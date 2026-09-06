'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');
const { compareImages, assertImageMatches } = require('../helpers/image-diff.cjs');

function run(file) {
  const result = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, `${file} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

test('golden diff reports pixel count, ratio and max channel delta', async () => {
  const expected = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 18, g: 52, b: 86, alpha: 1 } } }).png().toBuffer();
  const canvas = createCanvas(4, 4);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#123456';
  ctx.fillRect(0, 0, 4, 4);
  const result = await compareImages(canvas.toBuffer('image/png'), expected, { channelTolerance: 0 });
  assert.deepEqual({ differingPixels: result.differingPixels, maxChannelDelta: result.maxChannelDelta, matches: result.matches }, { differingPixels: 0, maxChannelDelta: 0, matches: true });

  const changed = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 19, g: 52, b: 86, alpha: 1 } } }).png().toBuffer();
  const tolerated = await compareImages(changed, expected, { channelTolerance: 1 });
  assert.equal(tolerated.matches, true);
  const strict = await compareImages(changed, expected, { channelTolerance: 0 });
  assert.equal(strict.differingPixels, 16);
  assert.equal(strict.differingPixelRatio, 1);
  assert.equal(strict.maxChannelDelta, 1);
});

test('phase 5 raster goldens cover backgrounds, gradients, fit, masks, scene, x/y zero and opacity zero', () => {
  run('tests/phase5-golden.cjs');
});

test('phase 6 composition goldens cover scenes, templates and built-in components', () => {
  run('tests/phase6-golden.cjs');
});

test('phase 10 goldens cover text, shapes/paths, charts, collage and stitch determinism', () => {
  run('tests/phase10-golden.cjs');
});

test('golden mismatch can emit a reviewable diff image', async () => {
  const expected = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#000000' } }).png().toBuffer();
  const actual = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(
    assertImageMatches(actual, expected, { channelTolerance: 0, diffPath: 'artifacts/golden-diffs/self-test.png' }),
    /golden mismatch: 4\/4 pixels differ \(100\.0000%\), max channel delta=255/
  );
});
