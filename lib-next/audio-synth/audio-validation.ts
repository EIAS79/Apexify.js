import type {
  AdsrEnvelope,
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
import { DEFAULT_SAMPLE_RATE } from "./engine";
import { applyPresetOverrides } from "./preset-overrides";
import { getPresetDefinition } from "./presets";
import { inspectWavPcm16 } from "./wav-encode";

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
  assertFiniteNumber(value.cutoff, `${name}.cutoff`, {
    min: 0,
    exclusiveMin: true,
    max: sampleRate ? sampleRate / 2 : undefined,
  });
  assertOptionalFiniteNumber(value.q, `${name}.q`, { min: 0.5, max: 8 });
}

function validateLayer(layer: SynthLayer, index: number, sampleRate: number): { end: number; partials: number } {
  const name = `audio.layers[${index}]`;
  assertRecord(layer, name);
  assertOptionalEnumWaveform(layer.waveform, `${name}.waveform`);
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
      if (!Array.isArray(partial) || partial.length !== 2) {
        throw new ApexifyInputError(`${name}.partials[${i}] must be [frequencyRatio, gain].`);
      }
      assertFiniteNumber(partial[0], `${name}.partials[${i}][0]`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(partial[1], `${name}.partials[${i}][1]`, { min: 0, max: 4 });
    }
  }
  return { end: (layer.delay ?? 0) + layer.duration, partials: partialCount };
}

function assertOptionalEnumWaveform(value: unknown, name: string): void {
  if (value === undefined) return;
  assertEnum(value, name, ["sine", "square", "sawtooth", "triangle", "noise", "pink"] as const);
}

function presetDefinition(name: SynthPresetName, overrides?: SynthPresetOverrides): SynthSoundOptions {
  try {
    return applyPresetOverrides(getPresetDefinition(name), overrides);
  } catch (error) {
    throw new ApexifyInputError(`Unknown synth preset: ${String(name)}.`, { cause: error });
  }
}

export function validateSynthSoundOptions(options: SynthSoundOptions): { duration: number; sampleRate: number; channels: 1 | 2 } {
  assertRecord(options, "audio");
  assertCollection(options.layers, "audio.layers", { min: 1 });
  assertWithinLimit("maxAudioLayers", options.layers.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.sampleRate");
  const channels = validateChannels(options.channels, "audio.channels");
  assertOptionalFiniteNumber(options.masterGain, "audio.masterGain", { min: 0, max: 4 });
  assertOptionalFiniteNumber(options.duration, "audio.duration", { min: 0, exclusiveMin: true });
  if (options.limiter !== undefined && typeof options.limiter !== "boolean") {
    throw new ApexifyInputError("audio.limiter must be boolean when provided.");
  }
  let computed = 0;
  let partials = 0;
  options.layers.forEach((layer, i) => {
    const result = validateLayer(layer, i, sampleRate);
    computed = Math.max(computed, result.end);
    partials += result.partials;
  });
  assertWithinLimit("maxAudioPartials", partials);
  const duration = options.duration ?? computed;
  if (duration <= 0) throw new ApexifyInputError("audio duration must be > 0.");
  assertAudioResourceLimits({
    durationSeconds: duration,
    sampleRate,
    channels,
    layers: options.layers.length,
    partials,
  });
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

  const tail = options.tail ?? 0.1;
  let endTime = tail;
  let storedChunkBytes = 0;
  options.events.forEach((event, i) => {
    const name = `audio.sequence.events[${i}]`;
    assertRecord(event, name);
    assertFiniteNumber(event.at, `${name}.at`, { min: 0 });
    assertOptionalFiniteNumber(event.gain, `${name}.gain`, { min: 0, max: 4 });
    const sourceCount = Number(Boolean(event.preset)) + Number(Boolean(event.options));
    if (sourceCount !== 1) throw new ApexifyInputError(`${name} requires exactly one of preset or options.`);

    const definition = event.options
      ? { ...event.options, sampleRate, channels }
      : { ...presetDefinition(event.preset as SynthPresetName), sampleRate, channels };
    const eventDuration = validateSynthSoundOptions(definition).duration;
    endTime = Math.max(endTime, event.at + eventDuration);
    storedChunkBytes += estimateAudioBytes(eventDuration, sampleRate, channels);
    assertWithinLimit("maxAudioBytes", storedChunkBytes);
  });

  // renderSequence initializes endTime with tail and adds tail again at output allocation.
  const duration = endTime + tail;
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, events: options.events.length });
  const outputBytes = estimateAudioBytes(duration, sampleRate, channels);
  assertWithinLimit("maxAudioBytes", storedChunkBytes + outputBytes);
  return { duration, sampleRate, channels };
}

