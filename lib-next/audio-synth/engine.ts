import type {
  AdsrEnvelope,
  FilterOptions,
  SynthLayer,
  SynthSoundOptions,
  SynthSequenceOptions,
  Waveform,
} from "../types/audio-synth";
import { getPresetDefinition } from "./presets";

const DEFAULT_SAMPLE_RATE = 44100;
const DEFAULT_ADSR: Required<AdsrEnvelope> = {
  attack: 0.002,
  decay: 0.05,
  sustain: 0.7,
  release: 0.08,
};

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

function oscSample(wave: Waveform, phase: number, pinkState: { b0: number; b1: number; b2: number }): number {
  const t = phase % (Math.PI * 2);
  switch (wave) {
    case "sine":
      return Math.sin(t);
    case "square":
      return Math.sin(t) >= 0 ? 1 : -1;
    case "sawtooth":
      return 1 - ((t / (Math.PI * 2)) % 1) * 2;
    case "triangle": {
      const p = (t / (Math.PI * 2)) % 1;
      return p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    }
    case "noise":
      return Math.random() * 2 - 1;
    case "pink": {
      const white = Math.random() * 2 - 1;
      pinkState.b0 = 0.99886 * pinkState.b0 + white * 0.0555179;
      pinkState.b1 = 0.99332 * pinkState.b1 + white * 0.0750759;
      pinkState.b2 = 0.969 * pinkState.b2 + white * 0.153852;
      return (pinkState.b0 + pinkState.b1 + pinkState.b2) / 3;
    }
    default:
      return Math.sin(t);
  }
}

function adsrGain(t: number, duration: number, env: Required<AdsrEnvelope>): number {
  const { attack, decay, sustain, release } = env;
  const sustainStart = attack + decay;
  const releaseStart = Math.max(sustainStart, duration - release);

  if (t < attack) return t / Math.max(attack, 1e-6);
  if (t < sustainStart) {
    const d = decay > 0 ? (t - attack) / decay : 1;
    return 1 - (1 - sustain) * Math.min(1, d);
  }
  if (t < releaseStart) return sustain;
  const r = release > 0 ? (t - releaseStart) / release : 1;
  return sustain * (1 - Math.min(1, r));
}

function applyFilter(
  sample: number,
  filter: FilterOptions | undefined,
  state: { lp: number; hp: number },
  sampleRate: number
): number {
  if (!filter) return sample;
  const q = filter.q ?? 1;
  const fc = Math.max(20, Math.min(sampleRate * 0.45, filter.cutoff));
  const alpha = Math.exp((-2 * Math.PI * fc) / sampleRate) * (0.5 + q * 0.05);

  if (filter.type === "lowpass") {
    state.lp = alpha * state.lp + (1 - alpha) * sample;
    return state.lp;
  }
  state.hp = alpha * state.hp + (1 - alpha) * (sample - state.hp);
  return sample - state.hp;
}

function renderLayer(
  layer: SynthLayer,
  out: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  globalStartSample: number
): void {
  const delay = layer.delay ?? 0;
  const startSample = globalStartSample + Math.floor(delay * sampleRate);
  const duration = layer.duration;
  const length = Math.floor(duration * sampleRate);
  const wave = layer.waveform ?? "sine";
  const gain = layer.gain ?? 0.5;
  const f0 = (layer.frequency ?? 440) * centsToRatio(layer.detune ?? 0);
  const f1 = (layer.frequencyEnd ?? layer.frequency ?? 440) * centsToRatio(layer.detune ?? 0);
  const env = { ...DEFAULT_ADSR, ...layer.adsr } as Required<AdsrEnvelope>;
  const pan = Math.max(-1, Math.min(1, layer.pan ?? 0));
  const leftGain = channels === 1 ? 1 : Math.cos(((pan + 1) / 2) * Math.PI * 0.5);
  const rightGain = channels === 1 ? 0 : Math.sin(((pan + 1) / 2) * Math.PI * 0.5);
  const noiseMix = layer.noiseMix ?? 0;
  const partials = layer.partials ?? [];

  let phase = 0;
  const pinkState = { b0: 0, b1: 0, b2: 0 };
  const filterState = { lp: 0, hp: 0 };

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const frac = length > 1 ? i / (length - 1) : 0;
    let freq = f0 + (f1 - f0) * frac;

    if (layer.vibrato) {
      freq += layer.vibrato.depth * Math.sin(2 * Math.PI * layer.vibrato.rate * t);
    }

    const phaseInc = (2 * Math.PI * freq) / sampleRate;
    phase += phaseInc;

    let sample = oscSample(wave, phase, pinkState);
    for (const [ratio, pGain] of partials) {
      sample += oscSample(wave, phase * ratio, pinkState) * pGain;
    }
    if (noiseMix > 0 && wave !== "noise" && wave !== "pink") {
      sample = sample * (1 - noiseMix) + (Math.random() * 2 - 1) * noiseMix;
    }

    sample = applyFilter(sample, layer.filter, filterState, sampleRate);

    let amp = gain * adsrGain(t, duration, env);
    if (layer.tremolo) {
      amp *= 1 - layer.tremolo.depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * layer.tremolo.rate * t));
    }
    sample *= amp;

    const idx = startSample + i;
    if (idx < 0 || idx >= out.length / channels) continue;

    if (channels === 1) {
      out[idx] += sample;
    } else {
      const frame = idx;
      out[frame * 2] += sample * leftGain;
      out[frame * 2 + 1] += sample * rightGain;
    }
  }
}

function computeDuration(options: SynthSoundOptions): number {
  if (options.duration != null) return options.duration;
  let max = 0;
  for (const layer of options.layers) {
    const end = (layer.delay ?? 0) + layer.duration;
    if (end > max) max = end;
  }
  return Math.max(0.01, max);
}

