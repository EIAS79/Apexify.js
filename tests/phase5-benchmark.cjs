'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

function makePhotoLikeRgb(width, height) {
  const data = Buffer.allocUnsafe(width * height * 3);
  let state = 0x12345678;
  const randomByte = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state & 0xff;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const n = randomByte();
      data[i] = (x * 255 / Math.max(1, width - 1) + n * 0.2) & 0xff;
      data[i + 1] = (y * 255 / Math.max(1, height - 1) + n * 0.15) & 0xff;
      data[i + 2] = ((x + y) * 127 / Math.max(1, width + height - 2) + n * 0.35) & 0xff;
    }
  }
  return data;
}

async function main() {
  const width = 2048;
  const height = 1536;
  const source = makePhotoLikeRgb(width, height);
  const jpeg = await sharp(source, { raw: { width, height, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
  const uri = `data:image/jpeg;base64,${jpeg.toString('base64')}`;

  const heapBefore = process.memoryUsage().heapUsed;
  const paletteStart = performance.now();
  const palette = await api.detectColors(uri);
  const paletteMs = performance.now() - paletteStart;
  const heapAfter = process.memoryUsage().heapUsed;

  assert.ok(palette.length > 0 && palette.length <= 16, `palette must be bounded, got ${palette.length}`);
  assert.ok(paletteMs < 10_000, `palette benchmark exceeded 10s: ${paletteMs.toFixed(1)}ms`);
  assert.ok(heapAfter - heapBefore < 96 * 1024 * 1024, `palette JS heap grew excessively: ${heapAfter - heapBefore} bytes`);

  const blurSource = await sharp(source, { raw: { width, height, channels: 3 } }).resize(1024, 768).png().toBuffer();
  const blurUri = `data:image/png;base64,${blurSource.toString('base64')}`;
  const blurStart = performance.now();
  const blurred = await api.imgEffects(blurUri, [{ type: 'blur', radius: 8 }]);
  const blurMs = performance.now() - blurStart;
  const metadata = await sharp(blurred).metadata();

  assert.equal(metadata.width, 1024);
  assert.equal(metadata.height, 768);
  assert.ok(blurMs < 10_000, `native blur benchmark exceeded 10s: ${blurMs.toFixed(1)}ms`);

  console.log(JSON.stringify({
    phase: 5,
    palette: { source: `${width}x${height}`, colors: palette.length, ms: Number(paletteMs.toFixed(1)), heapDeltaBytes: heapAfter - heapBefore },
    blur: { source: '1024x768', radius: 8, ms: Number(blurMs.toFixed(1)) },
  }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
