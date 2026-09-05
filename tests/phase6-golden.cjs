'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

function solid(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function raw(buffer) {
  return sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

function px(r, x, y) {
  const i = (y * r.info.width + x) * r.info.channels;
  return [...r.data.subarray(i, i + 4)];
}

function near(actual, expected, tolerance, label) {
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${label}: ${actual} vs ${expected}`);
}

async function main() {
  const painter = new api.ApexPainter();
  const red = solid(4, 4, '#ff0000');
  const blue = solid(4, 4, '#0000ff');

  // Simple scene reference.
  let image = await raw(await painter.renderScene({ width: 6, height: 6, background: { colorBg: '#123456' }, layers: [] }));
  near(px(image, 0, 0), [18, 52, 86, 255], 1, 'simple scene');

  // Stable bottom-to-top order.
  image = await raw(await painter.renderScene({
    width: 6, height: 6, background: { colorBg: '#000000' },
    layers: [
      { type: 'imageBuffer', buffer: red, x: 0, y: 0, width: 6, height: 6 },
      { type: 'imageBuffer', buffer: blue, x: 2, y: 2, width: 4, height: 4 },
    ],
  }));
  near(px(image, 1, 1), [255, 0, 0, 255], 2, 'multi-layer lower');
  near(px(image, 4, 4), [0, 0, 255, 255], 2, 'multi-layer upper');

  // Nested clipping + inherited surface opacity.
  image = await raw(await painter.renderScene({
    width: 10, height: 10, background: { colorBg: '#000000' },
    layers: [{
      type: 'surface', placement: { x: 2, y: 2, width: 4, height: 4, opacity: 0.5 }, background: { transparentBase: true },
      layers: [{ type: 'imageBuffer', buffer: red, x: -2, y: -2, width: 8, height: 8 }],
    }],
  }));
  near(px(image, 3, 3), [128, 0, 0, 255], 3, 'nested opacity');
  near(px(image, 1, 1), [0, 0, 0, 255], 1, 'nested clipping');
  near(px(image, 7, 7), [0, 0, 0, 255], 1, 'nested clipping far edge');

  // Surface transform remains scoped: rotating a 2x4 child by 90deg produces a horizontal 4x2 footprint.
  image = await raw(await painter.renderScene({
    width: 10, height: 10, background: { colorBg: '#000000' },
    layers: [{
      type: 'surface', placement: { x: 4, y: 3, width: 2, height: 4, rotation: 90 }, background: { colorBg: '#ff0000' }, layers: [],
    }],
  }));
  assert.ok(px(image, 3, 5)[0] > 200, `rotated surface did not extend horizontally: ${px(image, 3, 5)}`);
  assert.ok(px(image, 5, 2)[0] < 20, `surface transform leaked/unexpected footprint: ${px(image, 5, 2)}`);

  // Asset-backed image layer.
  painter.assets.loadImage('goldenLogo', red);
  image = await raw(await painter.renderScene({
    width: 8, height: 4, background: { colorBg: '#000000' },
    layers: [{ type: 'image', images: { source: '$goldenLogo', x: 0, y: 0, width: 4, height: 4 } }],
  }));
  near(px(image, 1, 1), [255, 0, 0, 255], 3, 'asset-backed image');

  // Template-generated scene.
  painter.assets.loadPalette('goldenTheme', { fill: '#00ff00' });
  const template = painter.createTemplate({
    width: 8,
    height: 8,
    background: { colorBg: '#000000' },
    layers: [{ type: 'image', source: 'rectangle', x: '{{x}}', y: 0, width: 4, height: 4, shape: { fill: true, color: '$goldenTheme.fill' } }],
  });
  image = await raw(await template.render({ x: 0 }));
  near(px(image, 1, 1), [0, 255, 0, 255], 3, 'template-generated scene');

  // Built-in component render reference.
  image = await raw(await painter.renderScene({
    width: 80,
    height: 40,
    background: { colorBg: '#000000' },
    layers: painter.components.progressBar.toLayers({ x: 0, y: 0, width: 80, height: 20, value: 50, fill: '#ff0000', background: '#0000ff' }),
  }, { resolveAssetRefs: false }));
  assert.ok(px(image, 10, 10)[0] > 200, `component fill reference: ${px(image, 10, 10)}`);
  assert.ok(px(image, 70, 10)[2] > 200, `component background reference: ${px(image, 70, 10)}`);

  console.log('phase6-golden: simple/multi/nested/assets/templates/components/clipping/transform/opacity references passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
