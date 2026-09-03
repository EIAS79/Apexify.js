'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

function makeCanvas(width, height, rgba) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const data = ctx.createImageData(width, height);
  data.data.set(rgba);
  ctx.putImageData(data, 0, 0);
  return ctx;
}

function assertPixelsNear(actual, expected, tolerance, label) {
  assert.equal(actual.length, expected.length, `${label}: raster length mismatch`);
  for (let i = 0; i < actual.length; i++) {
    const delta = Math.abs(actual[i] - expected[i]);
    assert.ok(delta <= tolerance, `${label}: channel ${i} expected ${expected[i]}, got ${actual[i]} (delta ${delta})`);
  }
}

function canvasPixel(ctx, x, y) {
  return [...ctx.getImageData(x, y, 1, 1).data];
}

async function rawPng(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function rawPixel(raw, x, y) {
  const i = (y * raw.info.width + x) * raw.info.channels;
  return [...raw.data.subarray(i, i + 4)];
}

function splitFixture() {
  const canvas = createCanvas(4, 2);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 2, 2);
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(2, 0, 2, 2);
  return canvas.toBuffer('image/png');
}

function rectCrop(imageSource, left, top, right, bottom) {
  return {
    imageSource,
    crop: 'inner',
    coordinates: [
      { from: { x: left, y: top }, to: { x: right, y: top } },
      { from: { x: right, y: top }, to: { x: right, y: bottom } },
      { from: { x: right, y: bottom }, to: { x: left, y: bottom } },
      { from: { x: left, y: bottom }, to: { x: left, y: top } },
    ],
  };
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();

  // Exact filter reference: invert, then posterize to 4 levels, alpha unchanged.
  const input = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
    20, 40, 60, 128,
  ]);
  const expected = [
    255, 255, 255, 255,
    0, 255, 255, 255,
    255, 0, 255, 255,
    255, 255, 170, 128,
  ];
  const filterCtx = makeCanvas(2, 2, input);
  await api.applyContextImageFilters(filterCtx, [
    { type: 'invert' },
    { type: 'posterize', levels: 4 },
  ], 2, 2);
  assertPixelsNear([...filterCtx.getImageData(0, 0, 2, 2).data], expected, 1, 'invert+posterize golden');

  // Explicit opacity zero must stay fully transparent. Canvas canonicalizes fully
  // transparent pixels to transparent black.
  const transparent = createCanvas(3, 3);
  const transparentCtx = transparent.getContext('2d');
  api.drawBar(transparentCtx, 0, 0, 3, 3, '#ff00ff', undefined, 0);
  await api.applyContextImageFilters(transparentCtx, [{ type: 'invert' }], 3, 3);
  const transparentRaster = [...transparentCtx.getImageData(0, 0, 3, 3).data];
  const expectedTransparent = Array.from({ length: 9 }, () => [0, 0, 0, 0]).flat();
  assertPixelsNear(transparentRaster, expectedTransparent, 0, 'opacity-zero golden');

  // Linear gradient.
  {
    const canvas = createCanvas(8, 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'linear', startX: 0, startY: 0, endX: 8, endY: 0,
      colors: [{ stop: 0, color: '#ff0000' }, { stop: 1, color: '#0000ff' }],
    }, { x: 0, y: 0, w: 8, h: 2 });
    ctx.fillRect(0, 0, 8, 2);
    const left = canvasPixel(ctx, 0, 0);
    const right = canvasPixel(ctx, 7, 0);
    assert.ok(left[0] > left[2] + 150, `linear start is not red-dominant: ${left}`);
    assert.ok(right[2] > right[0] + 150, `linear end is not blue-dominant: ${right}`);
  }

  // Radial gradient with explicit zero center.
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'radial', startX: 0, startY: 0, startRadius: 0, endX: 0, endY: 0, endRadius: 8,
      colors: [{ stop: 0, color: '#ffffff' }, { stop: 1, color: '#000000' }],
    }, { x: 0, y: 0, w: 8, h: 8 });
    ctx.fillRect(0, 0, 8, 8);
    assert.ok(canvasPixel(ctx, 0, 0)[0] > canvasPixel(ctx, 7, 7)[0] + 120, 'radial golden brightness ordering');
  }

  // Conic gradient around explicit origin.
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'conic', centerX: 0, centerY: 0, startAngle: 0,
      colors: [
        { stop: 0, color: '#ff0000' },
        { stop: 0.5, color: '#00ff00' },
        { stop: 1, color: '#0000ff' },
      ],
    }, { x: 0, y: 0, w: 8, h: 8 });
    ctx.fillRect(0, 0, 8, 8);
    assert.notDeepEqual(canvasPixel(ctx, 7, 0), canvasPixel(ctx, 0, 7), 'conic quadrants must differ');
  }

  // Repeating and reflected gradients are distinct periodic constructions.
  {
    const repeatCanvas = createCanvas(8, 2);
    const repeatCtx = repeatCanvas.getContext('2d');
    repeatCtx.fillStyle = api.createGradientFill(repeatCtx, {
      type: 'linear', startX: 0, startY: 0, endX: 4, endY: 0, repeat: 'repeat',
      colors: [{ stop: 0, color: '#ff0000' }, { stop: 1, color: '#0000ff' }],
    }, { x: 0, y: 0, w: 4, h: 2 });
    repeatCtx.fillRect(0, 0, 8, 2);
    assertPixelsNear(canvasPixel(repeatCtx, 1, 0), canvasPixel(repeatCtx, 5, 0), 4, 'repeat gradient period');

    const reflectCanvas = createCanvas(8, 2);
    const reflectCtx = reflectCanvas.getContext('2d');
    reflectCtx.fillStyle = api.createGradientFill(reflectCtx, {
      type: 'linear', startX: 0, startY: 0, endX: 4, endY: 0, repeat: 'reflect',
      colors: [{ stop: 0, color: '#ff0000' }, { stop: 1, color: '#0000ff' }],
    }, { x: 0, y: 0, w: 4, h: 2 });
    reflectCtx.fillRect(0, 0, 8, 2);
    assertPixelsNear(canvasPixel(reflectCtx, 0, 0), canvasPixel(reflectCtx, 7, 0), 8, 'reflect gradient mirror edge');
    assert.notDeepEqual(canvasPixel(repeatCtx, 5, 0), canvasPixel(reflectCtx, 5, 0), 'reflect must not collapse to repeat');
  }

  const fixture = splitFixture();
  const fixtureUri = `data:image/png;base64,${fixture.toString('base64')}`;
  const creator = new api.CanvasCreator();

  // Solid and transparent canvases.
  let raw = await rawPng((await creator.createCanvas({ width: 4, height: 2, colorBg: '#123456' })).buffer);
  assertPixelsNear(rawPixel(raw, 0, 0), [18, 52, 86, 255], 1, 'solid canvas');
  raw = await rawPng((await creator.createCanvas({ width: 4, height: 2, transparentBase: true })).buffer);
  assertPixelsNear(rawPixel(raw, 0, 0), [0, 0, 0, 0], 0, 'transparent canvas');

  // Image background layer and custom background.
  raw = await rawPng((await creator.createCanvas({
    width: 4, height: 2, transparentBase: true,
    bgLayers: [{ type: 'image', source: fixtureUri, fit: 'fill' }],
  })).buffer);
  assertPixelsNear(rawPixel(raw, 0, 0), [255, 0, 0, 255], 2, 'image background left');
  assertPixelsNear(rawPixel(raw, 3, 0), [0, 0, 255, 255], 2, 'image background right');

  raw = await rawPng((await creator.createCanvas({
    width: 4, height: 2,
    customBg: { source: fixtureUri, fit: 'fill', filters: [{ type: 'invert' }] },
  })).buffer);
  assertPixelsNear(rawPixel(raw, 0, 0), [0, 255, 255, 255], 3, 'filtered custom background');

  // Contain and cover visual behavior.
  const image = await api.loadImageCached(fixtureUri);
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    api.drawImageFitted(ctx, image, 8, 8, 'contain', 'center');
    assert.equal(canvasPixel(ctx, 0, 0)[3], 0, 'contain letterbox');
    assert.equal(canvasPixel(ctx, 0, 3)[3], 255, 'contain content');
  }
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    api.drawImageFitted(ctx, image, 8, 8, 'cover', 'center');
    assert.equal(canvasPixel(ctx, 0, 0)[3], 255, 'cover fills corner');
    assert.equal(canvasPixel(ctx, 7, 7)[3], 255, 'cover fills opposite corner');
  }

  // Crop and mask goldens.
  const cropped = await api.cropRasterImage(rectCrop(fixtureUri, 0, 0, 2, 2));
  raw = await rawPng(cropped);
  assert.equal(raw.info.width, 2);
  assert.equal(raw.info.height, 2);
  assertPixelsNear(rawPixel(raw, 0, 0), [255, 0, 0, 255], 2, 'crop at origin');

  const maskCanvas = createCanvas(4, 2);
  const maskCtx = maskCanvas.getContext('2d');
  maskCtx.fillStyle = '#ffffff';
  maskCtx.fillRect(0, 0, 2, 2);
  const masked = await api.applyRasterMask(fixture, maskCanvas.toBuffer('image/png'), { type: 'alpha' });
  raw = await rawPng(masked);
  assert.equal(rawPixel(raw, 0, 0)[3], 255, 'mask retained left alpha');
  assert.equal(rawPixel(raw, 3, 0)[3], 0, 'mask cleared right alpha');

  // Public painter image at x=0/y=0 plus text+image composition.
  const painter = new api.ApexPainter('png');
  const base = await painter.createCanvas({ width: 80, height: 40, transparentBase: true });
  const withImage = await painter.createImage({ source: fixture, x: 0, y: 0, width: 40, height: 20 }, base.buffer);
  raw = await rawPng(withImage);
  assert.equal(rawPixel(raw, 0, 0)[3], 255, 'public image x=0/y=0');
  const withText = await painter.createText({
    text: 'A', x: 50, y: 28,
    font: { size: 24, family: 'Arial' },
    fill: { color: '#ffffff' },
  }, withImage);
  raw = await rawPng(withText);
  assert.equal(rawPixel(raw, 0, 0)[3], 255, 'text composition preserved image');
  const textArea = raw.data.subarray((10 * raw.info.width + 45) * 4, (35 * raw.info.width + 75) * 4);
  assert.ok([...textArea].some((value, i) => i % 4 === 3 && value > 0), 'text+image composition produced visible text pixels');

  // Scene/image integration reference using an imageBuffer layer.
  const scene = await painter.renderScene({
    width: 80,
    height: 40,
    background: { colorBg: '#000000' },
    layers: [
      { type: 'imageBuffer', buffer: fixture, x: 0, y: 0, width: 40, height: 20, globalAlpha: 1 },
      { type: 'text', texts: { text: 'S', x: 50, y: 28, font: { size: 24, family: 'Arial' }, fill: { color: '#ffffff' } } },
    ],
  });
  raw = await rawPng(scene);
  assertPixelsNear(rawPixel(raw, 0, 0), [255, 0, 0, 255], 3, 'scene image integration');

  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  console.log('phase5-golden: gradients, backgrounds, fit/crop/mask, effects, text/image, and scene references passed.');
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  try { api.clearDecodedImageCache(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
