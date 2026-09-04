'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function pixel(buffer, x, y) {
  const raw = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * raw.info.width + x) * raw.info.channels;
  return [...raw.data.subarray(i, i + 4)];
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();

  // Asset manager: explicit duplicates, replacement, nested object/array paths, cloning, and deletion.
  const assets = new api.AssetManager();
  const palette = { primary: '#ff0000', secondary: '#00ff00' };
  assets.loadPalette('theme', palette);
  palette.primary = '#000000';
  assert.equal(assets.resolve('theme.primary'), '#ff0000');
  assert.throws(() => assets.loadPalette('theme', { primary: '#fff' }), api.ApexifyAssetError);
  assets.replacePalette('theme', { primary: '#112233' });
  assert.equal(assets.resolve('theme.primary'), '#112233');

  const objectAsset = { nested: { answer: 42 }, flags: [false, 0, '', 'ok'] };
  assets.loadValue('meta', objectAsset);
  objectAsset.nested.answer = 99;
  assert.equal(assets.resolve('meta.nested.answer'), 42);
  assert.equal(assets.resolve('meta.flags.0'), false);
  assert.equal(assets.resolve('meta.flags.1'), 0);
  assert.equal(assets.resolve('meta.flags.2'), '');
  assert.throws(() => assets.resolve('meta.missing'), api.ApexifyAssetError);
  assert.equal(assets.has('meta'), true);
  assert.deepEqual(assets.list().map((entry) => entry.name).sort(), ['meta', 'theme']);
  assert.equal(assets.delete('meta'), true);
  assert.equal(assets.has('meta'), false);

  assets.loadValue('meta', { flags: [false, 0, '', 'ok'] });
  const resolver = (ref) => assets.resolve(ref);
  assert.deepEqual(api.resolveAssetRefsDeep({ a: '$meta.flags.0', b: '$meta.flags.1', c: '$meta.flags.2' }, resolver), { a: false, b: 0, c: '' });
  assert.equal(api.resolveAssetStringLeaf('value=$meta.flags.1', resolver), 'value=0');
  assert.equal(api.resolveAssetStringLeaf('$$meta.flags.1', resolver), '$meta.flags.1');
  const cycle = {}; cycle.self = cycle;
  assert.throws(() => api.resolveAssetRefsDeep(cycle, resolver), api.ApexifyAssetError);

  const imageAsset = solidPng(4, 4, '#ff0000');
  assets.loadImage('logo', imageAsset);
  assert.throws(() => api.resolveAssetStringLeaf('prefix $logo', resolver), api.ApexifyAssetError);
  const resolvedBuffer = api.resolveAssetStringLeaf('$logo', resolver);
  assert.equal(Buffer.isBuffer(resolvedBuffer), true);
  resolvedBuffer[0] ^= 0xff;
  assert.notDeepEqual(resolvedBuffer, assets.resolve('logo'), 'resolved Buffer must not mutate registry storage');

  const painter = new api.ApexPainter();
  painter.assets.loadImage('logo', imageAsset);
  painter.assets.loadPalette('brand', { red: '#ff0000', blue: '#0000ff' });

  // Builder copy-on-ingress and snapshot isolation.
  const inputLayer = { type: 'imageBuffer', buffer: solidPng(2, 2, '#ff0000'), x: 0, y: 0, width: 8, height: 8 };
  const background = { colorBg: '#000000' };
  const builder = painter.createScene({ width: 8, height: 8, background, layers: [inputLayer] });
  inputLayer.x = 5;
  inputLayer.buffer[0] ^= 0xff;
  background.colorBg = '#ffffff';
  let snapshot = builder.toRenderInput();
  assert.equal(snapshot.layers[0].x, 0);
  assert.equal(snapshot.background.colorBg, '#000000');
  snapshot.layers[0].x = 6;
  assert.equal(builder.toRenderInput().layers[0].x, 0);

  // Builder ordering contract: bottom -> top, insert/replace/move/remove.
  const red = solidPng(4, 4, '#ff0000');
  const blue = solidPng(4, 4, '#0000ff');
  const green = solidPng(4, 4, '#00ff00');
  const order = painter.createScene(4, 4)
    .addLayer({ type: 'imageBuffer', buffer: red, x: 0, y: 0, width: 4, height: 4 })
    .addLayer({ type: 'imageBuffer', buffer: blue, x: 0, y: 0, width: 4, height: 4 });
  assert.deepEqual(await pixel(await order.render(), 1, 1), [0, 0, 255, 255]);
  order.insertBefore(1, { type: 'imageBuffer', buffer: green, x: 0, y: 0, width: 4, height: 4 });
  order.moveLayer(2, 0);
  assert.deepEqual(await pixel(await order.render(), 1, 1), [0, 255, 0, 255]);
  order.replaceLayer(2, { type: 'imageBuffer', buffer: red, x: 0, y: 0, width: 4, height: 4 });
  assert.deepEqual(await pixel(await order.render(), 1, 1), [255, 0, 0, 255]);
  order.removeLayer(2);
  assert.equal(order.layerCount, 2);
  assert.throws(() => order.insertAfter(99, { type: 'imageBuffer', buffer: red, x: 0, y: 0 }), api.ApexifyInputError);

  // Nested surface clipping, transform isolation, opacity, and deterministic repeated render.
  const nestedScene = {
    width: 12,
    height: 12,
    background: { colorBg: '#000000' },
    layers: [{
      type: 'surface',
      placement: { x: 2, y: 2, width: 6, height: 6, opacity: 0.5 },
      background: { transparentBase: true },
      layers: [{ type: 'imageBuffer', buffer: red, x: -2, y: -2, width: 10, height: 10 }],
    }],
  };
  const nestedA = await painter.renderScene(nestedScene, { resolveAssetRefs: false });
  const nestedB = await painter.renderScene(nestedScene, { resolveAssetRefs: false });
  assert.equal(nestedA.equals(nestedB), true, 'identical scene must render deterministically');
  assert.equal((await pixel(nestedA, 1, 1))[0], 0, 'child surface must clip before parent placement');
  const inside = await pixel(nestedA, 3, 3);
  assert.ok(inside[0] >= 125 && inside[0] <= 130 && inside[1] === 0 && inside[2] === 0, `nested opacity mismatch: ${inside}`);

  // Scene background dimensions are not a second source of truth.
  assert.throws(() => painter.validateSceneRenderInput({ width: 4, height: 4, background: { width: 99 }, layers: [] }), api.ApexifyInputError);

  // Total nested pixel budget is enforced before allocation.
  api.configureApexifyRuntime({ limits: { maxCanvasDimension: 100, maxTotalPixels: 100, maxSceneTotalPixels: 150 } });
  await assert.rejects(
    painter.renderScene({
      width: 10, height: 10, layers: [{ type: 'surface', placement: { x: 0, y: 0, width: 10, height: 10 }, layers: [] }],
    }, { resolveAssetRefs: false }),
    api.ApexifyResourceLimitError
  );
  api.resetApexifyRuntimeConfig();

  // Reused Buffer-backed asset should decode once and hit the bounded decoded-image cache thereafter.
  api.clearDecodedImageCache();
  const reused = await painter.renderScene({
    width: 10,
    height: 4,
    layers: [
      { type: 'image', images: { source: '$logo', x: 0, y: 0, width: 4, height: 4 } },
      { type: 'image', images: { source: '$logo', x: 5, y: 0, width: 4, height: 4 } },
    ],
  });
  assert.equal(Buffer.isBuffer(reused), true);
  const stats = api.getDecodedImageCacheStats();
  assert.ok(stats.sets >= 1, `expected a cache set: ${JSON.stringify(stats)}`);
  assert.ok(stats.hits >= 1, `expected repeated Buffer asset cache hit: ${JSON.stringify(stats)}`);

  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  console.log('phase6-scenes-assets: scene mutation/order/surfaces/limits and asset semantics passed.');
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  try { api.clearDecodedImageCache(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
