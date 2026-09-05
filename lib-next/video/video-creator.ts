import { createCanvas, loadImage } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import type { VideoCreationOptions } from "./video-options";

export type {
  MixAudioOperation,
  MixAudioOverlayClip,
  VideoCreationOptions,
} from "./video-options";

type Helper3 = (a: any, b: any, c?: any) => Promise<any>;

/** Routes public video operations to the secured video implementation. */
export class VideoCreator {
  private checkFFmpegAvailable?: () => Promise<boolean>;
  private getFFmpegInstallInstructions?: () => string;
  private getVideoInfo?: (videoSource: string | Buffer, skipFFmpegCheck?: boolean) => Promise<any>;
  private getVideoCodec?: (videoSource: string | Buffer) => Promise<string>;
  private extractVideoFrame?: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: "jpg" | "png",
    quality?: number
  ) => Promise<Buffer | null>;
  private extractFrames?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private extractAllFrames?: (videoSource: string | Buffer, options?: any) => Promise<any>;

  private generateVideoThumbnail?: Helper3;
  private convertVideo?: Helper3;
  private trimVideo?: Helper3;
  private extractAudio?: Helper3;
  private addWatermarkToVideo?: Helper3;
  private changeVideoSpeed?: Helper3;
  private generateVideoPreview?: Helper3;
  private applyVideoEffects?: Helper3;
  private mergeVideos?: (options: any) => Promise<any>;
  private replaceVideoSegment?: Helper3;
  private rotateVideo?: Helper3;
  private cropVideo?: Helper3;
  private compressVideo?: Helper3;
  private addTextToVideo?: Helper3;
  private addFadeToVideo?: Helper3;
  private reverseVideo?: Helper3;
  private createVideoLoop?: Helper3;
  private batchProcessVideos?: (options: any) => Promise<any>;
  private detectVideoScenes?: Helper3;
  private stabilizeVideo?: Helper3;
  private colorCorrectVideo?: Helper3;
  private addPictureInPicture?: Helper3;
  private createSplitScreen?: (options: any) => Promise<any>;
  private createTimeLapseVideo?: Helper3;
  private muteVideo?: Helper3;
  private mixVideoAudio?: Helper3;
  private adjustVideoVolume?: Helper3;
  private createVideoFromFrames?: (options: any) => Promise<any>;
  private freezeVideoFrame?: Helper3;
  private exportVideoPreset?: Helper3;
  private normalizeVideoAudio?: Helper3;
  private applyLUTToVideo?: Helper3;
  private addVideoTransition?: Helper3;
  private addTextOverlayToVideo?: Helper3;
  private addAnimatedTextToVideo?: Helper3;

  setDependencies(deps: {
    checkFFmpegAvailable: () => Promise<boolean>;
    getFFmpegInstallInstructions: () => string;
    getVideoInfo: (videoSource: string | Buffer, skipFFmpegCheck?: boolean) => Promise<any>;
    getVideoCodec: (videoSource: string | Buffer) => Promise<string>;
    extractVideoFrame: (
      videoSource: string | Buffer,
      frameNumber?: number,
      timeSeconds?: number,
      outputFormat?: "jpg" | "png",
      quality?: number
    ) => Promise<Buffer | null>;
    extractFrames?: (videoSource: string | Buffer, options: any) => Promise<any>;
    extractAllFrames?: (videoSource: string | Buffer, options?: any) => Promise<any>;
  }): void {
    Object.assign(this, deps);
  }

  setHelperMethods(helpers: {
    generateVideoThumbnail?: Helper3;
    convertVideo?: Helper3;
    trimVideo?: Helper3;
    extractAudio?: Helper3;
    addWatermarkToVideo?: Helper3;
    changeVideoSpeed?: Helper3;
    generateVideoPreview?: Helper3;
    applyVideoEffects?: Helper3;
    mergeVideos?: (options: any) => Promise<any>;
    replaceVideoSegment?: Helper3;
    rotateVideo?: Helper3;
    cropVideo?: Helper3;
    compressVideo?: Helper3;
    addTextToVideo?: Helper3;
    addFadeToVideo?: Helper3;
    reverseVideo?: Helper3;
    createVideoLoop?: Helper3;
    batchProcessVideos?: (options: any) => Promise<any>;
    detectVideoScenes?: Helper3;
    stabilizeVideo?: Helper3;
    colorCorrectVideo?: Helper3;
    addPictureInPicture?: Helper3;
    createSplitScreen?: (options: any) => Promise<any>;
    createTimeLapseVideo?: Helper3;
    muteVideo?: Helper3;
    mixVideoAudio?: Helper3;
    adjustVideoVolume?: Helper3;
    createVideoFromFrames?: (options: any) => Promise<any>;
    freezeVideoFrame?: Helper3;
    exportVideoPreset?: Helper3;
    normalizeVideoAudio?: Helper3;
    applyLUTToVideo?: Helper3;
    addVideoTransition?: Helper3;
    addTextOverlayToVideo?: Helper3;
    addAnimatedTextToVideo?: Helper3;
  }): void {
    Object.assign(this, helpers);
  }

  private require<T>(value: T | undefined, name: string): T {
    if (!value) throw new Error(`${name} dependency not set.`);
    return value;
  }

  async createVideo(options: VideoCreationOptions): Promise<any> {
    try {
      const available = await this.require(this.checkFFmpegAvailable, "checkFFmpegAvailable")();
      if (!available) {
        throw new Error(
          "FFMPEG NOT FOUND\nVideo processing features require FFmpeg/ffprobe to be installed.\n" +
            this.require(this.getFFmpegInstallInstructions, "getFFmpegInstallInstructions")()
        );
      }

      let videoInfo: any = null;
      if (options.getInfo || options.generateThumbnail || options.generatePreview || options.extractFrame?.frame !== undefined) {
        videoInfo = await this.require(this.getVideoInfo, "getVideoInfo")(options.source, true);
      }
      if (options.getInfo) return videoInfo ?? this.require(this.getVideoInfo, "getVideoInfo")(options.source, true);

      if (options.extractFrame) {
        const frameBuffer = await this.require(this.extractVideoFrame, "extractVideoFrame")(
          options.source,
          options.extractFrame.frame ?? 0,
          options.extractFrame.time,
          options.extractFrame.outputFormat ?? "png",
          options.extractFrame.quality ?? 2
        );
        if (!frameBuffer?.length) throw new Error("Failed to extract video frame.");
        const frameImage = await loadImage(frameBuffer);
        const width = options.extractFrame.width ?? frameImage.width;
        const height = options.extractFrame.height ?? frameImage.height;
        const canvas = createCanvas(width, height);
        getCanvasContext(canvas).drawImage(frameImage, 0, 0, width, height);
        return { buffer: canvas.toBuffer("image/png"), canvas: { width, height } };
      }

      if (options.extractFrames) {
        if (options.extractFrames.times) {
          const frames: Buffer[] = [];
          for (const time of options.extractFrames.times) {
            const frame = await this.require(this.extractVideoFrame, "extractVideoFrame")(
              options.source, 0, time, options.extractFrames.outputFormat ?? "jpg", options.extractFrames.quality ?? 2
            );
            if (frame) frames.push(frame);
          }
          return frames;
        }
        if (options.extractFrames.interval !== undefined) {
          return this.require(this.extractFrames, "extractFrames")(options.source, {
            interval: options.extractFrames.interval,
            outputFormat: options.extractFrames.outputFormat ?? "jpg",
            frameSelection: options.extractFrames.frameSelection,
            outputDirectory: options.extractFrames.outputDirectory,
          });
        }
      }

      if (options.extractAllFrames) return this.require(this.extractAllFrames, "extractAllFrames")(options.source, options.extractAllFrames);
      if (options.generateThumbnail) return this.require(this.generateVideoThumbnail, "generateVideoThumbnail")(options.source, options.generateThumbnail, videoInfo);
      if (options.convert) return this.require(this.convertVideo, "convertVideo")(options.source, options.convert);
      if (options.trim) return this.require(this.trimVideo, "trimVideo")(options.source, options.trim);
      if (options.extractAudio) return this.require(this.extractAudio, "extractAudio")(options.source, options.extractAudio);
      if (options.addWatermark) return this.require(this.addWatermarkToVideo, "addWatermarkToVideo")(options.source, options.addWatermark);
      if (options.changeSpeed) return this.require(this.changeVideoSpeed, "changeVideoSpeed")(options.source, options.changeSpeed);
      if (options.generatePreview) return this.require(this.generateVideoPreview, "generateVideoPreview")(options.source, options.generatePreview, videoInfo);
      if (options.applyEffects) return this.require(this.applyVideoEffects, "applyVideoEffects")(options.source, options.applyEffects);
      if (options.merge) return this.require(this.mergeVideos, "mergeVideos")(options.merge);
      if (options.replaceSegment) return this.require(this.replaceVideoSegment, "replaceSegment")(options.source, options.replaceSegment);
      if (options.rotate) return this.require(this.rotateVideo, "rotateVideo")(options.source, options.rotate);
      if (options.crop) return this.require(this.cropVideo, "cropVideo")(options.source, options.crop);
      if (options.compress) return this.require(this.compressVideo, "compressVideo")(options.source, options.compress);
      if (options.addText) return this.require(this.addTextToVideo, "addTextToVideo")(options.source, options.addText);
      if (options.addFade) return this.require(this.addFadeToVideo, "addFadeToVideo")(options.source, options.addFade);
      if (options.reverse) return this.require(this.reverseVideo, "reverseVideo")(options.source, options.reverse);
      if (options.createLoop) return this.require(this.createVideoLoop, "createVideoLoop")(options.source, options.createLoop);
      if (options.batch) return this.require(this.batchProcessVideos, "batchProcessVideos")(options.batch);
      if (options.detectScenes) return this.require(this.detectVideoScenes, "detectVideoScenes")(options.source, options.detectScenes);
      if (options.stabilize) return this.require(this.stabilizeVideo, "stabilizeVideo")(options.source, options.stabilize);
      if (options.colorCorrect) return this.require(this.colorCorrectVideo, "colorCorrectVideo")(options.source, options.colorCorrect);
      if (options.pictureInPicture) return this.require(this.addPictureInPicture, "addPictureInPicture")(options.source, options.pictureInPicture);
      if (options.splitScreen) return this.require(this.createSplitScreen, "createSplitScreen")(options.splitScreen);
      if (options.createTimeLapse) return this.require(this.createTimeLapseVideo, "createTimeLapseVideo")(options.source, options.createTimeLapse);
      if (options.removeAudio) return this.require(this.muteVideo, "muteVideo")(options.source, { outputPath: options.removeAudio.outputPath });
      if (options.mixAudio) return this.require(this.mixVideoAudio, "mixVideoAudio")(options.source, options.mixAudio);
      if (options.mute) return this.require(this.muteVideo, "muteVideo")(options.source, options.mute);
      if (options.adjustVolume) return this.require(this.adjustVideoVolume, "adjustVideoVolume")(options.source, options.adjustVolume);
      if (options.createFromFrames) return this.require(this.createVideoFromFrames, "createVideoFromFrames")(options.createFromFrames);

      if (options.detectFormat) {
        const [info, codec] = await Promise.all([
          this.require(this.getVideoInfo, "getVideoInfo")(options.source, true),
          this.require(this.getVideoCodec, "getVideoCodec")(options.source),
        ]);
        return {
          format: info?.format || "unknown",
          codec: codec || "unknown",
          container: info?.format || "unknown",
          width: info?.width,
          height: info?.height,
          fps: info?.fps,
          bitrate: info?.bitrate,
          duration: info?.duration,
        };
      }

      if (options.freezeFrame) return this.require(this.freezeVideoFrame, "freezeVideoFrame")(options.source, options.freezeFrame, options.onProgress);
      if (options.exportPreset) return this.require(this.exportVideoPreset, "exportVideoPreset")(options.source, options.exportPreset, options.onProgress);
      if (options.normalizeAudio) return this.require(this.normalizeVideoAudio, "normalizeVideoAudio")(options.source, options.normalizeAudio, options.onProgress);
      if (options.applyLUT) return this.require(this.applyLUTToVideo, "applyLUTToVideo")(options.source, options.applyLUT, options.onProgress);
      if (options.addTransition) return this.require(this.addVideoTransition, "addVideoTransition")(options.source, options.addTransition, options.onProgress);
      if (options.addTextOverlay) return this.require(this.addTextOverlayToVideo, "addTextOverlayToVideo")(options.source, options.addTextOverlay, options.onProgress);
      if (options.addAnimatedText) return this.require(this.addAnimatedTextToVideo, "addAnimatedTextToVideo")(options.source, options.addAnimatedText, options.onProgress);

      throw new Error("No video operation specified.");
    } catch (error) {
      const message = getErrorMessage(error);
      if (message.includes("FFMPEG NOT FOUND") || message.includes("FFmpeg")) throw error;
      throw new Error(`createVideo failed: ${message}`, { cause: error });
    }
  }
}
