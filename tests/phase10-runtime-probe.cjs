'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

function mark(name) {
  console.log(`PHASE10_RUNTIME_PROBE ${name}`);
}

function png(width, height, color) {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

(async () => {
  mark('start');

  const canvas = api.createCanvas(320, 180);
  const ctx = api.getCanvasContext(canvas);
  const textProps = {
    text: 'AReallyLongTokenThatMustWrap\n\nCafé 😀 مرحبا 世界',
    x: 0,
    y: 0,
    font: { size: 20, family: 'Arial' },
    layout: { maxWidth: 95, lineHeight: 1.2 },
    fill: { color: '#111111', opacity: 1 },
  };
  await api.EnhancedTextRenderer.renderText(ctx, textProps);
  await new api.TextMetricsCreator().measureText(textProps);
  mark('text');

  const pixels = new api.PixelDataCreator();
  const black = png(4, 4, '#000000');
  const red = await pixels.setPixelColor(black, 0, 0, { r: 255, g: 0, b: 0, a: 255 });
  await pixels.getPixelColor(red, 0, 0);
  await pixels.manipulatePixels(red, { filter: 'invert', intensity: 0, region: { x: 0, y: 0, width: 1, height: 1 } });
  mark('pixels');

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase10-probe-'));
  try {
    const session = { saveCounter: 0 };
    await api.saveImageBuffer(red, { directory: dir, filename: 'image.png' }, session);
    await api.saveImageBuffer(red, { directory: dir, filename: 'image.png' }, session);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
  mark('save');

  const source = png(64, 32, '#336699');
  for (const format of ['jpeg', 'webp', 'avif']) {
    await api.compressImage(source, { format, quality: 70, maxWidth: 32 });
    mark(`compress-${format}`);
  }
  await api.extractPalette(source, { count: 4, method: 'median-cut', format: 'hex' });
  mark('palette');

  const a = png(20, 10, '#ff0000');
  const b = png(10, 20, '#00ff00');
  await api.stitchImages([a, b], { direction: 'horizontal', spacing: 2 });
  await api.stitchImages([a, b], { direction: 'vertical', spacing: 3 });
  mark('stitch');
  await api.createCollage([
    { source: a }, { source: b }, { source: a }, { source: b }, { source: a },
  ], { type: 'grid', columns: 2, rows: 1, spacing: 1, background: '#000000' });
  mark('collage');

  const charts = new api.ChartCreator();
  const chartCases = [
    ['pie', [{ label: 'A', value: 2 }, { label: 'B', value: 1 }], { dimensions: { width: 320, height: 240 } }],
    ['bar', [{ label: 'A', value: -2, xStart: 0, xEnd: 1 }, { label: 'B', value: 3, xStart: 1, xEnd: 2 }], { dimensions: { width: 320, height: 240 } }],
    ['horizontalBar', [{ label: 'A', value: -2 }, { label: 'B', value: 3 }], { dimensions: { width: 320, height: 240 } }],
    ['line', [{ label: 'zero', data: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], { dimensions: { width: 320, height: 240 } }],
    ['scatter', [{ label: 'mixed', data: [{ x: -1, y: -1 }, { x: 2, y: 3 }] }], { dimensions: { width: 320, height: 240 } }],
    ['radar', [{ label: 'R', values: [0, 2, 4] }], { dimensions: { width: 320, height: 240 }, radar: { categories: ['α', 'β', 'γ'] } }],
    ['polarArea', [{ label: 'A', value: 1 }, { label: 'B', value: 3 }], { dimensions: { width: 320, height: 240 } }],
  ];
  for (const [type, data, options] of chartCases) {
    mark(`chart-${type}-start`);
    await charts.createChart(type, data, options);
    mark(`chart-${type}-done`);
  }

  mark('combo-start');
  await charts.createComboChart({
    dimensions: { width: 320, height: 240 },
    bars: [{ label: 'B', value: 3, xStart: 0, xEnd: 1 }],
    lines: [{ label: 'L', yAxis: 'primary', data: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }],
  });
  mark('combo-done');

  mark('comparison-start');
  await charts.createComparisonChart({
    dimensions: { width: 640, height: 240 },
    layout: 'sideBySide',
    chart1: { type: 'pie', data: [{ label: 'A', value: 2 }, { label: 'B', value: 1 }], options: {} },
    chart2: { type: 'line', data: [{ label: 'L', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], options: {} },
  });
  mark('comparison-done');

  let active = 0;
  const fakePainter = {
    async createCanvas(config) {
      active++;
      await new Promise((resolve) => setTimeout(resolve, 8 + (5 - config.width)));
      active--;
      return { buffer: Buffer.from([config.width]) };
    },
    async createImage() { throw new Error('not used'); },
    async createText() { throw new Error('not used'); },
    async append(value) { return Buffer.from(value); },
  };
  await api.batchOperations(fakePainter, [1, 2, 3, 4, 5].map((width) => ({ type: 'canvas', config: { width, height: 1 } })), { concurrency: 2 });
  await api.chainOperations(fakePainter, [{ method: 'append', args: [[1, 2, 3]] }]);
  mark('batch-chain');

  for (const key of ['IMGUR_CLIENT_ID', 'IMGUR_CLIENT_SECRET', 'IMGUR_ACCESS_TOKEN', 'IMGUR_REFRESH_TOKEN']) delete process.env[key];
  try { await api.uploadImgur(source); } catch {}
  mark('upload-preflight');

  mark('done');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
