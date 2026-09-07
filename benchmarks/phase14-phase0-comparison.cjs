'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'artifacts', 'benchmarks');
const baselinePath = path.join(__dirname, 'baselines', 'phase0-node20-linux.json');
const cjsEntry = path.join(root, 'dist', 'cjs', 'index.cjs');
fs.mkdirSync(outputDir, { recursive: true });

function bytesOf(value) {
  if (Buffer.isBuffer(value)) return value.length;
  if (value && Buffer.isBuffer(value.buffer)) return value.buffer.length;
  if (value && typeof value.base64 === 'string') return Buffer.byteLength(value.base64, 'base64');
  return null;
}

async function measure(name, operation) {
  if (global.gc) global.gc();
  const startRss = process.memoryUsage().rss;
  let peakRss = startRss;
  const sampler = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
  }, 5);
  sampler.unref();

  const started = performance.now();
  try {
    const value = await operation();
    const ended = performance.now();
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return {
      name,
      status: 'pass',
      wallMs: Number((ended - started).toFixed(3)),
      startRssBytes: startRss,
      peakRssBytes: peakRss,
      rssDeltaBytes: peakRss - startRss,
      outputBytes: bytesOf(value),
    };
  } catch (error) {
    const ended = performance.now();
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    return {
      name,
      status: 'fail',
      wallMs: Number((ended - started).toFixed(3)),
      startRssBytes: startRss,
      peakRssBytes: peakRss,
      rssDeltaBytes: peakRss - startRss,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearInterval(sampler);
  }
}

function measureColdImport() {
  const started = performance.now();
  const proc = spawnSync(process.execPath, ['-e', "require('./dist/cjs/index.cjs')"], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
  });
  const ended = performance.now();
  return {
    name: 'cold-cjs-import',
    status: proc.status === 0 ? 'pass' : 'fail',
    wallMs: Number((ended - started).toFixed(3)),
    exitCode: proc.status,
    signal: proc.signal,
    error: proc.status === 0 ? undefined : (proc.stderr || proc.stdout || 'cold import failed').trim().slice(0, 2000),
  };
}

function ffmpegAvailable() {
  const proc = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', timeout: 10000 });
  return proc.status === 0;
}

function percentChange(baseline, final) {
  if (!Number.isFinite(baseline) || baseline === 0 || !Number.isFinite(final)) return null;
  return Number((((final - baseline) / baseline) * 100).toFixed(2));
}

function compareToPhase0(finalMeasurements) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const baselineByName = new Map(baseline.measurements.map((entry) => [entry.name, entry]));
  return finalMeasurements.map((final) => {
    const initial = baselineByName.get(final.name);
    if (!initial) return { name: final.name, baseline: null, final, comparable: false, reason: 'No Phase 0 workload with this name.' };
    if (initial.status !== 'pass' || final.status !== 'pass') {
      return {
        name: final.name,
        baseline: initial,
        final,
        comparable: false,
        reason: initial.status !== 'pass' ? `Phase 0 status was ${initial.status}.` : `Final status was ${final.status}.`,
      };
    }
    return {
      name: final.name,
      baseline: initial,
      final,
      comparable: true,
      wallPercentChange: percentChange(initial.wallMs, final.wallMs),
      rssDeltaPercentChange: percentChange(initial.rssDeltaBytes, final.rssDeltaBytes),
      peakRssPercentChange: percentChange(initial.peakRssBytes, final.peakRssBytes),
    };
  });
}

