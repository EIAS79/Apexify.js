import type { VideoTextOverlayOperation } from "../types/video-text";
import type { FfmpegProgress } from "./process-runner";

export type VideoSource = string | Buffer;
export type VideoOutputFormat = "mp4" | "webm" | "avi" | "mov" | "mkv";
export type VideoQuality = "low" | "medium" | "high" | "ultra";
export type VideoFit = "contain" | "cover" | "stretch";
export type VideoAudioPolicy = "preserve" | "first" | "mix" | "none";

export interface VideoOperationControls {
  /** Abort remote resolution and the active FFmpeg/ffprobe process. */
  signal?: AbortSignal;
  /** Per-operation process timeout. Defaults to runtime FFmpeg policy. */
  timeoutMs?: number;
  /** Existing output policy. Defaults to true for backward compatibility. */
  overwrite?: boolean;
  onProgress?: (progress: FfmpegProgress) => void;
}

export interface MixAudioOverlayClip {
  source: VideoSource;
  startTime: number;
  duration?: number;
  sourceStart?: number;
  volume?: number;
  speed?: number;
  pitchSemitones?: number;
  /** Stereo pan from -1 (left) to +1 (right). */
  pan?: number;
  fadeIn?: number;
  fadeOut?: number;
}

export interface MixAudioOperation {
  outputPath: string;
  overlays: MixAudioOverlayClip[];
  keepOriginalAudio?: boolean;
  originalVolume?: number;
  originalSpeed?: number;
  originalPitchSemitones?: number;
  /** Output length policy. `video` is the stable default. */
  durationPolicy?: "video" | "shortest" | "longest";
}

