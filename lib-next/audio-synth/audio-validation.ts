import type {
  AdsrEnvelope,
  AudioSeed,
  FilterOptions,
  SynthComposeClip,
  SynthComposeOptions,
  SynthLayer,
  SynthMixInput,
  SynthMixOptions,
  SynthPresetName,
  SynthPresetOverrides,
  SynthSequenceOptions,
  SynthSoundOptions,
} from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertAudioResourceLimits, assertWithinLimit, estimateAudioBytes } from "../runtime/limits";
import {
  assertCollection,
  assertEnum,
  assertFiniteNumber,
  assertOptionalFiniteNumber,
  assertRecord,
} from "../runtime/validation";
import { DEFAULT_SAMPLE_RATE } from "./constants";
import { applyPresetOverrides } from "./preset-overrides";
import { getPresetDefinition } from "./presets";
import { inspectWavPcm16 } from "./wav-encode";

function validateSeed(value: unknown, name: string): AudioSeed | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new ApexifyInputError(`${name} must be a safe integer or string.`);
    return value;
  }
  if (typeof value === "string") {
    if (value.length === 0 || value.length > 256) throw new ApexifyInputError(`${name} string must contain 1–256 characters.`);
    return value;
  }
  throw new ApexifyInputError(`${name} must be a safe integer or string.`);
}

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

function validateFilter(value: FilterOptions | undefined, name: string, sampleRate: number): void {
  if (value === undefined) return;
  assertRecord(value, name);
  assertEnum(value.type, `${name}.type`, ["lowpass", "highpass"] as const);
  assertFiniteNumber(value.cutoff, `${name}.cutoff`, { min: 0, exclusiveMin: true });
  if (value.cutoff >= sampleRate / 2) throw new ApexifyInputError(`${name}.cutoff must be below Nyquist (${sampleRate / 2} Hz).`);
  assertOptionalFiniteNumber(value.q, `${name}.q`, { min: 0.1, max: 20 });
}

function tonalWaveform(layer: SynthLayer): boolean {
  const waveform = layer.waveform ?? "sine";
  return waveform !== "noise" && waveform !== "pink";
}