async function main() {
  if (!fs.existsSync(cjsEntry)) throw new Error('Phase 14 benchmark requires a completed package build at dist/cjs/index.cjs.');
  if (!fs.existsSync(baselinePath)) throw new Error('Committed Phase 0 baseline evidence is missing.');

  const results = [];
  results.push(measureColdImport());

  const { ApexPainter } = require(cjsEntry);
  const painter = new ApexPainter('png');

  let base1200;
  results.push(await measure('canvas-1200x630', async () => {
    base1200 = await painter.createCanvas({ width: 1200, height: 630, colorBg: '#101820' });
    return base1200;
  }));

  results.push(await measure('text-render', async () => painter.createText({
    text: 'Apexify.js Phase 0 baseline',
    x: 72,
    y: 160,
    font: { size: 56, family: 'Arial' },
    fill: { color: '#ffffff' },
  }, base1200.buffer)));

  const sourceImage = await painter.createCanvas({ width: 320, height: 180, colorBg: '#3a86ff' });
  results.push(await measure('single-image-composition', async () => painter.createImage({
    source: sourceImage.buffer,
    x: 440,
    y: 225,
    width: 320,
    height: 180,
    borderRadius: 18,
  }, base1200.buffer)));

  results.push(await measure('medium-scene', async () => painter.renderScene({
    width: 1200,
    height: 630,
    background: { colorBg: '#0b132b' },
    layers: [
      { type: 'image', images: { source: 'rectangle', x: 80, y: 80, width: 1040, height: 470, shape: { fill: true, color: '#1c2541' }, borderRadius: 24 } },
      { type: 'text', texts: { text: 'Medium scene', x: 140, y: 180, font: { size: 54, family: 'Arial' }, fill: { color: '#ffffff' } } },
      { type: 'text', texts: { text: 'Apexify.js reengineering baseline', x: 140, y: 260, font: { size: 30, family: 'Arial' }, fill: { color: '#d8e2dc' } } },
      { type: 'imageBuffer', buffer: sourceImage.buffer, x: 140, y: 330, width: 320, height: 180, globalAlpha: 0.95 },
      { type: 'surface', placement: { x: 700, y: 330, width: 300, height: 160 }, background: { colorBg: '#5bc0be' }, layers: [
        { type: 'text', texts: { text: 'nested surface', x: 24, y: 80, font: { size: 28, family: 'Arial' }, fill: { color: '#0b132b' } } },
      ] },
    ],
  })));

  const chartData = Array.from({ length: 8 }, (_, i) => ({
    label: `S${i + 1}`,
    value: [14, 38, 29, 51, 44, 63, 57, 72][i],
    xStart: i,
    xEnd: i + 1,
  }));
  results.push(await measure('chart-render', async () => painter.createChart('bar', chartData)));

  const gifCanvas = await painter.createCanvas({ width: 320, height: 180, colorBg: '#14213d' });
  const gifFrame = await painter.createText({
    text: 'Apexify',
    x: 72,
    y: 105,
    font: { size: 42, family: 'Arial' },
    fill: { color: '#fca311' },
  }, gifCanvas.buffer);
  const gifFrames = Array.from({ length: 30 }, () => ({ duration: 33, buffer: gifFrame }));
  results.push(await measure('gif-30-frame', async () => painter.createGIF(gifFrames, {
    outputFormat: 'buffer',
    width: 320,
    height: 180,
    repeat: 0,
    quality: 10,
  })));

  results.push(await measure('audio-10-second', async () => painter.createAudio.synth({
    duration: 10,
    sampleRate: 44100,
    channels: 2,
    masterGain: 0.5,
    layers: [
      { waveform: 'sine', frequency: 220, frequencyEnd: 440, duration: 10, gain: 0.35 },
      { waveform: 'triangle', frequency: 110, duration: 10, gain: 0.15, pan: -0.25 },
    ],
  })));

  const hasFfmpeg = ffmpegAvailable();
  if (hasFfmpeg) {
    const frameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase14-video-'));
    const videoOutput = path.join(frameDir, 'final.mp4');
    try {
      const frameBuffers = [];
      for (let i = 0; i < 30; i += 1) {
        const cv = await painter.createCanvas({ width: 320, height: 180, colorBg: i % 2 ? '#264653' : '#2a9d8f' });
        frameBuffers.push(await painter.createText({
          text: `Frame ${String(i + 1).padStart(2, '0')}`,
          x: 78,
          y: 100,
          font: { size: 34, family: 'Arial' },
          fill: { color: '#ffffff' },
        }, cv.buffer));
      }
      results.push(await measure('video-from-frames', async () => painter.createVideo({
        source: frameBuffers[0],
        createFromFrames: {
          frames: frameBuffers,
          outputPath: videoOutput,
          fps: 10,
          format: 'mp4',
          quality: 'medium',
          resolution: { width: 320, height: 180 },
        },
      })));
    } finally {
      fs.rmSync(frameDir, { recursive: true, force: true });
    }
  } else {
    results.push({ name: 'video-from-frames', status: 'skipped', reason: 'ffmpeg executable unavailable' });
  }

  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const comparisons = compareToPhase0(results);
  const report = {
    schemaVersion: 1,
    phase: 14,
    generatedAt: new Date().toISOString(),
    baselineSubjectSha: baseline.baselineSubjectSha,
    finalSubjectSha: process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || null,
    baselineRuntime: { node: baseline.node, platform: baseline.platform, ffmpegAvailable: baseline.ffmpegAvailable },
    finalRuntime: { node: process.version, platform: `${process.platform}-${process.arch}`, ffmpegAvailable: hasFfmpeg },
    comparisonCaveat: 'Phase 0 used Node 20 and a different GitHub-hosted runner image. Percentages are directional evidence, not a hardware/runtime-normalized controlled A/B.',
    measurements: results,
    comparisons,
  };

  const nodeMajor = process.versions.node.split('.')[0];
  const outputPath = path.join(outputDir, `phase14-phase0-comparison-node-${nodeMajor}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`phase14-phase0-comparison: wrote ${path.relative(root, outputPath)}`);
  for (const item of comparisons) {
    if (item.comparable) console.log(`${item.name}: wall ${item.wallPercentChange}% | peak RSS ${item.peakRssPercentChange}% | RSS delta ${item.rssDeltaPercentChange}%`);
    else console.log(`${item.name}: not directly comparable (${item.reason})`);
  }

  if (results.some((entry) => entry.status === 'fail')) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
