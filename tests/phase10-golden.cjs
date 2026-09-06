'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
function canvasPng(width, height, color = '#ffffff') {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}
async function fingerprint(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let nonTransparent = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 0) nonTransparent++;
    if (data[i] + data[i + 1] + data[i + 2] < 300) dark++;
  }
  return { sha256: sha(buffer), width: info.width, height: info.height, nonTransparent, dark };
}

(async () => {
  const observed = {};

  const textRender = async () => {
    const { canvas, ctx } = canvasPng(360, 180);
    await api.EnhancedTextRenderer.renderText(ctx, {
      text: 'Apexify\nCafé • 世界 • 😀', x: 8, y: 28,
      font: { family: 'Arial', size: 24 },
      layout: { maxWidth: 180, lineHeight: 1.25 },
      fill: { color: '#111111' },
      stroke: { color: '#555555', width: 1 },
      effects: { shadow: { color: '#999999', blur: 1, offsetX: 1, offsetY: 1 } },
      decorations: { underline: true, strikethrough: true },
    });
    return canvas.toBuffer('image/png');
  };
  const t1 = await textRender(), t2 = await textRender();
  assert.equal(sha(t1), sha(t2), 'text golden must be deterministic');
  observed.text = await fingerprint(t1);
  assert(observed.text.dark > 50);

  const charts = new api.ChartCreator();
  const cases = {
    pie: [[{ label: 'A', value: 2 }, { label: 'B', value: 1 }], { dimensions: { width: 320, height: 240 }, legend: { show: true } }],
    bar: [[{ label: 'neg', value: -2, xStart: 0, xEnd: 1 }, { label: 'pos', value: 3, xStart: 1, xEnd: 2 }], { dimensions: { width: 320, height: 240 } }],
    horizontalBar: [[{ label: 'neg', value: -2 }, { label: 'pos', value: 3 }], { dimensions: { width: 320, height: 240 } }],
    line: [[{ label: 'series', data: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }] }], { dimensions: { width: 320, height: 240 }, legend: { show: true } }],
    scatter: [[{ label: 'points', data: [{ x: -1, y: -2 }, { x: 0, y: 0 }, { x: 2, y: 3 }] }], { dimensions: { width: 320, height: 240 }, legend: { show: true } }],
    radar: [[{ label: 'R', values: [1, 3, 2] }], { dimensions: { width: 320, height: 240 }, radar: { categories: ['One', 'Two', 'Three'] }, legend: { show: true } }],
    polarArea: [[{ label: 'One', value: 1 }, { label: 'Two', value: 3 }, { label: 'Three', value: 2 }], { dimensions: { width: 320, height: 240 }, legend: { show: true } }],
  };
  observed.charts = {};
  for (const [type, [data, options]] of Object.entries(cases)) {
    const first = await charts.createChart(type, data, options);
    const second = await charts.createChart(type, data, options);
    assert.equal(sha(first), sha(second), `${type} golden must be deterministic`);
    observed.charts[type] = await fingerprint(first);
    assert.equal(observed.charts[type].width, 320);
    assert.equal(observed.charts[type].height, 240);
  }

  const base = canvasPng(300, 100).canvas.toBuffer('image/png');
  const pathCreator = new api.Path2DCreator();
  const pathCommands = [
    { type: 'roundedRect', x: 10, y: 10, width: 80, height: 50, radius: 8 },
    { type: 'circle', x: 130, y: 35, radius: 25 },
    { type: 'star', x: 210, y: 35, outerRadius: 28, innerRadius: 12, points: 5 },
  ];
  const p1 = await pathCreator.drawPath(base, pathCommands, { fill: { color: '#336699' }, stroke: { color: '#111111', width: 2 } });
  const p2 = await pathCreator.drawPath(base, pathCommands, { fill: { color: '#336699' }, stroke: { color: '#111111', width: 2 } });
  assert.equal(sha(p1), sha(p2), 'path golden must be deterministic');
  observed.path = await fingerprint(p1);

  const red = canvasPng(20, 10, '#ff0000').canvas.toBuffer('image/png');
  const green = canvasPng(10, 20, '#00ff00').canvas.toBuffer('image/png');
  const stitchA = await api.stitchImages([red, green], { direction: 'horizontal', spacing: 2 });
  const stitchB = await api.stitchImages([red, green], { direction: 'horizontal', spacing: 2 });
  assert.equal(sha(stitchA), sha(stitchB));
  observed.stitch = await fingerprint(stitchA);
  const collageA = await api.createCollage([{ source: red }, { source: green }, { source: red }], { type: 'grid', columns: 2, spacing: 1, background: '#000000' });
  const collageB = await api.createCollage([{ source: red }, { source: green }, { source: red }], { type: 'grid', columns: 2, spacing: 1, background: '#000000' });
  assert.equal(sha(collageA), sha(collageB));
  observed.collage = await fingerprint(collageA);

  fs.writeFileSync('phase10-golden-observed.json', JSON.stringify(observed, null, 2) + '\n');
  console.log('phase10-golden: deterministic visual fingerprints generated and verified.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
