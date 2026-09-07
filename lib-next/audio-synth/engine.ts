import type { AdsrEnvelope, SynthLayer, SynthSoundOptions, SynthSequenceOptions, Waveform } from "../types";
import { ApexifyAudioError, ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit, estimateAudioBytes } from "../runtime/limits";
import { createBiquadProcessor } from "./biquad-filter";
import { PEAK_LIMIT } from "./constants";
import { createAudioRandom, deriveAudioSeed } from "./audio-random";
import { validateSynthSequenceOptions, validateSynthSoundOptions } from "./audio-validation";
import { getPresetDefinition } from "./presets";

const TAU = Math.PI * 2;
const DEFAULT_ADSR: Required<AdsrEnvelope> = { attack: 0.002, decay: 0.05, sustain: 0.7, release: 0.08 };

type ValidatedSoundOptions = ReturnType<typeof validateSynthSoundOptions>;
type ValidatedSequenceOptions = ReturnType<typeof validateSynthSequenceOptions>;

interface PinkNoiseState {
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
  b6: number;
}

interface ResolvedAdsr {
  env: Required<AdsrEnvelope>;
  sustainStart: number;
  releaseStart: number;
}

function centsToRatio(cents: number): number {
  return Math.pow(2, cents / 1200);
}

function wrapPhase(phase: number): number {
  if (phase >= TAU || phase < 0) phase %= TAU;
  return phase < 0 ? phase + TAU : phase;
}

function oscSample(wave: Waveform, phase: number, pink: PinkNoiseState, random: () => number): number {
  switch (wave) {
    case "sine": return Math.sin(phase);
    case "square": return Math.sin(phase) >= 0 ? 1 : -1;
    case "sawtooth": return 2 * (wrapPhase(phase) / TAU) - 1;
    case "triangle": return 1 - 4 * Math.abs((wrapPhase(phase) / TAU) - 0.5);
    case "noise": return random() * 2 - 1;
    case "pink": {
      const white = random() * 2 - 1;
      pink.b0 = 0.99886 * pink.b0 + white * 0.0555179;
      pink.b1 = 0.99332 * pink.b1 + white * 0.0750759;
      pink.b2 = 0.969 * pink.b2 + white * 0.153852;
      pink.b3 = 0.8665 * pink.b3 + white * 0.3104856;
      pink.b4 = 0.55 * pink.b4 + white * 0.5329522;
      pink.b5 = -0.7616 * pink.b5 - white * 0.016898;
      const value = pink.b0 + pink.b1 + pink.b2 + pink.b3 + pink.b4 + pink.b5 + pink.b6 + white * 0.5362;
      pink.b6 = white * 0.115926;
      return Math.max(-1, Math.min(1, value * 0.11));
    }
  }
}

function fittedAdsr(duration: number, env: Required<AdsrEnvelope>): Required<AdsrEnvelope> {
  const stageTotal = env.attack + env.decay + env.release;
  if (stageTotal <= duration || stageTotal === 0) return env;
  const scale = duration / stageTotal;
  return { ...env, attack: env.attack * scale, decay: env.decay * scale, release: env.release * scale };
}

function resolveAdsr(duration: number, envelope: AdsrEnvelope | undefined): ResolvedAdsr {
  const env = fittedAdsr(duration, { ...DEFAULT_ADSR, ...envelope });
  const sustainStart = env.attack + env.decay;
  return {
    env,
    sustainStart,
    releaseStart: Math.max(sustainStart, duration - env.release),
  };
}

function adsrGainResolved(t: number, duration: number, resolved: ResolvedAdsr): number {
  const { env, sustainStart, releaseStart } = resolved;
  const clampedT = t <= 0 ? 0 : t >= duration ? duration : t;
  if (env.attack > 0 && clampedT < env.attack) return clampedT / env.attack;
  if (clampedT < sustainStart) {
    if (env.decay === 0) return env.sustain;
    const progress = Math.max(0, Math.min(1, (clampedT - env.attack) / env.decay));
    return 1 - (1 - env.sustain) * progress;
  }
  if (clampedT < releaseStart) return env.sustain;
  if (clampedT >= duration) return 0;
  if (env.release === 0) return env.sustain;
  const progress = Math.max(0, Math.min(1, (clampedT - releaseStart) / env.release));
  return env.sustain * (1 - progress);
}

