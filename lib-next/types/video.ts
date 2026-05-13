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
  imagePath: string;
  size?: {
    width?: number;
    height?: number;
  };
  maintainAspectRatio?: boolean;
  quality?: number;
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

/** Scene → encoded video result shape. */
export type { SceneToVideoResult } from "../scene/render-scene-to-video";
