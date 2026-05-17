import type {
  FilterOptions,
  SynthClipQuality,
  SynthComposeClip,
  SynthComposeOptions,
  SynthPresetOverrides,
  SynthSoundOptions,
} from "../types/audio-synth";
import {
  applyLimiter,
  composeTimeline,
  DEFAULT_SAMPLE_RATE,
  renderSound,
  resampleToMatch,
} from "./engine";
import { getPresetDefinition } from "./presets";
import { applyPresetOverrides } from "./preset-overrides";
import { decodeWavPcm16, encodeWavPcm16 } from "./wav-encode";

function qualityFilter(q: SynthClipQuality): FilterOptions {
  switch (q) {
    case "bright":
      return { type: "highpass", cutoff: 280, q: 0.8 };
    case "warm":
      return { type: "lowpass", cutoff: 3200, q: 1 };
    case "muffled":
      return { type: "lowpass", cutoff: 700, q: 1.2 };
    case "lofi":
      return { type: "lowpass", cutoff: 2200, q: 1.5 };
    case "crisp":
      return { type: "highpass", cutoff: 120, q: 1 };
    default:
      return { type: "lowpass", cutoff: 4000, q: 1 };
  }
}

function applyClipFilter(
  samples: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  filter: FilterOptions
): void {
  const state = { lp: 0, hp: 0 };
  const q = filter.q ?? 1;
  const fc = Math.max(20, Math.min(sampleRate * 0.45, filter.cutoff));
  const alpha = Math.exp((-2 * Math.PI * fc) / sampleRate) * (0.5 + q * 0.05);
  const frames = samples.length / channels;
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < channels; c++) {
      const i = f * channels + c;
      let s = samples[i];
      if (filter.type === "lowpass") {
        state.lp = alpha * state.lp + (1 - alpha) * s;
        s = state.lp;
      } else {
        state.hp = alpha * state.hp + (1 - alpha) * (s - state.hp);
        s = s - state.hp;
      }
      samples[i] = s;
    }
  }
}

function applyFades(
  samples: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  fadeIn?: number,
  fadeOut?: number
): void {
  const frames = samples.length / channels;
  if (fadeIn && fadeIn > 0) {
    const n = Math.min(frames, Math.ceil(fadeIn * sampleRate));
    for (let f = 0; f < n; f++) {
      const g = f / n;
      for (let c = 0; c < channels; c++) samples[f * channels + c] *= g;
    }
  }
  if (fadeOut && fadeOut > 0) {
    const n = Math.min(frames, Math.ceil(fadeOut * sampleRate));
    for (let f = 0; f < n; f++) {
      const g = f / n;
      const idx = frames - 1 - f;
      for (let c = 0; c < channels; c++) samples[idx * channels + c] *= g;
    }
  }
}

function applyPan(samples: Float32Array, pan: number): void {
  const frames = samples.length / 2;
  const p = Math.max(-1, Math.min(1, pan));
  const l = Math.cos(((p + 1) / 2) * Math.PI * 0.5);
  const r = Math.sin(((p + 1) / 2) * Math.PI * 0.5);
  for (let f = 0; f < frames; f++) {
    const m = (samples[f * 2] + samples[f * 2 + 1]) * 0.5;
    samples[f * 2] = m * l;
    samples[f * 2 + 1] = m * r;
  }
}

function changeSpeed(samples: Float32Array, channels: 1 | 2, speed: number): Float32Array {
  if (speed === 1 || !Number.isFinite(speed) || speed <= 0) return samples;
  const srcFrames = samples.length / channels;
  const targetFrames = Math.max(1, Math.floor(srcFrames / speed));
  const out = new Float32Array(targetFrames * channels);
  for (let f = 0; f < targetFrames; f++) {
    const srcF = f * speed;
    const i0 = Math.floor(srcF);
    const i1 = Math.min(srcFrames - 1, i0 + 1);
    const frac = srcF - i0;
    for (let c = 0; c < channels; c++) {
      const s0 = samples[i0 * channels + c] ?? 0;
      const s1 = samples[i1 * channels + c] ?? 0;
      out[f * channels + c] = s0 + (s1 - s0) * frac;
    }
  }
  return out;
}

function trimClip(
  samples: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  sourceStart?: number,
  duration?: number
): Float32Array {
  const startFrame = Math.floor((sourceStart ?? 0) * sampleRate);
  const srcFrames = samples.length / channels;
  if (startFrame >= srcFrames) return new Float32Array(0);
  let endFrame = srcFrames;
  if (duration != null && duration > 0) {
    endFrame = Math.min(srcFrames, startFrame + Math.ceil(duration * sampleRate));
  }
  const len = endFrame - startFrame;
  const out = new Float32Array(len * channels);
  for (let i = 0; i < len * channels; i++) {
    out[i] = samples[startFrame * channels + i] ?? 0;
  }
  return out;
}

function clipPitchOverrides(clip: SynthComposeClip): SynthPresetOverrides | undefined {
  const semitones = (clip.transpose ?? 0) + (clip.detune ?? 0) / 100;
  const pitchRatio = clip.pitch ?? 1;
  const transpose =
    semitones !== 0 || pitchRatio !== 1 ? semitones + 12 * Math.log2(pitchRatio) : undefined;
  const volume = clip.volume ?? clip.gain;
  if (transpose == null && volume == null) return undefined;
  return { transpose, volume };
}

