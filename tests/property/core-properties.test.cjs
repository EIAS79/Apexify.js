'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const { test } = require('node:test');
const api = require('../.build/phase12-properties-entry.cjs');

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function int(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

test('asset resolver property: nested inputs resolve deterministically without mutating input', () => {
  const random = rng(0xA12E51F1);
  const values = { name: 'Apexify', n: 42, flag: false, deep: 'value' };
  const resolve = (key) => {
    const leaf = key.split('.').at(-1);
    if (!(leaf in values)) throw new Error(`missing ${key}`);
    return values[leaf];
  };

  for (let iteration = 0; iteration < 750; iteration++) {
    const input = [];
    const expected = [];
    const count = int(random, 1, 12);
    for (let i = 0; i < count; i++) {
      const kind = int(random, 0, 4);
      if (kind === 0) { input.push('$name'); expected.push('Apexify'); }
      else if (kind === 1) { input.push('n=$n'); expected.push('n=42'); }
      else if (kind === 2) { input.push('$$literal'); expected.push('$literal'); }
      else if (kind === 3) { input.push({ x: '$deep', untouched: i }); expected.push(Object.assign(Object.create(null), { x: 'value', untouched: i })); }
      else { input.push(i); expected.push(i); }
    }
    const snapshot = structuredClone(input);
    const first = api.resolveAssetRefsDeep(input, resolve);
    const second = api.resolveAssetRefsDeep(input, resolve);
    assert.deepEqual(first, expected);
    assert.deepEqual(second, expected);
    assert.deepEqual(input, snapshot);
  }
});

test('asset resolver rejects cycles and prototype-pollution keys', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => api.resolveAssetRefsDeep(cyclic, () => 'x'), /cyclic/i);
  const unsafe = JSON.parse('{"constructor":"$name"}');
  assert.throws(() => api.resolveAssetRefsDeep(unsafe, () => 'x'), /unsafe key/i);
});

test('scene validation property: finite positive bounded dimensions accept, invalid numeric bounds reject', () => {
  const random = rng(0x5CE0E123);
  for (let i = 0; i < 500; i++) {
    const width = int(random, 1, 1024);
    const height = int(random, 1, 1024);
    assert.doesNotThrow(() => api.validateSceneRenderInput({ width, height, layers: [] }));
  }
  const bad = [0, -1, NaN, Infinity, -Infinity, 1.5];
  for (const value of bad) {
    assert.throws(() => api.validateSceneRenderInput({ width: value, height: 10, layers: [] }));
    assert.throws(() => api.validateSceneRenderInput({ width: 10, height: value, layers: [] }));
  }
});

test('gradient-stop property: arbitrary valid order normalizes, invalid numeric/color bounds reject', () => {
  const random = rng(0x6AAD1E17);
  const canvas = createCanvas(32, 8);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 500; i++) {
    const stops = Array.from({ length: int(random, 2, 8) }, () => ({
      stop: random(),
      color: `rgb(${int(random, 0, 255)},${int(random, 0, 255)},${int(random, 0, 255)})`,
    }));
    assert.doesNotThrow(() => api.createGradientFill(ctx, {
      type: 'linear', startX: 0, startY: 0, endX: 32, endY: 0, colors: stops,
    }, { x: 0, y: 0, w: 32, h: 8 }));
  }
  for (const stop of [-1, 1.01, NaN, Infinity, -Infinity]) {
    assert.throws(() => api.createGradientFill(ctx, {
      type: 'linear', startX: 0, startY: 0, endX: 32, endY: 0,
      colors: [{ stop: 0, color: '#000' }, { stop, color: '#fff' }],
    }, { x: 0, y: 0, w: 32, h: 8 }), /stop must be a finite number between 0 and 1/i);
  }
  assert.throws(() => api.createGradientFill(ctx, {
    type: 'linear', startX: 0, startY: 0, endX: 32, endY: 0,
    colors: [{ stop: 0, color: '#000' }],
  }, { x: 0, y: 0, w: 32, h: 8 }), /at least two stops/i);
  assert.throws(() => api.createGradientFill(ctx, {
    type: 'linear', startX: 0, startY: 0, endX: 0, endY: 0,
    colors: [{ stop: 0, color: '#000' }, { stop: 1, color: '#fff' }],
  }, { x: 0, y: 0, w: 32, h: 8 }), /must not be identical/i);
  assert.throws(() => api.createGradientFill(ctx, {
    type: 'radial', startX: 0, startY: 0, startRadius: -1, endX: 1, endY: 1, endRadius: 3,
    colors: [{ stop: 0, color: '#000' }, { stop: 1, color: '#fff' }],
  }, { x: 0, y: 0, w: 32, h: 8 }), /radii must be non-negative/i);
});

