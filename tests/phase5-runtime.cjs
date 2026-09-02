'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

function pixel(ctx, x, y) {
  return [...ctx.getImageData(x, y, 1, 1).data];
}

function near(a, b, tolerance = 3) {
  return a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
}

function canvasFromPixels(width, height, pixels) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  image.data.set(pixels);
  ctx.putImageData(image, 0, 0);
  return { canvas, ctx };
}

async function expectError(fn, predicate, label) {
  let caught;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: expected an error`);
  assert.ok(predicate(caught), `${label}: unexpected error ${caught?.name}: ${caught?.message}`);
  return caught;
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();

  const png = await sharp({
    create: { width: 8, height: 6, channels: 4, background: { r: 220, g: 20, b: 30, alpha: 1 } },
  }).png().toBuffer();
  const inspected = await api.inspectImageSource(png, { requireCanvasBudget: true });
  assert.equal(inspected.width, 8);
  assert.equal(inspected.height, 6);
  assert.equal(inspected.pages, 1);
  assert.equal(inspected.format, 'png');
  assert.equal(inspected.svg, false);
  assert.ok(inspected.sourceBytes > 0);

  const decoded = await api.decodeImageSource(png, { requireCanvasBudget: true });
  assert.equal(decoded.width, 8);
  assert.equal(decoded.height, 6);

  const bombSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="20000"><rect width="1" height="1"/></svg>');
  const bomb = await expectError(
    () => api.inspectImageSource(bombSvg),
    (error) => error.code === 'APEXIFY_RESOURCE_LIMIT' && error.limit === 'maxDecodedImagePixels',
    'decoded-pixel preflight'
  );
  assert.ok(bomb.actual > bomb.maximum);

  const externalSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="https://example.com/a.png"/></svg>');
  await expectError(
    () => api.inspectImageSource(externalSvg),
    (error) => error.code === 'APEXIFY_DECODE' && /external SVG resource/i.test(error.message),
    'SVG external resource policy'
  );

  const activeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  await expectError(
    () => api.inspectImageSource(activeSvg),
    (error) => error.code === 'APEXIFY_DECODE' && /active SVG content/i.test(error.message),
    'SVG active-content policy'
  );

  api.configureApexifyRuntime({ limits: { maxSvgElements: 3 } });
  const denseSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/><rect/><rect/><rect/></svg>');
  await expectError(
    () => api.inspectImageSource(denseSvg),
    (error) => error.code === 'APEXIFY_RESOURCE_LIMIT' && error.limit === 'maxSvgElements',
    'SVG element limit'
  );
  api.resetApexifyRuntimeConfig();

  const dataUri = `data:image/png;base64,${png.toString('base64')}`;
  api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 60_000, maxEntries: 8, maxBytes: 1024 * 1024 } });
  api.clearDecodedImageCache();
  await api.loadImageCached(dataUri);
  await api.loadImageCached(dataUri);
  let stats = api.getDecodedImageCacheStats();
  assert.ok(stats.sets >= 1, `expected decoded cache set, got ${JSON.stringify(stats)}`);
  assert.ok(stats.hits >= 1, `expected decoded cache hit, got ${JSON.stringify(stats)}`);
  assert.equal(stats.entries, 1);

  const medium = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } },
  }).png().toBuffer();
  const mediumUri = `data:image/png;base64,${medium.toString('base64')}`;
  api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 60_000, maxEntries: 8, maxBytes: 1024 } });
  api.clearDecodedImageCache();
  await api.loadImageCached(mediumUri);
  stats = api.getDecodedImageCacheStats();
  assert.equal(stats.entries, 0, `oversized decoded image must not remain cached: ${JSON.stringify(stats)}`);
  assert.ok(stats.bytes <= 1024);
  api.resetApexifyRuntimeConfig();

  {
    const canvas = createCanvas(8, 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'linear',
      startX: 0,
      startY: 0,
      endX: 4,
      endY: 0,
      repeat: 'repeat',
      colors: [{ stop: 1, color: '#0000ff' }, { stop: 0, color: '#ff0000' }],
    }, { x: 0, y: 0, w: 4, h: 2 });
    ctx.fillRect(0, 0, 8, 2);
    assert.ok(near(pixel(ctx, 1, 0), pixel(ctx, 5, 0)), 'repeat gradient must repeat its raster period');
  }

  {
    const canvas = createCanvas(8, 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'linear',
      startX: 0,
      startY: 0,
      endX: 4,
      endY: 0,
      repeat: 'reflect',
      colors: [{ stop: 0, color: '#ff0000' }, { stop: 1, color: '#0000ff' }],
    }, { x: 0, y: 0, w: 4, h: 2 });
    ctx.fillRect(0, 0, 8, 2);
    assert.ok(near(pixel(ctx, 0, 0), pixel(ctx, 7, 0), 8), 'reflect gradient must mirror the adjacent period');
    assert.ok(near(pixel(ctx, 1, 0), pixel(ctx, 6, 0), 8), 'reflect gradient symmetry must hold inside the period');
  }

  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'radial',
      startX: 0,
      startY: 0,
      startRadius: 0,
      endX: 0,
      endY: 0,
      endRadius: 8,
      colors: [{ stop: 0, color: '#ffffff' }, { stop: 1, color: '#000000' }],
    }, { x: 0, y: 0, w: 8, h: 8 });
    ctx.fillRect(0, 0, 8, 8);
    const origin = pixel(ctx, 0, 0);
    const far = pixel(ctx, 7, 7);
    assert.ok(origin[0] > far[0] + 100, `explicit zero radial center was not preserved: ${origin} vs ${far}`);
  }

  {
    const canvas = createCanvas(8, 8);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = api.createGradientFill(ctx, {
      type: 'conic',
      centerX: 0,
      centerY: 0,
      startAngle: 0,
      colors: [{ stop: 0, color: '#ff0000' }, { stop: 0.5, color: '#00ff00' }, { stop: 1, color: '#0000ff' }],
    }, { x: 0, y: 0, w: 8, h: 8 });
    ctx.fillRect(0, 0, 8, 8);
    assert.notDeepEqual(pixel(ctx, 7, 0), pixel(ctx, 0, 7), 'conic gradient must render around explicit zero center');
  }

  await expectError(
    async () => {
      const canvas = createCanvas(4, 4);
      const ctx = canvas.getContext('2d');
      api.createGradientFill(ctx, {
        type: 'linear',
        colors: [{ stop: -0.1, color: '#fff' }, { stop: 1, color: '#000' }],
      }, { x: 0, y: 0, w: 4, h: 4 });
    },
    (error) => error.code === 'APEXIFY_INPUT' && /stop/i.test(error.message),
    'invalid gradient stop'
  );

  {
    const canvas = createCanvas(4, 4);
    const ctx = canvas.getContext('2d');
    api.drawBar(ctx, 0, 0, 4, 4, '#ff0000', undefined, 0);
    const alpha = ctx.getImageData(0, 0, 4, 4).data.filter((_, i) => i % 4 === 3);
    assert.ok([...alpha].every((value) => value === 0), 'bar opacity=0 must remain fully transparent');
  }

  const sourcePixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      sourcePixels[i] = x * 16;
      sourcePixels[i + 1] = y * 16;
      sourcePixels[i + 2] = (x + y) * 8;
      sourcePixels[i + 3] = 255;
    }
  }

  {
    const a = canvasFromPixels(16, 16, sourcePixels);
    const b = canvasFromPixels(16, 16, sourcePixels);
    await api.applyContextImageFilters(a.ctx, [{ type: 'noise', intensity: 0.5 }], 16, 16);
    await api.applyContextImageFilters(b.ctx, [{ type: 'noise', intensity: 0.5 }], 16, 16);
    assert.deepEqual(
      [...a.ctx.getImageData(0, 0, 16, 16).data],
      [...b.ctx.getImageData(0, 0, 16, 16).data],
      'noise filter must be deterministic for reproducible golden renders'
    );
  }

  {
    const zero = canvasFromPixels(16, 16, sourcePixels);
    const center = canvasFromPixels(16, 16, sourcePixels);
    await api.applyContextImageFilters(zero.ctx, [{ type: 'radialBlur', intensity: 12, centerX: 0, centerY: 0 }], 16, 16);
    await api.applyContextImageFilters(center.ctx, [{ type: 'radialBlur', intensity: 12, centerX: 8, centerY: 8 }], 16, 16);
    assert.notDeepEqual(
      [...zero.ctx.getImageData(0, 0, 16, 16).data],
      [...center.ctx.getImageData(0, 0, 16, 16).data],
      'radial blur centerX=0/centerY=0 must not fall back to canvas center'
    );
  }

  await expectError(
    async () => {
      const { ctx } = canvasFromPixels(16, 16, sourcePixels);
      await api.applyContextImageFilters(ctx, [{ type: 'radialBlur', intensity: 2, centerX: -1, centerY: 0 }], 16, 16);
    },
    (error) => error.code === 'APEXIFY_INPUT',
    'radial blur coordinate validation'
  );

  const paletteRaw = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const red = x < 32;
      paletteRaw[i] = red ? 255 : 0;
      paletteRaw[i + 1] = 0;
      paletteRaw[i + 2] = red ? 0 : 255;
      paletteRaw[i + 3] = 255;
    }
  }
  const palettePng = await sharp(paletteRaw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();
  const paletteUri = `data:image/png;base64,${palettePng.toString('base64')}`;
  const palette = await api.detectColors(paletteUri);
  assert.ok(palette.length <= 16, `palette must be capped: ${palette.length}`);
  assert.ok(palette.some((entry) => entry.color === '255,0,0' && Number(entry.frequency) > 40), JSON.stringify(palette));
  assert.ok(palette.some((entry) => entry.color === '0,0,255' && Number(entry.frequency) > 40), JSON.stringify(palette));
  assert.deepEqual(await api.detectColors('not-a-real-image-path'), [], 'legacy detectColors failure shape must remain []');

  const blurred = await api.imgEffects(paletteUri, [{ type: 'blur', radius: 3 }]);
  const blurredMeta = await sharp(blurred).metadata();
  assert.equal(blurredMeta.width, 64);
  assert.equal(blurredMeta.height, 64);

  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  console.log('phase5-runtime: decode preflight, SVG policy, cache, gradients, zero defaults, filters, palette, and legacy blur passed.');
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