function renderClipSource(
  clip: SynthComposeClip,
  sampleRate: number,
  channels: 1 | 2
): Float32Array {
  const wav = clip.wav ?? clip.buffer;
  if (wav) {
    const { samples, sampleRate: sr, channels: ch } = decodeWavPcm16(wav);
    if (sr === sampleRate && ch === channels) return new Float32Array(samples);
    const frames = Math.ceil((samples.length / ch) * (sampleRate / sr));
    return resampleToMatch(samples, sr, ch, sampleRate, channels, frames);
  }

  const pitch = clipPitchOverrides(clip);
  let def: SynthSoundOptions;
  if (clip.sound) {
    def = clip.sound;
  } else if (clip.preset) {
    def = getPresetDefinition(clip.preset);
  } else {
    throw new Error("compose: each clip needs preset, sound, wav, or buffer.");
  }

  def = applyPresetOverrides(def, {
    ...clip.overrides,
    ...(pitch?.transpose != null ? { transpose: (clip.overrides?.transpose ?? 0) + pitch.transpose } : {}),
    ...(pitch?.volume != null ? { volume: (clip.overrides?.volume ?? 1) * pitch.volume } : {}),
  });

  return renderSound({ ...def, sampleRate, channels, limiter: false });
}

function processClip(
  clip: SynthComposeClip,
  samples: Float32Array,
  sampleRate: number,
  channels: 1 | 2
): Float32Array {
  let pcm = samples;

  if (clip.sourceStart || (clip.duration != null && clip.duration > 0)) {
    pcm = trimClip(pcm, channels, sampleRate, clip.sourceStart, clip.duration);
  }

  if (clip.speed != null && clip.speed !== 1) {
    pcm = changeSpeed(pcm, channels, clip.speed);
  }

  const gain = clip.gain ?? clip.volume ?? 1;
  if (gain !== 1) {
    for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  }

  if (clip.noise != null && clip.noise > 0) {
    const n = Math.min(1, clip.noise);
    for (let i = 0; i < pcm.length; i++) {
      pcm[i] = pcm[i] * (1 - n) + (Math.random() * 2 - 1) * n;
    }
  }

  const filter = clip.filter ?? (clip.quality ? qualityFilter(clip.quality) : undefined);
  if (filter) applyClipFilter(pcm, channels, sampleRate, filter);
  if (clip.quality === "lofi" && (clip.noise ?? 0) < 0.02) {
    for (let i = 0; i < pcm.length; i++) pcm[i] += (Math.random() * 2 - 1) * 0.03;
  }

  applyFades(pcm, channels, sampleRate, clip.fadeIn, clip.fadeOut);

  if (channels === 2 && clip.pan != null && clip.pan !== 0) {
    applyPan(pcm, clip.pan);
  }

  return pcm;
}

function applyPostHighpass(
  samples: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  cutoffHz: number
): void {
  const fc = Math.max(40, Math.min(sampleRate * 0.45, cutoffHz));
  const alpha = Math.exp((-2 * Math.PI * fc) / sampleRate);
  const frames = samples.length / channels;
  for (let c = 0; c < channels; c++) {
    let prevIn = 0;
    let prevOut = 0;
    for (let f = 0; f < frames; f++) {
      const i = f * channels + c;
      const x = samples[i];
      const y = alpha * (prevOut + x - prevIn);
      samples[i] = y;
      prevIn = x;
      prevOut = y;
    }
  }
}

/** Soft gate: attenuate quiet bed noise without hard clicks. */
function applyNoiseGate(samples: Float32Array, threshold: number): void {
  const t = Math.max(0.0005, threshold);
  const knee = t * 2.5;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a >= knee) continue;
    const g = a <= t ? 0 : (a - t) / (knee - t);
    samples[i] *= g * g;
  }
}

/** Mix clips on a timeline into one WAV (overlaps allowed). */
export function composeSynthAudio(options: SynthComposeOptions): Buffer {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const placements: { at: number; samples: Float32Array }[] = [];

  for (const clip of options.clips) {
    let pcm = renderClipSource(clip, sampleRate, channels);
    pcm = processClip(clip, pcm, sampleRate, channels);
    placements.push({ at: clip.at ?? 0, samples: pcm });
  }

  let pcm = composeTimeline(placements, sampleRate, channels, {
    duration: options.duration,
    tail: options.tail,
    masterGain: options.masterGain,
    limiter: options.limiter,
  });

  if (options.postHighpassHz != null && options.postHighpassHz > 0) {
    applyPostHighpass(pcm, channels, sampleRate, options.postHighpassHz);
  }
  if (options.noiseGateThreshold != null && options.noiseGateThreshold > 0) {
    applyNoiseGate(pcm, options.noiseGateThreshold);
  }
  if (options.limiter !== false) {
    applyLimiter(pcm, true);
  }

  return encodeWavPcm16(pcm, sampleRate, channels);
}
