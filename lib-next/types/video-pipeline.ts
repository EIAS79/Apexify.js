import type { SynthPresetName, SynthSequenceEvent, SynthSoundOptions } from "./audio-synth";
import type { VideoTextOverlayClip } from "./video-text";

/** Shared layer identity — same `id` replaces the previous layer instead of duplicating. */
export interface VideoPipelineLayerBase {
  /** Stable key for upsert/replace (e.g. `"main-trim"`, `"titles"`). */
  id?: string;
}

export interface VideoPipelineSourceLayer extends VideoPipelineLayerBase {
  kind: "source";
  source: string | Buffer;
}

export interface VideoPipelineTrimLayer extends VideoPipelineLayerBase {
  kind: "trim";
  startTime: number;
  endTime: number;
}

export interface VideoPipelineSpliceLayer extends VideoPipelineLayerBase {
  kind: "splice";
  targetStartTime: number;
  targetEndTime: number;
  replacementVideo?: string | Buffer;
  replacementStartTime?: number;
  replacementDuration?: number;
  replacementFrames?: Array<string | Buffer>;
  replacementFps?: number;
}

export interface VideoPipelineTextLayer extends VideoPipelineLayerBase {
  kind: "text";
  overlays: VideoTextOverlayClip[];
}

/** External audio file/URL/buffer on the timeline. */
export interface VideoPipelineAudioFileTrack {
  type: "file";
  source: string | Buffer;
  startTime: number;
  duration?: number;
  sourceStart?: number;
  volume?: number;
  speed?: number;
  pitchSemitones?: number;
}

/** Procedural preset at a point in time (rendered to WAV during compile). */
export interface VideoPipelineAudioPresetTrack {
  type: "preset";
  preset: SynthPresetName;
  startTime: number;
  gain?: number;
  volume?: number;
  transpose?: number;
}

/** Custom synth sound played at `startTime`. */
export interface VideoPipelineAudioSynthTrack {
  type: "synth";
  sound: SynthSoundOptions;
  startTime: number;
  gain?: number;
}

/** Full sequence timeline (rendered once, placed at `startTime` on the video). */
export interface VideoPipelineAudioSequenceTrack {
  type: "sequence";
  events: SynthSequenceEvent[];
  startTime: number;
  tail?: number;
  masterGain?: number;
}

/** Pre-built WAV buffer. */
export interface VideoPipelineAudioWavTrack {
  type: "wav";
  wav: Buffer;
  startTime: number;
  volume?: number;
}

export type VideoPipelineAudioTrack =
  | VideoPipelineAudioFileTrack
  | VideoPipelineAudioPresetTrack
  | VideoPipelineAudioSynthTrack
  | VideoPipelineAudioSequenceTrack
  | VideoPipelineAudioWavTrack;

export interface VideoPipelineAudioLayer extends VideoPipelineLayerBase {
  kind: "audio";
  tracks: VideoPipelineAudioTrack[];
  keepOriginalAudio?: boolean;
  originalVolume?: number;
  originalSpeed?: number;
  originalPitchSemitones?: number;
}

export type VideoPipelineLayer =
  | VideoPipelineSourceLayer
  | VideoPipelineTrimLayer
  | VideoPipelineSpliceLayer
  | VideoPipelineTextLayer
  | VideoPipelineAudioLayer;

export interface VideoPipelineSnapshot {
  layers: VideoPipelineLayer[];
}

export type VideoPipelineRenderPreset = "export" | "preview";

export interface VideoPipelineRenderOptions {
  outputPath: string;
  preset?: VideoPipelineRenderPreset;
  onProgress?: (progress: { percent: number; time: number; speed: number }) => void;
}

export interface VideoPipelineRenderResult {
  outputPath: string;
  success: boolean;
  passes: number;
}