export function adsrGainAt(t: number, duration: number, envelope: AdsrEnvelope = {}): number {
  return adsrGainResolved(t, duration, resolveAdsr(duration, envelope));
}

function renderLayer(
  layer: SynthLayer,
  out: Float32Array,
  channels: 1 | 2,
  sampleRate: number,
  globalStartSample: number,
  random: () => number
): void {
  const startSample = globalStartSample + Math.floor((layer.delay ?? 0) * sampleRate);
  const length = Math.max(1, Math.ceil(layer.duration * sampleRate));
  const wave = layer.waveform ?? "sine";
  const gain = layer.gain ?? 0.5;
  const tonal = wave !== "noise" && wave !== "pink";
  const detuneRatio = centsToRatio(layer.detune ?? 0);
  const f0 = tonal ? (layer.frequency ?? 440) * detuneRatio : 0;
  const f1 = tonal ? (layer.frequencyEnd ?? layer.frequency ?? 440) * detuneRatio : 0;
  const frequencyStep = length > 1 ? (f1 - f0) / (length - 1) : 0;
  const pan = layer.pan ?? 0;
  const panAngle = ((pan + 1) * Math.PI) / 4;
  const leftGain = channels === 1 ? 1 : Math.cos(panAngle);
  const rightGain = channels === 1 ? 0 : Math.sin(panAngle);
  const noiseMix = layer.noiseMix ?? 0;
  const partials = layer.partials ?? [];
  const partialScale = 1 / (1 + partials.reduce((sum, [, pGain]) => sum + pGain, 0));
  const vibratoOmega = layer.vibrato ? TAU * layer.vibrato.rate : 0;
  const tremoloOmega = layer.tremolo ? TAU * layer.tremolo.rate : 0;
  const filter = layer.filter ? createBiquadProcessor(layer.filter, sampleRate) : undefined;
  const pink: PinkNoiseState = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
  const adsr = resolveAdsr(layer.duration, layer.adsr);
  const envelopeStep = length > 1 ? layer.duration / (length - 1) : 0;

  let phase = 0;
  let clockTime = 0;
  let envelopeTime = length > 1 ? 0 : layer.duration;
  for (let i = 0; i < length; i += 1) {
    let sample: number;

    if (tonal) {
      let frequency = f0 + frequencyStep * i;
      if (layer.vibrato) frequency += layer.vibrato.depth * Math.sin(vibratoOmega * clockTime);
      sample = oscSample(wave, phase, pink, random);
      for (const [ratio, pGain] of partials) sample += oscSample(wave, phase * ratio, pink, random) * pGain;
      sample *= partialScale;
      if (noiseMix > 0) sample = sample * (1 - noiseMix) + (random() * 2 - 1) * noiseMix;
      phase = wrapPhase(phase + (TAU * frequency) / sampleRate);
    } else {
      sample = oscSample(wave, 0, pink, random);
    }

    if (filter) sample = filter.process(sample);
    let amp = gain * adsrGainResolved(envelopeTime, layer.duration, adsr);
    if (layer.tremolo) {
      const modulation = 0.5 + 0.5 * Math.sin(tremoloOmega * clockTime);
      amp *= 1 - layer.tremolo.depth * modulation;
    }
    sample *= amp;

    const frame = startSample + i;
    if (frame >= 0 && frame < out.length / channels) {
      if (channels === 1) out[frame] += sample;
      else {
        out[frame * 2] += sample * leftGain;
        out[frame * 2 + 1] += sample * rightGain;
      }
    }
    clockTime += 1 / sampleRate;
    envelopeTime += envelopeStep;
  }
}

function ensureFinite(samples: Float32Array, operation: string): void {
  for (let i = 0; i < samples.length; i += 1) {
    if (!Number.isFinite(samples[i])) throw new ApexifyAudioError(`${operation} produced a non-finite sample.`, { details: { sampleIndex: i } });
  }
}

function finalizeSamples(samples: Float32Array, masterGain: number, limiter: boolean, operation: string): void {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const value = masterGain === 1 ? samples[i]! : samples[i]! * masterGain;
    if (!Number.isFinite(value)) throw new ApexifyAudioError(`${operation} produced a non-finite sample.`, { details: { sampleIndex: i } });
    if (masterGain !== 1) samples[i] = value;
    if (limiter) {
      const magnitude = Math.abs(value);
      if (magnitude > peak) peak = magnitude;
    }
  }
  if (!limiter || peak <= 1) return;
  const scale = PEAK_LIMIT / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
}

