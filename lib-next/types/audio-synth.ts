/**
 * Procedural audio synthesis — oscillators, noise, envelopes, presets, sequencing.
 */

export type Waveform = "sine" | "square" | "sawtooth" | "triangle" | "noise" | "pink";

export type FilterType = "lowpass" | "highpass";

/** ADSR envelope (seconds + sustain level 0–1). */
export interface AdsrEnvelope {
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
}

export interface VibratoOptions {
  /** Depth in Hz. */
  depth: number;
  /** LFO rate in Hz. */
  rate: number;
}

export interface TremoloOptions {
  /** Depth 0–1 (amplitude modulation). */
  depth: number;
  rate: number;
}

export interface FilterOptions {
  type: FilterType;
  /** Cutoff Hz. */
  cutoff: number;
  /** Resonance/Q-ish emphasis 0.5–8. */
  q?: number;
}

/** One tone/noise layer in a custom sound. */
export interface SynthLayer {
  waveform?: Waveform;
  /** Start frequency (Hz). */
  frequency?: number;
  /** Linear sweep to this Hz by end of layer (optional). */
  frequencyEnd?: number;
  /** Layer length in seconds. */
  duration: number;
  /** Delay before this layer starts (seconds, relative to sound start). */
  delay?: number;
  /** Layer gain 0–1. */
  gain?: number;
  /** Detune in cents. */
  detune?: number;
  adsr?: AdsrEnvelope;
  vibrato?: VibratoOptions;
  tremolo?: TremoloOptions;
  filter?: FilterOptions;
  /** Blend white noise into tonal waveforms 0–1. */
  noiseMix?: number;
  /** Optional harmonic partials as `[frequencyRatio, gain][]` (e.g. `[2, 0.35]` = 2nd harmonic). */
  partials?: Array<[number, number]>;
  /** Pan -1 (left) to 1 (right); only used when `channels` is 2. */
  pan?: number;
}

/** Full custom sound definition. */
export interface SynthSoundOptions {
  layers: SynthLayer[];
  sampleRate?: number;
  channels?: 1 | 2;
  /** Master gain 0–1 (can exceed 1 slightly before limiter). */
  masterGain?: number;
  /** Total duration; auto-computed from layers when omitted. */
  duration?: number;
  /** Soft-clip / limit peaks (default true). */
  limiter?: boolean;
}

/** Overrides when calling {@link SynthPresetName} presets (`volume`, `transpose`, etc.). */
export interface SynthPresetOverrides extends Partial<SynthSoundOptions> {
  /** Multiply all layer gains. */
  volume?: number;
  /** Shift tonal layers by semitones. */
  transpose?: number;
}

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
  /** Start time on the master timeline (seconds). */
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
  /** Padding after last event (seconds). */
  tail?: number;
}

export interface SynthPresetInfo {
  name: SynthPresetName;
  description: string;
  defaultDuration: number;
}

/** Tone shaping applied to a composed clip after synthesis. */
export type SynthClipQuality = "bright" | "warm" | "muffled" | "lofi" | "crisp";

/**
 * One sound placed on a timeline inside a single output WAV ({@link SynthComposeOptions}).
 * Multiple clips may overlap (same or different time ranges) with independent pitch, volume, and tone.
 */
export interface SynthComposeClip {
  /** Start time on the master timeline (seconds). Default `0`. */
  at?: number;
  /** Max length on the timeline (seconds); trims the tail. */
  duration?: number;
  /** Skip into the clip before playback (seconds). */
  sourceStart?: number;

  preset?: SynthPresetName;
  /** Custom multi-layer definition (alias: treated as full sound). */
  sound?: SynthSoundOptions;
  /** Existing WAV buffer from {@link synth} / {@link preset} / files. */
  wav?: Buffer;
  /** Alias of {@link wav}. */
  buffer?: Buffer;

  /** Linear gain (default `1`). */
  gain?: number;
  /** Alias of {@link gain}. */
  volume?: number;
  /** Pitch shift in semitones (tonal layers). */
  transpose?: number;
  /** Detune in cents (added to semitone shift). */
  detune?: number;
  /** Extra pitch multiplier (e.g. `1.5` = perfect fifth up). */
  pitch?: number;
  /** Playback speed (`1` = normal; `2` = twice as fast, higher pitch). */
  speed?: number;

  pan?: number;
  fadeIn?: number;
  fadeOut?: number;

  overrides?: SynthPresetOverrides;
  /** Blend white noise over the rendered clip (0–1). */
  noise?: number;
  /** Post-filter on the whole clip. */
  filter?: FilterOptions;
  /** Shorthand tone; merged with {@link filter} when both set. */
  quality?: SynthClipQuality;
}

export interface SynthComposeOptions {
  clips: SynthComposeClip[];
  /** Total output length (seconds); auto from clip ends when omitted. */
  duration?: number;
  sampleRate?: number;
  channels?: 1 | 2;
  masterGain?: number;
  /** Padding after the last clip ends (seconds). */
  tail?: number;
  limiter?: boolean;
  /**
   * High-pass the final mix (Hz). Removes DC/rumble from stacked square waves and explosions.
   * Recommended ~180–280 for dense game SFX beds.
   */
  postHighpassHz?: number;
  /**
   * Silence samples whose abs level is below this (0–1) after the mix. Reduces “speaker hiss”
   * from hundreds of quiet overlaps in quiet sections.
   */
  noiseGateThreshold?: number;
}
