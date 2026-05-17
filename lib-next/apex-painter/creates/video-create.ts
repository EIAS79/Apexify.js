import type { ExtractFramesOptions } from "../../types";
import type { ExtractAllFramesOptions } from "../../video/extract-all-frames";
import type { VideoCreationOptions } from "../../video/video-stack";
import type { SceneToVideoResult } from "../../scene/render-scene-to-video";
import type { VideoPipelineLayer } from "../../types";
import { VideoStack } from "../../video/video-stack";
import { VideoPipeline } from "../../video/video-pipeline-builder";

/** Flat video API on {@link ApexPainter} — delegates into {@link VideoStack}. */
export class VideoCreate {
  constructor(private readonly stack: VideoStack) {}

  createVideo(options: VideoCreationOptions): Promise<SceneToVideoResult> {
    return this.stack.creator.createVideo(options);
  }

  /** Layer-based video pipeline — trim, splice, text, audio/synth in minimal passes. */
  videoPipeline(source?: string | Buffer, initialLayers?: VideoPipelineLayer[]): VideoPipeline {
    return this.stack.videoPipeline(source, initialLayers);
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck?: boolean) {
    return this.stack.getVideoInfo(source, skipFfmpegCheck);
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    return this.stack.extractFrames(videoSource, options);
  }

  extractAllFrames(videoSource: string | Buffer, options?: ExtractAllFramesOptions) {
    return this.stack.extractAllFrames(videoSource, options);
  }

  extractFrameAtTime(
    videoSource: string | Buffer,
    timeSeconds: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.stack.extractFrameAtTime(videoSource, timeSeconds, outputFormat, quality);
  }

  extractFrameByNumber(
    videoSource: string | Buffer,
    frameNumber: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.stack.extractFrameByNumber(videoSource, frameNumber, outputFormat, quality);
  }

  extractMultipleFrames(
    videoSource: string | Buffer,
    times: number[],
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.stack.extractMultipleFrames(videoSource, times, outputFormat, quality);
  }
}