export function applyLimiter(samples: Float32Array, enabled: boolean): void {
  if (!enabled) return;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]!));
  if (peak <= 1) return;
  const scale = PEAK_LIMIT / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= scale;
}

/** Trusted internal path for a sound whose public/resource validation has already completed. */
export function renderValidatedSound(options: SynthSoundOptions, validated: ValidatedSoundOptions): Float32Array {
  const { duration, sampleRate, channels } = validated;
  const frameCount = Math.ceil(duration * sampleRate);
  const samples = new Float32Array(frameCount * channels);

  for (let index = 0; index < options.layers.length; index += 1) {
    const layer = options.layers[index]!;
    renderLayer(layer, samples, channels, sampleRate, 0, createAudioRandom(deriveAudioSeed(options.seed, `layer:${index}`)));
  }

  finalizeSamples(samples, options.masterGain ?? 1, options.limiter !== false, "audio synthesis");
  return samples;
}

export function renderSound(options: SynthSoundOptions): Float32Array {
  return renderValidatedSound(options, validateSynthSoundOptions(options));
}

export function mixFloatBuffers(buffers: Float32Array[], channels: 1 | 2, masterGain = 1): Float32Array {
  if (channels !== 1 && channels !== 2) throw new ApexifyInputError("mixFloatBuffers channels must be 1 or 2.");
  let maxLength = 0;
  for (const buffer of buffers) {
    if (!(buffer instanceof Float32Array) || buffer.length % channels !== 0) throw new ApexifyInputError("mixFloatBuffers requires complete Float32 audio frames.");
    maxLength = Math.max(maxLength, buffer.length);
  }
  assertWithinLimit("maxAudioBytes", maxLength * Float32Array.BYTES_PER_ELEMENT);
  const out = new Float32Array(maxLength);
  for (const buffer of buffers) for (let i = 0; i < buffer.length; i += 1) out[i] += buffer[i]!;
  finalizeSamples(out, masterGain, true, "audio mix");
  return out;
}

function sourceChannelSample(samples: Float32Array, frame: number, fromChannels: 1 | 2, toChannel: number, toChannels: 1 | 2): number {
  if (fromChannels === 1) return samples[frame] ?? 0;
  if (toChannels === 1) return ((samples[frame * 2] ?? 0) + (samples[frame * 2 + 1] ?? 0)) * 0.5;
  return samples[frame * 2 + Math.min(toChannel, 1)] ?? 0;
}

export function resampleToMatch(
  samples: Float32Array,
  fromRate: number,
  fromChannels: 1 | 2,
  toRate: number,
  toChannels: 1 | 2,
  targetFrames: number
): Float32Array {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw new ApexifyInputError("resampleToMatch requires non-empty Float32 samples.");
  if (!Number.isInteger(fromRate) || fromRate <= 0 || !Number.isInteger(toRate) || toRate <= 0) throw new ApexifyInputError("resampleToMatch sample rates must be positive integers.");
  if ((fromChannels !== 1 && fromChannels !== 2) || (toChannels !== 1 && toChannels !== 2)) throw new ApexifyInputError("resampleToMatch supports only mono/stereo audio.");
  if (!Number.isSafeInteger(targetFrames) || targetFrames <= 0) throw new ApexifyInputError("resampleToMatch targetFrames must be a positive safe integer.");
  if (samples.length % fromChannels !== 0) throw new ApexifyInputError("resampleToMatch source has incomplete frames.");
  assertWithinLimit("maxAudioSampleRate", fromRate);
  assertWithinLimit("maxAudioSampleRate", toRate);
  assertWithinLimit("maxAudioBytes", targetFrames * toChannels * Float32Array.BYTES_PER_ELEMENT);

  const sourceFrames = samples.length / fromChannels;
  if (fromRate === toRate && fromChannels === toChannels && sourceFrames === targetFrames) return samples;
  const out = new Float32Array(targetFrames * toChannels);
  const ratio = fromRate / toRate;
  for (let frame = 0; frame < targetFrames; frame += 1) {
    const sourcePosition = Math.min(sourceFrames - 1, frame * ratio);
    const i0 = Math.floor(sourcePosition);
    const i1 = Math.min(sourceFrames - 1, i0 + 1);
    const frac = sourcePosition - i0;
    for (let channel = 0; channel < toChannels; channel += 1) {
      const s0 = sourceChannelSample(samples, i0, fromChannels, channel, toChannels);
      const s1 = sourceChannelSample(samples, i1, fromChannels, channel, toChannels);
      out[frame * toChannels + channel] = s0 + (s1 - s0) * frac;
    }
  }
  ensureFinite(out, "audio resampling");
  return out;
}

