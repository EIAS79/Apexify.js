import type {
  SynthComposeClip,
  SynthComposeOptions,
  SynthMixInput,
  SynthMixOptions,
  SynthPresetName,
  SynthPresetOverrides,
  SynthSequenceOptions,
  SynthSoundOptions,
} from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertAudioWavResourceLimits, assertWithinLimit, estimatePcm16WavBytes } from "../runtime/limits";
import { composeSynthAudio } from "./compose";
import { mixFloatBuffers, renderSound, renderValidatedSequence, renderValidatedSound, resampleToMatch } from "./engine";
import { deriveAudioSeed } from "./audio-random";
import { applyPresetOverrides } from "./preset-overrides";
import { getPresetDefinition } from "./presets";
import { decodeWavPcm16, encodeValidatedWavPcm16 } from "./wav-encode";
import {
  isTimelineMixInput,
  validateSynthComposeOptions,
  validateSynthMixInputs,
  validateSynthSequenceOptions,
  validateSynthSoundOptions,
} from "./audio-validation";

export { applyPresetOverrides } from "./preset-overrides";

function resolvePreset(name: SynthPresetName, overrides?: SynthPresetOverrides): SynthSoundOptions {
  try {
    return applyPresetOverrides(getPresetDefinition(name), overrides);
  } catch (error) {
    if (error instanceof ApexifyInputError) throw error;
    throw new ApexifyInputError(`Unknown synth preset: ${String(name)}.`, { cause: error });
  }
}

export function synthesizeSound(options: SynthSoundOptions): Buffer {
  const validated = validateSynthSoundOptions(options);
  assertAudioWavResourceLimits(validated.duration, validated.sampleRate, validated.channels);
  const pcm = renderValidatedSound(options, validated);
  return encodeValidatedWavPcm16(pcm, validated.sampleRate, validated.channels);
}

export function synthesizePreset(name: SynthPresetName, overrides?: SynthPresetOverrides): Buffer {
  return synthesizeSound(resolvePreset(name, overrides));
}

export function synthesizeSequence(options: SynthSequenceOptions): Buffer {
  const validated = validateSynthSequenceOptions(options);
  assertAudioWavResourceLimits(validated.duration, validated.sampleRate, validated.channels);
  const pcm = renderValidatedSequence(options, validated);
  return encodeValidatedWavPcm16(pcm, validated.sampleRate, validated.channels);
}

/** Mix multiple sounds into one WAV — simultaneous mix, or timeline composition when any input uses timeline controls. */
export function mixSynthSounds(inputs: SynthMixInput[], options: SynthMixOptions = {}): Buffer {
  const validated = validateSynthMixInputs(inputs, options);
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
    const composeOptions: SynthComposeOptions = {
      clips,
      sampleRate: validated.sampleRate,
      channels: validated.channels,
      masterGain: options.masterGain,
      seed: options.seed,
    };
    validateSynthComposeOptions(composeOptions);
    return composeSynthAudio(composeOptions);
  }

  const sampleRate = validated.sampleRate;
  const channels = validated.channels;
  const wavBytes = estimatePcm16WavBytes(validated.maxDuration, sampleRate, channels);
  assertWithinLimit("maxAudioBytes", validated.peakBytes + wavBytes);
  const floats: Float32Array[] = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index]!;
    const derivedSeed = deriveAudioSeed(options.seed, `mix:${index}`);
    if (Buffer.isBuffer(input)) {
      const decoded = decodeWavPcm16(input);
      const sourceFrames = decoded.samples.length / decoded.channels;
      const targetFrames = Math.max(1, Math.round(sourceFrames * (sampleRate / decoded.sampleRate)));
      floats.push(resampleToMatch(decoded.samples, decoded.sampleRate, decoded.channels, sampleRate, channels, targetFrames));
      continue;
    }
    if ("preset" in input && input.preset) {
      const preset = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
      const definition = resolvePreset(preset.preset, preset.overrides);
      let pcm = renderSound({ ...definition, sampleRate, channels, seed: definition.seed ?? derivedSeed });
      if (preset.gain !== undefined && preset.gain !== 1) for (let i = 0; i < pcm.length; i += 1) pcm[i] *= preset.gain;
      floats.push(pcm);
      continue;
    }
    const sound = input as SynthSoundOptions;
    floats.push(renderSound({ ...sound, sampleRate, channels, seed: sound.seed ?? derivedSeed }));
  }

  const mixed = mixFloatBuffers(floats, channels, options.masterGain ?? 1);
  return encodeValidatedWavPcm16(mixed, sampleRate, channels);
}

export type { SynthComposeClip, SynthComposeOptions };
export { composeSynthAudio };
