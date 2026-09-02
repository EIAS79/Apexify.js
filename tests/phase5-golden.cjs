'use strict';

const assert = require('node:assert/strict');
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

async function main() {
  // Static 2x2 reference image. The expected raster is independent of the implementation:
  // invert each RGB channel, then posterize to 4 levels (0/85/170/255), preserving alpha.
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
  const ctx = makeCanvas(2, 2, input);
  await api.applyContextImageFilters(ctx, [
    { type: 'invert' },
    { type: 'posterize', levels: 4 },
  ], 2, 2);
  assertPixelsNear([...ctx.getImageData(0, 0, 2, 2).data], expected, 1, 'invert+posterize golden');

  // A second reference combines a renderer opacity edge case with a native filter.
  // The transparent background must stay transparent when opacity is explicitly zero.
  const transparent = createCanvas(3, 3);
  const transparentCtx = transparent.getContext('2d');
  api.drawBar(transparentCtx, 0, 0, 3, 3, '#ff00ff', undefined, 0);
  await api.applyContextImageFilters(transparentCtx, [{ type: 'invert' }], 3, 3);
  const transparentRaster = [...transparentCtx.getImageData(0, 0, 3, 3).data];
  const expectedTransparent = Array.from({ length: 9 }, () => [255, 255, 255, 0]).flat();
  assertPixelsNear(transparentRaster, expectedTransparent, 0, 'opacity-zero golden');

  console.log('phase5-golden: deterministic reference rasters passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
