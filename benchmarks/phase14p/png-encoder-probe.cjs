'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');

const width = 1200;
const height = 630;
const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';
const warmups = Number(process.env.APEXIFY_PNG_PROBE_WARMUPS || 5);
const samples = Number(process.env.APEXIFY_PNG_PROBE_SAMPLES || 20);

function makeCanvas() {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `56px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Apexify.js normalized Phase 14-P baseline', 72, 160);
  return canvas;
}

function percentile(sorted, p) {
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const w = index - lo;
  return sorted[lo] * (1 - w) + sorted[hi] * w;
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: Number(percentile(sorted, 0.5).toFixed(3)),
    p95: Number(percentile(sorted, 0.95).toFixed(3)),
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted[sorted.length - 1].toFixed(3)),
  };
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function pixelHash(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { hash: hash(data), width: info.width, height: info.height, channels: info.channels };
}

async function run(name, encode) {
  for (let i = 0; i < warmups; i += 1) await encode();
  const timings = [];
  let representative;
  for (let i = 0; i < samples; i += 1) {
    if (global.gc) global.gc();
    const started = performance.now();
    const output = await encode();
    timings.push(performance.now() - started);
    representative ||= output;
  }
  return {
    name,
    timing: stats(timings),
    bytes: representative.length,
    encodedHash: hash(representative),
    pixels: await pixelHash(representative),
  };
}

(async () => {
  sharp.cache(false);
  sharp.concurrency(1);
  const canvas = makeCanvas();

  const reference = await run('skia-async', () => canvas.encode('png'));
  const raw = canvas.data();
  console.log(`canvas.data bytes=${raw.length} expected=${width * height * 4} first=${[...raw.subarray(0, 4)].join(',')}`);

  const candidates = [];
  for (const compressionLevel of [0, 1, 3, 6]) {
    candidates.push(await run(`sharp-c${compressionLevel}`, async () => {
      const pixels = canvas.data();
      return sharp(pixels, { raw: { width, height, channels: 4 } })
        .png({ compressionLevel, adaptiveFiltering: false, palette: false })
        .toBuffer();
    }));
  }

  const all = [reference, ...candidates];
  console.log('Phase 14-P PNG encoder probe');
  console.log(`reference pixels=${reference.pixels.hash}`);
  for (const result of all) {
    const samePixels = result.pixels.hash === reference.pixels.hash;
    const sizeChange = ((result.bytes / reference.bytes) - 1) * 100;
    console.log(`${result.name.padEnd(12)} median=${result.timing.median.toFixed(3)} ms p95=${result.timing.p95.toFixed(3)} ms bytes=${result.bytes} size=${sizeChange >= 0 ? '+' : ''}${sizeChange.toFixed(1)}% samePixels=${samePixels} encoded=${result.encodedHash}`);
  }

  const valid = candidates.filter((result) => result.pixels.hash === reference.pixels.hash);
  if (valid.length === 0) {
    throw new Error('No Sharp raw PNG candidate preserved the exact decoded RGBA pixels; reject this backend route.');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
