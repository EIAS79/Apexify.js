import type {
  AdsrEnvelope, FilterOptions, SynthComposeClip, SynthComposeOptions, SynthLayer, SynthMixInput,
  SynthMixOptions, SynthSequenceOptions, SynthSoundOptions,
} from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertAudioResourceLimits, assertWithinLimit } from "../runtime/limits";
import { assertCollection, assertEnum, assertFiniteNumber, assertOptionalFiniteNumber, assertRecord } from "../runtime/validation";
import { DEFAULT_SAMPLE_RATE } from "./engine";

function validateChannels(value: unknown, name: string): 1 | 2 {
  const channels = value ?? 1;
  if (channels !== 1 && channels !== 2) throw new ApexifyInputError(`${name} must be 1 or 2.`);
  return channels;
}

function validateSampleRate(value: unknown, name: string): number {
  const sampleRate = value ?? DEFAULT_SAMPLE_RATE;
  assertFiniteNumber(sampleRate, name, { min: 1, integer: true });
  assertWithinLimit("maxAudioSampleRate", sampleRate);
  return sampleRate;
}

function validateAdsr(value: AdsrEnvelope | undefined, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  assertOptionalFiniteNumber(value.attack, `${name}.attack`, { min: 0 });
  assertOptionalFiniteNumber(value.decay, `${name}.decay`, { min: 0 });
  assertOptionalFiniteNumber(value.sustain, `${name}.sustain`, { min: 0, max: 1 });
  assertOptionalFiniteNumber(value.release, `${name}.release`, { min: 0 });
}

function validateFilter(value: FilterOptions | undefined, name: string, sampleRate?: number): void {
  if (value === undefined) return;
  assertRecord(value, name);
  assertEnum(value.type, `${name}.type`, ["lowpass", "highpass"] as const);
  assertFiniteNumber(value.cutoff, `${name}.cutoff`, { min: 0, exclusiveMin: true, max: sampleRate ? sampleRate / 2 : undefined });
  assertOptionalFiniteNumber(value.q, `${name}.q`, { min: 0.5, max: 8 });
}

