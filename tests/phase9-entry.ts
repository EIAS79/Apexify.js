export { ApexPainter } from "../lib-next/index";
export {
  synthesizeSound,
  synthesizePreset,
  synthesizeSequence,
  mixSynthSounds,
  composeSynthAudio,
  applyPresetOverrides,
} from "../lib-next/audio-synth/synthesizer";
export {
  renderSound,
  renderSequence,
  composeTimeline,
  resampleToMatch,
  adsrGainAt,
  applyLimiter,
  DEFAULT_SAMPLE_RATE,
} from "../lib-next/audio-synth/engine";
export { encodeWavPcm16, decodeWavPcm16, inspectWavPcm16 } from "../lib-next/audio-synth/wav-encode";
export { getPresetDefinition, listPresets, SYNTH_PRESET_NAMES } from "../lib-next/audio-synth/presets";
export { createAudioRandom, deriveAudioSeed } from "../lib-next/audio-synth/audio-random";
export { filterInterleavedInPlace } from "../lib-next/audio-synth/biquad-filter";
export {
  validateSynthSoundOptions,
  validateSynthSequenceOptions,
  validateSynthComposeOptions,
  validateSynthMixInputs,
} from "../lib-next/audio-synth/audio-validation";
export {
  ApexifyError,
  ApexifyInputError,
  ApexifyDecodeError,
  ApexifyResourceLimitError,
  ApexifyAudioError,
} from "../lib-next/runtime/errors";
export {
  configureApexifyRuntime,
  getDefaultApexifyRuntimeConfig,
  resetApexifyRuntimeConfig,
} from "../lib-next/runtime/config";
