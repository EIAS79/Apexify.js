'use strict';

const assert = require('node:assert/strict');

async function main() {
  const { detectColors } = require('../node_modules/.cache/apexify-phase3/phase3-entry.cjs');
  // 2x1 PNG: one opaque red pixel + one fully transparent pixel.
  const source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8Dwn4GBgQEADPwB//0td20AAAAASUVORK5CYII=';
  const colors = await detectColors(source);
  const red = colors.find((entry) => entry.color === '255,0,0');
  assert.ok(red, 'opaque red pixel must be reported');
  assert.equal(red.frequency, '50.00', 'detectColors must retain historical total-pixel frequency semantics');
  console.log('Phase 3 compatibility tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
