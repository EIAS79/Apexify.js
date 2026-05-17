import type { SynthPresetInfo, SynthPresetName, SynthSoundOptions } from "../types/audio-synth";

type PresetDef = SynthSoundOptions & { _duration?: number; _desc?: string };

const PRESETS: Record<SynthPresetName, PresetDef> = {
  laser: {
    _desc: "Short sci-fi pew",
    layers: [
      { waveform: "sawtooth", frequency: 1200, frequencyEnd: 180, duration: 0.12, gain: 0.45, adsr: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.05 } },
      { waveform: "square", frequency: 2400, frequencyEnd: 400, duration: 0.06, gain: 0.15, adsr: { attack: 0.001, sustain: 0, release: 0.03 } },
    ],
  },
  laserHeavy: {
    _desc: "Thicker laser blast",
    layers: [
      { waveform: "sawtooth", frequency: 800, frequencyEnd: 120, duration: 0.2, gain: 0.55, filter: { type: "lowpass", cutoff: 4000, q: 2 } },
      { waveform: "noise", duration: 0.08, gain: 0.12, filter: { type: "highpass", cutoff: 2000 } },
    ],
  },
  laserCharge: {
    _desc: "Rising charge then release",
    layers: [
      { waveform: "sine", frequency: 200, frequencyEnd: 900, duration: 0.35, gain: 0.35, adsr: { attack: 0.2, sustain: 0.6, release: 0.05 } },
      { waveform: "sawtooth", frequency: 1500, frequencyEnd: 250, duration: 0.1, delay: 0.32, gain: 0.5, adsr: { attack: 0.002, sustain: 0, release: 0.06 } },
    ],
  },
  explosion: {
    _desc: "Big boom with rumble",
    layers: [
      { waveform: "noise", duration: 0.45, gain: 0.7, filter: { type: "lowpass", cutoff: 800, q: 1.5 }, adsr: { attack: 0.002, decay: 0.15, sustain: 0.2, release: 0.25 } },
      { waveform: "sine", frequency: 120, frequencyEnd: 40, duration: 0.5, gain: 0.55, adsr: { attack: 0.005, decay: 0.2, sustain: 0.1, release: 0.3 } },
    ],
  },
  explosionSmall: {
    _desc: "Quick pop",
    layers: [
      { waveform: "noise", duration: 0.15, gain: 0.5, filter: { type: "lowpass", cutoff: 2000 } },
      { waveform: "sine", frequency: 200, frequencyEnd: 80, duration: 0.12, gain: 0.35 },
    ],
  },
  explosionDeep: {
    _desc: "Sub-heavy detonation",
    layers: [
      { waveform: "noise", duration: 0.6, gain: 0.65, filter: { type: "lowpass", cutoff: 400 } },
      { waveform: "sine", frequency: 80, frequencyEnd: 30, duration: 0.7, gain: 0.7, adsr: { attack: 0.01, release: 0.4 } },
    ],
  },
  hit: {
    _desc: "Impact punch",
    layers: [
      { waveform: "noise", duration: 0.08, gain: 0.55, filter: { type: "lowpass", cutoff: 3000 } },
      { waveform: "square", frequency: 180, frequencyEnd: 60, duration: 0.1, gain: 0.4 },
    ],
  },
  hitSoft: {
    _desc: "Light tap",
    layers: [
      { waveform: "sine", frequency: 400, frequencyEnd: 200, duration: 0.06, gain: 0.35, adsr: { attack: 0.001, release: 0.04 } },
    ],
  },
  hitMetal: {
    _desc: "Metallic clang",
    layers: [
      { waveform: "triangle", frequency: 880, duration: 0.15, gain: 0.35, partials: [[2, 0.4], [3, 0.2]], adsr: { attack: 0.001, decay: 0.08, sustain: 0.1, release: 0.1 } },
      { waveform: "noise", duration: 0.05, gain: 0.2, filter: { type: "highpass", cutoff: 4000 } },
    ],
  },
  coin: {
    _desc: "Classic pickup ding",
    layers: [
      { waveform: "square", frequency: 987, duration: 0.08, gain: 0.25, adsr: { attack: 0.001, sustain: 0.3, release: 0.05 } },
      { waveform: "square", frequency: 1318, duration: 0.12, delay: 0.04, gain: 0.3, adsr: { attack: 0.001, sustain: 0.2, release: 0.08 } },
    ],
  },
  powerup: {
    _desc: "Ascending power-up",
    layers: [
      { waveform: "square", frequency: 440, frequencyEnd: 880, duration: 0.2, gain: 0.3, adsr: { attack: 0.01, sustain: 0.5, release: 0.05 } },
      { waveform: "square", frequency: 660, frequencyEnd: 1320, duration: 0.2, delay: 0.1, gain: 0.28 },
      { waveform: "sine", frequency: 880, frequencyEnd: 1760, duration: 0.25, delay: 0.2, gain: 0.25 },
    ],
  },
  powerupLong: {
    _desc: "Extended level-up arpeggio",
    layers: [
      { waveform: "sawtooth", frequency: 330, duration: 0.15, gain: 0.22 },
      { waveform: "sawtooth", frequency: 440, duration: 0.15, delay: 0.12, gain: 0.22 },
      { waveform: "sawtooth", frequency: 554, duration: 0.15, delay: 0.24, gain: 0.22 },
      { waveform: "sawtooth", frequency: 660, duration: 0.25, delay: 0.36, gain: 0.28, adsr: { sustain: 0.5, release: 0.15 } },
    ],
  },
  shield: {
    _desc: "Energy shield shimmer",
    layers: [
      { waveform: "sine", frequency: 600, duration: 0.25, gain: 0.3, vibrato: { depth: 30, rate: 12 } },
      { waveform: "triangle", frequency: 900, duration: 0.25, gain: 0.2, delay: 0.05, vibrato: { depth: 40, rate: 10 } },
    ],
  },
  jump: {
    _desc: "Platformer jump",
    layers: [
      { waveform: "square", frequency: 200, frequencyEnd: 600, duration: 0.18, gain: 0.35, adsr: { attack: 0.005, sustain: 0.4, release: 0.06 } },
    ],
  },
  jumpHigh: {
    _desc: "Higher bouncy jump",
    layers: [
      { waveform: "square", frequency: 350, frequencyEnd: 900, duration: 0.2, gain: 0.38 },
      { waveform: "sine", frequency: 700, frequencyEnd: 1200, duration: 0.1, delay: 0.05, gain: 0.15 },
    ],
  },
  alarm: {
    _desc: "Alternating warning beeps",
    layers: [
      { waveform: "square", frequency: 800, duration: 0.15, gain: 0.35, adsr: { sustain: 0.6, release: 0.05 } },
      { waveform: "square", frequency: 600, duration: 0.15, delay: 0.2, gain: 0.35 },
      { waveform: "square", frequency: 800, duration: 0.15, delay: 0.4, gain: 0.35 },
    ],
  },
  alarmUrgent: {
    _desc: "Fast urgent alarm",
    layers: [
      { waveform: "square", frequency: 1000, duration: 0.08, gain: 0.4 },
      { waveform: "square", frequency: 750, duration: 0.08, delay: 0.1, gain: 0.4 },
      { waveform: "square", frequency: 1000, duration: 0.08, delay: 0.2, gain: 0.4 },
      { waveform: "square", frequency: 750, duration: 0.08, delay: 0.3, gain: 0.4 },
    ],
  },
  beep: {
    _desc: "Simple UI beep",
    layers: [{ waveform: "sine", frequency: 880, duration: 0.1, gain: 0.35 }],
  },
  beepHigh: {
    _desc: "High confirmation beep",
    layers: [{ waveform: "sine", frequency: 1760, duration: 0.08, gain: 0.3 }],
  },
  click: {
    _desc: "Sharp UI click",
    layers: [
      { waveform: "noise", duration: 0.02, gain: 0.4, filter: { type: "highpass", cutoff: 3000 } },
      { waveform: "square", frequency: 1200, frequencyEnd: 800, duration: 0.03, gain: 0.2 },
    ],
  },
  clickSoft: {
    _desc: "Soft muted click",
    layers: [{ waveform: "sine", frequency: 600, frequencyEnd: 400, duration: 0.04, gain: 0.25, filter: { type: "lowpass", cutoff: 2000 } }],
  },
  whoosh: {
    _desc: "Sweep whoosh",
    layers: [
      { waveform: "pink", duration: 0.25, gain: 0.45, filter: { type: "lowpass", cutoff: 400, q: 2 }, adsr: { attack: 0.05, release: 0.15 } },
      { waveform: "pink", duration: 0.25, gain: 0.35, filter: { type: "lowpass", cutoff: 8000, q: 2 }, frequencyEnd: 200, adsr: { attack: 0.02, release: 0.2 } },
    ],
  },
  whooshIn: {
    _desc: "Reverse whoosh (in)",
    layers: [
      { waveform: "pink", duration: 0.3, gain: 0.4, filter: { type: "lowpass", cutoff: 200, q: 1 }, adsr: { attack: 0.15, release: 0.05 } },
    ],
  },
  engine: {
    _desc: "Low engine drone",
    layers: [
      { waveform: "sawtooth", frequency: 65, duration: 0.8, gain: 0.35, filter: { type: "lowpass", cutoff: 300 }, tremolo: { depth: 0.15, rate: 8 } },
      { waveform: "square", frequency: 130, duration: 0.8, gain: 0.15, filter: { type: "lowpass", cutoff: 500 } },
    ],
  },
  engineIdle: {
    _desc: "Idle engine rumble",
    layers: [
      { waveform: "sawtooth", frequency: 55, duration: 1, gain: 0.3, filter: { type: "lowpass", cutoff: 200 }, tremolo: { depth: 0.08, rate: 4 } },
    ],
  },
  siren: {
    _desc: "Police-style siren",
    layers: [
      { waveform: "sine", frequency: 600, frequencyEnd: 1200, duration: 0.5, gain: 0.4 },
      { waveform: "sine", frequency: 1200, frequencyEnd: 600, duration: 0.5, delay: 0.5, gain: 0.4 },
    ],
  },
  gameOver: {
    _desc: "Descending game over",
    layers: [
      { waveform: "square", frequency: 440, frequencyEnd: 220, duration: 0.3, gain: 0.35 },
      { waveform: "square", frequency: 330, frequencyEnd: 165, duration: 0.35, delay: 0.25, gain: 0.32 },
      { waveform: "square", frequency: 220, frequencyEnd: 110, duration: 0.5, delay: 0.5, gain: 0.3 },
    ],
  },
  gameOverSoft: {
    _desc: "Gentle fail tone",
    layers: [{ waveform: "sine", frequency: 392, frequencyEnd: 262, duration: 0.6, gain: 0.35, adsr: { attack: 0.02, release: 0.3 } }],
  },
  blip: {
    _desc: "Retro blip",
    layers: [{ waveform: "square", frequency: 523, duration: 0.05, gain: 0.3 }],
  },
  charge: {
    _desc: "Charging loop feel",
    layers: [
      { waveform: "sawtooth", frequency: 150, frequencyEnd: 400, duration: 0.5, gain: 0.3, tremolo: { depth: 0.2, rate: 16 } },
    ],
  },
  failure: {
    _desc: "Error / fail buzz",
    layers: [
      { waveform: "square", frequency: 150, duration: 0.25, gain: 0.4 },
      { waveform: "square", frequency: 140, duration: 0.25, delay: 0.12, gain: 0.35 },
    ],
  },
  success: {
    _desc: "Victory fanfare snippet",
    layers: [
      { waveform: "sine", frequency: 523, duration: 0.15, gain: 0.3 },
      { waveform: "sine", frequency: 659, duration: 0.15, delay: 0.12, gain: 0.3 },
      { waveform: "sine", frequency: 784, duration: 0.25, delay: 0.24, gain: 0.35, adsr: { sustain: 0.6, release: 0.15 } },
    ],
  },
  menuSelect: {
    _desc: "Menu cursor move",
    layers: [{ waveform: "sine", frequency: 440, duration: 0.06, gain: 0.28 }],
  },
  menuBack: {
    _desc: "Menu back / cancel",
    layers: [{ waveform: "sine", frequency: 330, frequencyEnd: 220, duration: 0.1, gain: 0.28 }],
  },
  footstep: {
    _desc: "Soft footstep thud",
    layers: [
      { waveform: "noise", duration: 0.04, gain: 0.35, filter: { type: "lowpass", cutoff: 400 } },
      { waveform: "sine", frequency: 100, frequencyEnd: 60, duration: 0.05, gain: 0.25 },
    ],
  },
  slash: {
    _desc: "Sword slash swipe",
    layers: [
      { waveform: "pink", duration: 0.12, gain: 0.4, filter: { type: "highpass", cutoff: 1500 }, adsr: { attack: 0.001, release: 0.08 } },
      { waveform: "sawtooth", frequency: 800, frequencyEnd: 200, duration: 0.1, gain: 0.25 },
    ],
  },
  rumble: {
    _desc: "Low rumble shake",
    layers: [
      { waveform: "noise", duration: 0.35, gain: 0.5, filter: { type: "lowpass", cutoff: 120 } },
      { waveform: "sine", frequency: 45, duration: 0.35, gain: 0.4, tremolo: { depth: 0.3, rate: 12 } },
    ],
  },
  sparkle: {
    _desc: "Magic sparkle twinkle",
    layers: [
      { waveform: "sine", frequency: 2000, duration: 0.08, gain: 0.2 },
      { waveform: "sine", frequency: 2600, duration: 0.08, delay: 0.04, gain: 0.18 },
      { waveform: "sine", frequency: 3200, duration: 0.1, delay: 0.08, gain: 0.15 },
    ],
  },
  thunder: {
    _desc: "Distant thunder crack",
    layers: [
      { waveform: "noise", duration: 0.8, gain: 0.55, filter: { type: "lowpass", cutoff: 600 }, adsr: { attack: 0.1, sustain: 0.3, release: 0.4 } },
      { waveform: "noise", duration: 0.15, gain: 0.35, delay: 0.05, filter: { type: "highpass", cutoff: 800 } },
    ],
  },
};

function estimateDuration(def: SynthSoundOptions): number {
  let max = 0;
  for (const layer of def.layers) {
    const end = (layer.delay ?? 0) + layer.duration;
    if (end > max) max = end;
  }
  return max;
}

export function getPresetDefinition(name: SynthPresetName): SynthSoundOptions {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown synth preset: ${name}`);
  const { _desc, _duration, ...opts } = p;
  return opts;
}

export function listPresets(): SynthPresetInfo[] {
  return (Object.keys(PRESETS) as SynthPresetName[]).map((name) => {
    const def = getPresetDefinition(name);
    const meta = PRESETS[name];
    return {
      name,
      description: meta._desc ?? name,
      defaultDuration: estimateDuration(def),
    };
  });
}

export const SYNTH_PRESET_NAMES = Object.keys(PRESETS) as SynthPresetName[];
