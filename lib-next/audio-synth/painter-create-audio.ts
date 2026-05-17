import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { PainterCreateAudio } from "../apex-painter/public-types";
import { listPresets, SYNTH_PRESET_NAMES } from "./presets";
import {
  composeSynthAudio,
  mixSynthSounds,
  synthesizePreset,
  synthesizeSequence,
  synthesizeSound,
} from "./synthesizer";

export function createPainterCreateAudioFacet(): PainterCreateAudio {
  return {
    presetNames: SYNTH_PRESET_NAMES,
    listPresets,
    synth: synthesizeSound,
    custom: synthesizeSound,
    preset: synthesizePreset,
    sequence: synthesizeSequence,
    compose: composeSynthAudio,
    mix: mixSynthSounds,
    async save(wav, filePath) {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, wav);
    },
  };
}
