/** Procedural audio synthesis — oscillators, noise, envelopes, presets, sequencing, composition, and PCM16 WAV I/O. */

export type AudioSeed = number | string;
export type Waveform = "sine" | "square" | "sawtooth" | "triangle" | "noise" | "pink";
export type FilterType = "lowpass" | "highpass";

/** ADSR envelope (seconds + sustain level 0–1). Stages are proportionally fitted when A+D+R exceeds the layer duration. */
export interface AdsrEnvelope {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

export interface VibratoOptions {
  /** Frequency deviation in Hz. */
  depth: number;
  /** LFO rate in Hz. */
  rate: number;
}

export interface TremoloOptions {
  /** Depth 0–1. Output amplitude stays non-negative. */
  depth: number;
  /** LFO rate in Hz. */
  rate: number;
}

export interface FilterOptions {
  type: FilterType;
  /** Cutoff in Hz; must be below Nyquist. */
  cutoff: number;
  /** Biquad Q/resonance. Default sqrt(1/2); supported range 0.1–20. */
  q?: number;
}

/** One tone/noise layer in a custom sound. */
export interface SynthLayer {
  waveform?: Waveform;
  /** Start frequency in Hz for tonal waveforms. */
  frequency?: number;
  /** Linear per-sample sweep to this frequency by the final frame. */
  frequencyEnd?: number;
  /** Layer length in seconds. */
  duration: number;
  /** Delay before this layer starts (seconds, relative to sound start). */
  delay?: number;
  /** Layer gain, validated in the range 0–4. */
  gain?: number;
  /** Detune in cents. */
  detune?: number;
  adsr?: AdsrEnvelope;
  vibrato?: VibratoOptions;
  tremolo?: TremoloOptions;
  filter?: FilterOptions;
  /** Blend white noise into tonal waveforms, 0–1. */
  noiseMix?: number;
  /** Harmonic partials as `[frequencyRatio, gain][]`. Tonal waveforms only; aggregate partial amplitude is normalized. */
  partials?: Array<[number, number]>;
  /** Equal-power pan: -1 left, 0 center, +1 right. Used only for stereo output. */
  pan?: number;
}

/** Deep layer override used by preset customization. Nested DSP objects merge with the preset layer by index. */
export type SynthLayerOverride = Omit<Partial<SynthLayer>, "adsr" | "vibrato" | "tremolo" | "filter"> & {
  adsr?: Partial<AdsrEnvelope>;
  vibrato?: Partial<VibratoOptions>;
  tremolo?: Partial<TremoloOptions>;
  filter?: Partial<FilterOptions>;
};

/** Full custom sound definition. */
export interface SynthSoundOptions {
  layers: SynthLayer[];
  sampleRate?: number;
  channels?: 1 | 2;
  /** Master gain, validated in the range 0–4. */
  masterGain?: number;
  /** Total duration; auto-computed from layers when omitted. Must be > 0. */
  duration?: number;
  /** Peak-normalize overs to 0.98 (default true). `false` disables normalization; PCM encoding still clamps full scale. */
  limiter?: boolean;
  /** Optional operation-local deterministic seed for noise. Numbers must be safe integers; strings are hashed deterministically. */
  seed?: AudioSeed;
}

/** Preset overrides. Layer entries merge by index, including nested ADSR/filter/modulation objects. */
export type SynthPresetOverrides = Omit<Partial<SynthSoundOptions>, "layers"> & {
  layers?: SynthLayerOverride[];
  /** Multiply all resulting layer gains. */
  volume?: number;
  /** Shift tonal layers by semitones. */
  transpose?: number;
};

export type SynthPresetName =
  | "laser"
  | "laserHeavy"
  | "laserCharge"
  | "explosion"
  | "explosionSmall"
  | "explosionDeep"
  | "hit"
  | "hitSoft"
  | "hitMetal"
  | "coin"
  | "powerup"
  | "powerupLong"
  | "shield"
  | "jump"
  | "jumpHigh"
  | "alarm"
  | "alarmUrgent"
  | "beep"
  | "beepHigh"
  | "click"
  | "clickSoft"
  | "whoosh"
  | "whooshIn"
  | "engine"
  | "engineIdle"
  | "siren"
  | "gameOver"
  | "gameOverSoft"
  | "blip"
  | "charge"
  | "failure"
  | "success"
  | "menuSelect"
  | "menuBack"
  | "footstep"
  | "slash"
  | "rumble"
  | "sparkle"
  | "thunder";

/** One event on a timeline when using {@link SynthSequenceOptions}. */
export interface SynthSequenceEvent {
  /** Start time on the master timeline in seconds. */
  at: number;
  preset?: SynthPresetName;
  options?: SynthSoundOptions;
  /** Per-event gain multiplier. */
  gain?: number;
}

export interface SynthSequenceOptions {
  events: SynthSequenceEvent[];
  sampleRate?: number;
  channels?: 1 | 2;
  masterGain?: number;
  /** Padding after the last event in seconds. */
  tail?: number;
  /** Optional seed; each event receives an independently derived deterministic stream. */
  seed?: AudioSeed;
}

export interface SynthPresetInfo {
  name: SynthPresetName;
  description: string;
  defaultDuration: number;
}

/** Tone shaping applied to a composed clip after synthesis. */
export type SynthClipQuality = "bright" | "warm" | "muffled" | "lofi" | "crisp";

/** One source placed on a timeline. Multiple clips may overlap. */
export interface SynthComposeClip {
  /** Start time on the master timeline in seconds. Default 0. */
  at?: number;
  /** Maximum source length in seconds; trims the source tail. */
  duration?: number;
  /** Skip into the source before playback in seconds. */
  sourceStart?: number;

