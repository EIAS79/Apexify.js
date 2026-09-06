'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

async function main() {
  api.resetApexifyRuntimeConfig();
  const config = {
    sampleRate: 24000,
    channels: 2,
    seed: 'concurrent',
    layers: [
      { waveform: 'pink', duration: 0.2, gain: 0.3, filter: { type: 'lowpass', cutoff: 2500, q: 0.8 }, pan: -0.25 },
      { waveform: 'sine', frequency: 330, duration: 0.2, gain: 0.15, vibrato: { depth: 8, rate: 5 }, pan: 0.25 },
    ],
  };
  const snapshot = JSON.stringify(config);
  const results = await Promise.all(Array.from({ length: 16 }, async () => api.synthesizeSound(config)));
  const hashes = results.map(hash);
  assert.equal(new Set(hashes).size, 1, 'concurrent same-seed renders must be byte-identical');
  assert.equal(JSON.stringify(config), snapshot, 'concurrent renders must not mutate shared config');

  const different = await Promise.all(Array.from({ length: 8 }, async (_, index) => api.synthesizeSound({ ...config, seed: `seed-${index}` })));
  assert.equal(new Set(different.map(hash)).size, different.length, 'independent seeds must not share RNG state');

  const filteredA = api.synthesizeSound({ sampleRate: 24000, seed: 1, layers: [{ waveform: 'noise', duration: 0.15, gain: 0.2, filter: { type: 'highpass', cutoff: 1000 } }] });
  api.synthesizeSound({ sampleRate: 24000, seed: 999, layers: [{ waveform: 'noise', duration: 0.15, gain: 0.2, filter: { type: 'lowpass', cutoff: 400 } }] });
  const filteredB = api.synthesizeSound({ sampleRate: 24000, seed: 1, layers: [{ waveform: 'noise', duration: 0.15, gain: 0.2, filter: { type: 'highpass', cutoff: 1000 } }] });
  assert.equal(hash(filteredA), hash(filteredB), 'filter/noise state must be operation-local');

  const composition = {
    sampleRate: 24000,
    channels: 2,
    seed: 'compose',
    clips: [
      { preset: 'explosionSmall', at: 0, noise: 0.02, pan: -0.4 },
      { preset: 'click', at: 0.08, quality: 'lofi', pan: 0.4 },
    ],
  };
  assert.equal(hash(api.composeSynthAudio(composition)), hash(api.composeSynthAudio(composition)), 'seeded composition must be byte-identical');

  if (global.gc) { global.gc(); global.gc(); }
  const before = process.memoryUsage();
  let maxArrayBuffers = before.arrayBuffers;
  for (let i = 0; i < 160; i += 1) {
    const preset = i % 2 === 0 ? 'explosion' : 'whoosh';
    const wav = api.synthesizePreset(preset, { seed: `loop-${i}` });
    assert.ok(wav.length > 44);
    if (i % 20 === 0 && global.gc) global.gc();
    maxArrayBuffers = Math.max(maxArrayBuffers, process.memoryUsage().arrayBuffers);
  }
  if (global.gc) { global.gc(); global.gc(); }
  const after = process.memoryUsage();
  assert.ok(maxArrayBuffers - before.arrayBuffers < 64 * 1024 * 1024, 'repeated synthesis must not retain unbounded typed-array memory');
  assert.ok(after.arrayBuffers - before.arrayBuffers < 16 * 1024 * 1024, 'post-GC audio buffers must not be retained by global DSP state');

  api.configureApexifyRuntime({ limits: { maxAudioBytes: 4096 } });
  for (let i = 0; i < 20; i += 1) {
    assert.throws(
      () => api.synthesizeSound({ sampleRate: 48000, channels: 2, duration: 10, layers: [{ waveform: 'sine', frequency: 440, duration: 10 }] }),
      (error) => error.code === 'APEXIFY_RESOURCE_LIMIT'
    );
  }
  api.resetApexifyRuntimeConfig();

  console.log(`PHASE9_MEMORY ${JSON.stringify({ before, after, maxArrayBuffers })}`);
  console.log('phase9-concurrency: local RNG/filter state, deterministic concurrent renders, reentrancy, and repeated-memory stability passed.');
}

main().catch((error) => {
  api.resetApexifyRuntimeConfig();
  console.error(error);
  process.exitCode = 1;
});
