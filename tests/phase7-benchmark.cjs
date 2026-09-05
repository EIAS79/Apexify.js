'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase7/phase7-entry.cjs');

function patternedPng(seed, width = 96, height = 54) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${(seed * 41) % 255}, ${(seed * 73) % 255}, ${(seed * 109) % 255})`;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgb(${(seed * 17 + i * 31) % 255}, ${(seed * 29 + i * 47) % 255}, ${(seed * 53 + i * 13) % 255})`;
    ctx.fillRect((i * 11 + seed) % width, (i * 7 + seed * 3) % height, 12, 8);
  }
  return canvas.toBuffer('image/png');
}

function validGifFile(file) {
  const header = fs.readFileSync(file).subarray(0, 6).toString('ascii');
  return header === 'GIF87a' || header === 'GIF89a';
}

async function timed(label, frames, fn) {
  const started = performance.now();
  await fn();
  const elapsedMs = performance.now() - started;
  return { label, frames, elapsedMs, fps: frames / (elapsedMs / 1000) };
}

function runMemoryWorker(mode, count) {
  const worker = path.join(__dirname, 'phase7-memory-worker.cjs');
  const output = execFileSync(
    process.execPath,
    ['--expose-gc', worker, mode, String(count), '192', '108'],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 1024 * 1024 }
  );
  const line = output.trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const painter = new api.ApexPainter();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase7-benchmark-'));
  const perf = [];

  try {
    // Fresh-process comparison: the reference intentionally retains all source PNGs before encoding.
    const memoryCollect = runMemoryWorker('collect', 100);
    const memoryStream = runMemoryWorker('stream', 100);
    assert.ok(
      memoryStream.sourceBytesHighWater * 20 < memoryCollect.sourceBytesHighWater,
      `streaming source high-water must be bounded to ~one frame: collect=${memoryCollect.sourceBytesHighWater}, stream=${memoryStream.sourceBytesHighWater}`
    );
    assert.ok(
      memoryStream.peakDelta.arrayBuffers < memoryCollect.peakDelta.arrayBuffers ||
      memoryStream.peakDelta.external < memoryCollect.peakDelta.external ||
      memoryStream.peakDelta.rss < memoryCollect.peakDelta.rss,
      'streaming must improve at least one measured process memory high-water metric versus collect-all reference'
    );

    const smallFrames = Array.from({ length: 8 }, (_, i) => ({ buffer: patternedPng(i), duration: 10 }));
    const mediumFrames = Array.from({ length: 30 }, (_, i) => ({ buffer: patternedPng(i + 20), duration: 10 }));
    const localSource = path.join(dir, 'local.png');
    fs.writeFileSync(localSource, patternedPng(999));
    const watermark = patternedPng(777, 12, 8);

    perf.push(await timed('small-array-buffer', 8, async () => {
      const out = path.join(dir, 'small.gif');
      await painter.createGIF(smallFrames, { outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1 });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('medium-array-buffer', 30, async () => {
      const out = path.join(dir, 'medium.gif');
      await painter.createGIF(mediumFrames, { outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1 });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('asynciterable-100', 100, async () => {
      const out = path.join(dir, 'stream-100.gif');
      await painter.createGIF(undefined, {
        outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1,
        onStart: async () => (async function* () {
          for (let i = 0; i < 100; i++) yield { buffer: patternedPng(i + 1000), duration: 10 };
        })(),
      });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('asynciterable-180', 180, async () => {
      const out = path.join(dir, 'stream-180.gif');
      await painter.createGIF(undefined, {
        outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1,
        onStart: async () => (async function* () {
          for (let i = 0; i < 180; i++) yield { buffer: patternedPng(i + 2000), duration: 10 };
        })(),
      });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('watermark-30', 30, async () => {
      const out = path.join(dir, 'watermark.gif');
      await painter.createGIF(mediumFrames, {
        outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1,
        watermark: { url: watermark, position: 'bottom-right', opacity: 0.75, scale: 0.75 },
      });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('text-overlay-30', 30, async () => {
      const out = path.join(dir, 'text.gif');
      await painter.createGIF(mediumFrames, {
        outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1,
        textOverlay: { text: 'Phase 7', x: 4, y: 18, fontSize: 12, color: '#ffffff' },
      });
      assert.equal(validGifFile(out), true);
    }));

    perf.push(await timed('local-path-12', 12, async () => {
      const out = path.join(dir, 'local.gif');
      const frames = Array.from({ length: 12 }, () => ({ background: localSource, duration: 10 }));
      await painter.createGIF(frames, { outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1 });
      assert.equal(validGifFile(out), true);
    }));

    const remoteFrame = patternedPng(5000);
    let remoteActive = 0;
    let remotePeak = 0;
    const server = http.createServer((req, res) => {
      remoteActive += 1;
      remotePeak = Math.max(remotePeak, remoteActive);
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': remoteFrame.length });
        res.end(remoteFrame);
        remoteActive -= 1;
      }, 5);
    });
    const port = await listen(server);
    try {
      api.configureApexifyRuntime({
        network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'], retryAttempts: 1, timeoutMs: 2000 },
        limits: { maxBatchConcurrency: 4, maxConcurrentRemoteFetches: 3 },
      });
      perf.push(await timed('remote-equivalent-12', 12, async () => {
        const out = path.join(dir, 'remote.gif');
        const frames = Array.from({ length: 12 }, (_, i) => ({ background: `http://127.0.0.1:${port}/frame?i=${i}`, duration: 10 }));
        await painter.createGIF(frames, { outputFormat: 'file', outputFile: out, width: 96, height: 54, quality: 20, repeat: -1 });
        assert.equal(validGifFile(out), true);
      }));
      assert.ok(remotePeak >= 2 && remotePeak <= 3, `remote benchmark must exercise bounded concurrency, saw ${remotePeak}`);
    } finally {
      await close(server);
      api.resetApexifyRuntimeConfig();
    }

    // Sequential memory-stability diagnostic. GC is diagnostic only; no runtime correctness depends on it.
    const stability = [];
    for (let i = 0; i < 8; i++) {
      const out = path.join(dir, `stable-${i}.gif`);
      await painter.createGIF(undefined, {
        outputFormat: 'file', outputFile: out, width: 64, height: 36, quality: 20, repeat: -1,
        onStart: async () => (async function* () {
          for (let j = 0; j < 6; j++) yield { buffer: patternedPng(i * 10 + j, 64, 36), duration: 10 };
        })(),
      });
      if (global.gc) { global.gc(); global.gc(); }
      stability.push(process.memoryUsage().external);
    }
    const externalGrowth = stability.at(-1) - stability[0];
    assert.ok(externalGrowth < 16 * 1024 * 1024, `repeated GIF creation external-memory growth is suspicious: ${externalGrowth}`);

    for (const row of perf) {
      assert.ok(Number.isFinite(row.elapsedMs) && row.elapsedMs > 0);
      assert.ok(row.elapsedMs < 120_000, `${row.label} exceeded conservative benchmark ceiling`);
      assert.ok(row.fps > 0.1, `${row.label} throughput collapsed below 0.1 fps`);
    }

    const report = {
      memory: {
        collectAll: memoryCollect,
        streaming: memoryStream,
        sourceRetentionReductionPercent: 100 * (1 - memoryStream.sourceBytesHighWater / memoryCollect.sourceBytesHighWater),
      },
      performance: perf,
      stability: { externalBytes: stability, finalMinusFirst: externalGrowth },
    };
    console.log(`PHASE7_BENCHMARK ${JSON.stringify(report)}`);
    console.log('phase7-benchmark: isolated memory comparison, throughput workloads, remote concurrency and stability passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
