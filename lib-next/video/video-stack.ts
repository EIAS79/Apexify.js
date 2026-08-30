import { VideoCreator, type VideoCreationOptions } from "./video-creator";
import { VideoHelpers } from "./video-helpers";
import { VideoPipeline } from "./video-pipeline-builder";
import type { ExtractFramesOptions, VideoPipelineLayer } from "../types";
import { createFfmpegSession, type FfmpegSession, type FfmpegSessionOptions } from "./ffmpeg-session";
import { probeVideoCodecSource, probeVideoMetadata } from "./ffprobe-metadata";
import { extractVideoFrameBuffer } from "./extract-frame";
import { extractFramesAtInterval } from "./extract-interval-frames";
import { extractAllVideoFrames } from "./extract-all-frames";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertCollection, assertEnum, assertFiniteNumber, assertSource } from "../runtime/validation";
import { validateVideoCreationOptions, validateVideoPipelineLayers } from "./video-validation";

class ValidatedVideoCreator extends VideoCreator {
  override createVideo(options: VideoCreationOptions): Promise<any> {
    // Runs before VideoCreator checks FFmpeg availability or resolves sources.
    validateVideoCreationOptions(options);
    return super.createVideo(options);
  }
}

/** Single entry for all video work (used as `painter.video`). */
export class VideoStack {
  readonly creator: VideoCreator;
  private readonly helpers: VideoHelpers;
  private readonly session: FfmpegSession;

  constructor(options: FfmpegSessionOptions = {}) {
    this.session = createFfmpegSession(options);
    this.creator = new ValidatedVideoCreator();

    const session = this.session;
    const getVideoInfo = (src: string | Buffer, skip?: boolean) => probeVideoMetadata(src, session, skip ?? false);
    const extractVideoFrame = (
      src: string | Buffer,
      frameNumber?: number,
      timeSeconds?: number,
      outputFormat?: "jpg" | "png",
      quality?: number
    ) => extractVideoFrameBuffer(session, src, frameNumber ?? 0, timeSeconds, outputFormat ?? "jpg", quality ?? 2);
    const extractFrames = (src: string | Buffer, opts: ExtractFramesOptions) => extractFramesAtInterval(src, opts, session);
    const extractAllFrames = (src: string | Buffer, opts?: Parameters<typeof extractAllVideoFrames>[1]) => extractAllVideoFrames(src, opts, session);

    this.creator.setDependencies({
      checkFFmpegAvailable: () => session.checkAvailable(),
      getFFmpegInstallInstructions: () => session.getInstallInstructions(),
      getVideoInfo,
      getVideoCodec: (source: string | Buffer) => probeVideoCodecSource(source, session),
      extractVideoFrame,
      extractFrames,
      extractAllFrames,
    });

    this.helpers = new VideoHelpers({
      checkFFmpegAvailable: () => session.checkAvailable(),
      getFFmpegInstallInstructions: () => session.getInstallInstructions(),
      getVideoInfo,
      extractVideoFrame,
      createVideo: (opts) => this.creator.createVideo(opts),
    }, session);

    const h = this.helpers;
    this.creator.setHelperMethods({
      generateVideoThumbnail: (a, b, c) => h.generateVideoThumbnail(a, b, c),
      convertVideo: (a, b) => h.convertVideo(a, b),
      trimVideo: (a, b) => h.trimVideo(a, b),
      extractAudio: (a, b) => h.extractAudio(a, b),
      addWatermarkToVideo: (a, b) => h.addWatermarkToVideo(a, b),
      changeVideoSpeed: (a, b) => h.changeVideoSpeed(a, b),
      generateVideoPreview: (a, b, c) => h.generateVideoPreview(a, b, c),
      applyVideoEffects: (a, b) => h.applyVideoEffects(a, b),
      mergeVideos: (o) => h.mergeVideos(o),
      replaceVideoSegment: (a, b) => h.replaceVideoSegment(a, b),
      rotateVideo: (a, b) => h.rotateVideo(a, b),
      cropVideo: (a, b) => h.cropVideo(a, b),
      compressVideo: (a, b) => h.compressVideo(a, b),
      addTextToVideo: (a, b) => h.addTextToVideo(a, b),
      addFadeToVideo: (a, b) => h.addFadeToVideo(a, b),
      reverseVideo: (a, b) => h.reverseVideo(a, b),
      createVideoLoop: (a, b) => h.createVideoLoop(a, b),
      batchProcessVideos: (o) => h.batchProcessVideos(o),
      detectVideoScenes: (a, b) => h.detectVideoScenes(a, b),
      stabilizeVideo: (a, b) => h.stabilizeVideo(a, b),
      colorCorrectVideo: (a, b) => h.colorCorrectVideo(a, b),
      addPictureInPicture: (a, b) => h.addPictureInPicture(a, b),
      createSplitScreen: (o) => h.createSplitScreen(o),
      createTimeLapseVideo: (a, b) => h.createTimeLapseVideo(a, b),
      muteVideo: (a, b) => h.muteVideo(a, b),
      mixVideoAudio: (a, b) => h.mixVideoAudio(a, b),
      adjustVideoVolume: (a, b) => h.adjustVideoVolume(a, b),
      createVideoFromFrames: (o) => h.createVideoFromFrames(o),
      freezeVideoFrame: (a, b, c) => h.freezeVideoFrame(a, b, c),
      exportVideoPreset: (a, b, c) => h.exportVideoPreset(a, b, c),
      normalizeVideoAudio: (a, b, c) => h.normalizeVideoAudio(a, b, c),
      applyLUTToVideo: (a, b, c) => h.applyLUTToVideo(a, b, c),
      addVideoTransition: (a, b, c) => h.addVideoTransition(a, b, c),
      addTextOverlayToVideo: (a, b, c) => h.addTextOverlayToVideo(a, b, c),
      addAnimatedTextToVideo: (a, b, c) => h.addAnimatedTextToVideo(a, b, c),
    });
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck = false) {
    assertSource(source, "video.getVideoInfo.source");
    return probeVideoMetadata(source, this.session, skipFfmpegCheck);
  }

