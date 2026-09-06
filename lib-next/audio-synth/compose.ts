import type {
  AudioSeed,
  FilterOptions,
  SynthClipQuality,
  SynthComposeClip,
  SynthComposeOptions,
  SynthPresetOverrides,
  SynthSoundOptions,
} from "../types";
import { ApexifyAudioError, ApexifyInputError } from "../runtime/errors";
import { filterInterleavedInPlace } from "./biquad-filter";
import { createAudioRandom, deriveAudioSeed } from "./audio-random";
import { applyLimiter, renderSound, resampleToMatch } from "./engine";
import { getPresetDefinition } from "./presets";
import { applyPresetOverrides } from "./preset-overrides";
import { decodeWavPcm16, encodeWavPcm16 } from "./wav-encode";
import { validateSynthComposeOptions } from "./audio-validation";

function qualityFilter(quality: SynthClipQuality): FilterOptions {
  switch (quality) {
    case "bright": return { type: "highpass", cutoff: 280, q: 0.8 };
    case "warm": return { type: "lowpass", cutoff: 3200, q: 1 };
    case "muffled": return { type: "lowpass", cutoff: 700, q: 1.2 };
    case "lofi": return { type: "lowpass", cutoff: 2200, q: 1.5 };
    case "crisp": return { type: "highpass", cutoff: 120, q: 1 };
  }
}

function applyFades(samples: Float32Array, channels: 1 | 2, sampleRate: number, fadeIn?: number, fadeOut?: number): void {
  const frames = samples.length / channels;
  if (fadeIn !== undefined && fadeIn > 0) {
    const count = Math.min(frames, Math.max(1, Math.ceil(fadeIn * sampleRate)));
    for (let frame = 0; frame < count; frame += 1) {
      const gain = count === 1 ? 1 : frame / (count - 1);
      for (let channel = 0; channel < channels; channel += 1) samples[frame * channels + channel] *= gain;
    }
  }
  if (fadeOut !== undefined && fadeOut > 0) {
    const count = Math.min(frames, Math.max(1, Math.ceil(fadeOut * sampleRate)));
    for (let frameFromEnd = 0; frameFromEnd < count; frameFromEnd += 1) {
      const gain = count === 1 ? 0 : frameFromEnd / (count - 1);
      const frame = frames - 1 - frameFromEnd;
      for (let channel = 0; channel < channels; channel += 1) samples[frame * channels + channel] *= gain;
    }
  }
}

/** Equal-power stereo balance. Center leaves both channels unchanged. */
function applyPan(samples: Float32Array, pan: number): void {
  const angle = ((pan + 1) * Math.PI) / 4;
  const leftGain = Math.cos(angle) * Math.SQRT2;
  const rightGain = Math.sin(angle) * Math.SQRT2;
  for (let frame = 0; frame < samples.length / 2; frame += 1) {
    samples[frame * 2] *= leftGain;
    samples[frame * 2 + 1] *= rightGain;
  }
}

/** Linear playback-rate resampling: speed changes duration and pitch together. */
function changeSpeed(samples: Float32Array, channels: 1 | 2, speed: number): Float32Array {
  if (speed === 1) return samples;
  const sourceFrames = samples.length / channels;
  const targetFrames = Math.max(1, Math.round(sourceFrames / speed));
  const out = new Float32Array(targetFrames * channels);
  for (let frame = 0; frame < targetFrames; frame += 1) {
    const sourcePosition = Math.min(sourceFrames - 1, frame * speed);
    const i0 = Math.floor(sourcePosition);
    const i1 = Math.min(sourceFrames - 1, i0 + 1);
    const frac = sourcePosition - i0;
    for (let channel = 0; channel < channels; channel += 1) {
      const s0 = samples[i0 * channels + channel] ?? 0;
      const s1 = samples[i1 * channels + channel] ?? 0;
      out[frame * channels + channel] = s0 + (s1 - s0) * frac;
    }
  }
  return out;
}

/** Trimming uses a view because the source is operation-owned and subsequent processing may mutate it safely. */
function trimClip(samples: Float32Array, channels: 1 | 2, sampleRate: number, sourceStart?: number, duration?: number): Float32Array {
  const startFrame = Math.floor((sourceStart ?? 0) * sampleRate);
  const sourceFrames = samples.length / channels;
  let endFrame = sourceFrames;
  if (duration !== undefined) endFrame = Math.min(sourceFrames, startFrame + Math.ceil(duration * sampleRate));
  return samples.subarray(startFrame * channels, endFrame * channels);
}

function clipPitchOverrides(clip: SynthComposeClip): SynthPresetOverrides | undefined {
  const semitones = (clip.transpose ?? 0) + (clip.detune ?? 0) / 100;
  const ratio = clip.pitch ?? 1;
  const transpose = semitones !== 0 || ratio !== 1 ? semitones + 12 * Math.log2(ratio) : undefined;
  if (transpose === undefined) return undefined;
  return { transpose };
}

