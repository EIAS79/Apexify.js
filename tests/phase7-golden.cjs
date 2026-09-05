'use strict';

const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase7/phase7-entry.cjs');

function framePng(width, height, draw) {
  const canvas = createCanvas(width, height);
  draw(canvas.getContext('2d'));
  return canvas.toBuffer('image/png');
}

function gceBlocks(buffer) {
  const out = [];
  for (let i = 0; i + 7 < buffer.length; i++) {
    if (buffer[i] === 0x21 && buffer[i + 1] === 0xf9 && buffer[i + 2] === 0x04) {
      const packed = buffer[i + 3];
      out.push({
        disposal: (packed >> 2) & 0x07,
        transparent: (packed & 0x01) === 1,
        delayCs: buffer[i + 4] | (buffer[i + 5] << 8),
        transparentIndex: buffer[i + 6],
      });
    }
  }
  return out;
}

function pixel(data, width, channels, x, y) {
  const at = (y * width + x) * channels;
  return Array.from(data.subarray(at, at + channels));
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const painter = new api.ApexPainter();

  const first = framePng(32, 24, (ctx) => {
    ctx.clearRect(0, 0, 32, 24);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(2, 6, 8, 8);
  });
  const second = framePng(32, 24, (ctx) => {
    ctx.clearRect(0, 0, 32, 24);
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(22, 6, 8, 8);
  });

  const gif = await painter.createGIF([
    { buffer: first, duration: 25, dispose: 2, transparentColor: '#000000' },
    { buffer: second, duration: 40, dispose: 3, transparentColor: '0x000000' },
  ], {
    outputFormat: 'buffer', width: 32, height: 24, repeat: -1,
  });

  const blocks = gceBlocks(gif);
  assert.equal(blocks.length, 2, 'two Graphic Control Extension blocks expected');
  assert.deepEqual(blocks.map((b) => b.delayCs), [3, 4], 'millisecond delays must round to GIF 10ms units');
  assert.deepEqual(blocks.map((b) => b.disposal), [2, 3], 'per-frame disposal modes must not leak across frames');
  assert.deepEqual(blocks.map((b) => b.transparent), [true, true], 'transparent color must set transparency flag per frame');

  const metadata = await sharp(gif, { animated: true }).metadata();
  assert.equal(metadata.pages, 2);
  assert.equal(metadata.width, 32);
  assert.equal(metadata.pageHeight ?? 24, 24);

  const decoded = await sharp(gif, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pageHeight = metadata.pageHeight ?? 24;
  const { width, channels } = decoded.info;
  const p1Red = pixel(decoded.data, width, channels, 5, 10);
  assert.ok(p1Red[0] > 180 && p1Red[2] < 80, 'frame 1 should contain red moving object');
  const p2Blue = pixel(decoded.data, width, channels, 25, pageHeight + 10);
  assert.ok(p2Blue[2] > 150 && p2Blue[0] < 120, 'frame 2 should contain blue moving object');
  const p2OldLocation = pixel(decoded.data, width, channels, 5, pageHeight + 10);
  assert.ok(p2OldLocation[3] < 80 || p2OldLocation[0] < 120, 'dispose=2 must prevent a strong red ghost in frame 2');

  // Exact boundary/odd-size output remains a valid decodable GIF.
  const one = framePng(1, 1, (ctx) => { ctx.fillStyle = '#22c55e'; ctx.fillRect(0, 0, 1, 1); });
  const oneGif = await painter.createGIF([{ buffer: one, duration: 10 }], {
    outputFormat: 'buffer', width: 1, height: 1, repeat: -1,
  });
  const oneMeta = await sharp(oneGif).metadata();
  assert.equal(oneMeta.width, 1);
  assert.equal(oneMeta.height, 1);

  const odd = framePng(7, 5, (ctx) => { ctx.fillStyle = '#a855f7'; ctx.fillRect(0, 0, 7, 5); });
  const oddGif = await painter.createGIF([{ buffer: odd }], {
    outputFormat: 'buffer', width: 13, height: 9,
  });
  const oddMeta = await sharp(oddGif).metadata();
  assert.equal(oddMeta.width, 13);
  assert.equal(oddMeta.height, 9);

  // Watermark/text representative output decodes after full composition.
  const base = framePng(40, 24, (ctx) => { ctx.fillStyle = '#111827'; ctx.fillRect(0, 0, 40, 24); });
  const wm = framePng(4, 4, (ctx) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); });
  const composed = await painter.createGIF([{ buffer: base }], {
    outputFormat: 'buffer', width: 40, height: 24,
    watermark: { url: wm, position: 'top-right', margin: 1, scale: 2, opacity: 1 },
    textOverlay: { text: 'OK', x: 2, y: 15, fontSize: 10, fontColor: '#ffffff' },
  });
  const composedRaw = await sharp(composed).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const topRight = pixel(composedRaw.data, composedRaw.info.width, composedRaw.info.channels, 35, 3);
  assert.ok(topRight[0] > 170 && topRight[1] > 170 && topRight[2] > 170, 'watermark should be visible at resolved top-right position');

  console.log('phase7-golden: timing/disposal/transparency, decoded motion, boundary sizing and overlays passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