function validateLayer(layer: SynthLayer, index: number, sampleRate: number): { end: number; partials: number } {
  const name = `audio.layers[${index}]`;
  assertRecord(layer, name);
  if (layer.waveform !== undefined) assertEnum(layer.waveform, `${name}.waveform`, ["sine", "square", "sawtooth", "triangle", "noise", "pink"] as const);
  assertFiniteNumber(layer.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(layer.delay, `${name}.delay`, { min: 0 });
  assertOptionalFiniteNumber(layer.gain, `${name}.gain`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(layer.pan, `${name}.pan`, { min: -1, max: 1 });
  assertOptionalFiniteNumber(layer.noiseMix, `${name}.noiseMix`, { min: 0, max: 1 });
  validateAdsr(layer.adsr, `${name}.adsr`);
  validateFilter(layer.filter, `${name}.filter`, sampleRate);

  if (!tonalWaveform(layer)) {
    if (layer.frequency !== undefined || layer.frequencyEnd !== undefined || layer.detune !== undefined || layer.vibrato !== undefined || (layer.partials?.length ?? 0) > 0) {
      throw new ApexifyInputError(`${name} noise waveforms do not accept frequency, detune, vibrato, or harmonic partial options.`);
    }
    if ((layer.noiseMix ?? 0) !== 0) throw new ApexifyInputError(`${name}.noiseMix is only valid for tonal waveforms.`);
  } else {
    assertOptionalFiniteNumber(layer.frequency, `${name}.frequency`, { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(layer.frequencyEnd, `${name}.frequencyEnd`, { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(layer.detune, `${name}.detune`, { min: -4_800, max: 4_800 });
    const detuneRatio = Math.pow(2, (layer.detune ?? 0) / 1200);
    const f0 = (layer.frequency ?? 440) * detuneRatio;
    const f1 = (layer.frequencyEnd ?? layer.frequency ?? 440) * detuneRatio;
    if (!Number.isFinite(f0) || !Number.isFinite(f1) || Math.max(f0, f1) >= sampleRate / 2) {
      throw new ApexifyInputError(`${name} effective frequency must remain below Nyquist.`);
    }
    if (layer.vibrato !== undefined) {
      assertRecord(layer.vibrato, `${name}.vibrato`);
      assertFiniteNumber(layer.vibrato.depth, `${name}.vibrato.depth`, { min: 0 });
      assertFiniteNumber(layer.vibrato.rate, `${name}.vibrato.rate`, { min: 0, exclusiveMin: true });
      if (Math.min(f0, f1) - layer.vibrato.depth <= 0 || Math.max(f0, f1) + layer.vibrato.depth >= sampleRate / 2) {
        throw new ApexifyInputError(`${name}.vibrato must keep instantaneous frequency within (0, Nyquist).`);
      }
    }
  }

  if (layer.tremolo !== undefined) {
    assertRecord(layer.tremolo, `${name}.tremolo`);
    assertFiniteNumber(layer.tremolo.depth, `${name}.tremolo.depth`, { min: 0, max: 1 });
    assertFiniteNumber(layer.tremolo.rate, `${name}.tremolo.rate`, { min: 0, exclusiveMin: true });
  }

  let partialCount = 0;
  if (layer.partials !== undefined) {
    assertCollection(layer.partials, `${name}.partials`, { limit: "maxCollectionItems" });
    partialCount = layer.partials.length;
    const detuneRatio = Math.pow(2, (layer.detune ?? 0) / 1200);
    const fundamentalMax = Math.max(layer.frequency ?? 440, layer.frequencyEnd ?? layer.frequency ?? 440) * detuneRatio;
    for (let i = 0; i < layer.partials.length; i += 1) {
      const partial = layer.partials[i];
      if (!Array.isArray(partial) || partial.length !== 2) throw new ApexifyInputError(`${name}.partials[${i}] must be [frequencyRatio, gain].`);
      assertFiniteNumber(partial[0], `${name}.partials[${i}][0]`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(partial[1], `${name}.partials[${i}][1]`, { min: 0, max: 4 });
      if (fundamentalMax * partial[0] >= sampleRate / 2) throw new ApexifyInputError(`${name}.partials[${i}] exceeds Nyquist.`);
    }
  }

  return { end: (layer.delay ?? 0) + layer.duration, partials: partialCount };
}

function presetDefinition(name: SynthPresetName, overrides?: SynthPresetOverrides): SynthSoundOptions {
  try {
    return applyPresetOverrides(getPresetDefinition(name), overrides);
  } catch (error) {
    if (error instanceof ApexifyInputError) throw error;
    throw new ApexifyInputError(`Unknown synth preset: ${String(name)}.`, { cause: error });
  }
}

export function validateSynthSoundOptions(options: SynthSoundOptions): { duration: number; sampleRate: number; channels: 1 | 2 } {
  assertRecord(options, "audio");
  assertCollection(options.layers, "audio.layers", { min: 1 });
  assertWithinLimit("maxAudioLayers", options.layers.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.sampleRate");
  const channels = validateChannels(options.channels, "audio.channels");
  validateSeed(options.seed, "audio.seed");
  assertOptionalFiniteNumber(options.masterGain, "audio.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.duration, "audio.duration", { min: 0, exclusiveMin: true });
  if (options.limiter !== undefined && typeof options.limiter !== "boolean") throw new ApexifyInputError("audio.limiter must be boolean when provided.");

  let computedDuration = 0;
  let partials = 0;
  options.layers.forEach((layer, index) => {
    const validated = validateLayer(layer, index, sampleRate);
    computedDuration = Math.max(computedDuration, validated.end);
    partials += validated.partials;
  });
  assertWithinLimit("maxAudioPartials", partials);
  const duration = options.duration ?? computedDuration;
  if (duration <= 0) throw new ApexifyInputError("audio duration must be > 0; zero-length synthesis is not supported.");
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, layers: options.layers.length, partials });
  return { duration, sampleRate, channels };
}

export function validateSynthSequenceOptions(options: SynthSequenceOptions): { duration: number; sampleRate: number; channels: 1 | 2; peakBytes: number } {
  assertRecord(options, "audio.sequence");
  assertCollection(options.events, "audio.sequence.events", { min: 1 });
  assertWithinLimit("maxAudioEvents", options.events.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.sequence.sampleRate");
  const channels = validateChannels(options.channels, "audio.sequence.channels");
  validateSeed(options.seed, "audio.sequence.seed");
  assertOptionalFiniteNumber(options.masterGain, "audio.sequence.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.tail, "audio.sequence.tail", { min: 0 });

  let endTime = 0;
  let largestEventBytes = 0;
  options.events.forEach((event, index) => {
    const name = `audio.sequence.events[${index}]`;
    assertRecord(event, name);
    assertFiniteNumber(event.at, `${name}.at`, { min: 0 });
    assertOptionalFiniteNumber(event.gain, `${name}.gain`, { min: 0, max: 4 });
    const sourceCount = Number(event.preset !== undefined) + Number(event.options !== undefined);
    if (sourceCount !== 1) throw new ApexifyInputError(`${name} requires exactly one of preset or options.`);
    const definition = event.options
      ? { ...event.options, sampleRate, channels }
      : { ...presetDefinition(event.preset as SynthPresetName), sampleRate, channels };
    const eventDuration = validateSynthSoundOptions(definition).duration;
    endTime = Math.max(endTime, event.at + eventDuration);
    largestEventBytes = Math.max(largestEventBytes, estimateAudioBytes(eventDuration, sampleRate, channels));
  });

  const duration = endTime + (options.tail ?? 0.1);
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, events: options.events.length });
  const outputBytes = estimateAudioBytes(duration, sampleRate, channels);
  const peakBytes = outputBytes + largestEventBytes;
  assertWithinLimit("maxAudioBytes", peakBytes);
  return { duration, sampleRate, channels, peakBytes };
}

interface ComposeClipBudget {
  end: number;
  transientBytes: number;
}

function validateComposeClip(clip: SynthComposeClip, index: number, sampleRate: number, channels: 1 | 2): ComposeClipBudget {
  const name = `audio.compose.clips[${index}]`;
  assertRecord(clip, name);
  validateSeed(clip.seed, `${name}.seed`);
  assertOptionalFiniteNumber(clip.at, `${name}.at`, { min: 0 });
  assertOptionalFiniteNumber(clip.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(clip.sourceStart, `${name}.sourceStart`, { min: 0 });
  assertOptionalFiniteNumber(clip.gain, `${name}.gain`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(clip.volume, `${name}.volume`, { min: 0, max: 4 });
  if (clip.gain !== undefined && clip.volume !== undefined) throw new ApexifyInputError(`${name} may provide gain or volume, not both aliases.`);
  assertOptionalFiniteNumber(clip.transpose, `${name}.transpose`, { min: -36, max: 36 });
  assertOptionalFiniteNumber(clip.detune, `${name}.detune`, { min: -1_200, max: 1_200 });
  assertOptionalFiniteNumber(clip.pitch, `${name}.pitch`, { min: 0.125, max: 8 });
  assertOptionalFiniteNumber(clip.speed, `${name}.speed`, { min: 0.125, max: 16 });
  assertOptionalFiniteNumber(clip.pan, `${name}.pan`, { min: -1, max: 1 });
  assertOptionalFiniteNumber(clip.fadeIn, `${name}.fadeIn`, { min: 0 });
  assertOptionalFiniteNumber(clip.fadeOut, `${name}.fadeOut`, { min: 0 });
  assertOptionalFiniteNumber(clip.noise, `${name}.noise`, { min: 0, max: 1 });
  validateFilter(clip.filter, `${name}.filter`, sampleRate);
  if (clip.quality !== undefined) assertEnum(clip.quality, `${name}.quality`, ["bright", "warm", "muffled", "lofi", "crisp"] as const);

  const wav = clip.wav ?? clip.buffer;
  if (clip.wav !== undefined && clip.buffer !== undefined) throw new ApexifyInputError(`${name} may provide wav or buffer, not both aliases.`);
  const sourceCount = Number(clip.preset !== undefined) + Number(clip.sound !== undefined) + Number(Buffer.isBuffer(wav));
  if (sourceCount !== 1) throw new ApexifyInputError(`${name} must contain exactly one source: preset, sound, wav, or buffer.`);
  if (Buffer.isBuffer(wav) && (clip.transpose !== undefined || clip.detune !== undefined || clip.pitch !== undefined || clip.overrides !== undefined)) {
    throw new ApexifyInputError(`${name} pitch/override controls apply only to procedural preset/sound sources; use speed for WAV playback-rate changes.`);
  }

  let sourceDuration: number;
  let sourceBytes: number;
  let sourcePeakBytes: number;
  if (Buffer.isBuffer(wav)) {
    const info = inspectWavPcm16(wav);
    sourceDuration = info.durationSeconds;
    const decodedBytes = info.sampleCount * Float32Array.BYTES_PER_ELEMENT;
    const targetBytes = estimateAudioBytes(sourceDuration, sampleRate, channels);
    sourceBytes = targetBytes;
    sourcePeakBytes = info.sampleRate === sampleRate && info.channels === channels ? decodedBytes : decodedBytes + targetBytes;
  } else {
    const definition = clip.sound
      ? { ...clip.sound, sampleRate, channels, seed: clip.seed ?? clip.sound.seed }
      : { ...presetDefinition(clip.preset as SynthPresetName, clip.overrides), sampleRate, channels, seed: clip.seed };
    const validated = validateSynthSoundOptions(definition);
    sourceDuration = validated.duration;
    sourceBytes = estimateAudioBytes(sourceDuration, sampleRate, channels);
    sourcePeakBytes = sourceBytes;
  }

  const sourceStart = clip.sourceStart ?? 0;
  if (sourceStart >= sourceDuration) throw new ApexifyInputError(`${name}.sourceStart must be inside the source duration.`);
  const availableDuration = sourceDuration - sourceStart;
  const trimmedDuration = clip.duration === undefined ? availableDuration : Math.min(availableDuration, clip.duration);
  const finalDuration = trimmedDuration / (clip.speed ?? 1);
  if (finalDuration <= 0) throw new ApexifyInputError(`${name} resolves to zero-length audio.`);
  if ((clip.fadeIn ?? 0) > finalDuration || (clip.fadeOut ?? 0) > finalDuration) throw new ApexifyInputError(`${name} fade duration cannot exceed the rendered clip duration.`);
  assertAudioResourceLimits({ durationSeconds: finalDuration, sampleRate, channels });
  const finalBytes = estimateAudioBytes(finalDuration, sampleRate, channels);
  const transientBytes = Math.max(sourcePeakBytes, sourceBytes + (clip.speed !== undefined && clip.speed !== 1 ? finalBytes : 0));
  assertWithinLimit("maxAudioBytes", transientBytes);
  return { end: (clip.at ?? 0) + finalDuration, transientBytes };
}

export function validateSynthComposeOptions(options: SynthComposeOptions): { duration: number; sampleRate: number; channels: 1 | 2; peakBytes: number } {
  assertRecord(options, "audio.compose");
  assertCollection(options.clips, "audio.compose.clips", { min: 1 });
  assertWithinLimit("maxAudioEvents", options.clips.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.compose.sampleRate");
  const channels = validateChannels(options.channels, "audio.compose.channels");
  validateSeed(options.seed, "audio.compose.seed");
  assertOptionalFiniteNumber(options.duration, "audio.compose.duration", { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(options.tail, "audio.compose.tail", { min: 0 });
  assertOptionalFiniteNumber(options.masterGain, "audio.compose.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.postHighpassHz, "audio.compose.postHighpassHz", { min: 0, exclusiveMin: true });
  if (options.postHighpassHz !== undefined && options.postHighpassHz >= sampleRate / 2) throw new ApexifyInputError("audio.compose.postHighpassHz must be below Nyquist.");
  assertOptionalFiniteNumber(options.noiseGateThreshold, "audio.compose.noiseGateThreshold", { min: 0, max: 1 });
  if (options.limiter !== undefined && typeof options.limiter !== "boolean") throw new ApexifyInputError("audio.compose.limiter must be boolean when provided.");

  let clipEnd = 0;
  let largestTransient = 0;
  options.clips.forEach((clip, index) => {
    const budget = validateComposeClip(clip, index, sampleRate, channels);
    clipEnd = Math.max(clipEnd, budget.end);
    largestTransient = Math.max(largestTransient, budget.transientBytes);
  });
  const duration = Math.max(options.duration ?? 0, clipEnd + (options.tail ?? 0));
  if (duration <= 0) throw new ApexifyInputError("audio.compose resolves to zero-length audio.");
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, events: options.clips.length });
  const outputBytes = estimateAudioBytes(duration, sampleRate, channels);
  const peakBytes = outputBytes + largestTransient;
  assertWithinLimit("maxAudioBytes", peakBytes);
  return { duration, sampleRate, channels, peakBytes };
}

export function isTimelineMixInput(input: SynthMixInput): input is SynthComposeClip {
  if (!input || typeof input !== "object" || Buffer.isBuffer(input)) return false;
  if ("layers" in input && !("preset" in input)) return false;
  return (
    "at" in input || "sound" in input || "wav" in input || "buffer" in input || "fadeIn" in input ||
    "fadeOut" in input || "speed" in input || "quality" in input || "transpose" in input || "pitch" in input ||
    "detune" in input || "noise" in input || "sourceStart" in input || "pan" in input || "filter" in input
  );
}

export function validateSynthMixInputs(inputs: SynthMixInput[], options: SynthMixOptions = {}): { sampleRate: number; channels: 1 | 2; maxDuration: number; peakBytes: number } {
  assertCollection(inputs, "audio.mix.inputs", { min: 1 });
  assertWithinLimit("maxAudioEvents", inputs.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.mix.sampleRate");
  const channels = validateChannels(options.channels, "audio.mix.channels");
  validateSeed(options.seed, "audio.mix.seed");
  assertOptionalFiniteNumber(options.masterGain, "audio.mix.masterGain", { min: 0, max: 4 });

  if (inputs.some(isTimelineMixInput)) {
    const clips = inputs.map((input): SynthComposeClip => {
      if (Buffer.isBuffer(input)) return { wav: input, at: 0 };
      if ("layers" in input && !("preset" in input)) return { sound: input, at: 0 };
      if ("preset" in input && !isTimelineMixInput(input)) {
        const preset = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
        return { preset: preset.preset, at: 0, gain: preset.gain, overrides: preset.overrides };
      }
      return input as SynthComposeClip;
    });
    const result = validateSynthComposeOptions({ clips, sampleRate, channels, masterGain: options.masterGain, seed: options.seed });
    return { sampleRate, channels, maxDuration: result.duration, peakBytes: result.peakBytes };
  }

  let maxDuration = 0;
  let storedBytes = 0;
  let peakBytes = 0;
  inputs.forEach((input, index) => {
    const name = `audio.mix.inputs[${index}]`;
    let duration: number;
    let transientBytes: number;
    if (Buffer.isBuffer(input)) {
      const info = inspectWavPcm16(input);
      duration = info.durationSeconds;
      const decodedBytes = info.sampleCount * Float32Array.BYTES_PER_ELEMENT;
      const targetBytes = estimateAudioBytes(duration, sampleRate, channels);
      transientBytes = info.sampleRate === sampleRate && info.channels === channels ? decodedBytes : decodedBytes + targetBytes;
    } else if ("preset" in input && input.preset) {
      const preset = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
      assertOptionalFiniteNumber(preset.gain, `${name}.gain`, { min: 0, max: 4 });
      const definition = { ...presetDefinition(preset.preset, preset.overrides), sampleRate, channels };
      duration = validateSynthSoundOptions(definition).duration;
      transientBytes = estimateAudioBytes(duration, sampleRate, channels);
    } else {
      duration = validateSynthSoundOptions({ ...(input as SynthSoundOptions), sampleRate, channels }).duration;
      transientBytes = estimateAudioBytes(duration, sampleRate, channels);
    }
    const retainedBytes = estimateAudioBytes(duration, sampleRate, channels);
    peakBytes = Math.max(peakBytes, storedBytes + transientBytes);
    storedBytes += retainedBytes;
    assertWithinLimit("maxAudioBytes", storedBytes);
    maxDuration = Math.max(maxDuration, duration);
  });
  const outputBytes = estimateAudioBytes(maxDuration, sampleRate, channels);
  peakBytes = Math.max(peakBytes, storedBytes + outputBytes);
  assertWithinLimit("maxAudioBytes", peakBytes);
  return { sampleRate, channels, maxDuration, peakBytes };
}
