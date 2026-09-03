'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

function dataUri(buffer, mime = 'image/png') {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function rgba(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function pixel(raw, x, y) {
  const i = (y * raw.info.width + x) * raw.info.channels;
  return [...raw.data.subarray(i, i + 4)];
}

function near(actual, expected, tolerance = 3, label = 'pixel') {
  assert.equal(actual.length, expected.length, `${label}: channel count`);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${label}: channel ${i} expected ${expected[i]}, got ${actual[i]}`);
  }
}

async function expectError(fn, predicate, label) {
  let error;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${label}: expected rejection`);
  assert.ok(predicate(error), `${label}: unexpected ${error?.name}: ${error?.message}`);
}

function makeSplitCanvas(width = 4, height = 2, transparentRight = false) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width / 2, height);
  if (!transparentRight) {
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(width / 2, 0, width / 2, height);
  }
  return canvas;
}

function rectCrop(imageSource, left, top, right, bottom, crop = 'inner') {
  return {
    imageSource,
    crop,
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

  const split = makeSplitCanvas();
  const splitPng = split.toBuffer('image/png');
  const splitUri = dataUri(splitPng);

  // Resize semantics: exact fill must enlarge, contain must preserve aspect ratio,
  // outputFormat must be honored, and orientation must be applied before fitting.
  const exact = await api.resizingImg({
    imagePath: splitPng,
    size: { width: 8, height: 8 },
    maintainAspectRatio: false,
    outputFormat: 'png',
  });
  let meta = await sharp(exact).metadata();
  assert.equal(meta.width, 8, 'exact resize width');
  assert.equal(meta.height, 8, 'exact resize height');
  assert.equal(meta.format, 'png', 'PNG output format');

  const contain = await api.resizingImg({
    imagePath: splitPng,
    size: { width: 8, height: 8 },
    maintainAspectRatio: true,
  });
  meta = await sharp(contain).metadata();
  assert.equal(meta.width, 8, 'contain width');
  assert.equal(meta.height, 4, 'contain preserves 2:1 aspect ratio while enlarging');

  const jpeg = await api.resizingImg({
    imagePath: splitPng,
    size: { width: 8, height: 8 },
    maintainAspectRatio: false,
    outputFormat: 'jpeg',
    quality: 80,
  });
  meta = await sharp(jpeg).metadata();
  assert.equal(meta.format, 'jpeg', 'resize outputFormat=jpeg must not be ignored');
  assert.equal(meta.width, 8);
  assert.equal(meta.height, 8);

  const portraitRaw = Buffer.alloc(2 * 4 * 3, 120);
  const oriented = await sharp(portraitRaw, { raw: { width: 2, height: 4, channels: 3 } })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  const orientedResize = await api.resizingImg({
    imagePath: oriented,
    size: { width: 8, height: 8 },
    maintainAspectRatio: true,
  });
  meta = await sharp(orientedResize).metadata();
  assert.equal(meta.width, 8, 'orientation-aware resize width');
  assert.equal(meta.height, 4, 'orientation-aware resize uses effective 2:1 dimensions');

  await expectError(
    () => api.resizingImg({ imagePath: splitPng, size: { width: 3.5, height: 4 } }),
    (error) => error.code === 'APEXIFY_INPUT',
    'fractional resize dimensions'
  );
  await expectError(
    () => api.resizingImg({ imagePath: splitPng, size: { width: 0, height: 4 } }),
    (error) => error.code === 'APEXIFY_INPUT',
    'zero resize dimension'
  );

  // Converter shares the same preflight and normalizes the common jpg alias.
  const converted = await api.converter(splitPng, 'jpg');
  assert.equal((await sharp(converted).metadata()).format, 'jpeg');

  // Crop semantics: x=0/y=0 is valid, negative/out-of-source bounds are rejected.
  const crop = await api.cropRasterImage(rectCrop(splitUri, 0, 0, 2, 2));
  let raw = await rgba(crop);
  assert.equal(raw.info.width, 2);
  assert.equal(raw.info.height, 2);
  near(pixel(raw, 0, 0), [255, 0, 0, 255], 2, 'crop origin pixel');

  await expectError(
    () => api.cropRasterImage(rectCrop(splitUri, -1, 0, 2, 2)),
    (error) => error.code === 'APEXIFY_INPUT',
    'negative crop coordinate'
  );
  await expectError(
    () => api.cropRasterImage(rectCrop(splitUri, 0, 0, 9, 2)),
    (error) => error.code === 'APEXIFY_INPUT',
    'crop beyond source bounds'
  );

  // Fit behavior: fill stretches, contain letterboxes, cover fills the target.
  const image = await api.loadImageCached(splitUri);
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    api.drawImageFitted(ctx, image, 8, 8, 'contain', 'center');
    const data = ctx.getImageData(0, 0, 8, 8).data;
    assert.equal(data[3], 0, 'contain must leave transparent letterbox at y=0');
    const middle = [...ctx.getImageData(0, 3, 1, 1).data];
    near(middle, [255, 0, 0, 255], 2, 'contain image at x=0');
  }
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    api.drawImageFitted(ctx, image, 8, 8, 'cover', 'center');
    assert.ok([...ctx.getImageData(0, 0, 8, 8).data].filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255), 'cover fills target');
  }
  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    api.drawImageFitted(ctx, image, 8, 8, 'fill', 'center');
    assert.ok([...ctx.getImageData(0, 0, 8, 8).data].filter((_, i) => i % 4 === 3).every((alpha) => alpha === 255), 'fill stretches to target');
  }

  // Full background pipeline: solid/transparent/custom opacity/filter/layer order.
  const creator = new api.CanvasCreator();
  raw = await rgba((await creator.createCanvas({ width: 4, height: 4, colorBg: '#112233' })).buffer);
  near(pixel(raw, 0, 0), [17, 34, 51, 255], 2, 'solid background');

  raw = await rgba((await creator.createCanvas({ width: 4, height: 4, transparentBase: true })).buffer);
  near(pixel(raw, 0, 0), [0, 0, 0, 0], 0, 'transparent base');

  raw = await rgba((await creator.createCanvas({
    width: 4,
    height: 2,
    customBg: { source: splitUri, fit: 'fill', opacity: 0.5 },
  })).buffer);
  const half = pixel(raw, 0, 0);
  assert.ok(half[3] >= 126 && half[3] <= 129, `custom background opacity rendered more than once: ${half}`);

  raw = await rgba((await creator.createCanvas({
    width: 4,
    height: 2,
    customBg: { source: splitUri, fit: 'fill', filters: [{ type: 'invert' }] },
  })).buffer);
  near(pixel(raw, 0, 0), [0, 255, 255, 255], 3, 'custom background filter');

  raw = await rgba((await creator.createCanvas({
    width: 2,
    height: 2,
    transparentBase: true,
    bgLayers: [
      { type: 'color', value: '#ff0000' },
      { type: 'color', value: '#0000ff', opacity: 0.5 },
    ],
  })).buffer);
  near(pixel(raw, 0, 0), [127, 0, 128, 255], 2, 'background layer order');

  // Filtering a custom background must not filter pixels already present on the target.
  const transparentRight = makeSplitCanvas(4, 2, true);
  const transparentRightUri = dataUri(transparentRight.toBuffer('image/png'));
  const target = createCanvas(4, 2);
  const targetCtx = target.getContext('2d');
  targetCtx.fillStyle = '#00ff00';
  targetCtx.fillRect(0, 0, 4, 2);
  await creator.paintCanvasOntoExisting(target, {
    width: 4,
    height: 2,
    customBg: { source: transparentRightUri, fit: 'fill', filters: [{ type: 'invert' }] },
  });
  near([...targetCtx.getImageData(3, 0, 1, 1).data], [0, 255, 0, 255], 2, 'custom filter isolation');

  // Alpha-mask semantics and shared structured validation.
  const sourceMaskCanvas = createCanvas(2, 1);
  const sourceMaskCtx = sourceMaskCanvas.getContext('2d');
  sourceMaskCtx.fillStyle = '#ff0000';
  sourceMaskCtx.fillRect(0, 0, 2, 1);
  const alphaMaskCanvas = createCanvas(2, 1);
  const alphaMaskCtx = alphaMaskCanvas.getContext('2d');
  alphaMaskCtx.fillStyle = 'rgba(255,255,255,1)';
  alphaMaskCtx.fillRect(0, 0, 1, 1);
  const masked = await api.applyRasterMask(sourceMaskCanvas.toBuffer('image/png'), alphaMaskCanvas.toBuffer('image/png'), { type: 'alpha' });
  raw = await rgba(masked);
  assert.equal(pixel(raw, 0, 0)[3], 255);
  assert.equal(pixel(raw, 1, 0)[3], 0);
  await expectError(
    () => api.applyRasterMask(sourceMaskCanvas.toBuffer('image/png'), alphaMaskCanvas.toBuffer('image/png'), { type: 'bogus' }),
    (error) => error.code === 'APEXIFY_INPUT',
    'mask structured validation'
  );

  // Cache stability: repeated source hits, LRU entry bound, TTL expiry, disable mode,
  // and failed decodes do not remain as poisoned entries.
  api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 60_000, maxEntries: 3, maxBytes: 1024 * 1024 } });
  api.clearDecodedImageCache();
  await api.loadImageCached(splitUri);
  await api.loadImageCached(splitUri);
  let stats = api.getDecodedImageCacheStats();
  assert.ok(stats.hits >= 1, `cache hit missing: ${JSON.stringify(stats)}`);
  for (let i = 0; i < 8; i++) {
    const cv = createCanvas(2, 2);
    const cx = cv.getContext('2d');
    cx.fillStyle = `rgb(${i * 20},${255 - i * 20},${i * 10})`;
    cx.fillRect(0, 0, 2, 2);
    await api.loadImageCached(dataUri(cv.toBuffer('image/png')));
  }
  stats = api.getDecodedImageCacheStats();
  assert.ok(stats.entries <= 3, `LRU entry bound exceeded: ${JSON.stringify(stats)}`);
  assert.ok(stats.bytes <= 1024 * 1024, `cache byte bound exceeded: ${JSON.stringify(stats)}`);

  try { await api.loadImageCached('data:image/png;base64,AA=='); } catch {}
  stats = api.getDecodedImageCacheStats();
  assert.ok(stats.entries <= 3, `failed decode poisoned cache: ${JSON.stringify(stats)}`);

  api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 1, maxEntries: 3, maxBytes: 1024 * 1024 } });
  api.clearDecodedImageCache();
  await api.loadImageCached(splitUri);
  await new Promise((resolve) => setTimeout(resolve, 8));
  await api.loadImageCached(splitUri);
  stats = api.getDecodedImageCacheStats();
  assert.ok(stats.misses >= 2, `TTL expiry did not force a miss: ${JSON.stringify(stats)}`);

  api.configureApexifyRuntime({ cache: { enabled: false, ttlMs: 60_000, maxEntries: 3, maxBytes: 1024 * 1024 } });
  api.clearDecodedImageCache();
  await api.loadImageCached(splitUri);
  stats = api.getDecodedImageCacheStats();
  assert.equal(stats.entries, 0, `disabled cache retained decoded image: ${JSON.stringify(stats)}`);

  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  console.log('phase5-completion: resize/crop/fit/background/mask/cache completion semantics passed.');
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  try { api.clearDecodedImageCache(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
