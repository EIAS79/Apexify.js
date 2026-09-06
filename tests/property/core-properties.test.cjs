'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

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
  const unsafe = Object.create(null);
  unsafe.constructor = '$name';
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

test('IP classifier property never treats malformed arbitrary strings as public', () => {
  const random = rng(0x51F5AFE);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz!@#$%^&*()_+-=';
  for (let i = 0; i < 1000; i++) {
    let value = '';
    for (let j = 0, n = int(random, 1, 40); j < n; j++) value += alphabet[int(random, 0, alphabet.length - 1)];
    assert.equal(api.classifyIpAddress(value).blocked, true, value);
  }
});