interface ComposeClipBudget {
  end: number;
  finalBytes: number;
  transientBytes: number;
}

function validateComposeClip(
  clip: SynthComposeClip,
  index: number,
  sampleRate: number,
  channels: 1 | 2
): ComposeClipBudget {
  const name = `audio.compose.clips[${index}]`;
  assertRecord(clip, name);
  assertOptionalFiniteNumber(clip.at, `${name}.at`, { min: 0 });
  assertOptionalFiniteNumber(clip.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(clip.sourceStart, `${name}.sourceStart`, { min: 0 });
  assertOptionalFiniteNumber(clip.gain, `${name}.gain`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(clip.volume, `${name}.volume`, { min: 0, max: 4 });
  assertOptionalFiniteNumber(clip.transpose, `${name}.transpose`);
  assertOptionalFiniteNumber(clip.detune, `${name}.detune`);
  assertOptionalFiniteNumber(clip.pitch, `${name}.pitch`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(clip.speed, `${name}.speed`, { min: 0, exclusiveMin: true, max: 16 });
  assertOptionalFiniteNumber(clip.pan, `${name}.pan`, { min: -1, max: 1 });
  assertOptionalFiniteNumber(clip.fadeIn, `${name}.fadeIn`, { min: 0 });
  assertOptionalFiniteNumber(clip.fadeOut, `${name}.fadeOut`, { min: 0 });
  assertOptionalFiniteNumber(clip.noise, `${name}.noise`, { min: 0, max: 1 });
  validateFilter(clip.filter, `${name}.filter`, sampleRate);

  const wav = clip.wav ?? clip.buffer;
  if (clip.wav !== undefined && clip.buffer !== undefined) {
    throw new ApexifyInputError(`${name} may provide wav or buffer, not both aliases.`);
  }
  const sourceCount = Number(Boolean(clip.preset)) + Number(Boolean(clip.sound)) + Number(Buffer.isBuffer(wav));
  if (sourceCount !== 1) {
    throw new ApexifyInputError(`${name} must contain exactly one source: preset, sound, wav, or buffer.`);
  }

  let sourceDuration: number;
  let decodedSourceBytes = 0;
  let sourceTargetBytes: number;
  if (Buffer.isBuffer(wav)) {
    const info = inspectWavPcm16(wav);
    sourceDuration = info.durationSeconds;
    decodedSourceBytes = info.sampleCount * Float32Array.BYTES_PER_ELEMENT;
    sourceTargetBytes = estimateAudioBytes(sourceDuration, sampleRate, channels);
  } else {
    const definition = clip.sound
      ? { ...clip.sound, sampleRate, channels }
      : { ...presetDefinition(clip.preset as SynthPresetName, clip.overrides), sampleRate, channels };
    const validated = validateSynthSoundOptions(definition);
    sourceDuration = validated.duration;
    sourceTargetBytes = estimateAudioBytes(sourceDuration, sampleRate, channels);
  }

  const sourceStart = clip.sourceStart ?? 0;
  const availableDuration = Math.max(0, sourceDuration - sourceStart);
  const trimmedDuration = clip.duration !== undefined
    ? Math.min(availableDuration, clip.duration)
    : availableDuration;
  const speed = clip.speed ?? 1;
  let finalDuration = trimmedDuration / speed;
  if (trimmedDuration === 0 && speed !== 1) finalDuration = 1 / sampleRate;
  assertAudioResourceLimits({ durationSeconds: Math.max(finalDuration, 1 / sampleRate), sampleRate, channels });

  const trimmedBytes = estimateAudioBytes(Math.max(trimmedDuration, 1 / sampleRate), sampleRate, channels);
  const finalBytes = estimateAudioBytes(Math.max(finalDuration, 1 / sampleRate), sampleRate, channels);
  const usesTrimCopy = sourceStart > 0 || clip.duration !== undefined;
  const usesSpeedCopy = speed !== 1;
  let transientBytes = decodedSourceBytes + sourceTargetBytes;
  if (usesTrimCopy) transientBytes = Math.max(transientBytes, sourceTargetBytes + trimmedBytes);
  if (usesSpeedCopy) transientBytes = Math.max(transientBytes, (usesTrimCopy ? trimmedBytes : sourceTargetBytes) + finalBytes);
  transientBytes = Math.max(transientBytes, finalBytes);
  assertWithinLimit("maxAudioBytes", transientBytes);

  return { end: (clip.at ?? 0) + finalDuration, finalBytes, transientBytes };
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
  if (options.limiter !== undefined && typeof options.limiter !== "boolean") {
    throw new ApexifyInputError("audio.compose.limiter must be boolean when provided.");
  }

  let end = options.tail ?? 0;
  let storedPlacementBytes = 0;
  let peakBytes = 0;
  options.clips.forEach((clip, i) => {
    const budget = validateComposeClip(clip, i, sampleRate, channels);
    peakBytes = Math.max(peakBytes, storedPlacementBytes + budget.transientBytes);
    storedPlacementBytes += budget.finalBytes;
    assertWithinLimit("maxAudioBytes", storedPlacementBytes);
    end = Math.max(end, budget.end);
  });
  if (options.duration !== undefined) end = Math.max(end, options.duration);
  const duration = Math.max(end, 1 / sampleRate);
  assertAudioResourceLimits({ durationSeconds: duration, sampleRate, channels, events: options.clips.length });
  const outputBytes = estimateAudioBytes(duration, sampleRate, channels);
  peakBytes = Math.max(peakBytes, storedPlacementBytes + outputBytes);
  assertWithinLimit("maxAudioBytes", peakBytes);
  return { duration, sampleRate, channels };
}

function isTimelineMixInput(input: SynthMixInput): input is SynthComposeClip {
  if (!input || typeof input !== "object" || Buffer.isBuffer(input)) return false;
  if ("layers" in input && !("preset" in input)) return false;
  return (
    "at" in input || "sound" in input || "wav" in input || "buffer" in input ||
    "fadeIn" in input || "fadeOut" in input || "speed" in input || "quality" in input ||
    "transpose" in input || "pitch" in input || "detune" in input || "noise" in input || "sourceStart" in input
  );
}

export function validateSynthMixInputs(inputs: SynthMixInput[], options: SynthMixOptions = {}): void {
  assertCollection(inputs, "audio.mix.inputs", { min: 1 });
  assertWithinLimit("maxAudioEvents", inputs.length);
  const sampleRate = validateSampleRate(options.sampleRate, "audio.mix.sampleRate");
  const channels = validateChannels(options.channels, "audio.mix.channels");
  assertOptionalFiniteNumber(options.masterGain, "audio.mix.masterGain", { min: 0, max: 4 });

  if (inputs.some(isTimelineMixInput)) {
    const clips: SynthComposeClip[] = inputs.map((input) => {
      if (Buffer.isBuffer(input)) return { wav: input, at: 0 };
      if ("layers" in input && !("preset" in input)) return { sound: input, at: 0 };
      if ("preset" in input && !isTimelineMixInput(input)) {
        const preset = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
        return { preset: preset.preset, at: 0, gain: preset.gain, overrides: preset.overrides };
      }
      return input as SynthComposeClip;
    });
    validateSynthComposeOptions({ clips, sampleRate, channels, masterGain: options.masterGain });
    return;
  }

  let storedBytes = 0;
  let maxDuration = 0;
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
      transientBytes = decodedBytes + targetBytes;
    } else if ("preset" in input && input.preset) {
      const preset = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
      assertOptionalFiniteNumber(preset.gain, `${name}.gain`, { min: 0, max: 4 });
      const definition = { ...presetDefinition(preset.preset, preset.overrides), sampleRate, channels };
      duration = validateSynthSoundOptions(definition).duration;
      transientBytes = estimateAudioBytes(duration, sampleRate, channels);
    } else {
      const sound = input as SynthSoundOptions;
      duration = validateSynthSoundOptions({ ...sound, sampleRate, channels }).duration;
      transientBytes = estimateAudioBytes(duration, sampleRate, channels);
    }
    const storedInputBytes = estimateAudioBytes(duration, sampleRate, channels);
    peakBytes = Math.max(peakBytes, storedBytes + transientBytes);
    storedBytes += storedInputBytes;
    assertWithinLimit("maxAudioBytes", storedBytes);
    maxDuration = Math.max(maxDuration, duration);
  });

  const outputBytes = estimateAudioBytes(Math.max(maxDuration, 1 / sampleRate), sampleRate, channels);
  peakBytes = Math.max(peakBytes, storedBytes + outputBytes);
  assertWithinLimit("maxAudioBytes", peakBytes);
}
