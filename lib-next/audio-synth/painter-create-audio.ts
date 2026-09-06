import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { PainterCreateAudio } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertNonEmptyString } from "../runtime/validation";
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
      if (!Buffer.isBuffer(wav) || wav.length === 0) throw new ApexifyInputError("audio.save wav must be a non-empty Buffer.");
      assertNonEmptyString(filePath, "audio.save.filePath", 32_768);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, wav);
    },
  };
}
