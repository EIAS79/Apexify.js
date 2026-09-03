'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

function makePhotoLikeRgb(width, height, seed = 0x12345678) {
  const data = Buffer.allocUnsafe(width * height * 3);
  let state = seed >>> 0;
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
      data[i] = Math.max(0, Math.min(255, Math.round(x * 255 / Math.max(1, width - 1) + n * 0.12)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(y * 255 / Math.max(1, height - 1) + n * 0.10)));
      data[i + 2] = Math.max(0, Math.min(255, Math.round((x + y) * 127 / Math.max(1, width + height - 2) + n * 0.20)));
    }
  }
  return data;
}

function makeColorfulRgb(width, height) {
  const data = Buffer.allocUnsafe(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      data[i] = (x * 37 + y * 17) & 0xff;
      data[i + 1] = (x * 13 + y * 53) & 0xff;
      data[i + 2] = (x * 71 + y * 29) & 0xff;
    }
  }
  return data;
}

function uri(buffer, mime = 'image/jpeg') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
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

async function measure(name, operation, iterations = 1) {
  const start = process.memoryUsage();
  let peakRss = start.rss;
  let peakHeap = start.heapUsed;
  const sampler = setInterval(() => {
    const current = process.memoryUsage();
    peakRss = Math.max(peakRss, current.rss);
    peakHeap = Math.max(peakHeap, current.heapUsed);
  }, 5);
  sampler.unref();

  const started = performance.now();
  let value;
  try {
    for (let i = 0; i < iterations; i++) value = await operation(i);
  } finally {
    clearInterval(sampler);
  }
  const ended = performance.now();
  const final = process.memoryUsage();
  peakRss = Math.max(peakRss, final.rss);
  peakHeap = Math.max(peakHeap, final.heapUsed);
  return {
    name,
    iterations,
    totalMs: Number((ended - started).toFixed(1)),
    meanMs: Number(((ended - started) / iterations).toFixed(1)),
    rssDeltaBytes: peakRss - start.rss,
    heapDeltaBytes: peakHeap - start.heapUsed,
    value,
  };
}