  preset?: SynthPresetName;
  sound?: SynthSoundOptions;
  /** Existing PCM16 mono/stereo WAV. */
  wav?: Buffer;
  /** Alias of {@link wav}. */
  buffer?: Buffer;

  /** Linear gain. Default 1. */
  gain?: number;
  /** Alias of {@link gain}. */
  volume?: number;
  /** Procedural sources only: pitch shift in semitones without changing duration. */
  transpose?: number;
  /** Procedural sources only: detune in cents. */
  detune?: number;
  /** Procedural sources only: frequency multiplier. */
  pitch?: number;
  /** Playback-rate resampling. `2` halves duration and raises pitch by one octave; this is not pitch-preserving time stretch. */
  speed?: number;

  /** Equal-power/balance pan from -1 to +1 for stereo output. */
  pan?: number;
  fadeIn?: number;
  fadeOut?: number;

  overrides?: SynthPresetOverrides;
  /** Blend white noise over the rendered clip, 0–1. */
  noise?: number;
  /** Explicit post-filter. When present, it takes precedence over `quality`. */
  filter?: FilterOptions;
  /** Shorthand post-filter profile. */
  quality?: SynthClipQuality;
  /** Optional clip-local deterministic noise seed. Overrides a derived compose seed. */
  seed?: AudioSeed;
}

export interface SynthComposeOptions {
  clips: SynthComposeClip[];
  /** Minimum total output length; actual output still includes later clip ends. */
  duration?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  masterGain?: number;
  /** Padding after the last clip ends. */
  tail?: number;
  limiter?: boolean;
  /** High-pass the final mix in Hz. */
  postHighpassHz?: number;
  /** Soft-gate threshold, 0–1. */
  noiseGateThreshold?: number;
  /** Optional seed; clips receive independently derived deterministic streams unless they provide `seed`. */
  seed?: AudioSeed;
}

/** Argument to {@link PainterCreateAudio.mix} and internal `mixSynthSounds`. */
export type SynthMixInput =
  | Buffer
  | SynthSoundOptions
  | SynthComposeClip
  | { preset: SynthPresetName; gain?: number; overrides?: SynthPresetOverrides };

export interface SynthMixOptions {
  sampleRate?: number;
  channels?: 1 | 2;
  masterGain?: number;
  /** Optional seed used to derive independent noise streams for mixed procedural inputs. */
  seed?: AudioSeed;
}
