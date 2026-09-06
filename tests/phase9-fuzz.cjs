'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

let state = 0x9e3779b9;
function random() {
  state = (state + 0x6d2b79f5) >>> 0;
  let value = state;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
}
function between(min, max) { return min + random() * (max - min); }
function choice(values) { return values[Math.floor(random() * values.length)]; }
function finite(samples) { for (const sample of samples) assert.ok(Number.isFinite(sample)); }

api.resetApexifyRuntimeConfig();

const tonal = ['sine', 'square', 'sawtooth', 'triangle'];
for (let iteration = 0; iteration < 180; iteration += 1) {
  const sampleRate = choice([8000, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
  const waveform = choice(tonal);
  const frequency = between(30, sampleRate * 0.2);
  const end = between(30, sampleRate * 0.2);
  const duration = between(0.006, 0.04);
  const attack = between(0, duration * 1.5);
  const decay = between(0, duration * 1.5);
  const release = between(0, duration * 1.5);
  const layer = {
    waveform,
    frequency,
    frequencyEnd: end,
    duration,
    gain: between(0, 1.5),
    pan: between(-1, 1),
    adsr: { attack, decay, sustain: between(0, 1), release },
    tremolo: { depth: between(0, 1), rate: between(0.5, 20) },
  };
  const pcm = api.renderSound({ sampleRate, channels: choice([1, 2]), limiter: choice([true, false]), seed: iteration, layers: [layer] });
  assert.ok(pcm.length > 0);
  finite(pcm);
}

for (let iteration = 0; iteration < 80; iteration += 1) {
  const sampleRate = choice([8000, 16000, 24000, 44100]);
  const pcm = api.renderSound({
    sampleRate,
    channels: choice([1, 2]),
    seed: `noise-${iteration}`,
    layers: [{
      waveform: choice(['noise', 'pink']),
      duration: between(0.005, 0.03),
      gain: between(0, 1),
      adsr: { attack: between(0, 0.02), decay: between(0, 0.02), sustain: between(0, 1), release: between(0, 0.02) },
      filter: { type: choice(['lowpass', 'highpass']), cutoff: between(20, sampleRate * 0.45), q: between(0.1, 10) },
    }],
  });
  finite(pcm);
}

const valid = api.encodeWavPcm16(new Float32Array(256), 16000, 1);
for (let iteration = 0; iteration < 160; iteration += 1) {
  const malformed = Buffer.from(valid);
  const mutations = 1 + Math.floor(random() * 4);
  for (let m = 0; m < mutations; m += 1) {
    const index = Math.floor(random() * malformed.length);
    malformed[index] = Math.floor(random() * 256);
  }
  try {
    const info = api.inspectWavPcm16(malformed);
    assert.ok(info.sampleRate > 0 && (info.channels === 1 || info.channels === 2));
  } catch (error) {
    assert.ok(error && typeof error.code === 'string', 'malformed WAV must fail through a structured error');
    assert.ok(['APEXIFY_DECODE', 'APEXIFY_RESOURCE_LIMIT'].includes(error.code));
  }
}

console.log('phase9-fuzz: bounded randomized ADSR/oscillator/noise/filter configurations and malformed WAV mutations completed without NaN, crashes, or unchecked reads.');