  /** Declarative edit pipeline (layer stack). */
  videoPipeline(source?: string | Buffer, initialLayers?: VideoPipelineLayer[]): VideoPipeline {
    if (source !== undefined) assertSource(source, "videoPipeline.source");
    if (initialLayers !== undefined) {
      assertCollection(initialLayers, "videoPipeline.initialLayers", { limit: "maxCollectionItems" });
      const combined = source !== undefined
        ? [{ kind: "source", source } as VideoPipelineLayer, ...initialLayers.filter((layer) => layer.kind !== "source")]
        : initialLayers;
      if (combined.length > 0 && combined.some((layer) => layer.kind === "source")) validateVideoPipelineLayers(combined);
    }
    return new VideoPipeline(this.helpers, source, initialLayers);
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    validateVideoCreationOptions({ source: videoSource, extractFrames: options });
    return extractFramesAtInterval(videoSource, options, this.session);
  }

  extractAllFrames(videoSource: string | Buffer, options?: Parameters<typeof extractAllVideoFrames>[1]) {
    validateVideoCreationOptions({ source: videoSource, extractAllFrames: options ?? {} });
    return extractAllVideoFrames(videoSource, options, this.session);
  }

  extractFrameAtTime(videoSource: string | Buffer, timeSeconds: number, outputFormat: "jpg" | "png" = "jpg", quality = 2) {
    validateVideoCreationOptions({ source: videoSource, extractFrame: { time: timeSeconds, outputFormat, quality } });
    return extractVideoFrameBuffer(this.session, videoSource, 0, timeSeconds, outputFormat, quality);
  }

  async extractFrameByNumber(videoSource: string | Buffer, frameNumber: number, outputFormat: "jpg" | "png" = "jpg", quality = 2) {
    assertSource(videoSource, "video.extractFrameByNumber.source");
    assertFiniteNumber(frameNumber, "video.extractFrameByNumber.frameNumber", { min: 1, integer: true });
    assertEnum(outputFormat, "video.extractFrameByNumber.outputFormat", ["jpg", "png"] as const);
    assertFiniteNumber(quality, "video.extractFrameByNumber.quality", { min: 1, max: 31, integer: true });
    const videoInfo = await this.getVideoInfo(videoSource, true);
    if (!videoInfo || videoInfo.fps <= 0) throw new ApexifyInputError("Could not get video FPS to convert frame number to time.");
    const timeSeconds = (frameNumber - 1) / videoInfo.fps;
    return extractVideoFrameBuffer(this.session, videoSource, frameNumber - 1, timeSeconds, outputFormat, quality);
  }

  async extractMultipleFrames(videoSource: string | Buffer, times: number[], outputFormat: "jpg" | "png" = "jpg", quality = 2): Promise<Buffer[]> {
    assertSource(videoSource, "video.extractMultipleFrames.source");
    assertCollection(times, "video.extractMultipleFrames.times", { min: 1, limit: "maxVideoOverlays" });
    assertEnum(outputFormat, "video.extractMultipleFrames.outputFormat", ["jpg", "png"] as const);
    assertFiniteNumber(quality, "video.extractMultipleFrames.quality", { min: 1, max: 31, integer: true });
    times.forEach((time, index) => {
      assertFiniteNumber(time, `video.extractMultipleFrames.times[${index}]`, { min: 0 });
      assertWithinLimit("maxVideoDurationSeconds", time);
    });
    const frames: Buffer[] = [];
    for (const time of times) {
      const frame = await this.extractFrameAtTime(videoSource, time, outputFormat, quality);
      if (frame) frames.push(frame);
    }
    return frames;
  }
}

export type { VideoCreationOptions } from "./video-creator";
export type { FfmpegSessionOptions } from "./ffmpeg-session";
