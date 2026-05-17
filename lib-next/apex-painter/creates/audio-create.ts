import type { PainterCreateAudio } from "../../types";
import { createPainterCreateAudioFacet } from "../../audio-synth/painter-create-audio";

/**
 * Procedural SFX on {@link ApexPainter} — thin facade over `lib-next/audio-synth`
 * (same role as {@link VideoCreate} for video / {@link GifCreate} for GIF).
 */
export class AudioCreate implements PainterCreateAudio {
  readonly presetNames: PainterCreateAudio["presetNames"];
  readonly listPresets: PainterCreateAudio["listPresets"];
  readonly synth: PainterCreateAudio["synth"];
  readonly custom: PainterCreateAudio["custom"];
  readonly preset: PainterCreateAudio["preset"];
  readonly sequence: PainterCreateAudio["sequence"];
  readonly compose: PainterCreateAudio["compose"];
  readonly mix: PainterCreateAudio["mix"];
  readonly save: PainterCreateAudio["save"];

  constructor() {
    const facet = createPainterCreateAudioFacet();
    this.presetNames = facet.presetNames;
    this.listPresets = facet.listPresets.bind(facet);
    this.synth = facet.synth.bind(facet);
    this.custom = facet.custom.bind(facet);
    this.preset = facet.preset.bind(facet);
    this.sequence = facet.sequence.bind(facet);
    this.compose = facet.compose.bind(facet);
    this.mix = facet.mix.bind(facet);
    this.save = facet.save.bind(facet);
  }
}