function validateLayer(layer: SynthLayer, index: number, sampleRate: number): { end: number; partials: number } {
  const name = `audio.layers[${index}]`;
  assertRecord(layer, name);
  assertOptionalFiniteNumber(layer.frequency, `${name}.frequency`, { min: 0, exclusiveMin: true, max: sampleRate / 2 });
  assertOptionalFiniteNumber(layer.frequencyEnd, `${name}.frequencyEnd`, { min: 0, exclusiveMin: true, max: sampleRate / 2 });
  assertFiniteNumber(layer.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(layer.delay, `${name}.delay`, { min: 0 });
  assertOptionalFiniteNumber(layer.gain, `${name}.gain`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(layer.detune, `${name}.detune`);
  assertOptionalFiniteNumber(layer.noiseMix, `${name}.noiseMix`, { min: 0, max: 1 });
  assertOptionalFiniteNumber(layer.pan, `${name}.pan`, { min: -1, max: 1 });
  validateAdsr(layer.adsr, `${name}.adsr`);
  if (layer.vibrato !== undefined) {
    assertRecord(layer.vibrato, `${name}.vibrato`);
    assertFiniteNumber(layer.vibrato.depth, `${name}.vibrato.depth`, { min: 0 });
    assertFiniteNumber(layer.vibrato.rate, `${name}.vibrato.rate`, { min: 0, exclusiveMin: true });
  }
  if (layer.tremolo !== undefined) {
    assertRecord(layer.tremolo, `${name}.tremolo`);
    assertFiniteNumber(layer.tremolo.depth, `${name}.tremolo.depth`, { min: 0, max: 1 });
    assertFiniteNumber(layer.tremolo.rate, `${name}.tremolo.rate`, { min: 0, exclusiveMin: true });
  }
  validateFilter(layer.filter, `${name}.filter`, sampleRate);
  let partialCount = 0;
  if (layer.partials !== undefined) {
    assertCollection(layer.partials, `${name}.partials`, { limit: "maxCollectionItems" });
    partialCount = layer.partials.length;
    for (let i = 0; i < layer.partials.length; i++) {
      const partial = layer.partials[i];
      if (!Array.isArray(partial) || partial.length !== 2) throw new ApexifyInputError(`${name}.partials[${i}] must be [frequencyRatio, gain].`);
      assertFiniteNumber(partial[0], `${name}.partials[${i}][0]`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(partial[1], `${name}.partials[${i}][1]`, { min: 0, max: 4 });
    }
  }
  return { end: (layer.delay ?? 0) + layer.duration, partials: partialCount };
}

export function validateSynthSoundOptions(options: SynthSoundOptions): { duration: number; sampleRate: number; channels: 1 | 2 } {
  assertRecord(options, "audio");
  assertCollection(options.layers, "audio.layers", { min: 1 });
  assertWithinLimit("maxAudioLayers", options.layers.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.sampleRate");
  const channels = validateChannels(options.channels, "audio.channels");
  assertOptionalFiniteNumber(options.masterGain, "audio.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.duration, "audio.duration", { min: 0, exclusiveMin: true });
  let computed = 0;
  let partials = 0;
  options.layers.forEach((layer, i) => {
    const r = validateLayer(layer, i, sampleRate);
    computed = Math.max(computed, r.end);
    partials += r.partials;
  });
  assertWithinLimit("maxAudioPartials", partials);
  const duration = options.duration ?? computed;
  if (duration <= 0) throw new ApexifyInputError("audio duration must be > 0.");
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, layers: options.layers.length, partials });
  return { duration, sampleRate, channels };
}

export function validateSynthSequenceOptions(options: SynthSequenceOptions): { duration: number; sampleRate: number; channels: 1 | 2 } {
  assertRecord(options, "audio.sequence");
  assertCollection(options.events, "audio.sequence.events", { min: 1 });
  assertWithinLimit("maxAudioEvents", options.events.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.sequence.sampleRate");
  const channels = validateChannels(options.channels, "audio.sequence.channels");
  assertOptionalFiniteNumber(options.masterGain, "audio.sequence.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.tail, "audio.sequence.tail", { min: 0 });
  let end = 0;
  options.events.forEach((event, i) => {
    const name = `audio.sequence.events[${i}]`;
    assertRecord(event, name);
    assertFiniteNumber(event.at, `${name}.at`, { min: 0 });
    assertOptionalFiniteNumber(event.gain, `${name}.gain`, { min: 0, max: 4 });
    if (!event.preset && !event.options) throw new ApexifyInputError(`${name} requires preset or options.`);
    let eventDuration = 0;
    if (event.options) eventDuration = validateSynthSoundOptions({ ...event.options, sampleRate, channels }).duration;
    end = Math.max(end, event.at + eventDuration);
  });
  const duration = end + (options.tail ?? 0);
  assertAudioResourceLimits({ durationSeconds: Math.max(duration, 1 / sampleRate), sampleRate, channels, events: options.events.length });
  return { duration, sampleRate, channels };
}

function validateComposeClip(clip: SynthComposeClip, index: number, sampleRate: number): number {
  const name = `audio.compose.clips[${index}]`;
  assertRecord(clip, name);
  assertOptionalFiniteNumber(clip.at, `${name}.at`, { min: 0 });
  assertOptionalFiniteNumber(clip.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(clip.sourceStart, `${name}.sourceStart`, { min: 0 });
  assertOptionalFiniteNumber(clip.gain ?? clip.volume, `${name}.gain`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(clip.transpose, `${name}.transpose`);
  assertOptionalFiniteNumber(clip.detune, `${name}.detune`);
  assertOptionalFiniteNumber(clip.pitch, `${name}.pitch`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(clip.speed, `${name}.speed`, { min: 0, exclusiveMin: true, max: 16 });
  assertOptionalFiniteNumber(clip.pan, `${name}.pan`, { min: -1, max: 1 });
  assertOptionalFiniteNumber(clip.fadeIn, `${name}.fadeIn`, { min: 0 });
  assertOptionalFiniteNumber(clip.fadeOut, `${name}.fadeOut`, { min: 0 });
  assertOptionalFiniteNumber(clip.noise, `${name}.noise`, { min: 0, max: 1 });
  validateFilter(clip.filter, `${name}.filter`, sampleRate);
  const sourceCount = Number(Boolean(clip.preset)) + Number(Boolean(clip.sound)) + Number(Buffer.isBuffer(clip.wav ?? clip.buffer));
  if (sourceCount !== 1) throw new ApexifyInputError(`${name} must contain exactly one source: preset, sound, wav, or buffer.`);
  let duration = clip.duration ?? 0;
  if (clip.sound) duration = duration || validateSynthSoundOptions({ ...clip.sound, sampleRate }).duration;
  return (clip.at ?? 0) + duration;
}

export function validateSynthComposeOptions(options: SynthComposeOptions): { duration: number; sampleRate: number; channels: 1 | 2 } {
  assertRecord(options, "audio.compose");
  assertCollection(options.clips, "audio.compose.clips", { min: 1 });
  assertWithinLimit("maxAudioEvents", options.clips.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.compose.sampleRate");
  const channels = validateChannels(options.channels, "audio.compose.channels");
  assertOptionalFiniteNumber(options.duration, "audio.compose.duration", { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(options.tail, "audio.compose.tail", { min: 0 });
  assertOptionalFiniteNumber(options.masterGain, "audio.compose.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.postHighpassHz, "audio.compose.postHighpassHz", { min: 0, exclusiveMin: true, max: sampleRate / 2 });
  assertOptionalFiniteNumber(options.noiseGateThreshold, "audio.compose.noiseGateThreshold", { min: 0, max: 1 });
  let end = 0;
  options.clips.forEach((clip, i) => { end = Math.max(end, validateComposeClip(clip, i, sampleRate)); });
  const duration = options.duration ?? (end + (options.tail ?? 0));
  assertAudioResourceLimits({ durationSeconds: Math.max(duration, 1 / sampleRate), sampleRate, channels, events: options.clips.length });
  return { duration, sampleRate, channels };
}

export function validateSynthMixInputs(inputs: SynthMixInput[], options: SynthMixOptions = {}): void {
  assertCollection(inputs, "audio.mix.inputs", { min: 1 });
  assertWithinLimit("maxAudioEvents", inputs.length);
  validateSampleRate(options.sampleRate, "audio.mix.sampleRate");
  validateChannels(options.channels, "audio.mix.channels");
  assertOptionalFiniteNumber(options.masterGain, "audio.mix.masterGain", { min: 0, max: 4 });
}