export interface VideoCreationOptions extends VideoOperationControls {
  source: VideoSource;
  getInfo?: boolean;
  extractFrame?: {
    time?: number;
    frame?: number;
    width?: number;
    height?: number;
    outputFormat?: "jpg" | "png";
    quality?: number;
  };
  extractFrames?: {
    times?: number[];
    interval?: number;
    frameSelection?: { start?: number; end?: number };
    outputFormat?: "jpg" | "png";
    quality?: number;
    outputDirectory?: string;
  };
  extractAllFrames?: {
    outputFormat?: "jpg" | "png";
    outputDirectory?: string;
    quality?: number;
    prefix?: string;
    startTime?: number;
    endTime?: number;
  };
  generateThumbnail?: {
    count?: number;
    grid?: { cols: number; rows: number };
    width?: number;
    height?: number;
    outputFormat?: "jpg" | "png";
    quality?: number;
  };
  convert?: {
    outputPath: string;
    format?: VideoOutputFormat;
    videoCodec?: "libx264" | "libx265" | "libvpx-vp9" | "libaom-av1" | "copy";
    audioCodec?: "aac" | "libopus" | "libvorbis" | "mp3" | "copy" | "none";
    pixelFormat?: "yuv420p" | "yuv422p" | "yuv444p" | "rgba";
    quality?: VideoQuality;
    bitrate?: number;
    fps?: number;
    resolution?: { width?: number; height?: number; fit?: VideoFit };
  };
  /** Accurate mode re-encodes for timestamp precision; copy mode is keyframe-bound. */
  trim?: { startTime: number; endTime: number; outputPath: string; mode?: "accurate" | "copy" };
  extractAudio?: { outputPath: string; format?: "mp3" | "wav" | "aac" | "ogg"; bitrate?: number };
  addWatermark?: {
    watermarkPath: VideoSource;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    opacity?: number;
    size?: { width?: number; height?: number; fit?: VideoFit };
    marginX?: number;
    marginY?: number;
    startTime?: number;
    endTime?: number;
    outputPath: string;
  };
  changeSpeed?: { speed: number; outputPath: string };
  generatePreview?: { count?: number; outputDirectory?: string; outputFormat?: "jpg" | "png"; quality?: number };
  applyEffects?: {
    filters: Array<{
      type: "blur" | "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "invert" | "sharpen" | "noise";
      intensity?: number;
      value?: number;
    }>;
    outputPath: string;
  };
  merge?: {
    videos: VideoSource[];
    outputPath: string;
    mode?: "sequential" | "side-by-side" | "grid";
    direction?: "horizontal" | "vertical";
    grid?: { cols?: number; rows?: number; cellWidth?: number; cellHeight?: number; gap?: number; background?: string };
    audioPolicy?: VideoAudioPolicy;
  };
  replaceSegment?: {
    replacementVideo?: VideoSource;
    replacementStartTime?: number;
    replacementDuration?: number;
    replacementFrames?: VideoSource[];
    replacementFps?: number;
    targetStartTime: number;
    targetEndTime: number;
    /** fit scales replacement time to the target span; trim truncates/pads; preserve changes total duration. */
    durationPolicy?: "fit" | "trim" | "preserve";
    outputPath: string;
  };
  rotate?: { angle?: 90 | 180 | 270; flip?: "horizontal" | "vertical" | "both"; outputPath: string };
  crop?: { x: number; y: number; width: number; height: number; outputPath: string };
  compress?: { outputPath: string; quality?: VideoQuality; /** Target output size in MiB (best-effort bitrate budget). */ targetSize?: number; maxBitrate?: number };
  /** @deprecated Prefer addTextOverlay. */
  addText?: {
    text: string;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "top-center" | "bottom-center";
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    startTime?: number;
    endTime?: number;
    outputPath: string;
  };
  addFade?: { fadeIn?: number; fadeOut?: number; outputPath: string };
  reverse?: { outputPath: string };
  createLoop?: { outputPath: string; smooth?: boolean };
  /** @experimental Batch orchestration; each entry still uses the validated single-operation API. */
  batch?: { videos: Array<{ source: VideoSource; operations: Record<string, unknown> }>; outputDirectory: string };
  detectScenes?: { threshold?: number; outputPath?: string };
  /** @experimental Requires FFmpeg vidstab filters; unsupported builds return a structured process error. */
  stabilize?: { outputPath: string; smoothing?: number };
  colorCorrect?: { brightness?: number; contrast?: number; saturation?: number; hue?: number; temperature?: number; outputPath: string };
  pictureInPicture?: {
    overlayVideo: VideoSource;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    size?: { width?: number; height?: number; fit?: VideoFit };
    opacity?: number;
    outputPath: string;
  };
  splitScreen?: {
    videos: VideoSource[];
    layout?: "side-by-side" | "top-bottom" | "grid";
    grid?: { cols?: number; rows?: number; cellWidth?: number; cellHeight?: number; gap?: number; background?: string };
    audioPolicy?: VideoAudioPolicy;
    outputPath: string;
  };
  createTimeLapse?: { speed?: number; outputPath: string };
  removeAudio?: { outputPath: string };
  mixAudio?: MixAudioOperation;
  mute?: { outputPath: string; ranges?: Array<{ start: number; end: number }> };
  adjustVolume?: {
    outputPath: string;
    volume?: number;
    ranges?: Array<{ start: number; end: number; volume: number; /** @deprecated Use videoPipeline audio tracks. */ speed?: number; /** @deprecated Use videoPipeline audio tracks. */ pitchSemitones?: number }>;
  };
  createFromFrames?: {
    frames: VideoSource[];
    outputPath: string;
    fps?: number;
    format?: VideoOutputFormat;
    quality?: VideoQuality;
    bitrate?: number;
    resolution?: { width?: number; height?: number; fit?: VideoFit };
  };
  detectFormat?: boolean;
  freezeFrame?: { time: number; duration: number; outputPath: string };
  exportPreset?: {
    preset: "youtube" | "instagram" | "tiktok" | "twitter" | "facebook" | "4k" | "1080p" | "720p" | "mobile" | "web";
    outputPath: string;
  };
  normalizeAudio?: { targetLevel?: number; method?: "peak" | "rms" | "lufs"; outputPath: string };
  /** @experimental Requires FFmpeg lut3d support. */
  applyLUT?: { lutPath: string; intensity?: number; outputPath: string };
  addTransition?: {
    type: "fade" | "wipe" | "slide" | "zoom" | "rotate" | "dissolve" | "blur" | "circle" | "pixelize";
    duration: number;
    direction?: "left" | "right" | "up" | "down" | "in" | "out";
    secondVideo?: VideoSource;
    outputPath: string;
  };
  addTextOverlay?: VideoTextOverlayOperation;
  /** @deprecated Prefer addTextOverlay. */
  addAnimatedText?: {
    text: string;
    animation?: "fadeIn" | "fadeOut" | "slideIn" | "slideOut" | "typewriter" | "bounce" | "zoom" | "rotate";
    startTime: number;
    endTime: number;
    position?: { x: number; y: number } | "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "top-center" | "bottom-center";
    fontSize?: number;
    fontColor?: string;
    fontPath?: string;
    fontName?: string;
    fontFamily?: string;
    backgroundColor?: string;
    outputPath: string;
  };
}
