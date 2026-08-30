import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";
import type { PainterCreateAudio } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertNonEmptyString } from "../runtime/validation";
import { applyPresetOverrides } from "./preset-overrides";
import { getPresetDefinition, listPresets, SYNTH_PRESET_NAMES } from "./presets";
import {
  composeSynthAudio,
  mixSynthSounds,
  synthesizePreset,
  synthesizeSequence,
  synthesizeSound,
} from "./synthesizer";
import {
  validateSynthComposeOptions,
  validateSynthMixInputs,
  validateSynthSequenceOptions,
  validateSynthSoundOptions,
} from "./audio-validation";

export function createPainterCreateAudioFacet(): PainterCreateAudio {
  return {
    presetNames: SYNTH_PRESET_NAMES,
    listPresets,
    synth(options) {
      validateSynthSoundOptions(options);
      return synthesizeSound(options);
    },
    custom(options) {
      validateSynthSoundOptions(options);
      return synthesizeSound(options);
    },
    preset(name, overrides) {
      validateSynthSoundOptions(applyPresetOverrides(getPresetDefinition(name), overrides));
      return synthesizePreset(name, overrides);
    },
    sequence(options) {
      validateSynthSequenceOptions(options);
      return synthesizeSequence(options);
    },
    compose(options) {
      validateSynthComposeOptions(options);
      return composeSynthAudio(options);
    },
    mix(inputs, options) {
      validateSynthMixInputs(inputs, options);
      return mixSynthSounds(inputs, options);
    },
    async save(wav, filePath) {
      if (!Buffer.isBuffer(wav) || wav.length === 0) {
        throw new ApexifyInputError("audio.save wav must be a non-empty Buffer.");
      }
      assertNonEmptyString(filePath, "audio.save.filePath", 32_768);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, wav);
    },
  };
}
