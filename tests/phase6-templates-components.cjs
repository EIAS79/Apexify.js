'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function assertLayersRender(painter, layers, label, width = 180, height = 100) {
  const out = await painter.renderScene({ width, height, background: { colorBg: '#111827' }, layers }, { resolveAssetRefs: false });
  assert.ok(Buffer.isBuffer(out) && out.length > 20, `${label} did not render a PNG Buffer`);
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const painter = new api.ApexPainter();
  painter.assets.loadPalette('theme', { text: '#ffffff', accent: '#22c55e' });

  const definition = {
    width: 140,
    height: 70,
    background: { colorBg: '#111827' },
    layers: [
      {
        id: 'box',
        type: 'image',
        source: 'rectangle',
        x: '{{position.x}}',
        y: 2,
        width: 24,
        height: 24,
        shape: { fill: '{{flag}}', color: '$theme.accent' },
      },
      {
        id: 'empty',
        type: 'text',
        text: '{{empty}}',
        x: 30,
        y: 18,
        fontSize: 12,
        color: '$theme.text',
      },
      {
        id: 'fallback',
        type: 'text',
        text: '{{missing | fallback}}',
        x: 30,
        y: 36,
        fontSize: 12,
        color: '$theme.text',
      },
      {
        id: 'hidden',
        type: 'text',
        visible: '{{showHidden}}',
        text: '{{missingWithoutDefault}}',
        x: 30,
        y: 54,
        fontSize: 12,
        color: '$theme.text',
      },
      {
        id: 'nested',
        type: 'text',
        text: '{{person.name}}',
        x: 72,
        y: 18,
        fontSize: 12,
        color: '$theme.text',
      },
    ],
  };

  const handle = painter.createTemplate(definition);
  // Definition is captured by value at handle construction.
  definition.width = 999;
  definition.layers[0].x = 77;

  const data = { position: { x: 0 }, flag: false, empty: '', showHidden: false, person: { name: 'Ada' } };
  const firstPromise = handle.toRenderInput(data, {
    // Overrides target the same template-layer shape users authored; shorthand image/text is normalized afterward.
    overrides: { box: { width: 30, shape: { color: '#ff0000' } } },
    insertions: [{
      targetId: 'nested',
      position: 'before',
      layers: { id: 'inserted', type: 'text', text: 'I', x: 60, y: 18, fontSize: 12, color: '#ffffff' },
    }],
  });
  data.position.x = 44;
  data.flag = true;
  const first = await firstPromise;
  assert.equal(first.width, 140);
  assert.equal(first.layers.length, 5, 'hidden layer must be removed before its missing placeholder is resolved');
  const box = first.layers.find((layer) => layer.type === 'image');
  assert.equal(box.images.x, 0, 'numeric zero placeholder must survive');
  assert.equal(box.images.shape.fill, false, 'boolean false placeholder must survive');
  assert.equal(box.images.width, 30, 'override must win');
  assert.equal(box.images.shape.color, '#ff0000', 'nested override merge must preserve explicit patch');
  const empty = first.layers.find((layer) => layer.type === 'text' && layer.texts.x === 30 && layer.texts.y === 18);
  assert.equal(empty.texts.text, '', 'empty string placeholder must not be treated as missing');
  const fallback = first.layers.find((layer) => layer.type === 'text' && layer.texts.y === 36);
  assert.equal(fallback.texts.text, 'fallback');
  assert.equal(first.layers.some((layer) => layer.type === 'text' && layer.texts.text === 'I'), true, 'insertion missing');
  assert.equal(first.layers.some((layer) => layer.type === 'text' && layer.texts.text === 'Ada'), true, 'nested placeholder missing');

  // Returned scene is independent from future renders and data.
  box.images.x = 91;
  const second = await handle.toRenderInput({ position: { x: 5 }, flag: true, empty: 'E', showHidden: false, person: { name: 'Lin' } });
  assert.equal(second.layers.find((layer) => layer.type === 'image').images.x, 5);
  assert.equal(second.layers.some((layer) => layer.type === 'text' && layer.texts.text === 'Lin'), true);
  assert.equal(second.layers.some((layer) => layer.type === 'text' && layer.texts.text === 'I'), false, 'render-time insertion must not mutate template definition');

  await assert.rejects(handle.toRenderInput({ position: { x: 0 }, flag: true, empty: '', showHidden: false, person: { name: 'A' } }, {
    overrides: { unknown: { x: 1 } },
  }), api.TemplateResolveError);
  await assert.rejects(handle.toRenderInput({ position: { x: 0 }, flag: true, empty: '', showHidden: false, person: { name: 'A' } }, {
    insertions: [{ targetId: 'unknown', position: 'after', layers: { type: 'text', text: 'x', x: 0, y: 10, fontSize: 10 } }],
  }), api.TemplateResolveError);
  await assert.rejects(
    handle.toRenderInput({ position: { x: 0 }, flag: true, empty: '', showHidden: true, person: { name: 'A' } }),
    (error) => error instanceof api.TemplateResolveError && /missingWithoutDefault/.test(error.message)
  );

  const duplicate = painter.createTemplate({
    width: 20,
    height: 20,
    layers: [
      { id: 'same', type: 'text', text: 'A', x: 0, y: 10, fontSize: 10 },
      { id: 'same', type: 'text', text: 'B', x: 0, y: 18, fontSize: 10 },
    ],
  });
  await assert.rejects(duplicate.toRenderInput({}), api.TemplateResolveError);

  // Flex and grid layouts resolve deterministically and validate dimensions.
  const layoutTemplate = painter.createTemplate({
    width: 120,
    height: 80,
    layers: [
      {
        type: 'layout', x: 0, y: 0, width: 120, height: 30,
        layout: { type: 'flex', direction: 'row', gap: 4, padding: 2, align: 'center', justify: 'space-between' },
        children: [
          { type: 'image', source: 'rectangle', width: 10, height: 10, shape: { fill: true, color: '#ff0000' } },
          { type: 'image', source: 'rectangle', width: 10, height: 10, shape: { fill: true, color: '#0000ff' } },
        ],
      },
      {
        type: 'layout', x: 0, y: 35, width: 120, height: 40,
        layout: { type: 'grid', columns: 2, gap: 4, padding: 2, align: 'center', justify: 'center' },
        children: [
          { type: 'text', text: 'A', x: 0, y: 0, fontSize: 10 },
          { type: 'text', text: 'B', x: 0, y: 0, fontSize: 10 },
        ],
      },
    ],
  });
  const layoutInputA = await layoutTemplate.toRenderInput({});
  const layoutInputB = await layoutTemplate.toRenderInput({});
  assert.deepEqual(layoutInputA, layoutInputB, 'repeated template layout resolution must be deterministic');
  assert.equal(layoutInputA.layers.length, 4);
  await assertLayersRender(painter, layoutInputA.layers, 'template layout', 120, 80);

  // Every built-in component must render, not merely return an object.
  await assertLayersRender(painter, painter.components.badge.toLayers({ text: 'NEW', x: 4, y: 4 }), 'badge');
  await assertLayersRender(painter, painter.components.progressBar.toLayers({ x: 4, y: 10, width: 150, height: 24, value: 25, max: 100, showLabel: true }), 'progressBar');
  await assertLayersRender(painter, painter.components.avatar.toLayers({ source: solidPng(20, 20, '#f97316'), x: 10, y: 10, size: 40, borderColor: '#ffffff', borderWidth: 2 }), 'avatar');
  await assertLayersRender(painter, painter.components.card.toLayers({ x: 4, y: 4, width: 170, height: 90, title: 'Title', body: 'Body', borderColor: '#ffffff', borderWidth: 2, padding: 10 }), 'card', 180, 100);
  await assertLayersRender(painter, painter.components.watermark.toLayers({ text: 'Apexify', canvasWidth: 180, canvasHeight: 100, position: 'bottom-right' }), 'watermark');

  // Component edge validation.
  assert.throws(() => painter.components.progressBar.toLayers({ x: 0, y: 0, width: 10, height: 5, value: 1, max: 0 }), api.ApexifyInputError);
  assert.throws(() => painter.components.avatar.toLayers({ source: Buffer.alloc(0), x: 0, y: 0, size: 10 }), api.ApexifyInputError);
  assert.throws(() => painter.components.card.toLayers({ x: 0, y: 0, width: 20, height: 20, padding: 11 }), api.ApexifyInputError);
  assert.throws(() => painter.components.watermark.toLayers({ text: '', canvasWidth: 20, canvasHeight: 20 }), api.ApexifyInputError);

  // Components compose inside template insertion with normal scene validation.
  const badgeLayers = painter.components.badge.toLayers({ text: 'OK', x: 0, y: 0 });
  const componentTemplate = painter.createTemplate({
    width: 140,
    height: 50,
    layers: [{ id: 'anchor', type: 'text', text: 'anchor', x: 80, y: 20, fontSize: 12, color: '#ffffff' }],
  });
  const componentScene = await componentTemplate.toRenderInput({}, {
    insertions: [{ targetId: 'anchor', position: 'before', layers: badgeLayers }],
  });
  await assertLayersRender(painter, componentScene.layers, 'component template composition', 140, 50);

  console.log('phase6-templates-components: placeholders/visibility/overrides/layout/immutability and all built-ins passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
