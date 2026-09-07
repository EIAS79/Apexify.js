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

function textCanvas() {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, width, height);
  ctx.font = `56px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Apexify.js normalized Phase 14-P baseline', 72, 160);
  return canvas;
}

function transparentCanvas() {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 640, 360);
  ctx.fillStyle = 'rgba(255, 40, 80, 0.37)';
  ctx.fillRect(24, 30, 280, 210);
  ctx.fillStyle = 'rgba(20, 180, 255, 0.61)';
  ctx.beginPath();
  ctx.arc(360, 170, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `42px ${fontFamily}`;
  ctx.fillStyle = 'rgba(255,255,255,0.73)';
  ctx.fillText('alpha edges', 70, 310);
  return canvas;
}

function gradientCanvas() {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 800, 500);
  gradient.addColorStop(0, '#ff006e');
  gradient.addColorStop(0.37, '#8338ec');
  gradient.addColorStop(0.72, '#3a86ff');
  gradient.addColorStop(1, '#06d6a0');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 800, 500);
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 6;
  ctx.shadowOffsetY = 8;
  ctx.font = `64px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('gradient + shadow', 70, 270);
  return canvas;
}

function compositingCanvas() {
  const canvas = createCanvas(720, 480);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b132b';
  ctx.fillRect(0, 0, 720, 480);
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = '#5bc0be';
  ctx.fillRect(80, 70, 430, 280);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = '#ff9f1c';
  ctx.beginPath();
  ctx.arc(430, 250, 155, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.font = `38px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('composite', 245, 430);
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

async function decoded(png) {
  const image = sharp(png);
  const metadata = await image.metadata();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    hash: hash(data),
    info,
    metadata: {
      width: metadata.width,
      height: metadata.height,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      density: metadata.density ?? null,
      hasAlpha: metadata.hasAlpha,
      isProgressive: metadata.isProgressive,
    },
  };
}

async function sharpC6(canvas) {
  const pixels = canvas.data();
  return sharp(pixels, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .png({ compressionLevel: 6, adaptiveFiltering: false, palette: false })
    .toBuffer();
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
    decoded: await decoded(representative),
  };
}

async function verifyFixture(label, canvas, benchmark = false) {
  const rawHash = hash(canvas.data());
  const skia = benchmark
    ? await run(`${label}-skia`, () => canvas.encode('png'))
    : { name: `${label}-skia`, bytes: 0, timing: null, encodedHash: null, decoded: await decoded(await canvas.encode('png')) };
  const sharpResult = benchmark
    ? await run(`${label}-sharp-c6`, () => sharpC6(canvas))
    : (() => sharpC6(canvas).then(async (png) => ({ name: `${label}-sharp-c6`, bytes: png.length, timing: null, encodedHash: hash(png), decoded: await decoded(png) })))();
  const sharpResolved = await sharpResult;

  const skiaPixelsMatchRaw = skia.decoded.hash === rawHash;
  const sharpPixelsMatchRaw = sharpResolved.decoded.hash === rawHash;
  const samePixels = skia.decoded.hash === sharpResolved.decoded.hash;
  if (!skiaPixelsMatchRaw || !sharpPixelsMatchRaw || !samePixels) {
    throw new Error(`${label}: lossless pixel invariant failed (raw/skia/sharp mismatch).`);
  }

  console.log(`\n[${label}] ${canvas.width}x${canvas.height}`);
  console.log(`pixels=${rawHash} exact=true`);
  console.log(`skia metadata=${JSON.stringify(skia.decoded.metadata)}`);
  console.log(`sharp metadata=${JSON.stringify(sharpResolved.decoded.metadata)}`);
  if (benchmark) {
    const sizeChange = ((sharpResolved.bytes / skia.bytes) - 1) * 100;
    console.log(`skia       median=${skia.timing.median.toFixed(3)} ms p95=${skia.timing.p95.toFixed(3)} ms bytes=${skia.bytes}`);
    console.log(`sharp-c6   median=${sharpResolved.timing.median.toFixed(3)} ms p95=${sharpResolved.timing.p95.toFixed(3)} ms bytes=${sharpResolved.bytes} size=${sizeChange >= 0 ? '+' : ''}${sizeChange.toFixed(1)}%`);
  } else {
    console.log(`sharp-c6 bytes=${sharpResolved.bytes}`);
  }
}

(async () => {
  console.log(`sharp concurrency=${sharp.concurrency()}`);
  console.log('Phase 14-P lossless PNG semantic/performance probe');
  await verifyFixture('opaque-text', textCanvas(), true);
  await verifyFixture('transparent-alpha', transparentCanvas());
  await verifyFixture('gradient-shadow', gradientCanvas());
  await verifyFixture('compositing', compositingCanvas());
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