function renderClipSource(clip: SynthComposeClip, sampleRate: number, channels: 1 | 2, seed?: AudioSeed): Float32Array {
  const wav = clip.wav ?? clip.buffer;
  if (wav !== undefined) {
    const decoded = decodeWavPcm16(wav);
    if (decoded.sampleRate === sampleRate && decoded.channels === channels) return decoded.samples;
    const frames = Math.max(1, Math.round((decoded.samples.length / decoded.channels) * (sampleRate / decoded.sampleRate)));
    return resampleToMatch(decoded.samples, decoded.sampleRate, decoded.channels, sampleRate, channels, frames);
  }

  let definition: SynthSoundOptions;
  if (clip.sound !== undefined) definition = applyPresetOverrides(clip.sound, clipPitchOverrides(clip));
  else if (clip.preset !== undefined) {
    definition = applyPresetOverrides(getPresetDefinition(clip.preset), {
      ...clip.overrides,
      ...(clipPitchOverrides(clip)?.transpose !== undefined
        ? { transpose: (clip.overrides?.transpose ?? 0) + clipPitchOverrides(clip)!.transpose! }
        : {}),
    });
  } else throw new ApexifyInputError("compose: each clip requires one source.");

  return renderSound({ ...definition, sampleRate, channels, limiter: false, seed: clip.seed ?? seed ?? definition.seed });
}

function processClip(clip: SynthComposeClip, samples: Float32Array, sampleRate: number, channels: 1 | 2, seed?: AudioSeed): Float32Array {
  let pcm = trimClip(samples, channels, sampleRate, clip.sourceStart, clip.duration);
  if (clip.speed !== undefined && clip.speed !== 1) pcm = changeSpeed(pcm, channels, clip.speed);

  const gain = clip.gain ?? clip.volume ?? 1;
  if (gain !== 1) for (let i = 0; i < pcm.length; i += 1) pcm[i] *= gain;

  const random = createAudioRandom(clip.seed ?? seed);
  if (clip.noise !== undefined && clip.noise > 0) {
    const amount = clip.noise;
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = pcm[i]! * (1 - amount) + (random() * 2 - 1) * amount;
  }

  const filter = clip.filter ?? (clip.quality ? qualityFilter(clip.quality) : undefined);
  if (filter) filterInterleavedInPlace(pcm, channels, sampleRate, filter);
  if (clip.quality === "lofi" && (clip.noise ?? 0) < 0.02) {
    for (let i = 0; i < pcm.length; i += 1) pcm[i] += (random() * 2 - 1) * 0.03;
  }
  applyFades(pcm, channels, sampleRate, clip.fadeIn, clip.fadeOut);
  if (channels === 2 && clip.pan !== undefined && clip.pan !== 0) applyPan(pcm, clip.pan);
  return pcm;
}

/** Soft gate: attenuate quiet bed noise without hard clicks. */
function applyNoiseGate(samples: Float32Array, threshold: number): void {
  const knee = threshold * 2.5;
  for (let i = 0; i < samples.length; i += 1) {
    const amplitude = Math.abs(samples[i]!);
    if (amplitude >= knee) continue;
    const gain = amplitude <= threshold ? 0 : (amplitude - threshold) / Math.max(Number.EPSILON, knee - threshold);
    samples[i] *= gain * gain;
  }
}

function ensureFinite(samples: Float32Array): void {
  for (let i = 0; i < samples.length; i += 1) {
    if (!Number.isFinite(samples[i])) throw new ApexifyAudioError("audio composition produced a non-finite sample.", { details: { sampleIndex: i } });
  }
}

/** Mix clips on a timeline into one PCM16 WAV. Clips are rendered/mixed one at a time so final output + one clip bounds transient memory. */
export function composeSynthAudio(options: SynthComposeOptions): Buffer {
  const validated = validateSynthComposeOptions(options);
  const { sampleRate, channels, duration } = validated;
  const frameCount = Math.ceil(duration * sampleRate);
  const mixed = new Float32Array(frameCount * channels);

  for (let index = 0; index < options.clips.length; index += 1) {
    const clip = options.clips[index]!;
    const derivedSeed = deriveAudioSeed(options.seed, `clip:${index}`);
    let pcm = renderClipSource(clip, sampleRate, channels, derivedSeed);
    pcm = processClip(clip, pcm, sampleRate, channels, derivedSeed);
    const startFrame = Math.floor((clip.at ?? 0) * sampleRate);
    const frames = pcm.length / channels;
    for (let frame = 0; frame < frames && startFrame + frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) mixed[(startFrame + frame) * channels + channel] += pcm[frame * channels + channel]!;
    }
  }

  const master = options.masterGain ?? 1;
  if (master !== 1) for (let i = 0; i < mixed.length; i += 1) mixed[i] *= master;
  if (options.postHighpassHz !== undefined) filterInterleavedInPlace(mixed, channels, sampleRate, { type: "highpass", cutoff: options.postHighpassHz, q: Math.SQRT1_2 });
  if (options.noiseGateThreshold !== undefined && options.noiseGateThreshold > 0) applyNoiseGate(mixed, options.noiseGateThreshold);
  ensureFinite(mixed);
  applyLimiter(mixed, options.limiter !== false);
  return encodeWavPcm16(mixed, sampleRate, channels);
}
