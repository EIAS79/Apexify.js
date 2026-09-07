'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

const INITIAL_RUNS = 5;
const CONFIRMATION_RUNS = 6;
const DEFAULT_REGRESSION_TOLERANCE = 0.10;

function png(width, height, color) {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function workload() {
  const pathCreator = new api.Path2DCreator();
  for (let i = 0; i < 250; i++) {
    pathCreator.createPath2D([
      { type: 'moveTo', x: 0, y: 0 },
      { type: 'lineTo', x: 20 + (i % 10), y: 5 },
      { type: 'arc', x: 20, y: 20, radius: 5, startAngle: 0, endAngle: Math.PI },
      { type: 'closePath' },
    ]);
  }
  const pixels = new api.PixelDataCreator();
  let image = png(96, 96, '#336699');
  for (let i = 0; i < 5; i++) image = await pixels.manipulatePixels(image, { filter: i % 2 ? 'grayscale' : 'invert', intensity: 0.5 });
  const charts = new api.ChartCreator();
  for (let i = 0; i < 3; i++) {
    await charts.createChart('line', [{ label: 'bench', data: Array.from({ length: 30 }, (_, x) => ({ x, y: Math.sin(x / 4) * 20 })) }], { dimensions: { width: 360, height: 240 } });
  }
  const a = png(64, 48, '#ff0000');
  const b = png(48, 64, '#00ff00');
  for (let i = 0; i < 4; i++) await api.stitchImages([a, b, a, b], { direction: 'grid', spacing: 2 });
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function sampleOnce(times, rss) {
  if (global.gc) global.gc();
  const before = process.memoryUsage().rss;
  const start = performance.now();
  await workload();
  const elapsed = performance.now() - start;
  if (global.gc) global.gc();
  times.push(elapsed);
  rss.push(Math.max(0, process.memoryUsage().rss - before) / (1024 * 1024));
}

function metrics(times, rss) {
  return {
    medianElapsedMs: Number(median(times).toFixed(2)),
    medianRssDeltaMb: Number(median(rss).toFixed(2)),
  };
}

(async () => {
  const nodeMajor = process.versions.node.split('.')[0];
  const platformKey = `${process.platform}-${process.arch}-node${nodeMajor}`;
  const baselinePath = path.join(__dirname, 'baselines', 'phase12.json');
  const baselines = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    : { schemaVersion: 1, regressionTolerance: DEFAULT_REGRESSION_TOLERANCE, baselines: {} };
  const baseline = baselines.baselines?.[platformKey];
  const tolerance = baselines.regressionTolerance ?? DEFAULT_REGRESSION_TOLERANCE;
  const elapsedLimit = baseline ? baseline.medianElapsedMs * (1 + tolerance) : undefined;
  const rssLimit = baseline
    ? Math.max(baseline.medianRssDeltaMb * (1 + tolerance), baseline.medianRssDeltaMb + 16)
    : undefined;

  const times = [];
  const rss = [];
  for (let run = 0; run < INITIAL_RUNS; run++) await sampleOnce(times, rss);

  const initial = metrics(times, rss);
  const initialBreach = Boolean(
    baseline &&
    ((elapsedLimit !== undefined && initial.medianElapsedMs > elapsedLimit) ||
      (rssLimit !== undefined && initial.medianRssDeltaMb > rssLimit))
  );

  if (initialBreach) {
    console.warn(
      `phase12-benchmark: initial ${INITIAL_RUNS}-sample median breached the committed regression gate for ${platformKey}; ` +
      `collecting ${CONFIRMATION_RUNS} confirmatory samples without changing the threshold.`
    );
    for (let run = 0; run < CONFIRMATION_RUNS; run++) await sampleOnce(times, rss);
  }

  const finalMetrics = metrics(times, rss);
  const result = {
    schemaVersion: 2,
    platformKey,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    runs: times.length,
    initialRuns: INITIAL_RUNS,
    confirmationRuns: initialBreach ? CONFIRMATION_RUNS : 0,
    confirmationTriggered: initialBreach,
    initialMedianElapsedMs: initial.medianElapsedMs,
    initialMedianRssDeltaMb: initial.medianRssDeltaMb,
    medianElapsedMs: finalMetrics.medianElapsedMs,
    medianRssDeltaMb: finalMetrics.medianRssDeltaMb,
    samples: times.map((value, index) => ({ elapsedMs: Number(value.toFixed(2)), rssDeltaMb: Number(rss[index].toFixed(2)) })),
    workload: { pathBuilds: 250, pixelPasses: 5, lineCharts: 3, gridStitches: 4 },
  };

  if (baseline) {
    result.baseline = baseline;
    result.regressionTolerance = tolerance;
    result.regressionLimits = {
      elapsedMs: Number(elapsedLimit.toFixed(2)),
      rssDeltaMb: Number(rssLimit.toFixed(2)),
    };
  } else {
    console.warn(`phase12-benchmark: no committed baseline for ${platformKey}; emitting candidate evidence.`);
  }

  fs.mkdirSync('artifacts/benchmarks', { recursive: true });
  fs.writeFileSync(`artifacts/benchmarks/phase12-${platformKey}.json`, JSON.stringify(result, null, 2) + '\n');

  if (baseline) {
    assert(
      result.medianElapsedMs <= elapsedLimit,
      `Phase 12 confirmed benchmark regression: ${result.medianElapsedMs}ms > ${elapsedLimit.toFixed(2)}ms (${Math.round(tolerance * 100)}% tolerance; ${result.runs} samples)`
    );
    assert(
      result.medianRssDeltaMb <= rssLimit,
      `Phase 12 confirmed RSS regression: ${result.medianRssDeltaMb} MiB > ${rssLimit.toFixed(2)} MiB (${result.runs} samples)`
    );
  }

  console.log(
    `phase12-benchmark: ${platformKey} median ${result.medianElapsedMs}ms, RSS ${result.medianRssDeltaMb} MiB` +
    (initialBreach ? ` after ${CONFIRMATION_RUNS} confirmatory samples` : '')
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
