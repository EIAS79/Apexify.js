'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase5/phase5-entry.cjs');

async function expectError(fn, predicate, label) {
  let caught;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: expected an error`);
  assert.ok(predicate(caught), `${label}: unexpected ${caught?.name}: ${caught?.message}`);
}

function firstPixel(image) {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return [...ctx.getImageData(0, 0, 1, 1).data];
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();

  // Direct byte and data-URL sources are local inputs and must use
  // maxImageSourceBytes, not the smaller remote transport cap.
  const localPng = await sharp({
    create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
  }).png().toBuffer();
  assert.ok(localPng.byteLength > 32, `fixture unexpectedly too small: ${localPng.byteLength}`);
  api.configureApexifyRuntime({
    limits: { maxRemoteImageBytes: 32, maxImageSourceBytes: 1024 * 1024 },
  });
  const inspected = await api.inspectImageSource(localPng);
  assert.equal(inspected.width, 8);
  assert.equal(inspected.height, 8);
  const inspectedDataUrl = await api.inspectImageSource(`data:image/png;base64,${localPng.toString('base64')}`);
  assert.equal(inspectedDataUrl.width, 8);
  assert.equal(inspectedDataUrl.height, 8);
  api.resetApexifyRuntimeConfig();

  // Every opening SVG element must count, including elements omitted by the old
  // whitelist such as stop/symbol/marker/tspan/a.
  api.configureApexifyRuntime({ limits: { maxSvgElements: 5 } });
  const manyStops = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">' +
    '<defs><linearGradient id="g"><stop offset="0"/><stop offset=".5"/><stop offset="1"/></linearGradient></defs>' +
    '<rect width="10" height="10" fill="url(#g)"/></svg>'
  );
  await expectError(
    () => api.inspectImageSource(manyStops),
    (error) => error.code === 'APEXIFY_RESOURCE_LIMIT' && error.limit === 'maxSvgElements',
    'generic SVG complexity accounting'
  );
  api.resetApexifyRuntimeConfig();

  // A reflected gradient's expanded 2x2 mirror surface must be budgeted before
  // allocating it. The base 80x80 period is valid under this test limit; 160x160 is not.
  api.configureApexifyRuntime({ limits: { maxTotalPixels: 10_000 } });
  await expectError(
    async () => {
      const canvas = createCanvas(2, 2);
      const ctx = canvas.getContext('2d');
      api.createGradientFill(ctx, {
        type: 'linear',
        startX: 0,
        startY: 0,
        endX: 80,
        endY: 0,
        repeat: 'reflect',
        colors: [{ stop: 0, color: '#000' }, { stop: 1, color: '#fff' }],
      }, { x: 0, y: 0, w: 80, h: 80 });
    },
    (error) => error.code === 'APEXIFY_RESOURCE_LIMIT' && error.limit === 'maxTotalPixels',
    'reflected gradient expansion budget'
  );
  api.resetApexifyRuntimeConfig();

  // file: URL cache keys must track file size/mtime just like path-string keys.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase5-file-url-'));
  try {
    const file = path.join(tmp, 'mutable.png');
    const red = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    }).png().toBuffer();
    const blue = await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    }).png().toBuffer();

    await fs.writeFile(file, red);
    api.configureApexifyRuntime({ cache: { enabled: true, ttlMs: 60_000, maxEntries: 8, maxBytes: 1024 * 1024 } });
    api.clearDecodedImageCache();
    const url = pathToFileURL(file);
    const first = await api.loadImageCached(url);
    assert.deepEqual(firstPixel(first).slice(0, 3), [255, 0, 0]);

    await fs.writeFile(file, blue);
    const future = new Date(Date.now() + 2000);
    await fs.utimes(file, future, future);
    const second = await api.loadImageCached(url);
    assert.deepEqual(firstPixel(second).slice(0, 3), [0, 0, 255], 'file URL cache returned stale pixels');
    const stats = api.getDecodedImageCacheStats();
    assert.ok(stats.sets >= 2, `file URL metadata change should produce a new cache entry: ${JSON.stringify(stats)}`);
  } finally {
    api.resetApexifyRuntimeConfig();
    api.clearDecodedImageCache();
    await fs.rm(tmp, { recursive: true, force: true });
  }

  console.log('phase5-review-regressions: all four review findings plus local data-URL limits are covered and fixed.');
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
