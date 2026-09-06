'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

let state = 0x10a5f00d;
function rnd() {
  state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
  return (state >>> 0) / 0x100000000;
}
function between(min, max) { return min + rnd() * (max - min); }

(async () => {
  // Path commands: bounded finite random geometry should never emit NaN/native crashes.
  const path = new api.Path2DCreator();
  for (let i = 0; i < 100; i++) {
    const commands = [
      { type: 'moveTo', x: between(-100, 100), y: between(-100, 100) },
      { type: 'lineTo', x: between(-100, 100), y: between(-100, 100) },
      { type: 'arc', x: between(-50, 50), y: between(-50, 50), radius: between(0, 40), startAngle: between(-6, 6), endAngle: between(-6, 6) },
      { type: 'closePath' },
    ];
    assert(path.createPath2D(commands));
  }

  // Text wrapping: random Unicode/width combinations must terminate and produce finite metrics.
  const alphabet = Array.from('abc XYZ-._😀é世مرحبا');
  const metricsCreator = new api.TextMetricsCreator();
  for (let i = 0; i < 60; i++) {
    const length = 1 + Math.floor(rnd() * 80);
    let text = '';
    for (let j = 0; j < length; j++) text += alphabet[Math.floor(rnd() * alphabet.length)];
    if (i % 5 === 0) text += '\n\n' + text.slice(0, 5);
    const metrics = await metricsCreator.measureText({
      text, x: 0, y: 0,
      font: { family: 'Arial', size: 8 + Math.floor(rnd() * 30) },
      layout: { maxWidth: 1 + Math.floor(rnd() * 160), lineHeight: 0.8 + rnd() * 1.8 },
    });
    assert(Number.isFinite(metrics.width) && metrics.width >= 0);
    assert(Number.isFinite(metrics.totalHeight) && metrics.totalHeight >= 0);
    assert(metrics.lineCount >= 1);
  }

  // Chart invalid numeric trees consistently reject NaN/Infinity rather than reaching renderer math.
  const charts = new api.ChartCreator();
  for (const bad of [NaN, Infinity, -Infinity]) {
    await assert.rejects(() => charts.createChart('line', [{ label: 'x', data: [{ x: 0, y: bad }] }]), api.ApexifyInputError);
    await assert.rejects(() => charts.createChart('pie', [{ label: 'x', value: bad }]), api.ApexifyInputError);
  }

  // Pixel coordinates around exact borders have one consistent policy: in-range succeeds, out-of-range rejects.
  const canvas = api.createCanvas(8, 8);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = '#123456'; ctx.fillRect(0, 0, 8, 8);
  const buffer = canvas.toBuffer('image/png');
  const pixels = new api.PixelDataCreator();
  assert.deepEqual(await pixels.getColor(buffer, 7, 7), { r: 18, g: 52, b: 86, a: 255 });
  for (const [x, y] of [[8, 0], [0, 8], [-1, 0], [0, -1]]) {
    await assert.rejects(() => pixels.getColor(buffer, x, y), api.ApexifyInputError);
  }

  console.log('phase10-fuzz: bounded path/text/chart/pixel property checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
