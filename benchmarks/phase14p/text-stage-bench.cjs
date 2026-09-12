'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');

const root = process.cwd();
const fixtureRoot = path.join(root, 'benchmarks', '.phase14p-source', 'lib-next');
const { validateTextInput } = require(path.join(fixtureRoot, 'text', 'text-validation.js'));
const { EnhancedTextRenderer } = require(path.join(fixtureRoot, 'text', 'enhanced-text-renderer.js'));
const { loadImageCached, clearDecodedImageCache, getDecodedImageCacheStats } = require(path.join(fixtureRoot, 'image', 'image-properties.js'));
const { assertCanvasResourceLimits } = require(path.join(fixtureRoot, 'runtime', 'limits.js'));
const publicApi = require(path.join(root, 'dist', 'cjs', 'index.cjs'));
const { ApexPainter, configureApexifyRuntime, resetApexifyRuntimeConfig } = publicApi;

const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';
const samples = Number(process.env.APEXIFY_TEXT_STAGE_SAMPLES || 40);
const warmups = Number(process.env.APEXIFY_TEXT_STAGE_WARMUPS || 10);
const PNG_SIGNATURE_BYTES = 8;
const fallbackDiagnostics = [];

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
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
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    mean: Number(mean.toFixed(4)),
    median: Number(percentile(sorted, 0.5).toFixed(4)),
    p95: Number(percentile(sorted, 0.95).toFixed(4)),
    min: Number(sorted[0].toFixed(4)),
    max: Number(sorted[sorted.length - 1].toFixed(4)),
  };
}

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function signature(buffer) {
  return `${buffer.length}:${hash(buffer)}`;
}

async function pixelSignature(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return `${info.width}x${info.height}x${info.channels}:${hash(data)}`;
}

function semanticChunks(png) {
  const result = [];
  let offset = PNG_SIGNATURE_BYTES;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    if (end > png.length) throw new Error(`Malformed PNG chunk ${type}.`);
    if (['sBIT', 'sRGB', 'pHYs', 'iCCP', 'gAMA', 'cHRM'].includes(type)) {
      result.push(`${type}:${png.subarray(dataStart, dataStart + length).toString('hex')}`);
    }
    offset = end;
    if (type === 'IEND') break;
  }
  return result;
}

const base = solidPng(1200, 630, '#101820');
const textProps = {
  text: 'Apexify.js normalized Phase 14-P baseline',
  x: 72,
  y: 160,
  font: { size: 56, family: fontFamily },
  fill: { color: '#ffffff' },
};

