import type { SynthLayer, SynthLayerOverride, SynthPresetOverrides, SynthSoundOptions } from "../types";

function cloneLayer(layer: SynthLayer): SynthLayer {
  const cloned: SynthLayer = {
    ...layer,
    adsr: layer.adsr ? { ...layer.adsr } : undefined,
    vibrato: layer.vibrato ? { ...layer.vibrato } : undefined,
    tremolo: layer.tremolo ? { ...layer.tremolo } : undefined,
    filter: layer.filter ? { ...layer.filter } : undefined,
    partials: layer.partials?.map(([ratio, gain]) => [ratio, gain]),
  };
  const waveform = cloned.waveform ?? "sine";
  if (waveform === "noise" || waveform === "pink") {
    delete cloned.frequency;
    delete cloned.frequencyEnd;
    delete cloned.detune;
    delete cloned.vibrato;
    delete cloned.partials;
    delete cloned.noiseMix;
  }
  return cloned;
}

function mergeLayer(base: SynthLayer | undefined, override: SynthLayerOverride): SynthLayer {
  const merged = {
    ...(base ? cloneLayer(base) : {}),
    ...override,
    adsr: override.adsr === undefined ? base?.adsr && { ...base.adsr } : { ...base?.adsr, ...override.adsr },
    vibrato: override.vibrato === undefined ? base?.vibrato && { ...base.vibrato } : { ...base?.vibrato, ...override.vibrato },
    tremolo: override.tremolo === undefined ? base?.tremolo && { ...base.tremolo } : { ...base?.tremolo, ...override.tremolo },
    filter: override.filter === undefined ? base?.filter && { ...base.filter } : { ...base?.filter, ...override.filter },
    partials: override.partials === undefined
      ? base?.partials?.map(([ratio, gain]) => [ratio, gain] as [number, number])
      : override.partials.map(([ratio, gain]) => [ratio, gain] as [number, number]),
  } as SynthLayer;
  return cloneLayer(merged);
}

export function applyPresetOverrides(base: SynthSoundOptions, overrides?: SynthPresetOverrides): SynthSoundOptions {
  const clonedBaseLayers = base.layers.map(cloneLayer);
  if (!overrides) return { ...base, layers: clonedBaseLayers };

  const { volume, transpose, layers: layerOverrides, ...rest } = overrides;
  let layers = layerOverrides
    ? Array.from({ length: Math.max(clonedBaseLayers.length, layerOverrides.length) }, (_, index) => {
        const override = layerOverrides[index];
        const baseLayer = clonedBaseLayers[index];
        if (override === undefined) return baseLayer ? cloneLayer(baseLayer) : ({} as SynthLayer);
        return mergeLayer(baseLayer, override);
      })
    : clonedBaseLayers;

  if (volume !== undefined && volume !== 1) layers = layers.map((layer) => ({ ...layer, gain: (layer.gain ?? 0.5) * volume }));
  if (transpose !== undefined && transpose !== 0) {
    const ratio = Math.pow(2, transpose / 12);
    layers = layers.map((layer) => ({
      ...layer,
      frequency: layer.frequency !== undefined ? layer.frequency * ratio : undefined,
      frequencyEnd: layer.frequencyEnd !== undefined ? layer.frequencyEnd * ratio : undefined,
    }));
  }

  return { ...base, ...rest, layers };
}