test('FFmpeg custom-expression property rejects graph delimiters and unknown identifiers', () => {
  const safe = [
    't', 'w/2', 'if(lt(t,1),0,w/2)', 'max(0.01,sin(PI*t))', 'between(t,0,1)', 'clip(t,0,1)',
  ];
  for (const expression of safe) assert.equal(api.assertSafeFilterExpression(expression), expression);
  const delimiters = [';', '\\', ':', '[', ']', "'", '"', '\n', '\r', '\0'];
  for (const delimiter of delimiters) {
    const payload = `if(lt(t,1),0,w/2)${delimiter}movie`;
    assert.throws(() => api.assertSafeFilterExpression(payload), /unsafe|unsupported/i, payload);
  }
  const random = rng(0xFEEDBEEF);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < 250; i++) {
    let unknown = 'z';
    for (let j = 0; j < int(random, 2, 16); j++) unknown += alphabet[int(random, 0, alphabet.length - 1)];
    if (['sqrt', 'trunc', 'round'].includes(unknown)) continue;
    assert.throws(() => api.assertSafeFilterExpression(`${unknown}(t)`), /unsupported identifier/i);
  }
});

test('video option validation property accepts bounded convert values and rejects invalid numeric/operation states before I/O', () => {
  const random = rng(0x71DE0123);
  for (let i = 0; i < 500; i++) {
    const fps = 1 + random() * 119;
    const bitrate = int(random, 1, 50_000);
    const width = int(random, 1, 1920);
    const height = int(random, 1, 1080);
    assert.doesNotThrow(() => api.validateVideoCreationOptions({
      source: Buffer.from([1]),
      convert: { outputPath: 'out.mp4', fps, bitrate, resolution: { width, height } },
    }));
  }
  for (const fps of [0, -1, NaN, Infinity]) {
    assert.throws(() => api.validateVideoCreationOptions({
      source: Buffer.from([1]), convert: { outputPath: 'out.mp4', fps },
    }));
  }
  for (const speed of [0, -1, 16.1, NaN, Infinity]) {
    assert.throws(() => api.validateVideoCreationOptions({
      source: Buffer.from([1]), changeSpeed: { outputPath: 'out.mp4', speed },
    }));
  }
  assert.throws(() => api.validateVideoCreationOptions({ source: Buffer.from([1]) }), /exactly one operation/i);
  assert.throws(() => api.validateVideoCreationOptions({
    source: Buffer.from([1]), convert: { outputPath: 'a.mp4' }, trim: { outputPath: 'b.mp4', startTime: 0, endTime: 1 },
  }), /exactly one operation/i);
});

test('IP classifier property never treats malformed arbitrary strings as public', () => {
  const random = rng(0x51F5AFE);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=';
  for (let i = 0; i < 1000; i++) {
    let value = '';
    for (let j = 0, n = int(random, 1, 40); j < n; j++) value += alphabet[int(random, 0, alphabet.length - 1)];
    assert.equal(api.classifyIpAddress(value).blocked, true, value);
  }
});
