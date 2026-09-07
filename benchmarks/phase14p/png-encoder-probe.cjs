'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');

const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';
const warmups = Number(process.env.APEXIFY_PNG_PROBE_WARMUPS || 5);
const samples = Number(process.env.APEXIFY_PNG_PROBE_SAMPLES || 20);

function textCanvas() {
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, 1200, 630);
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
  const metadata = await sharp(png).metadata();
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
      hasProfile: metadata.hasProfile,
    },
  };
}

function rawView(typed) {
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

function sharpPipeline(pixels, canvas, premultiplied) {
  return sharp(pixels, {
    raw: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      premultiplied,
    },
  })
    .png({ compressionLevel: 6, adaptiveFiltering: false, palette: false })
    .withMetadata({ density: 72 });
}

async function encodeSharpPremultiplied(canvas) {
  return sharpPipeline(canvas.data(), canvas, true).toBuffer();
}

async function encodeSharpImageData(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return sharpPipeline(rawView(imageData.data), canvas, false).toBuffer();
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

async function once(name, encode) {
  const output = await encode();
  return {
    name,
    timing: null,
    bytes: output.length,
    encodedHash: hash(output),
    decoded: await decoded(output),
  };
}

async function verifyFixture(label, canvas, benchmark = false) {
  const rawBackingHash = hash(canvas.data());
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const imageDataHash = hash(rawView(imageData.data));

  const skia = benchmark
    ? await run(`${label}-skia`, () => canvas.encode('png'))
    : await once(`${label}-skia`, () => canvas.encode('png'));
  const premul = benchmark
    ? await run(`${label}-sharp-premul`, () => encodeSharpPremultiplied(canvas))
    : await once(`${label}-sharp-premul`, () => encodeSharpPremultiplied(canvas));
  const imageDataResult = benchmark
    ? await run(`${label}-sharp-imagedata`, () => encodeSharpImageData(canvas))
    : await once(`${label}-sharp-imagedata`, () => encodeSharpImageData(canvas));

  const reference = skia.decoded.hash;
  const premulMatch = premul.decoded.hash === reference;
  const imageDataMatch = imageDataResult.decoded.hash === reference;
  const imageDataReferenceMatch = imageDataHash === reference;

  console.log(`\n[${label}] ${canvas.width}x${canvas.height}`);
  console.log(`backing=${rawBackingHash}`);
  console.log(`imageData=${imageDataHash} matchesSkia=${imageDataReferenceMatch}`);
  console.log(`skiaPixels=${reference}`);
  console.log(`premulPixels=${premul.decoded.hash} matchesSkia=${premulMatch}`);
  console.log(`imageDataPixels=${imageDataResult.decoded.hash} matchesSkia=${imageDataMatch}`);
  console.log(`skia metadata=${JSON.stringify(skia.decoded.metadata)}`);
  console.log(`premul metadata=${JSON.stringify(premul.decoded.metadata)}`);
  console.log(`imageData metadata=${JSON.stringify(imageDataResult.decoded.metadata)}`);

  const report = (result) => {
    const sizeChange = ((result.bytes / skia.bytes) - 1) * 100;
    const timing = result.timing ? ` median=${result.timing.median.toFixed(3)} ms p95=${result.timing.p95.toFixed(3)} ms` : '';
    console.log(`${result.name.padEnd(30)}${timing} bytes=${result.bytes} size=${sizeChange >= 0 ? '+' : ''}${sizeChange.toFixed(1)}%`);
  };
  if (benchmark) report(skia);
  report(premul);
  report(imageDataResult);

  if (!imageDataReferenceMatch) throw new Error(`${label}: Canvas getImageData pixels differ from Skia PNG decode.`);
  if (!premulMatch) throw new Error(`${label}: Sharp premultiplied raw input differs from Skia PNG decode.`);
  if (!imageDataMatch) throw new Error(`${label}: Sharp getImageData input differs from Skia PNG decode.`);
  if (premul.decoded.metadata.density !== 72 || imageDataResult.decoded.metadata.density !== 72) {
    throw new Error(`${label}: Sharp candidate failed to preserve 72 DPI output density.`);
  }
}

(async () => {
  console.log(`sharp concurrency=${sharp.concurrency()}`);
  console.log('Phase 14-P premultiplied lossless PNG semantic/performance probe');
  await verifyFixture('opaque-text', textCanvas(), true);
  await verifyFixture('transparent-alpha', transparentCanvas(), true);
  await verifyFixture('gradient-shadow', gradientCanvas());
  await verifyFixture('compositing', compositingCanvas());
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
