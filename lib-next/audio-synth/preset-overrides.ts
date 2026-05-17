import type { SynthPresetOverrides, SynthSoundOptions } from "../types/audio-synth";

export function applyPresetOverrides(
  base: SynthSoundOptions,
  overrides?: SynthPresetOverrides
): SynthSoundOptions {
  if (!overrides) return base;
  const { volume, transpose, ...rest } = overrides;
  const baseLayers = base.layers ?? [];
  let layers = rest.layers ?? baseLayers.map((l) => ({ ...l }));

  if (volume != null && volume !== 1) {
    layers = layers.map((l) => ({ ...l, gain: (l.gain ?? 0.5) * volume }));
  }
  if (transpose != null && transpose !== 0) {
    const ratio = Math.pow(2, transpose / 12);
    layers = layers.map((l) => ({
      ...l,
      frequency: l.frequency != null ? l.frequency * ratio : l.frequency,
      frequencyEnd: l.frequencyEnd != null ? l.frequencyEnd * ratio : l.frequencyEnd,
    }));
  }

  return { ...base, ...rest, layers };
}