async function paletteCase(name, width, height, raw, format = 'jpeg') {
  const encoder = sharp(raw, { raw: { width, height, channels: 3 } });
  const buffer = format === 'png' ? await encoder.png().toBuffer() : await encoder.jpeg({ quality: 82 }).toBuffer();
  const source = uri(buffer, format === 'png' ? 'image/png' : 'image/jpeg');
  const result = await measure(`palette-${name}`, () => api.detectColors(source));
  assert.ok(result.value.length > 0 && result.value.length <= 16, `${name}: palette must be bounded/useful, got ${result.value.length}`);
  assert.ok(result.totalMs < 10_000, `${name}: palette exceeded 10s: ${result.totalMs}ms`);
  assert.ok(result.heapDeltaBytes < 96 * 1024 * 1024, `${name}: palette JS heap grew excessively: ${result.heapDeltaBytes}`);
  return { ...result, colors: result.value.length, value: undefined, source: `${width}x${height}` };
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  const measurements = [];

  const smallRaw = makePhotoLikeRgb(128, 96, 0x11111111);
  const mediumRaw = makePhotoLikeRgb(800, 600, 0x22222222);
  const largeRaw = makePhotoLikeRgb(2048, 1536, 0x33333333);
  const colorfulRaw = makeColorfulRgb(1024, 768);
  const uniformRaw = Buffer.alloc(1024 * 768 * 3);
  for (let i = 0; i < uniformRaw.length; i += 3) {
    uniformRaw[i] = 24;
    uniformRaw[i + 1] = 96;
    uniformRaw[i + 2] = 180;
  }

  measurements.push(await paletteCase('small', 128, 96, smallRaw));
  measurements.push(await paletteCase('medium-photo', 800, 600, mediumRaw));
  measurements.push(await paletteCase('large-photo', 2048, 1536, largeRaw));
  measurements.push(await paletteCase('colorful', 1024, 768, colorfulRaw, 'png'));
  const uniform = await paletteCase('uniform', 1024, 768, uniformRaw, 'png');
  assert.equal(uniform.colors, 1, `uniform palette should collapse to one color, got ${uniform.colors}`);
  measurements.push(uniform);

  const mediumJpeg = await sharp(mediumRaw, { raw: { width: 800, height: 600, channels: 3 } }).jpeg({ quality: 82 }).toBuffer();
  const mediumUri = uri(mediumJpeg);

  // Decode/cache cold/warm measurements.
  api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 60_000, maxEntries: 16, maxBytes: 64 * 1024 * 1024 } });
  api.clearDecodedImageCache();
  let measured = await measure('decode-cache-miss', () => api.loadImageCached(mediumUri), 1);
  measurements.push({ ...measured, value: undefined });
  measured = await measure('decode-cache-hit', () => api.loadImageCached(mediumUri), 8);
  measurements.push({ ...measured, value: undefined });
  const cacheStats = api.getDecodedImageCacheStats();
  assert.ok(cacheStats.hits >= 8, `cache-hit benchmark did not hit cache: ${JSON.stringify(cacheStats)}`);

  // Comparable Phase 0 canvas workload.
  const painter = new api.ApexPainter('png');
  measured = await measure('canvas-1200x630', () => painter.createCanvas({ width: 1200, height: 630, colorBg: '#101820' }), 3);
  assert.ok(measured.meanMs < 2000, `1200x630 canvas unexpectedly slow: ${measured.meanMs}ms`);
  const baseCanvas = measured.value;
  measurements.push({ ...measured, value: undefined, outputBytes: baseCanvas.buffer.length });

  // Resize, crop and expensive native blur.
  measured = await measure('resize-800x600-to-1200x900', () => api.resizingImg({
    imagePath: mediumJpeg,
    size: { width: 1200, height: 900 },
    maintainAspectRatio: false,
  }), 3);
  assert.equal((await sharp(measured.value).metadata()).width, 1200);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length });

  // Use the Buffer source here intentionally: public source-string validation caps
  // huge data URLs, and the benchmark is measuring crop rather than string parsing.
  measured = await measure('crop-800x600-to-400x300', () => api.cropRasterImage(rectCrop(mediumJpeg, 0, 0, 400, 300)), 3);
  assert.equal((await sharp(measured.value).metadata()).width, 400);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length });

  measured = await measure('blur-800x600-radius8', () => api.imgEffects(mediumUri, [{ type: 'blur', radius: 8 }]), 2);
  assert.equal((await sharp(measured.value).metadata()).width, 800);
  assert.ok(measured.meanMs < 5000, `native blur benchmark exceeded 5s mean: ${measured.meanMs}ms`);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length });

  // Medium public image composition and scene integration.
  const imageTile = await painter.createCanvas({ width: 320, height: 180, colorBg: '#3a86ff' });
  measured = await measure('single-image-composition', () => painter.createImage({
    source: imageTile.buffer, x: 440, y: 225, width: 320, height: 180, borderRadius: 18,
  }, baseCanvas.buffer), 3);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length });

  measured = await measure('medium-scene', () => painter.renderScene({
    width: 1200,
    height: 630,
    background: { colorBg: '#0b132b' },
    layers: [
      { type: 'image', images: { source: 'rectangle', x: 80, y: 80, width: 1040, height: 470, shape: { fill: true, color: '#1c2541' }, borderRadius: 24 } },
      { type: 'text', texts: { text: 'Phase 5 scene', x: 140, y: 180, font: { size: 54, family: 'Arial' }, fill: { color: '#ffffff' } } },
      { type: 'imageBuffer', buffer: imageTile.buffer, x: 140, y: 330, width: 320, height: 180, globalAlpha: 0.95 },
    ],
  }), 2);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length });

  // Repeated cached composition proves stable cache bounds under warm reuse.
  api.clearDecodedImageCache();
  measured = await measure('cached-image-composition', () => painter.createImage({
    source: mediumJpeg, x: 0, y: 0, width: 400, height: 300,
  }, baseCanvas.buffer), 6);
  const warmStats = api.getDecodedImageCacheStats();
  assert.ok(warmStats.hits >= 5, `repeated composition did not reuse decoded source: ${JSON.stringify(warmStats)}`);
  assert.ok(warmStats.entries <= 16 && warmStats.bytes <= 64 * 1024 * 1024, `warm cache exceeded bounds: ${JSON.stringify(warmStats)}`);
  measurements.push({ ...measured, value: undefined, outputBytes: measured.value.length, cacheStats: warmStats });

  // Safety/resource overhead is acceptable if the complete benchmark stays bounded.
  const maxHeapGrowth = Math.max(...measurements.map((entry) => entry.heapDeltaBytes));
  assert.ok(maxHeapGrowth < 160 * 1024 * 1024, `benchmark observed excessive JS heap growth: ${maxHeapGrowth}`);

  const report = {
    phase: 5,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    phase0Comparable: {
      canvas1200x630BaselineMs: 26.981,
      baselineNode: 'v20.20.2',
      note: 'Phase 0 baseline runner/toolchain differs; comparison is directional, not a controlled A/B.',
    },
    measurements,
    maxHeapGrowthBytes: maxHeapGrowth,
  };
  console.log(JSON.stringify(report));

  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  try { api.clearDecodedImageCache(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
