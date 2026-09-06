'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

function png(width, height, color) {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

(async () => {
  if (global.gc) global.gc();
  const before = process.memoryUsage().rss;
  const start = performance.now();

  const path = new api.Path2DCreator();
  for (let i = 0; i < 500; i++) {
    path.createPath2D([
      { type: 'moveTo', x: 0, y: 0 },
      { type: 'lineTo', x: 20 + (i % 10), y: 5 },
      { type: 'arc', x: 20, y: 20, radius: 5, startAngle: 0, endAngle: Math.PI },
      { type: 'closePath' },
    ]);
  }

  const pixels = new api.PixelDataCreator();
  let image = png(128, 128, '#336699');
  for (let i = 0; i < 10; i++) image = await pixels.manipulatePixels(image, { filter: i % 2 ? 'grayscale' : 'invert', intensity: 0.5 });

  const charts = new api.ChartCreator();
  for (let i = 0; i < 6; i++) {
    await charts.createChart('line', [{ label: 'bench', data: Array.from({ length: 40 }, (_, x) => ({ x, y: Math.sin(x / 4) * 20 })) }], { dimensions: { width: 480, height: 320 } });
  }

  const a = png(96, 64, '#ff0000');
  const b = png(64, 96, '#00ff00');
  for (let i = 0; i < 8; i++) await api.stitchImages([a, b, a, b], { direction: 'grid', spacing: 2 });

  if (global.gc) global.gc();
  const elapsedMs = performance.now() - start;
  const after = process.memoryUsage().rss;
  const rssDeltaMb = Math.max(0, after - before) / (1024 * 1024);

  assert(elapsedMs < 30000, `Phase 10 benchmark exceeded 30s: ${elapsedMs.toFixed(1)}ms`);
  assert(rssDeltaMb < 384, `Phase 10 benchmark RSS delta exceeded 384 MiB: ${rssDeltaMb.toFixed(1)} MiB`);

  const nodeMajor = process.versions.node.split('.')[0];
  const evidence = {
    node: process.version,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    rssDeltaMb: Number(rssDeltaMb.toFixed(2)),
    workloads: { pathBuilds: 500, pixelPasses: 10, lineCharts: 6, gridStitches: 8 },
    limits: { elapsedMs: 30000, rssDeltaMb: 384 },
  };
  fs.writeFileSync(`phase10-benchmark-node-${nodeMajor}.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`phase10-benchmark: ${elapsedMs.toFixed(1)}ms, RSS delta ${rssDeltaMb.toFixed(1)} MiB`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
