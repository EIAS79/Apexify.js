'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function stats(samples) {
  let peak = 0;
  let sum = 0;
  let square = 0;
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample), 'all preset samples must be finite');
    peak = Math.max(peak, Math.abs(sample));
    sum += sample;
    square += sample * sample;
  }
  return { peak, mean: sum / samples.length, rms: Math.sqrt(square / samples.length) };
}
function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

api.resetApexifyRuntimeConfig();
const names = Array.from(api.SYNTH_PRESET_NAMES);
const infos = api.listPresets();
assert.equal(names.length, 39, 'every advertised built-in preset must be enumerated');
assert.equal(infos.length, names.length);
assert.deepEqual(infos.map((entry) => entry.name), names);

const metrics = [];
for (const name of names) {
  const wav = api.synthesizePreset(name, { seed: `phase9:${name}` });
  assert.ok(Buffer.isBuffer(wav) && wav.length > 44, `${name} must produce a non-empty WAV`);
  const decoded = api.decodeWavPcm16(wav);
  assert.ok(decoded.samples.length > 0, `${name} must contain samples`);
  const metric = stats(decoded.samples);
  assert.ok(metric.peak <= 1, `${name} PCM peak must be bounded`);
  assert.ok(metric.peak > 1e-5, `${name} must not be accidentally silent`);
  assert.ok(metric.rms > 1e-6, `${name} must have nonzero RMS`);
  assert.ok(Math.abs(metric.mean) < 0.2, `${name} must not have an extreme DC offset`);
  metrics.push({ name, ...metric, duration: decoded.samples.length / decoded.channels / decoded.sampleRate, bytes: wav.length });
}

const explosionA = api.synthesizePreset('explosion', { seed: 'same-seed' });
const explosionB = api.synthesizePreset('explosion', { seed: 'same-seed' });
const explosionC = api.synthesizePreset('explosion', { seed: 'different-seed' });
assert.equal(hash(explosionA), hash(explosionB), 'same seed + same preset must be byte-identical');
assert.notEqual(hash(explosionA), hash(explosionC), 'different seeds must change noise output');

const zeroed = api.synthesizePreset('beep', { volume: 0, seed: 'zero' });
const zeroSamples = api.decodeWavPcm16(zeroed).samples;
assert.ok(zeroSamples.every((sample) => sample === 0), 'zero volume override must not be discarded by fallback logic');

const base = api.getPresetDefinition('laserHeavy');
const overridden = api.applyPresetOverrides(base, {
  limiter: false,
  layers: [{ gain: 0, filter: { cutoff: 500 } }],
});
assert.equal(overridden.limiter, false);
assert.equal(overridden.layers[0].gain, 0);
assert.equal(overridden.layers[0].waveform, base.layers[0].waveform);
assert.equal(overridden.layers[0].filter.type, base.layers[0].filter.type);
assert.equal(overridden.layers[0].filter.cutoff, 500);
assert.equal(overridden.layers[0].filter.q, base.layers[0].filter.q);
assert.notStrictEqual(overridden.layers[0], base.layers[0]);
assert.notStrictEqual(overridden.layers[0].filter, base.layers[0].filter);

const reusableConfig = {
  sampleRate: 22050,
  channels: 1,
  seed: 'reentrant',
  layers: [{ waveform: 'noise', duration: 0.08, gain: 0.2, adsr: { attack: 0, decay: 0, sustain: 1, release: 0 } }],
};
const before = JSON.stringify(reusableConfig);
const first = api.synthesizeSound(reusableConfig);
const second = api.synthesizeSound(reusableConfig);
assert.equal(hash(first), hash(second));
assert.equal(JSON.stringify(reusableConfig), before, 'synthesis must not mutate user configuration');

const sequenceOptions = {
  sampleRate: 22050,
  seed: 'sequence-seed',
  events: [
    { at: 0, preset: 'explosion' },
    { at: 0.05, preset: 'click' },
    { at: 0.1, options: reusableConfig },
  ],
};
assert.equal(hash(api.synthesizeSequence(sequenceOptions)), hash(api.synthesizeSequence(sequenceOptions)), 'seeded sequences must be deterministic');

console.log(`PHASE9_PRESET_METRICS ${JSON.stringify(metrics)}`);
console.log('phase9-presets: every preset rendered finite non-silent PCM; seeded determinism, override deep merge, zero values, and reentrancy passed.');