async function stagedOnce(mode = 'sync') {
  const times = {};
  let t = performance.now();
  validateTextInput(textProps);
  let now = performance.now();
  times.validation = now - t;

  t = now;
  const decoded = await loadImageCached(base);
  assertCanvasResourceLimits(decoded.width, decoded.height);
  now = performance.now();
  times.cachedDecode = now - t;

  t = now;
  const canvas = createCanvas(decoded.width, decoded.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(decoded, 0, 0);
  now = performance.now();
  times.allocateAndCopy = now - t;

  t = now;
  await EnhancedTextRenderer.renderText(ctx, textProps);
  now = performance.now();
  times.textDraw = now - t;

  t = now;
  const output = mode === 'async' && typeof canvas.encode === 'function'
    ? await canvas.encode('png')
    : canvas.toBuffer('image/png');
  now = performance.now();
  times.pngEncode = now - t;
  times.total = Object.values(times).reduce((sum, value) => sum + value, 0);
  return { times, output };
}

async function collectStaged(mode) {
  for (let i = 0; i < warmups; i += 1) await stagedOnce(mode);
  const rows = [];
  let representative;
  for (let i = 0; i < samples; i += 1) {
    const result = await stagedOnce(mode);
    rows.push(result.times);
    representative ||= result.output;
  }
  const fields = ['validation', 'cachedDecode', 'allocateAndCopy', 'textDraw', 'pngEncode', 'total'];
  return {
    mode,
    samples,
    stages: Object.fromEntries(fields.map((field) => [field, stats(rows.map((row) => row[field]))])),
    outputSignature: signature(representative),
    pixelSignature: await pixelSignature(representative),
    semanticChunks: semanticChunks(representative),
  };
}

async function collectPublic() {
  configureApexifyRuntime({ diagnostics: { handler(event) {
    if (event.code === 'TEXT_PNG_FAST_PATH_FALLBACK') fallbackDiagnostics.push(event);
  } } });
  try {
    const painter = new ApexPainter('png');
    for (let i = 0; i < warmups; i += 1) await painter.createText(textProps, base);
    const wall = [];
    let representative;
    for (let i = 0; i < samples; i += 1) {
      if (global.gc) global.gc();
      const started = performance.now();
      const output = await painter.createText(textProps, base);
      wall.push(performance.now() - started);
      representative ||= output;
    }
    return {
      samples,
      timing: stats(wall),
      outputSignature: signature(representative),
      pixelSignature: await pixelSignature(representative),
      semanticChunks: semanticChunks(representative),
    };
  } finally {
    resetApexifyRuntimeConfig();
  }
}

(async () => {
  clearDecodedImageCache();
  await loadImageCached(base);
  const sync = await collectStaged('sync');
  const asyncResult = await collectStaged('async');
  const publicResult = await collectPublic();
  const cache = getDecodedImageCacheStats();

  console.log('Phase 14-P text stage benchmark');
  for (const result of [sync, asyncResult]) {
    console.log(`\n${result.mode} PNG path:`);
    for (const [name, value] of Object.entries(result.stages)) {
      const share = result.stages.total.median > 0 && name !== 'total'
        ? ` (${((value.median / result.stages.total.median) * 100).toFixed(1)}%)`
        : '';
      console.log(`${name.padEnd(18)} median=${value.median.toFixed(4)} ms p95=${value.p95.toFixed(4)} ms${share}`);
    }
  }
  console.log(`\npublic createText     median=${publicResult.timing.median.toFixed(4)} ms p95=${publicResult.timing.p95.toFixed(4)} ms`);
  console.log(`cache                  entries=${cache.entries} bytes=${cache.bytes} hits=${cache.hits} misses=${cache.misses}`);
  console.log(`sync output            ${sync.outputSignature}`);
  console.log(`async output           ${asyncResult.outputSignature}`);
  console.log(`public output          ${publicResult.outputSignature}`);
  console.log(`reference pixels       ${asyncResult.pixelSignature}`);
  console.log(`public pixels          ${publicResult.pixelSignature}`);
  console.log(`reference semantics    ${asyncResult.semanticChunks.join(',')}`);
  console.log(`public semantics       ${publicResult.semanticChunks.join(',')}`);
  console.log(`fast-path fallbacks    ${fallbackDiagnostics.length}`);
  for (const event of fallbackDiagnostics.slice(0, 3)) console.log(`fallback reason        ${event.details?.reason ?? event.message}`);

  if (sync.outputSignature !== asyncResult.outputSignature) {
    throw new Error('sync and async Skia PNG encoding produced different text output.');
  }
  if (asyncResult.pixelSignature !== publicResult.pixelSignature) {
    throw new Error('public createText fast PNG path changed decoded RGBA pixels.');
  }
  const requiredSemantics = ['sBIT:08080808', 'sRGB:00'];
  if (JSON.stringify(publicResult.semanticChunks) !== JSON.stringify(requiredSemantics)) {
    throw new Error(`public createText PNG semantic chunks changed: ${publicResult.semanticChunks.join(',')}`);
  }
  if (fallbackDiagnostics.length !== 0) {
    throw new Error(`normalized text fixture hit the PNG fallback path ${fallbackDiagnostics.length} times.`);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
