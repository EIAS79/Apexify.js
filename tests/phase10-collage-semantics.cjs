'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

function png(width, height, color) {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

(async () => {
  const source = png(10, 10, '#336699');
  const masonry = await api.createCollage([
    { source, width: 10, height: 30 },
    { source, width: 10, height: 10 },
    { source, width: 10, height: 20 },
  ], { type: 'masonry', columns: 2, spacing: 1 });
  const metadata = await sharp(masonry).metadata();
  assert.deepEqual([metadata.width, metadata.height], [21, 31], 'masonry must place each next tile in the shortest column');
  console.log('phase10-collage-semantics: shortest-column masonry passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
