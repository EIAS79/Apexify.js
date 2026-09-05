'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase7/phase7-entry.cjs');

function makeNoisePng(seed, width, height) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  let x = (seed + 1) * 0x9e3779b1;
  for (let i = 0; i < image.data.length; i += 4) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    image.data[i] = x & 0xff;
    image.data[i + 1] = (x >>> 8) & 0xff;
    image.data[i + 2] = (x >>> 16) & 0xff;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toBuffer('image/png');
}

function snap() {
  const m = process.memoryUsage();
  return { rss: m.rss, heapUsed: m.heapUsed, external: m.external, arrayBuffers: m.arrayBuffers };
}

function maximum(a, b) {
  return {
    rss: Math.max(a.rss, b.rss),
    heapUsed: Math.max(a.heapUsed, b.heapUsed),
    external: Math.max(a.external, b.external),
    arrayBuffers: Math.max(a.arrayBuffers, b.arrayBuffers),
  };
}

async function main() {
  const mode = process.argv[2];
  const count = Number(process.argv[3] ?? 100);
  const width = Number(process.argv[4] ?? 192);
  const height = Number(process.argv[5] ?? 108);
  if (!['collect', 'stream'].includes(mode) || !Number.isInteger(count) || count < 1) process.exit(2);

  api.resetApexifyRuntimeConfig();
  if (global.gc) { global.gc(); global.gc(); }
  const base = snap();
  let peak = base;
  let maxSourceBytes = 0;
  let retainedSourceBytes = 0;
  const sample = () => { peak = maximum(peak, snap()); };
  const timer = setInterval(sample, 2);
  timer.unref();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `apexify-phase7-memory-${mode}-`));
  const outputFile = path.join(dir, 'out.gif');
  const painter = new api.ApexPainter();
  const started = performance.now();

  try {
    if (mode === 'collect') {
      const frames = [];
      for (let i = 0; i < count; i++) {
        const buffer = makeNoisePng(i, width, height);
        frames.push({ buffer, duration: 10 });
        retainedSourceBytes += buffer.byteLength;
        maxSourceBytes = retainedSourceBytes;
        sample();
      }
      await painter.createGIF(frames, {
        outputFormat: 'file', outputFile, width, height, repeat: -1, quality: 20,
      });
      // Keep `frames` live until after the measurement to model the old collect-all architecture.
      if (frames.length !== count) throw new Error('collect reference lost frames');
      sample();
    } else {
      await painter.createGIF(undefined, {
        outputFormat: 'file', outputFile, width, height, repeat: -1, quality: 20,
        onStart: async () => (async function* () {
          for (let i = 0; i < count; i++) {
            const buffer = makeNoisePng(i, width, height);
            maxSourceBytes = Math.max(maxSourceBytes, buffer.byteLength);
            sample();
            yield { buffer, duration: 10 };
            // Diagnostic GC makes retained-source differences observable; correctness never depends on GC.
            if (global.gc && i % 10 === 9) global.gc();
            sample();
          }
        })(),
      });
      sample();
    }

    const elapsedMs = performance.now() - started;
    const after = snap();
    console.log(JSON.stringify({
      mode,
      count,
      width,
      height,
      elapsedMs,
      fps: count / (elapsedMs / 1000),
      sourceBytesHighWater: maxSourceBytes,
      baseline: base,
      peak,
      after,
      peakDelta: {
        rss: Math.max(0, peak.rss - base.rss),
        heapUsed: Math.max(0, peak.heapUsed - base.heapUsed),
        external: Math.max(0, peak.external - base.external),
        arrayBuffers: Math.max(0, peak.arrayBuffers - base.arrayBuffers),
      },
    }));
  } finally {
    clearInterval(timer);
    fs.rmSync(dir, { recursive: true, force: true });
    api.resetApexifyRuntimeConfig();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
