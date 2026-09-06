'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function decode(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function compareImages(actualBuffer, expectedBuffer, options = {}) {
  const channelTolerance = options.channelTolerance ?? 2;
  const maxDifferentPixelRatio = options.maxDifferentPixelRatio ?? 0;
  const actual = await decode(actualBuffer);
  const expected = await decode(expectedBuffer);
  assert.equal(actual.info.width, expected.info.width, 'golden width mismatch');
  assert.equal(actual.info.height, expected.info.height, 'golden height mismatch');
  assert.equal(actual.info.channels, 4);
  assert.equal(expected.info.channels, 4);

  let differingPixels = 0;
  let maxChannelDelta = 0;
  const diff = Buffer.alloc(actual.data.length);
  const pixelCount = actual.info.width * actual.info.height;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    let pixelDiffers = false;
    let pixelMax = 0;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(actual.data[offset + channel] - expected.data[offset + channel]);
      pixelMax = Math.max(pixelMax, delta);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta > channelTolerance) pixelDiffers = true;
    }
    if (pixelDiffers) differingPixels += 1;
    diff[offset] = pixelMax;
    diff[offset + 1] = 0;
    diff[offset + 2] = 0;
    diff[offset + 3] = pixelDiffers ? 255 : 0;
  }
  const differingPixelRatio = pixelCount === 0 ? 0 : differingPixels / pixelCount;
  return {
    matches: differingPixelRatio <= maxDifferentPixelRatio,
    width: actual.info.width,
    height: actual.info.height,
    pixelCount,
    differingPixels,
    differingPixelRatio,
    maxChannelDelta,
    channelTolerance,
    maxDifferentPixelRatio,
    diff,
  };
}

async function assertImageMatches(actualBuffer, expectedBuffer, options = {}) {
  const result = await compareImages(actualBuffer, expectedBuffer, options);
  if (result.matches) return result;

  if (options.diffPath) {
    await fs.mkdir(path.dirname(options.diffPath), { recursive: true });
    await sharp(result.diff, { raw: { width: result.width, height: result.height, channels: 4 } }).png().toFile(options.diffPath);
  }
  const percent = (result.differingPixelRatio * 100).toFixed(4);
  assert.fail(
    `golden mismatch: ${result.differingPixels}/${result.pixelCount} pixels differ (${percent}%), ` +
    `max channel delta=${result.maxChannelDelta}, channel tolerance=${result.channelTolerance}, ` +
    `allowed differing ratio=${result.maxDifferentPixelRatio}` +
    (options.diffPath ? `; diff=${options.diffPath}` : '')
  );
}

module.exports = { compareImages, assertImageMatches };