/** Trusted internal path for a sequence whose full validation has already completed. */
export function renderValidatedSequence(options: SynthSequenceOptions, validated: ValidatedSequenceOptions): Float32Array {
  const { duration, sampleRate, channels } = validated;
  const frameCount = Math.ceil(duration * sampleRate);
  const out = new Float32Array(frameCount * channels);

  for (let index = 0; index < options.events.length; index += 1) {
    const event = options.events[index]!;
    const base = event.options ?? getPresetDefinition(event.preset!);
    const seed = event.options?.seed ?? deriveAudioSeed(options.seed, `event:${index}`);
    const eventOptions = { ...base, sampleRate, channels, seed };
    const samples = renderSound(eventOptions);
    const start = Math.floor(event.at * sampleRate);
    const gain = event.gain ?? 1;
    const frames = samples.length / channels;
    for (let frame = 0; frame < frames && start + frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) out[(start + frame) * channels + channel] += samples[frame * channels + channel]! * gain;
    }
  }

  finalizeSamples(out, options.masterGain ?? 1, true, "audio sequence");
  return out;
}

export function renderSequence(options: SynthSequenceOptions): Float32Array {
  return renderValidatedSequence(options, validateSynthSequenceOptions(options));
}

export interface ComposeTimelineOptions {
  duration?: number;
  tail?: number;
  masterGain?: number;
  limiter?: boolean;
}

/** Low-level same-format timeline summation. Public synthesis/composition validates richer source semantics before calling equivalent logic. */
export function composeTimeline(
  placements: Array<{ at: number; samples: Float32Array }>,
  sampleRate: number,
  channels: 1 | 2,
  options: ComposeTimelineOptions = {}
): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new ApexifyInputError("composeTimeline sampleRate must be a positive integer.");
  if (channels !== 1 && channels !== 2) throw new ApexifyInputError("composeTimeline channels must be 1 or 2.");
  if (options.duration !== undefined && (!Number.isFinite(options.duration) || options.duration <= 0)) throw new ApexifyInputError("composeTimeline duration must be > 0.");
  if (options.tail !== undefined && (!Number.isFinite(options.tail) || options.tail < 0)) throw new ApexifyInputError("composeTimeline tail must be >= 0.");
  let endSeconds = 0;
  for (const placement of placements) {
    if (!Number.isFinite(placement.at) || placement.at < 0) throw new ApexifyInputError("composeTimeline placement offsets must be finite and non-negative.");
    if (!(placement.samples instanceof Float32Array) || placement.samples.length % channels !== 0) throw new ApexifyInputError("composeTimeline placements require complete Float32 frames.");
    endSeconds = Math.max(endSeconds, placement.at + placement.samples.length / channels / sampleRate);
  }
  endSeconds = Math.max(endSeconds + (options.tail ?? 0), options.duration ?? 0);
  if (endSeconds <= 0) throw new ApexifyInputError("composeTimeline cannot produce zero-length output.");
  const frameCount = Math.ceil(endSeconds * sampleRate);
  assertWithinLimit("maxAudioBytes", estimateAudioBytes(endSeconds, sampleRate, channels));
  const out = new Float32Array(frameCount * channels);
  for (const placement of placements) {
    const start = Math.floor(placement.at * sampleRate);
    const frames = placement.samples.length / channels;
    for (let frame = 0; frame < frames && start + frame < frameCount; frame += 1) {
      for (let channel = 0; channel < channels; channel += 1) out[(start + frame) * channels + channel] += placement.samples[frame * channels + channel]!;
    }
  }
  finalizeSamples(out, options.masterGain ?? 1, options.limiter !== false, "audio timeline");
  return out;
}

export { DEFAULT_SAMPLE_RATE } from "./constants";
