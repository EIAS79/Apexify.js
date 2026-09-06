'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

const EXPECTED = Object.freeze({
  sineSweep: '895b389215df451bc511e73bc2a5245256204464f895e44727458f730a1c1932',
  seededPink: '001e4cead6b66b00aaa4d0c97764eaaa63213c29219a4874cfb47de1bfb44f83',
  composition: '1c1a6c6ff20e348dd43810e2613e34ab6ca1ea3278856ed22ff938aaccf92eea',
});

api.resetApexifyRuntimeConfig();

function renderCases() {
  return {
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
}

const first = renderCases();
const second = renderCases();
const hashes = {};
for (const name of Object.keys(EXPECTED)) {
  assert.ok(first[name].length > 44, `${name} golden WAV must be non-empty`);
  const firstHash = hash(first[name]);
  const secondHash = hash(second[name]);
  assert.equal(secondHash, firstHash, `${name} must be repeatable within a process`);
  assert.equal(firstHash, EXPECTED[name], `${name} deterministic golden hash changed`);
  hashes[name] = firstHash;
}

console.log(`PHASE9_GOLDEN ${JSON.stringify(hashes)}`);
console.log('phase9-golden: locked deterministic hashes passed for sine sweep, seeded pink noise, and composition.');
