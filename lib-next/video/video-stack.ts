import { VideoCreator } from "./video-creator";
import { VideoHelpers } from "./video-helpers";
import type { ExtractFramesOptions } from "../types/video";
import { createFfmpegSession, type FfmpegSession } from "./ffmpeg-session";
import { probeVideoMetadata } from "./ffprobe-metadata";
import { extractVideoFrameBuffer } from "./extract-frame";
import { extractFramesAtInterval } from "./extract-interval-frames";
import { extractAllVideoFrames } from "./extract-all-frames";

/**
 * Single entry for all video work (used as `painter.video`).
 *
 * - **`creator`** — {@link VideoCreator.createVideo} and every `VideoCreationOptions` branch (convert, trim, merge, …).
 * - **Helpers on this object** — low-level probes/extracts wired for `VideoCreator`: `getVideoInfo`, `extractFrames`,
 *   `extractAllFrames`, `extractFrameAtTime`, `extractFrameByNumber`, `extractMultipleFrames`.
 */
export class VideoStack {
  readonly creator: VideoCreator;
  private readonly helpers: VideoHelpers;
  private readonly session: FfmpegSession;

  constructor() {
    this.session = createFfmpegSession();
    this.creator = new VideoCreator();

    const session = this.session;
    const getVideoInfo = (src: string | Buffer, skip?: boolean) => probeVideoMetadata(src, session, skip ?? false);
    const extractVideoFrame = (
      src: string | Buffer,
      frameNumber?: number,
      timeSeconds?: number,
      outputFormat?: "jpg" | "png",
      quality?: number
    ) =>
      extractVideoFrameBuffer(session, src, frameNumber ?? 0, timeSeconds, outputFormat ?? "jpg", quality ?? 2);

    const extractFrames = (src: string | Buffer, opts: ExtractFramesOptions) =>
      extractFramesAtInterval(src, opts, session);

    const extractAllFrames = (src: string | Buffer, opts?: Parameters<typeof extractAllVideoFrames>[1]) =>
      extractAllVideoFrames(src, opts, session);

    this.creator.setDependencies({
      checkFFmpegAvailable: () => session.checkAvailable(),
      getFFmpegInstallInstructions: () => session.getInstallInstructions(),
      getVideoInfo,
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
    });

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
      addAnimatedTextToVideo: (a, b, c) => h.addAnimatedTextToVideo(a, b, c),
    });
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck: boolean = false) {
    return probeVideoMetadata(source, this.session, skipFfmpegCheck);
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    return extractFramesAtInterval(videoSource, options, this.session);
  }

  extractAllFrames(
    videoSource: string | Buffer,
    options?: Parameters<typeof extractAllVideoFrames>[1]
  ) {
    return extractAllVideoFrames(videoSource, options, this.session);
  }

  extractFrameAtTime(
    videoSource: string | Buffer,
    timeSeconds: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return extractVideoFrameBuffer(this.session, videoSource, 0, timeSeconds, outputFormat, quality);
  }

  async extractFrameByNumber(
    videoSource: string | Buffer,
    frameNumber: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    const videoInfo = await this.getVideoInfo(videoSource, true);
    if (!videoInfo || videoInfo.fps <= 0) {
      throw new Error("Could not get video FPS to convert frame number to time");
    }
    const timeSeconds = (frameNumber - 1) / videoInfo.fps;
    return extractVideoFrameBuffer(
      this.session,
      videoSource,
      frameNumber - 1,
      timeSeconds,
      outputFormat,
      quality
    );
  }

  async extractMultipleFrames(
    videoSource: string | Buffer,
    times: number[],
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ): Promise<Buffer[]> {
    const frames: Buffer[] = [];
    for (const time of times) {
      const frame = await this.extractFrameAtTime(videoSource, time, outputFormat, quality);
      if (frame) frames.push(frame);
    }
    return frames;
  }
}

export type { VideoCreationOptions } from "./video-creator";
