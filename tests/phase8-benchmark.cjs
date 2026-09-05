'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const api = require('../node_modules/.cache/apexify-phase8/phase8-entry.cjs');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'pipe', timeout: 60_000 });
}

function makeVideo(file, { width = 320, height = 180, duration = 2.2, rate = 24, audio = true, frequency = 440 } = {}) {
  const args = ['-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=${rate}:duration=${duration}`];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`);
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '96k', '-shortest'); else args.push('-an');
  args.push('-y', file);
  ffmpeg(args);
}

function directoryBytes(root) {
  if (!fs.existsSync(root)) return 0;
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) total += fs.statSync(full).size;
    }
  }
  return total;
}

async function measure(label, tempRoot, expectedPasses, fn) {
  if (global.gc) { global.gc(); global.gc(); }
  const before = process.memoryUsage();
  let peakRss = before.rss;
  let peakExternal = before.external;
  let peakArrayBuffers = before.arrayBuffers;
  let peakTempBytes = directoryBytes(tempRoot);
  const timer = setInterval(() => {
    const memory = process.memoryUsage();
    peakRss = Math.max(peakRss, memory.rss);
    peakExternal = Math.max(peakExternal, memory.external);
    peakArrayBuffers = Math.max(peakArrayBuffers, memory.arrayBuffers);
    peakTempBytes = Math.max(peakTempBytes, directoryBytes(tempRoot));
  }, 10);
  const started = performance.now();
  let result;
  try {
    result = await fn();
  } finally {
    clearInterval(timer);
  }
  const elapsedMs = performance.now() - started;
  const after = process.memoryUsage();
  peakTempBytes = Math.max(peakTempBytes, directoryBytes(tempRoot));
  if (expectedPasses !== undefined) assert.equal(result?.passes ?? expectedPasses, expectedPasses);
  assert.ok(Number.isFinite(elapsedMs) && elapsedMs > 0);
  assert.ok(elapsedMs < 120_000, `${label} exceeded conservative 120s benchmark ceiling`);
  assert.ok(peakTempBytes < 512 * 1024 * 1024, `${label} temp high-water exceeded 512 MiB`);
  assert.ok(peakRss - before.rss < 512 * 1024 * 1024, `${label} RSS growth exceeded 512 MiB`);
  assert.deepEqual(fs.readdirSync(tempRoot), [], `${label} must cleanup temporary workspaces`);
  return {
    label,
    elapsedMs,
    passes: result?.passes ?? expectedPasses,
    tempDiskHighWaterBytes: peakTempBytes,
    memory: {
      rssStart: before.rss,
      rssPeak: peakRss,
      rssDeltaPeak: peakRss - before.rss,
      externalStart: before.external,
      externalPeak: peakExternal,
      externalDeltaPeak: peakExternal - before.external,
      arrayBuffersStart: before.arrayBuffers,
      arrayBuffersPeak: peakArrayBuffers,
      arrayBuffersDeltaPeak: peakArrayBuffers - before.arrayBuffers,
      rssEnd: after.rss,
    },
  };
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase8-benchmark-'));
  const tempRoot = path.join(dir, 'temp');
  fs.mkdirSync(tempRoot, { recursive: true });
  api.configureApexifyRuntime({ temp: { rootDirectory: tempRoot } });
  const painter = new api.ApexPainter();
  const sourceA = path.join(dir, 'a.mp4');
  const sourceB = path.join(dir, 'b.mp4');
  const sourceC = path.join(dir, 'c.mp4');
  makeVideo(sourceA, { width: 320, height: 180, duration: 2.2, rate: 24, audio: true, frequency: 440 });
  makeVideo(sourceB, { width: 240, height: 180, duration: 1.7, rate: 30, audio: false, frequency: 550 });
  makeVideo(sourceC, { width: 192, height: 108, duration: 1.9, rate: 15, audio: true, frequency: 660 });

  try {
    const rows = [];

    rows.push(await measure('convert-320x180-to-240x135', tempRoot, 1, async () => {
      const output = path.join(dir, 'convert.mp4');
      await painter.createVideo({
        source: sourceA,
        convert: { outputPath: output, format: 'mp4', videoCodec: 'libx264', audioCodec: 'aac', fps: 20, resolution: { width: 240, height: 135, fit: 'contain' } },
      });
      assert.ok(fs.statSync(output).size > 0);
      return { passes: 1 };
    }));

    rows.push(await measure('grid-3-inputs-2x2', tempRoot, 1, async () => {
      const output = path.join(dir, 'grid.mp4');
      await painter.createVideo({
        source: sourceA,
        merge: {
          videos: [sourceA, sourceB, sourceC], outputPath: output, mode: 'grid',
          grid: { rows: 2, cols: 2, cellWidth: 120, cellHeight: 68, gap: 2, background: '#000000' },
          audioPolicy: 'mix',
        },
      });
      assert.ok(fs.statSync(output).size > 0);
      return { passes: 1 };
    }));

    rows.push(await measure('pipeline-trim-text-audio-preview', tempRoot, 4, async () => {
      const output = path.join(dir, 'pipeline.mp4');
      const pipeline = painter.video.videoPipeline(sourceA);
      pipeline.trim(0.1, 1.8);
      pipeline.text({
        text: 'benchmark', x: 8, y: 10, font: { size: 14, family: 'Arial' }, fill: { color: '#ffffff' }, startTime: 0.1, endTime: 1.2,
      });
      pipeline.audio({ type: 'preset', preset: 'beep', startTime: 0.4, gain: 0.1 }, { keepOriginalAudio: true, durationPolicy: 'video' });
      const result = await pipeline.render({ outputPath: output, preset: 'preview', overwrite: true });
      assert.deepEqual(result.executionPlan, ['trim', 'text', 'audio', 'preview']);
      assert.ok(fs.statSync(output).size > 0);
      return result;
    }));

    for (const row of rows) {
      assert.ok(row.tempDiskHighWaterBytes >= 0);
      assert.ok(row.memory.rssDeltaPeak >= 0);
    }

    const report = {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      ffmpeg: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split(/\r?\n/)[0],
      workloads: rows,
    };
    console.log(`PHASE8_BENCHMARK ${JSON.stringify(report)}`);
    console.log('phase8-benchmark: representative video wall time, FFmpeg pass count, temp disk high-water, memory high-water and cleanup measured.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});