export function applyLimiter(samples: Float32Array, enabled: boolean): void {
  if (!enabled) return;
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > peak) peak = a;
  }
  if (peak <= 1) return;
  const scale = 0.98 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
}

export function renderSound(options: SynthSoundOptions): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const duration = computeDuration(options);
  const frameCount = Math.ceil(duration * sampleRate);
  const samples = new Float32Array(frameCount * channels);

  for (const layer of options.layers) {
    renderLayer(layer, samples, channels, sampleRate, 0);
  }

  const master = options.masterGain ?? 1;
  if (master !== 1) {
    for (let i = 0; i < samples.length; i++) samples[i] *= master;
  }

  applyLimiter(samples, options.limiter !== false);
  return samples;
}

export function mixFloatBuffers(
  buffers: Float32Array[],
  channels: 1 | 2,
  masterGain = 1
): Float32Array {
  let maxLen = 0;
  for (const b of buffers) {
    const frames = b.length / channels;
    if (frames > maxLen) maxLen = frames;
  }
  const out = new Float32Array(maxLen * channels);
  for (const buf of buffers) {
    const frames = Math.min(maxLen, buf.length / channels);
    for (let i = 0; i < frames * channels; i++) {
      out[i] += buf[i];
    }
  }
  if (masterGain !== 1) {
    for (let i = 0; i < out.length; i++) out[i] *= masterGain;
  }
  applyLimiter(out, true);
  return out;
}

export function resampleToMatch(
  samples: Float32Array,
  fromRate: number,
  fromChannels: 1 | 2,
  toRate: number,
  toChannels: 1 | 2,
  targetFrames: number
): Float32Array {
  if (fromRate === toRate && fromChannels === toChannels) {
    if (samples.length / fromChannels === targetFrames) return samples;
    const out = new Float32Array(targetFrames * toChannels);
    const copyFrames = Math.min(targetFrames, samples.length / fromChannels);
    for (let i = 0; i < copyFrames * toChannels; i++) out[i] = samples[i];
    return out;
  }
  const out = new Float32Array(targetFrames * toChannels);
  const ratio = fromRate / toRate;
  for (let f = 0; f < targetFrames; f++) {
    const srcF = f * ratio;
    const i0 = Math.floor(srcF);
    const i1 = Math.min(Math.floor(samples.length / fromChannels) - 1, i0 + 1);
    const frac = srcF - i0;
    for (let c = 0; c < toChannels; c++) {
      const sc = c < fromChannels ? c : 0;
      const s0 = samples[i0 * fromChannels + sc] ?? 0;
      const s1 = samples[i1 * fromChannels + sc] ?? 0;
      out[f * toChannels + c] = s0 + (s1 - s0) * frac;
    }
  }
  return out;
}

export function renderSequence(options: SynthSequenceOptions): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? 1;
  const tail = options.tail ?? 0.1;
  let endTime = tail;
  const chunks: { at: number; samples: Float32Array; gain: number }[] = [];

  for (const ev of options.events) {
    const soundOpts = ev.options;
    if (!soundOpts && !ev.preset) continue;
    const def =
      soundOpts ??
      (ev.preset ? getPresetDefinition(ev.preset) : null);
    if (!def) continue;
    const pcm = renderSound({ ...def, sampleRate, channels });
    const dur = computeDuration(def);
    const evEnd = ev.at + dur;
    if (evEnd > endTime) endTime = evEnd;
    chunks.push({ at: ev.at, samples: pcm, gain: ev.gain ?? 1 });
  }

  const frameCount = Math.ceil((endTime + tail) * sampleRate);
  const out = new Float32Array(frameCount * channels);

  for (const { at, samples, gain } of chunks) {
    const start = Math.floor(at * sampleRate);
    const ch = channels;
    const frames = samples.length / ch;
    for (let f = 0; f < frames; f++) {
      const dst = start + f;
      if (dst >= frameCount) break;
      for (let c = 0; c < ch; c++) {
        out[dst * ch + c] += samples[f * ch + c] * gain;
      }
    }
  }

  const master = options.masterGain ?? 1;
  if (master !== 1) {
    for (let i = 0; i < out.length; i++) out[i] *= master;
  }
  applyLimiter(out, true);
  return out;
}

export interface ComposeTimelineOptions {
  duration?: number;
  tail?: number;
  masterGain?: number;
  limiter?: boolean;
}

/** Sum clips at timeline offsets into one buffer (overlapping clips are added). */
export function composeTimeline(
  placements: Array<{ at: number; samples: Float32Array }>,
  sampleRate: number,
  channels: 1 | 2,
  options: ComposeTimelineOptions = {}
): Float32Array {
  const tail = options.tail ?? 0;
  let endSec = tail;
  for (const { at, samples } of placements) {
    const clipEnd = at + samples.length / channels / sampleRate;
    if (clipEnd > endSec) endSec = clipEnd;
  }
  if (options.duration != null) endSec = Math.max(endSec, options.duration);
  const frameCount = Math.ceil(endSec * sampleRate);
  const out = new Float32Array(frameCount * channels);

  for (const { at, samples } of placements) {
    const start = Math.floor(at * sampleRate);
    const frames = samples.length / channels;
    for (let f = 0; f < frames; f++) {
      const dst = start + f;
      if (dst >= frameCount) break;
      for (let c = 0; c < channels; c++) {
        out[dst * channels + c] += samples[f * channels + c];
      }
    }
  }

  const master = options.masterGain ?? 1;
  if (master !== 1) {
    for (let i = 0; i < out.length; i++) out[i] *= master;
  }
  applyLimiter(out, options.limiter !== false);
  return out;
}

export { DEFAULT_SAMPLE_RATE };
