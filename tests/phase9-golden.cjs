'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

api.resetApexifyRuntimeConfig();
const cases = {
  sineSweep: api.synthesizeSound({
    sampleRate: 16000,
    channels: 1,
    seed: 'golden-sine',
    layers: [{ waveform: 'sine', frequency: 220, frequencyEnd: 660, duration: 0.05, gain: 0.4, adsr: { attack: 0.002, decay: 0.006, sustain: 0.65, release: 0.01 } }],
  }),
  seededPink: api.synthesizeSound({
    sampleRate: 16000,
    channels: 1,
    seed: 'golden-pink',
    layers: [{ waveform: 'pink', duration: 0.05, gain: 0.35, filter: { type: 'lowpass', cutoff: 1800, q: 0.8 }, adsr: { attack: 0.002, decay: 0.004, sustain: 0.7, release: 0.01 } }],
  }),
  composition: api.composeSynthAudio({
    sampleRate: 16000,
    channels: 2,
    seed: 'golden-compose',
    clips: [
      { preset: 'beep', at: 0, pan: -0.3 },
      { preset: 'click', at: 0.025, pan: 0.4, noise: 0.01 },
    ],
  }),
};

const hashes = Object.fromEntries(Object.entries(cases).map(([name, buffer]) => [name, hash(buffer)]));
for (const [name, buffer] of Object.entries(cases)) {
  const second = name === 'sineSweep'
    ? api.synthesizeSound({ sampleRate: 16000, channels: 1, seed: 'golden-sine', layers: [{ waveform: 'sine', frequency: 220, frequencyEnd: 660, duration: 0.05, gain: 0.4, adsr: { attack: 0.002, decay: 0.006, sustain: 0.65, release: 0.01 } }] })
    : name === 'seededPink'
      ? api.synthesizeSound({ sampleRate: 16000, channels: 1, seed: 'golden-pink', layers: [{ waveform: 'pink', duration: 0.05, gain: 0.35, filter: { type: 'lowpass', cutoff: 1800, q: 0.8 }, adsr: { attack: 0.002, decay: 0.004, sustain: 0.7, release: 0.01 } }] })
      : api.composeSynthAudio({ sampleRate: 16000, channels: 2, seed: 'golden-compose', clips: [{ preset: 'beep', at: 0, pan: -0.3 }, { preset: 'click', at: 0.025, pan: 0.4, noise: 0.01 }] });
  assert.equal(hash(second), hashes[name], `${name} deterministic sample hash must be stable within the implementation`);
  assert.ok(buffer.length > 44);
}

console.log(`PHASE9_GOLDEN_CANDIDATE ${JSON.stringify(hashes)}`);
console.log('phase9-golden: deterministic short sample hashes generated for sine sweep, seeded pink noise, and composition.');
