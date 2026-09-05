import { VideoCreator, type VideoCreationOptions } from "./video-creator";
import { VideoHelpers } from "./video-helpers";
import { VideoPipeline } from "./video-pipeline-builder";
import type { ExtractFramesOptions, VideoPipelineLayer } from "../types";
import { createFfmpegSession, type FfmpegSession, type FfmpegSessionOptions } from "./ffmpeg-session";
import { probeVideoMetadata } from "./ffprobe-metadata";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertCollection, assertEnum, assertFiniteNumber, assertSource } from "../runtime/validation";
import { validateVideoCreationOptions, validateVideoPipelineLayers } from "./video-validation";
import { VideoOperations } from "./video-operations";

/** Single entry for all video work (used as `painter.video`). */
export class VideoStack {
  readonly creator: VideoCreator;
  readonly operations: VideoOperations;
  private readonly pipelineHelpers: VideoHelpers;
  private readonly session: FfmpegSession;

  constructor(options: FfmpegSessionOptions = {}) {
    this.session = createFfmpegSession(options);
    this.operations = new VideoOperations(this.session);
    this.creator = new VideoCreator(this.operations);

    // Temporary compatibility bridge used only by the old pipeline renderer.
    // Phase 8 removes this after the pipeline is moved onto VideoOperations.
    this.pipelineHelpers = new VideoHelpers({
      checkFFmpegAvailable: () => this.session.checkAvailable(),
      getFFmpegInstallInstructions: () => this.session.getInstallInstructions(),
      getVideoInfo: (source, skip) => probeVideoMetadata(source, this.session, skip ?? false),
      extractVideoFrame: async (source, frame, time, outputFormat, quality) => {
        const result = await this.operations.frames.extractOne(source, {
          frame: time === undefined ? frame : undefined,
          time,
          outputFormat,
          quality,
        });
        return result.buffer;
      },
      createVideo: (createOptions) => this.creator.createVideo(createOptions as VideoCreationOptions),
    }, this.session);
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck = false) {
    assertSource(source, "video.getVideoInfo.source");
    return probeVideoMetadata(source, this.session, skipFfmpegCheck);
  }

  /** Declarative edit pipeline (layer stack). */
  videoPipeline(source?: string | Buffer, initialLayers?: VideoPipelineLayer[]): VideoPipeline {
    if (source !== undefined) assertSource(source, "videoPipeline.source");
    if (initialLayers !== undefined) {
      assertCollection(initialLayers, "videoPipeline.initialLayers", { limit: "maxVideoPipelineLayers" });
      const combined = source !== undefined
        ? [{ kind: "source", source } as VideoPipelineLayer, ...initialLayers.filter((layer) => layer.kind !== "source")]
        : initialLayers;
      if (combined.length > 0 && combined.some((layer) => layer.kind === "source")) validateVideoPipelineLayers(combined);
    }
    return new VideoPipeline(this.pipelineHelpers, source, initialLayers);
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    validateVideoCreationOptions({ source: videoSource, extractFrames: options });
    return this.operations.frames.extractInterval(videoSource, options);
  }

  extractAllFrames(videoSource: string | Buffer, options?: Parameters<VideoOperations["frames"]["extractAll"]>[1]) {
    validateVideoCreationOptions({ source: videoSource, extractAllFrames: options ?? {} });
    return this.operations.frames.extractAll(videoSource, options ?? {});
  }

  async extractFrameAtTime(videoSource: string | Buffer, timeSeconds: number, outputFormat: "jpg" | "png" = "jpg", quality = 2) {
    validateVideoCreationOptions({ source: videoSource, extractFrame: { time: timeSeconds, outputFormat, quality } });
    return (await this.operations.frames.extractOne(videoSource, { time: timeSeconds, outputFormat, quality })).buffer;
  }

  async extractFrameByNumber(videoSource: string | Buffer, frameNumber: number, outputFormat: "jpg" | "png" = "jpg", quality = 2) {
    assertSource(videoSource, "video.extractFrameByNumber.source");
    assertFiniteNumber(frameNumber, "video.extractFrameByNumber.frameNumber", { min: 1, integer: true });
    assertEnum(outputFormat, "video.extractFrameByNumber.outputFormat", ["jpg", "png"] as const);
    assertFiniteNumber(quality, "video.extractFrameByNumber.quality", { min: 1, max: 31, integer: true });
    const videoInfo = await this.getVideoInfo(videoSource, true);
    if (!videoInfo || videoInfo.fps <= 0) throw new ApexifyInputError("Could not get video FPS to convert frame number to time.");
    const timeSeconds = (frameNumber - 1) / videoInfo.fps;
    return (await this.operations.frames.extractOne(videoSource, { time: timeSeconds, outputFormat, quality })).buffer;
  }

  async extractMultipleFrames(videoSource: string | Buffer, times: number[], outputFormat: "jpg" | "png" = "jpg", quality = 2): Promise<Buffer[]> {
    assertSource(videoSource, "video.extractMultipleFrames.source");
    assertCollection(times, "video.extractMultipleFrames.times", { min: 1, limit: "maxVideoExtractedFrames" });
    assertEnum(outputFormat, "video.extractMultipleFrames.outputFormat", ["jpg", "png"] as const);
    assertFiniteNumber(quality, "video.extractMultipleFrames.quality", { min: 1, max: 31, integer: true });
    times.forEach((time, index) => {
      assertFiniteNumber(time, `video.extractMultipleFrames.times[${index}]`, { min: 0 });
      assertWithinLimit("maxVideoDurationSeconds", time);
    });
    return this.operations.frames.extractTimes(videoSource, times, { outputFormat, quality });
  }
}

export type { VideoCreationOptions } from "./video-creator";
export type { FfmpegSessionOptions } from "./ffmpeg-session";
