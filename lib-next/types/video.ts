export interface ExtractFramesOptions {
  outputDirectory?: string;
  interval: number;
  outputFormat?: "jpg" | "png";
  frameSelection?: { start?: number; end?: number };
  watermark?: string;
}

export interface ResizeOptions {
  /** Raster bytes, HTTP(S) URL through shared network policy, data:image URL, or filesystem path. */
  imagePath: string | Buffer;
  size?: { width?: number; height?: number };
  maintainAspectRatio?: boolean;
  quality?: number;
  outputFormat?: "png" | "jpeg";
}

export interface VideoProbeStream {
  index: number;
  type: "video" | "audio" | "subtitle" | "data" | "attachment" | "unknown";
  codec: string;
  codecLongName?: string;
  profile?: string;
  width?: number;
  height?: number;
  fps?: number;
  bitrate?: number;
  pixelFormat?: string;
  sampleRate?: number;
  channels?: number;
  channelLayout?: string;
  duration?: number;
}

/** Typed, normalized ffprobe metadata. Raw ffprobe JSON is intentionally not the primary public API. */
export interface VideoProbeMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  /** Backward-compatible alias of `container`. */
  format: string;
  container: string;
  containerLongName?: string;
  codec: string;
  pixelFormat?: string;
  audio: boolean;
  audioCodec?: string;
  audioStreams: number;
  streams: VideoProbeStream[];
  size?: number;
}

export type {
  VideoCreationOptions,
  VideoSource,
  VideoOutputFormat,
  VideoQuality,
  VideoFit,
  VideoAudioPolicy,
  VideoOperationControls,
  MixAudioOverlayClip,
  MixAudioOperation,
} from "../video/video-options";

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

export type { SceneToVideoResult } from "../scene/render-scene-to-video";
