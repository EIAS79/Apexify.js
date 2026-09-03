export interface ExtractFramesOptions {
  outputDirectory?: string;
  interval: number;
  outputFormat?: "jpg" | "png";
  frameSelection?: {
    start?: number;
    end?: number;
  };
  watermark?: string;
}

export interface ResizeOptions {
  /**
   * Raster bytes (`Buffer`), `http(s):` URL (fetched through shared network policy),
   * `data:image/...;base64,...`, or filesystem path. Every source is metadata-
   * preflighted against the configured image limits before decode.
   */
  imagePath: string | Buffer;
  /** Target pixel dimensions. Positive integers only; omitted axes default to 500. */
  size?: {
    width?: number;
    height?: number;
  };
  /** `true` uses contain/inside semantics; `false` fills the exact requested size. */
  maintainAspectRatio?: boolean;
  /** Encoder quality, integer 1–100. */
  quality?: number;
  /** Output encoding. Defaults to PNG. */
  outputFormat?: "png" | "jpeg";
}

/** Result of `ffprobe` on a video stream (used by frame extraction and helpers). */
export interface VideoProbeMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  format: string;
}

/** Video pipeline options (`createVideo` / `ApexPainter.createVideo`). */
export type {
  VideoCreationOptions,
  MixAudioOverlayClip,
  MixAudioOperation,
} from "../video/video-creator";

export type {
  VideoTextOverlayClip,
  VideoTextOverlayOperation,
  VideoTextOverlayStyle,
  VideoTextTransition,
  VideoTextTransitionPreset,
} from "./video-text";

export type {
  VideoPipelineLayer,
  VideoPipelineSnapshot,
  VideoPipelineRenderOptions,
  VideoPipelineRenderResult,
  VideoPipelineAudioLayer,
  VideoPipelineAudioTrack,
  VideoPipelineTextLayer,
  VideoPipelineTrimLayer,
  VideoPipelineSpliceLayer,
  VideoPipelineSourceLayer,
} from "./video-pipeline";

/** Scene → encoded video result shape. */
export type { SceneToVideoResult } from "../scene/render-scene-to-video";
