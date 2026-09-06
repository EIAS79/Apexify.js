'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

const PHASE0 = {
  node: 'v20.20.2',
  platform: 'linux-x64',
  workload: 'audio-10-second',
  wallMs: 109.795,
  rssDeltaBytes: 1572864,
  outputBytes: 1764044,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function measure(name, frames, fn, runs = 3) {
  fn();
  const rows = [];
  for (let run = 0; run < runs; run += 1) {
    if (global.gc) { global.gc(); global.gc(); }
    const before = process.memoryUsage();
    const started = performance.now();
    const result = fn();
    const wallMs = performance.now() - started;
    const after = process.memoryUsage();
    const outputBytes = Buffer.isBuffer(result) ? result.length : result?.byteLength ?? 0;
    rows.push({ wallMs, rssDeltaBytes: Math.max(0, after.rss - before.rss), heapDeltaBytes: Math.max(0, after.heapUsed - before.heapUsed), arrayBufferDeltaBytes: Math.max(0, after.arrayBuffers - before.arrayBuffers), outputBytes });
  }
  const wallMs = median(rows.map((row) => row.wallMs));
  assert.ok(Number.isFinite(wallMs) && wallMs > 0 && wallMs < 15_000, `${name} benchmark exceeded conservative ceiling`);
  return {
    name,
    runs,
    wallMs,
    samplesPerSecond: frames ? Math.round(frames / (wallMs / 1000)) : undefined,
    rssDeltaBytes: Math.max(...rows.map((row) => row.rssDeltaBytes)),
    heapDeltaBytes: Math.max(...rows.map((row) => row.heapDeltaBytes)),
    arrayBufferDeltaBytes: Math.max(...rows.map((row) => row.arrayBufferDeltaBytes)),
    outputBytes: rows[rows.length - 1].outputBytes,
  };
}

api.resetApexifyRuntimeConfig();
const rows = [];

rows.push(measure('short-simple-sine', 12000, () => api.synthesizeSound({
  sampleRate: 48000,
  channels: 1,
  duration: 0.25,
  layers: [{ waveform: 'sine', frequency: 440, duration: 0.25, gain: 0.3 }],
})));

rows.push(measure('representative-preset-explosion', Math.ceil(0.5 * 44100), () => api.synthesizePreset('explosion', { seed: 'benchmark' })));
rows.push(measure('layered-preset-engine', Math.ceil(0.8 * 44100), () => api.synthesizePreset('engine', { seed: 'benchmark' })));

rows.push(measure('sequence-8-events', Math.ceil(1.5 * 32000), () => api.synthesizeSequence({
  sampleRate: 32000,
  channels: 2,
  seed: 'benchmark-sequence',
  events: Array.from({ length: 8 }, (_, index) => ({ at: index * 0.15, preset: index % 2 ? 'click' : 'beep', gain: 0.6 })),
})));

rows.push(measure('composition-overlap', Math.ceil(0.7 * 32000), () => api.composeSynthAudio({
  sampleRate: 32000,
  channels: 2,
  seed: 'benchmark-compose',
  clips: [
    { preset: 'engine', at: 0, duration: 0.5, gain: 0.4, pan: -0.2 },
    { preset: 'click', at: 0.1, gain: 0.7, pan: 0.5, quality: 'crisp' },
    { preset: 'explosionSmall', at: 0.25, gain: 0.5, pan: 0.1 },
  ],
})));

const baselineConfig = {
  duration: 10,
  sampleRate: 44100,
  channels: 2,
  masterGain: 0.5,
  layers: [
    { waveform: 'sine', frequency: 220, frequencyEnd: 440, duration: 10, gain: 0.35 },
    { waveform: 'triangle', frequency: 110, duration: 10, gain: 0.15, pan: -0.25 },
  ],
};
rows.push(measure('audio-10-second', 441000, () => api.synthesizeSound(baselineConfig)));

const resampleSource = api.renderSound({ sampleRate: 48000, channels: 2, duration: 5, seed: 'resample', layers: [{ waveform: 'sine', frequency: 440, duration: 5, gain: 0.2 }] });
rows.push(measure('resample-48k-to-44.1k', 220500, () => api.resampleToMatch(resampleSource, 48000, 2, 44100, 2, 220500)));

const wavPcm = api.renderSound({ sampleRate: 48000, channels: 2, duration: 5, seed: 'wav', layers: [{ waveform: 'sine', frequency: 330, duration: 5, gain: 0.2 }] });
rows.push(measure('wav-encode-5s-stereo', 240000, () => api.encodeWavPcm16(wavPcm, 48000, 2)));
const wav = api.encodeWavPcm16(wavPcm, 48000, 2);
rows.push(measure('wav-decode-5s-stereo', 240000, () => api.decodeWavPcm16(wav).samples));

const baselineFinal = rows.find((row) => row.name === 'audio-10-second');
assert.ok(baselineFinal);
const comparison = {
  baseline: PHASE0,
  final: baselineFinal,
  wallPercentChange: ((baselineFinal.wallMs - PHASE0.wallMs) / PHASE0.wallMs) * 100,
  rssDeltaPercentChange: PHASE0.rssDeltaBytes === 0 ? null : ((baselineFinal.rssDeltaBytes - PHASE0.rssDeltaBytes) / PHASE0.rssDeltaBytes) * 100,
  note: `Phase 0 was Node 20 Linux; Phase 9 executes on ${process.version} ${process.platform}-${process.arch}, so percentage comparison is directional rather than hardware/runtime-normalized.`,
};

console.log(`PHASE9_BENCHMARK ${JSON.stringify({ node: process.version, platform: `${process.platform}-${process.arch}`, workloads: rows, phase0Comparison: comparison })}`);
console.log('phase9-benchmark: synthesis, presets, sequence, composition, resampling, WAV encode/decode, wall time, throughput, and memory deltas measured.');
