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
import { composeSynthAudio } from "./compose";
import { DEFAULT_SAMPLE_RATE, mixFloatBuffers, renderSequence, renderSound, resampleToMatch } from "./engine";
import { applyPresetOverrides } from "./preset-overrides";
import { getPresetDefinition } from "./presets";
import { decodeWavPcm16, encodeWavPcm16 } from "./wav-encode";

export { applyPresetOverrides } from "./preset-overrides";

export function synthesizeSound(options: SynthSoundOptions): Buffer {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const pcm = renderSound(options);
  return encodeWavPcm16(pcm, sampleRate, channels);
}

export function synthesizePreset(
  name: SynthPresetName,
  overrides?: SynthPresetOverrides
): Buffer {
  return synthesizeSound(applyPresetOverrides(getPresetDefinition(name), overrides));
}

export function synthesizeSequence(options: SynthSequenceOptions): Buffer {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const pcm = renderSequence(options);
  return encodeWavPcm16(pcm, sampleRate, channels);
}

function isTimelineMixInput(input: SynthMixInput): input is SynthComposeClip {
  if (!input || typeof input !== "object" || Buffer.isBuffer(input)) return false;
  if ("layers" in input && !("preset" in input)) return false;
  return (
    "at" in input ||
    "sound" in input ||
    "wav" in input ||
    "buffer" in input ||
    "fadeIn" in input ||
    "fadeOut" in input ||
    "speed" in input ||
    "quality" in input ||
    "transpose" in input ||
    "pitch" in input ||
    "detune" in input ||
    "noise" in input ||
    "sourceStart" in input
  );
}

/** Mix multiple sounds into one WAV — simultaneous (`mix`) or timeline (`compose` when clips use `at`). */
export function mixSynthSounds(inputs: SynthMixInput[], options: SynthMixOptions = {}): Buffer {
  if (inputs.some(isTimelineMixInput)) {
    return composeSynthAudio({
      clips: inputs.map((input): SynthComposeClip => {
        if (Buffer.isBuffer(input)) return { wav: input, at: 0 };
        if ("layers" in input && !("preset" in input)) return { sound: input, at: 0 };
        if ("preset" in input && !isTimelineMixInput(input)) {
          const p = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
          return { preset: p.preset, at: 0, gain: p.gain, overrides: p.overrides };
        }
        return input as SynthComposeClip;
      }),
      sampleRate: options.sampleRate,
      channels: options.channels,
      masterGain: options.masterGain,
    });
  }

  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const floats: Float32Array[] = [];

  for (const input of inputs) {
    if (Buffer.isBuffer(input)) {
      const { samples, sampleRate: sr, channels: ch } = decodeWavPcm16(input);
      const srcFrames = samples.length / ch;
      const targetFrames = Math.ceil(srcFrames * (sampleRate / sr));
      floats.push(resampleToMatch(samples, sr, ch, sampleRate, channels, targetFrames));
      continue;
    }
    if ("preset" in input && input.preset) {
      const inp = input as { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };
      const def = applyPresetOverrides(getPresetDefinition(inp.preset), inp.overrides);
      let pcm = renderSound({ ...def, sampleRate, channels });
      if (inp.gain != null && inp.gain !== 1) {
        for (let i = 0; i < pcm.length; i++) pcm[i] *= inp.gain;
      }
      floats.push(pcm);
      continue;
    }
    floats.push(renderSound({ ...(input as SynthSoundOptions), sampleRate, channels }));
  }

  const mixed = mixFloatBuffers(floats, channels, options.masterGain ?? 1);
  return encodeWavPcm16(mixed, sampleRate, channels);
}

export type { SynthComposeClip, SynthComposeOptions };
export { composeSynthAudio };
