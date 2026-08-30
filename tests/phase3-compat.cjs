'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');

async function main() {
  const { detectColors, imgEffects } = require('../node_modules/.cache/apexify-phase3/phase3-entry.cjs');

  // 2x1 PNG: one opaque red pixel + one fully transparent pixel.
  const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8Dwn4GBgQEADPwB//0td20AAAAASUVORK5CYII=';
  const colors = await detectColors(source);
  const red = colors.find((entry) => entry.color === '255,0,0');
  assert.ok(red, 'opaque red pixel must be reported');
  assert.equal(red.frequency, '50.00', 'detectColors must retain historical total-pixel frequency semantics');

  const effectCanvas = createCanvas(8, 8);
  const effectCtx = effectCanvas.getContext('2d');
  effectCtx.fillStyle = '#ff0000';
  effectCtx.fillRect(0, 0, 4, 8);
  effectCtx.fillStyle = '#0000ff';
  effectCtx.fillRect(4, 0, 4, 8);
  const effectSource = effectCanvas.toBuffer('image/png');

  const legacyFlip = await imgEffects(effectSource, [{ type: 'flip', horizontal: true }]);
  assert.ok(Buffer.isBuffer(legacyFlip) && legacyFlip.length > 0, 'legacy flip effect must remain supported');

  const legacyGreyscale = await imgEffects(effectSource, [{ type: 'greyscale' }]);
  assert.ok(Buffer.isBuffer(legacyGreyscale) && legacyGreyscale.length > 0, 'legacy greyscale effect must remain supported');

  const motionBlur = await imgEffects(effectSource, [{ type: 'motionBlur', intensity: 3, angle: 0 }]);
  assert.ok(Buffer.isBuffer(motionBlur) && motionBlur.length > 0, 'typed motionBlur effect must be implemented');

  const emboss = await imgEffects(effectSource, [{ type: 'emboss', intensity: 1 }]);
  assert.ok(Buffer.isBuffer(emboss) && emboss.length > 0, 'typed emboss effect must be implemented');

  console.log('Phase 3 compatibility tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
