export {
  synthesizeSound,
  synthesizePreset,
  synthesizeSequence,
  mixSynthSounds,
  composeSynthAudio,
  type SynthMixInput,
  type SynthMixOptions,
  type SynthComposeClip,
  type SynthComposeOptions,
} from "./synthesizer";
export { renderSound, renderSequence, composeTimeline, DEFAULT_SAMPLE_RATE } from "./engine";
export { encodeWavPcm16, decodeWavPcm16 } from "./wav-encode";
export { getPresetDefinition, listPresets, SYNTH_PRESET_NAMES } from "./presets";
export { createPainterCreateAudioFacet } from "./painter-create-audio";
