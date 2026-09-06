'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function tone(overrides = {}) {
  return {
    sampleRate: 48000,
    channels: 1,
    layers: [{ waveform: 'sine', frequency: 440, duration: 0.1, gain: 0.2, ...overrides }],
  };
}
function expectInput(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, 'APEXIFY_INPUT');
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}
function expectLimit(fn, limit) {
  assert.throws(fn, (error) => {
    assert.equal(error.code, 'APEXIFY_RESOURCE_LIMIT');
    if (limit) assert.equal(error.limit, limit);
    return true;
  });
}

api.resetApexifyRuntimeConfig();
expectInput(() => api.synthesizeSound({ layers: [] }), /at least|minimum|audio\.layers/i);
expectInput(() => api.synthesizeSound({ ...tone(), duration: 0 }), /duration/i);
expectInput(() => api.synthesizeSound({ ...tone(), duration: -1 }), /duration/i);
expectInput(() => api.synthesizeSound({ ...tone(), duration: NaN }), /duration/i);
expectInput(() => api.synthesizeSound({ ...tone(), duration: Infinity }), /duration/i);
expectInput(() => api.synthesizeSound({ ...tone(), channels: 3 }), /channels/i);
expectInput(() => api.synthesizeSound({ ...tone(), sampleRate: 44100.5 }), /sampleRate/i);
expectLimit(() => api.synthesizeSound({ ...tone(), sampleRate: 192001 }), 'maxAudioSampleRate');
expectInput(() => api.synthesizeSound(tone({ frequency: 0 })), /frequency/i);
expectInput(() => api.synthesizeSound(tone({ frequency: -1 })), /frequency/i);
expectInput(() => api.synthesizeSound(tone({ frequency: NaN })), /frequency/i);
expectInput(() => api.synthesizeSound(tone({ frequency: 24000 })), /Nyquist/i);
expectInput(() => api.synthesizeSound(tone({ gain: 5 })), /gain/i);
expectInput(() => api.synthesizeSound(tone({ pan: 2 })), /pan/i);
expectInput(() => api.synthesizeSound(tone({ adsr: { sustain: 2 } })), /sustain/i);
expectInput(() => api.synthesizeSound(tone({ vibrato: { depth: 500, rate: 5 } })), /vibrato/i);
expectInput(() => api.synthesizeSound(tone({ tremolo: { depth: 1.1, rate: 5 } })), /tremolo/i);
expectInput(() => api.synthesizeSound(tone({ filter: { type: 'lowpass', cutoff: 24000 } })), /Nyquist/i);
expectInput(() => api.synthesizeSound(tone({ filter: { type: 'lowpass', cutoff: 1000, q: 0 } })), /q/i);
expectInput(() => api.synthesizeSound({ ...tone(), seed: {} }), /seed/i);
expectInput(() => api.synthesizeSound({ ...tone(), seed: Number.MAX_SAFE_INTEGER + 1 }), /safe integer/i);
expectInput(() => api.synthesizeSound({ sampleRate: 48000, layers: [{ waveform: 'noise', duration: 0.1, frequency: 440 }] }), /noise waveforms/i);
expectInput(() => api.synthesizeSound({ sampleRate: 48000, layers: [{ waveform: 'pink', duration: 0.1, partials: [[2, 0.1]] }] }), /noise waveforms/i);

expectInput(() => api.synthesizeSequence({ events: [] }), /events/i);
expectInput(() => api.synthesizeSequence({ events: [{ at: -1, preset: 'beep' }] }), /at/i);
expectInput(() => api.synthesizeSequence({ events: [{ at: 0, preset: 'beep', options: tone() }] }), /exactly one/i);
expectInput(() => api.composeSynthAudio({ clips: [] }), /clips/i);
expectInput(() => api.mixSynthSounds([]), /inputs/i);
expectInput(() => api.composeSynthAudio({ clips: [{ preset: 'beep', at: -0.1 }] }), /at/i);
expectInput(() => api.composeSynthAudio({ clips: [{ preset: 'beep', speed: 0 }] }), /speed/i);
expectInput(() => api.composeSynthAudio({ clips: [{ preset: 'beep', gain: 1, volume: 1 }] }), /gain or volume/i);
expectInput(() => api.composeSynthAudio({ clips: [{ wav: api.synthesizePreset('beep'), transpose: 12 }] }), /procedural/i);
expectInput(() => api.composeSynthAudio({ clips: [{ preset: 'beep', sourceStart: 999 }] }), /sourceStart/i);

api.configureApexifyRuntime({ limits: { maxAudioLayers: 2, maxAudioEvents: 2, maxAudioPartials: 2 } });
expectLimit(() => api.synthesizeSound({ layers: [tone().layers[0], tone().layers[0], tone().layers[0]] }), 'maxAudioLayers');
expectLimit(() => api.synthesizeSequence({ events: [{ at: 0, preset: 'beep' }, { at: 0.1, preset: 'beep' }, { at: 0.2, preset: 'beep' }] }), 'maxAudioEvents');
expectLimit(() => api.synthesizeSound(tone({ partials: [[2, 0.1], [3, 0.1], [4, 0.1]] })), 'maxAudioPartials');
api.resetApexifyRuntimeConfig();

api.configureApexifyRuntime({ limits: { maxAudioDurationSeconds: 0.1 } });
assert.doesNotThrow(() => api.renderSound(tone({ duration: 0.1 })));
expectLimit(() => api.renderSound(tone({ duration: 0.10001 })), 'maxAudioDurationSeconds');
api.resetApexifyRuntimeConfig();

api.configureApexifyRuntime({ limits: { maxAudioBytes: 1024 } });
const before = process.memoryUsage().arrayBuffers;
expectLimit(() => api.renderSound({ sampleRate: 48000, channels: 2, duration: 1, layers: [{ waveform: 'sine', frequency: 440, duration: 1 }] }), 'maxAudioBytes');
const after = process.memoryUsage().arrayBuffers;
assert.ok(after - before < 1024 * 1024, 'oversized audio must reject before a large typed-array allocation');
api.resetApexifyRuntimeConfig();

api.configureApexifyRuntime({ limits: { maxAudioDurationSeconds: 0.2, maxAudioBytes: 120000 } });
const nearLimit = api.synthesizeSound({ sampleRate: 48000, channels: 2, duration: 0.2, seed: 1, layers: [{ waveform: 'sine', frequency: 440, duration: 0.2, gain: 0.2 }] });
assert.ok(nearLimit.length > 44, 'large-but-valid configured workload must complete');
api.resetApexifyRuntimeConfig();

console.log('phase9-resource: invalid numeric/config combinations, one-over limits, early allocation rejection, and large-valid workload passed.');
