'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function peak(samples) {
  let value = 0;
  for (const sample of samples) value = Math.max(value, Math.abs(sample));
  return value;
}

function rms(samples, channel = 0, channels = 1) {
  let sum = 0;
  let count = 0;
  for (let i = channel; i < samples.length; i += channels) {
    sum += samples[i] * samples[i];
    count += 1;
  }
  return Math.sqrt(sum / Math.max(1, count));
}

function estimateFrequency(samples, sampleRate, channel = 0, channels = 1) {
  let crossings = 0;
  let previous = samples[channel] || 0;
  for (let i = channel + channels; i < samples.length; i += channels) {
    const current = samples[i];
    if (previous <= 0 && current > 0) crossings += 1;
    previous = current;
  }
  const duration = (samples.length / channels - 1) / sampleRate;
  return crossings / duration;
}

function fullEnvelope() {
  return { attack: 0, decay: 0, sustain: 1, release: 0 };
}

function assertFinite(samples) {
  for (const sample of samples) assert.ok(Number.isFinite(sample));
}

api.resetApexifyRuntimeConfig();

const sampleRate = 48_000;
const sine = api.renderSound({
  sampleRate,
  channels: 1,
  limiter: false,
  layers: [{ waveform: 'sine', frequency: 440, duration: 0.5, gain: 0.8, adsr: fullEnvelope() }],
});
assert.ok(Math.abs(estimateFrequency(sine, sampleRate) - 440) < 2, '440 Hz sine frequency must be numerically correct');
assert.ok(Math.abs(sine[0]) < 1e-12, 'sine phase must begin at zero before the first increment');
assert.ok(peak(sine) <= 0.801);

for (const waveform of ['sine', 'square', 'sawtooth', 'triangle']) {
  const samples = api.renderSound({
    sampleRate: 16_000,
    channels: 1,
    limiter: false,
    layers: [{ waveform, frequency: 400, duration: 0.1, gain: 0.8, adsr: fullEnvelope() }],
  });
  assertFinite(samples);
  assert.ok(peak(samples) <= 0.81, `${waveform} must remain normalized before layer gain`);
}

assert.equal(api.adsrGainAt(0, 1, { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 }), 0);
assert.ok(Math.abs(api.adsrGainAt(0.1, 1, { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 }) - 1) < 1e-9);
assert.ok(Math.abs(api.adsrGainAt(0.2, 1, { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 }) - 0.5) < 1e-9);
assert.equal(api.adsrGainAt(1, 1, { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.2 }), 0);
for (let i = 0; i <= 100; i += 1) {
  const value = api.adsrGainAt(i / 1000, 0.1, { attack: 0.2, decay: 0.2, sustain: 0.4, release: 0.2 });
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, 'overlong ADSR stages must be fitted safely');
}
assert.equal(api.adsrGainAt(0.1, 0.1, { attack: 0.2, decay: 0.2, sustain: 0.4, release: 0.2 }), 0);

const panLeft = api.renderSound({ sampleRate, channels: 2, limiter: false, layers: [{ waveform: 'sine', frequency: 440, duration: 0.2, gain: 0.5, pan: -1, adsr: fullEnvelope() }] });
const panCenter = api.renderSound({ sampleRate, channels: 2, limiter: false, layers: [{ waveform: 'sine', frequency: 440, duration: 0.2, gain: 0.5, pan: 0, adsr: fullEnvelope() }] });
const panRight = api.renderSound({ sampleRate, channels: 2, limiter: false, layers: [{ waveform: 'sine', frequency: 440, duration: 0.2, gain: 0.5, pan: 1, adsr: fullEnvelope() }] });
assert.ok(rms(panLeft, 1, 2) < 1e-10 && rms(panLeft, 0, 2) > 0.2);
assert.ok(Math.abs(rms(panCenter, 0, 2) - rms(panCenter, 1, 2)) < 1e-9);
assert.ok(rms(panRight, 0, 2) < 1e-10 && rms(panRight, 1, 2) > 0.2);

const partial = api.renderSound({
  sampleRate,
  channels: 1,
  limiter: false,
  layers: [{ waveform: 'sine', frequency: 300, duration: 0.2, gain: 1, partials: [[2, 0.5], [3, 0.25]], adsr: fullEnvelope() }],
});
assertFinite(partial);
assert.ok(peak(partial) <= 1.001, 'normalized partial aggregate must not exceed unit amplitude for unit layer gain');

const plainHigh = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 8000, duration: 0.2, gain: 0.7, adsr: fullEnvelope() }] });
const lowPassedHigh = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 8000, duration: 0.2, gain: 0.7, filter: { type: 'lowpass', cutoff: 500, q: Math.SQRT1_2 }, adsr: fullEnvelope() }] });
assert.ok(rms(lowPassedHigh) < rms(plainHigh) * 0.1, 'low-pass must attenuate high-frequency content');
const plainLow = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 100, duration: 0.3, gain: 0.7, adsr: fullEnvelope() }] });
const highPassedLow = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 100, duration: 0.3, gain: 0.7, filter: { type: 'highpass', cutoff: 1200, q: Math.SQRT1_2 }, adsr: fullEnvelope() }] });
assert.ok(rms(highPassedLow) < rms(plainLow) * 0.1, 'high-pass must attenuate low-frequency content');

const vibrato = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 440, duration: 0.3, gain: 0.5, vibrato: { depth: 20, rate: 5 }, adsr: fullEnvelope() }] });
const tremolo = api.renderSound({ sampleRate, channels: 1, limiter: false, layers: [{ waveform: 'sine', frequency: 440, duration: 0.3, gain: 0.5, tremolo: { depth: 0.8, rate: 5 }, adsr: fullEnvelope() }] });
assertFinite(vibrato);
assertFinite(tremolo);
assert.ok(rms(tremolo) < rms(sine), 'tremolo must attenuate average energy without negative gain');

const resampled = api.resampleToMatch(sine, sampleRate, 1, 24_000, 1, Math.round((sine.length / sampleRate) * 24_000));
assert.ok(Math.abs(resampled.length / 24_000 - sine.length / sampleRate) < 1 / 24_000);
assert.ok(Math.abs(estimateFrequency(resampled, 24_000) - 440) < 3, 'sample-rate conversion must preserve tone frequency and duration');
const stereo = new Float32Array([1, -1, 0.5, 0.5]);
const mono = api.resampleToMatch(stereo, 1000, 2, 1000, 1, 2);
assert.deepEqual(Array.from(mono), [0, 0.5], 'stereo-to-mono conversion must average channels rather than drop one');

const loud = new Float32Array([2, -3, 0.5]);
api.applyLimiter(loud, true);
assert.ok(peak(loud) <= 0.980001);

const speedSource = api.encodeWavPcm16(sine, sampleRate, 1);
const spedWav = api.composeSynthAudio({ clips: [{ wav: speedSource, speed: 2 }], sampleRate, channels: 1 });
const sped = api.decodeWavPcm16(spedWav);
assert.ok(Math.abs(sped.samples.length / sampleRate - 0.25) < 2 / sampleRate, 'speed 2 must halve playback duration');
assert.ok(Math.abs(estimateFrequency(sped.samples, sampleRate) - 880) < 6, 'playback-rate speed must change pitch as documented');

console.log('phase9-dsp: oscillator, ADSR, modulation, partial, pan, filter, limiter, resampling, and speed semantics passed.');
