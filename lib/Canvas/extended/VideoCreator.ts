import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { exec } from "child_process";
import { promisify } from "util";
import axios from 'axios';
import fs from "fs";
import path from "path";
import type { CanvasResults } from "./CanvasCreator";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";

const execAsync = promisify(exec);

/**
 * Video creation options interface
 */
export interface VideoCreationOptions {
  source: string | Buffer;
  getInfo?: boolean;
  extractFrame?: {
    time?: number;
    frame?: number;
    width?: number;
    height?: number;
    outputFormat?: 'jpg' | 'png';
    quality?: number;
  };
  extractFrames?: {
    times?: number[];
    interval?: number;
    frameSelection?: { start?: number; end?: number };
    outputFormat?: 'jpg' | 'png';
    quality?: number;
    outputDirectory?: string;
  };
  extractAllFrames?: {
    outputFormat?: 'jpg' | 'png';
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
    outputFormat?: 'jpg' | 'png';
    quality?: number;
  };
  convert?: {
    outputPath: string;
    format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    bitrate?: number;
    fps?: number;
    resolution?: { width: number; height: number };
  };
  trim?: {
    startTime: number;
    endTime: number;
    outputPath: string;
  };
  extractAudio?: {
    outputPath: string;
    format?: 'mp3' | 'wav' | 'aac' | 'ogg';
    bitrate?: number;
  };
  addWatermark?: {
    watermarkPath: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    opacity?: number;
    size?: { width: number; height: number };
    outputPath: string;
  };
  changeSpeed?: {
    speed: number;
    outputPath: string;
  };
  generatePreview?: {
    count?: number;
    outputDirectory?: string;
    outputFormat?: 'jpg' | 'png';
    quality?: number;
  };
  applyEffects?: {
    filters: Array<{
      type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'noise';
      intensity?: number;
      value?: number;
    }>;
    outputPath: string;
  };
  merge?: {
    videos: Array<string | Buffer>;
    outputPath: string;
    mode?: 'sequential' | 'side-by-side' | 'grid';
    grid?: { cols: number; rows: number };
  };
  replaceSegment?: {
    replacementVideo?: string | Buffer;
    replacementStartTime?: number;
    replacementDuration?: number;
    replacementFrames?: Array<string | Buffer>;
    replacementFps?: number;
    targetStartTime: number;
    targetEndTime: number;
    outputPath: string;
  };
  rotate?: {
    angle?: 90 | 180 | 270;
    flip?: 'horizontal' | 'vertical' | 'both';
    outputPath: string;
  };
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
    outputPath: string;
  };
  compress?: {
    outputPath: string;
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    targetSize?: number;
    maxBitrate?: number;
  };
  addText?: {
    text: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top-center' | 'bottom-center';
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    startTime?: number;
    endTime?: number;
    outputPath: string;
  };
  addFade?: {
    fadeIn?: number;
    fadeOut?: number;
    outputPath: string;
  };
  reverse?: {
    outputPath: string;
  };
  createLoop?: {
    outputPath: string;
    smooth?: boolean;
  };
  batch?: {
    videos: Array<{ source: string | Buffer; operations: any }>;
    outputDirectory: string;
  };
  detectScenes?: {
    threshold?: number;
    outputPath?: string;
  };
  stabilize?: {
    outputPath: string;
    smoothing?: number;
  };
  colorCorrect?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    hue?: number;
    temperature?: number;
    outputPath: string;
  };
  pictureInPicture?: {
    overlayVideo: string | Buffer;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    size?: { width: number; height: number };
    opacity?: number;
    outputPath: string;
  };
  splitScreen?: {
    videos: Array<string | Buffer>;
    layout?: 'side-by-side' | 'top-bottom' | 'grid';
    grid?: { cols: number; rows: number };
    outputPath: string;
  };
  createTimeLapse?: {
    speed?: number;
    outputPath: string;
  };
  mute?: {
    outputPath: string;
    ranges?: Array<{ start: number; end: number }>;
  };
  adjustVolume?: {
    volume: number;
    outputPath: string;
  };
  createFromFrames?: {
    frames: Array<string | Buffer>;
    outputPath: string;
    fps?: number;
    format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
    quality?: 'low' | 'medium' | 'high' | 'ultra';
    bitrate?: number;
    resolution?: { width: number; height: number };
  };
  detectFormat?: boolean;
  freezeFrame?: {
    time: number;
    duration: number;
    outputPath: string;
  };
  exportPreset?: {
    preset: 'youtube' | 'instagram' | 'tiktok' | 'twitter' | 'facebook' | 
            '4k' | '1080p' | '720p' | 'mobile' | 'web';
    outputPath: string;
  };
  normalizeAudio?: {
    targetLevel?: number;
    method?: 'peak' | 'rms' | 'lufs';
    outputPath: string;
  };
  applyLUT?: {
    lutPath: string;
    intensity?: number;
    outputPath: string;
  };
  addTransition?: {
    type: 'fade' | 'wipe' | 'slide' | 'zoom' | 'rotate' | 'dissolve' | 'blur' | 'circle' | 'pixelize';
    duration: number;
    direction?: 'left' | 'right' | 'up' | 'down' | 'in' | 'out';
    secondVideo?: string | Buffer;
    outputPath: string;
  };
  addAnimatedText?: {
    text: string;
    animation?: 'fadeIn' | 'fadeOut' | 'slideIn' | 'slideOut' | 'typewriter' | 'bounce' | 'zoom' | 'rotate';
    startTime: number;
    endTime: number;
    position?: { x: number; y: number } | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top-center' | 'bottom-center';
    fontSize?: number;
    fontColor?: string;
    fontPath?: string;
    fontName?: string;
    fontFamily?: string;
    backgroundColor?: string;
    outputPath: string;
  };
  onProgress?: (progress: {
    percent: number;
    time: number;
    speed: number;
  }) => void;
}

/**
 * Extended class for video creation functionality
 */
export class VideoCreator {
  // Dependencies injected from ApexPainter
  private checkFFmpegAvailable?: () => Promise<boolean>;
  private getFFmpegInstallInstructions?: () => string;
  private getVideoInfo?: (videoSource: string | Buffer, skipFFmpegCheck?: boolean) => Promise<any>;
  private extractVideoFrame?: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: 'jpg' | 'png',
    quality?: number
  ) => Promise<Buffer | null>;
  private extractFrames?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private extractAllFrames?: (videoSource: string | Buffer, options?: any) => Promise<any>;

  /**
   * Sets dependencies from ApexPainter
   */
  setDependencies(deps: {
    checkFFmpegAvailable: () => Promise<boolean>;
    getFFmpegInstallInstructions: () => string;
    getVideoInfo: (videoSource: string | Buffer, skipFFmpegCheck?: boolean) => Promise<any>;
    extractVideoFrame: (
      videoSource: string | Buffer,
      frameNumber?: number,
      timeSeconds?: number,
      outputFormat?: 'jpg' | 'png',
      quality?: number
    ) => Promise<Buffer | null>;
    extractFrames?: (videoSource: string | Buffer, options: any) => Promise<any>;
    extractAllFrames?: (videoSource: string | Buffer, options?: any) => Promise<any>;
  }): void {
    this.checkFFmpegAvailable = deps.checkFFmpegAvailable;
    this.getFFmpegInstallInstructions = deps.getFFmpegInstallInstructions;
    this.getVideoInfo = deps.getVideoInfo;
    this.extractVideoFrame = deps.extractVideoFrame;
    this.extractFrames = deps.extractFrames;
    this.extractAllFrames = deps.extractAllFrames;
  }

  /**
   * Main createVideo method - handles all video operations
   */
  async createVideo(options: VideoCreationOptions): Promise<any> {
    try {
      if (!this.checkFFmpegAvailable || !this.getFFmpegInstallInstructions) {
        throw new Error('VideoCreator dependencies not set. Call setDependencies() first.');
      }

      const ffmpegAvailable = await this.checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        const errorMessage = 
          '❌ FFMPEG NOT FOUND\n' +
          'Video processing features require FFmpeg to be installed on your system.\n' +
          this.getFFmpegInstallInstructions();
        throw new Error(errorMessage);
      }

      // Get video info if requested or needed
      let videoInfo: any = null;
      if (options.getInfo || options.extractFrame?.frame || options.generateThumbnail || options.generatePreview) {
        if (!this.getVideoInfo) {
          throw new Error('getVideoInfo dependency not set');
        }
        videoInfo = await this.getVideoInfo(options.source, true);
      }

      // Handle getInfo
      if (options.getInfo) {
        if (!this.getVideoInfo) {
          throw new Error('getVideoInfo dependency not set');
        }
        return videoInfo || await this.getVideoInfo(options.source, true);
      }

      // Handle extractFrame (creates canvas)
      if (options.extractFrame) {
        if (!this.extractVideoFrame) {
          throw new Error('extractVideoFrame dependency not set');
        }
        const frameBuffer = await this.extractVideoFrame(
          options.source,
          options.extractFrame.frame ?? 0,
          options.extractFrame.time,
          options.extractFrame.outputFormat || 'png',
          options.extractFrame.quality || 2
        );

        if (!frameBuffer || frameBuffer.length === 0) {
          throw new Error('Failed to extract video frame');
        }

        const frameImage = await loadImage(frameBuffer);
        const videoWidth = frameImage.width;
        const videoHeight = frameImage.height;

        const width = options.extractFrame.width ?? videoWidth;
        const height = options.extractFrame.height ?? videoHeight;

        const canvas = createCanvas(width, height);
        const ctx = getCanvasContext(canvas);

        ctx.drawImage(frameImage, 0, 0, width, height);

        return {
          buffer: canvas.toBuffer('image/png'),
          canvas: { width, height }
        };
      }

      // Handle extractFrames (multiple frames at specific times or intervals)
      if (options.extractFrames) {
        if (options.extractFrames.times) {
          if (!this.extractVideoFrame) {
            throw new Error('extractVideoFrame dependency not set');
          }
          const frames: Buffer[] = [];
          for (const time of options.extractFrames.times) {
            const frame = await this.extractVideoFrame(
              options.source,
              0,
              time,
              options.extractFrames.outputFormat || 'jpg',
              options.extractFrames.quality || 2
            );
            if (frame) {
              frames.push(frame);
            }
          }
          return frames;
        } else if (options.extractFrames.interval && this.extractFrames) {
          return await this.extractFrames(options.source, {
            interval: options.extractFrames.interval,
            outputFormat: options.extractFrames.outputFormat || 'jpg',
            frameSelection: options.extractFrames.frameSelection,
            outputDirectory: options.extractFrames.outputDirectory
          });
        }
      }

      // Handle extractAllFrames
      if (options.extractAllFrames && this.extractAllFrames) {
        return await this.extractAllFrames(options.source, {
          outputFormat: options.extractAllFrames.outputFormat,
          outputDirectory: options.extractAllFrames.outputDirectory,
          quality: options.extractAllFrames.quality,
          prefix: options.extractAllFrames.prefix,
          startTime: options.extractAllFrames.startTime,
          endTime: options.extractAllFrames.endTime
        });
      }

      // Handle generateThumbnail
      if (options.generateThumbnail) {
        if (!this.generateVideoThumbnail) {
          throw new Error('generateVideoThumbnail helper method not set');
        }
        return await this.generateVideoThumbnail(options.source, options.generateThumbnail, videoInfo);
      }

      // Handle convert
      if (options.convert) {
        if (!this.convertVideo) {
          throw new Error('convertVideo helper method not set');
        }
        return await this.convertVideo(options.source, options.convert);
      }

      // Handle trim
      if (options.trim) {
        if (!this.trimVideo) {
          throw new Error('trimVideo helper method not set');
        }
        return await this.trimVideo(options.source, options.trim);
      }

      // Handle extractAudio
      if (options.extractAudio) {
        if (!this.extractAudio) {
          throw new Error('extractAudio helper method not set');
        }
        return await this.extractAudio(options.source, options.extractAudio);
      }

      // Handle addWatermark
      if (options.addWatermark) {
        if (!this.addWatermarkToVideo) {
          throw new Error('addWatermarkToVideo helper method not set');
        }
        return await this.addWatermarkToVideo(options.source, options.addWatermark);
      }

      // Handle changeSpeed
      if (options.changeSpeed) {
        if (!this.changeVideoSpeed) {
          throw new Error('changeVideoSpeed helper method not set');
        }
        return await this.changeVideoSpeed(options.source, options.changeSpeed);
      }

      // Handle generatePreview
      if (options.generatePreview) {
        if (!this.generateVideoPreview) {
          throw new Error('generateVideoPreview helper method not set');
        }
        return await this.generateVideoPreview(options.source, options.generatePreview, videoInfo);
      }

      // Handle applyEffects
      if (options.applyEffects) {
        if (!this.applyVideoEffects) {
          throw new Error('applyVideoEffects helper method not set');
        }
        return await this.applyVideoEffects(options.source, options.applyEffects);
      }

      // Handle merge
      if (options.merge) {
        if (!this.mergeVideos) {
          throw new Error('mergeVideos helper method not set');
        }
        return await this.mergeVideos(options.merge);
      }

      // Handle replaceSegment
      if (options.replaceSegment) {
        if (!this.replaceVideoSegment) {
          throw new Error('replaceVideoSegment helper method not set');
        }
        return await this.replaceVideoSegment(options.source, options.replaceSegment);
      }

      // Handle rotate
      if (options.rotate) {
        if (!this.rotateVideo) {
          throw new Error('rotateVideo helper method not set');
        }
        return await this.rotateVideo(options.source, options.rotate);
      }

      // Handle crop
      if (options.crop) {
        if (!this.cropVideo) {
          throw new Error('cropVideo helper method not set');
        }
        return await this.cropVideo(options.source, options.crop);
      }

      // Handle compress
      if (options.compress) {
        if (!this.compressVideo) {
          throw new Error('compressVideo helper method not set');
        }
        return await this.compressVideo(options.source, options.compress);
      }

      // Handle addText
      if (options.addText) {
        if (!this.addTextToVideo) {
          throw new Error('addTextToVideo helper method not set');
        }
        return await this.addTextToVideo(options.source, options.addText);
      }

      // Handle addFade
      if (options.addFade) {
        if (!this.addFadeToVideo) {
          throw new Error('addFadeToVideo helper method not set');
        }
        return await this.addFadeToVideo(options.source, options.addFade);
      }

      // Handle reverse
      if (options.reverse) {
        if (!this.reverseVideo) {
          throw new Error('reverseVideo helper method not set');
        }
        return await this.reverseVideo(options.source, options.reverse);
      }

      // Handle createLoop
      if (options.createLoop) {
        if (!this.createVideoLoop) {
          throw new Error('createVideoLoop helper method not set');
        }
        return await this.createVideoLoop(options.source, options.createLoop);
      }

      // Handle batch
      if (options.batch) {
        if (!this.batchProcessVideos) {
          throw new Error('batchProcessVideos helper method not set');
        }
        return await this.batchProcessVideos(options.batch);
      }

      // Handle detectScenes
      if (options.detectScenes) {
        if (!this.detectVideoScenes) {
          throw new Error('detectVideoScenes helper method not set');
        }
        return await this.detectVideoScenes(options.source, options.detectScenes);
      }

      // Handle stabilize
      if (options.stabilize) {
        if (!this.stabilizeVideo) {
          throw new Error('stabilizeVideo helper method not set');
        }
        return await this.stabilizeVideo(options.source, options.stabilize);
      }

      // Handle colorCorrect
      if (options.colorCorrect) {
        if (!this.colorCorrectVideo) {
          throw new Error('colorCorrectVideo helper method not set');
        }
        return await this.colorCorrectVideo(options.source, options.colorCorrect);
      }

      // Handle pictureInPicture
      if (options.pictureInPicture) {
        if (!this.addPictureInPicture) {
          throw new Error('addPictureInPicture helper method not set');
        }
        return await this.addPictureInPicture(options.source, options.pictureInPicture);
      }

      // Handle splitScreen
      if (options.splitScreen) {
        if (!this.createSplitScreen) {
          throw new Error('createSplitScreen helper method not set');
        }
        return await this.createSplitScreen(options.splitScreen);
      }

      // Handle createTimeLapse
      if (options.createTimeLapse) {
        if (!this.createTimeLapseVideo) {
          throw new Error('createTimeLapseVideo helper method not set');
        }
        return await this.createTimeLapseVideo(options.source, options.createTimeLapse);
      }

      // Handle mute
      if (options.mute) {
        if (!this.muteVideo) {
          throw new Error('muteVideo helper method not set');
        }
        return await this.muteVideo(options.source, options.mute);
      }

      // Handle adjustVolume
      if (options.adjustVolume) {
        if (!this.adjustVideoVolume) {
          throw new Error('adjustVideoVolume helper method not set');
        }
        return await this.adjustVideoVolume(options.source, options.adjustVolume);
      }

      // Handle createFromFrames
      if (options.createFromFrames) {
        if (!this.createVideoFromFrames) {
          throw new Error('createVideoFromFrames helper method not set');
        }
        return await this.createVideoFromFrames(options.createFromFrames);
      }

      // Handle detectFormat
      if (options.detectFormat) {
        if (!this.getVideoInfo) {
          throw new Error('getVideoInfo dependency not set');
        }
        const info = await this.getVideoInfo(options.source, true);
        let codec = 'unknown';
        try {
          const frameDir = path.join(process.cwd(), '.temp-frames');
          let videoPath: string;
          if (Buffer.isBuffer(options.source)) {
            const tempPath = path.join(frameDir, `temp-video-${Date.now()}.mp4`);
            fs.writeFileSync(tempPath, options.source);
            videoPath = tempPath;
          } else {
            let resolvedPath = options.source;
            if (!/^https?:\/\//i.test(resolvedPath)) {
              resolvedPath = path.join(process.cwd(), resolvedPath);
            }
            videoPath = resolvedPath;
          }
          const escapedPath = videoPath.replace(/"/g, '\\"');
          const { stdout } = await execAsync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${escapedPath}"`,
            { timeout: 10000, maxBuffer: 1024 * 1024 }
          );
          codec = stdout.toString().trim() || 'unknown';
        } catch {
          codec = 'unknown';
        }
        
        return {
          format: info?.format || 'unknown',
          codec: codec,
          container: info?.format || 'unknown',
          width: info?.width,
          height: info?.height,
          fps: info?.fps,
          bitrate: info?.bitrate,
          duration: info?.duration
        };
      }

      // Handle freezeFrame
      if (options.freezeFrame) {
        if (!this.freezeVideoFrame) {
          throw new Error('freezeVideoFrame helper method not set');
        }
        return await this.freezeVideoFrame(options.source, options.freezeFrame, options.onProgress);
      }

      // Handle exportPreset
      if (options.exportPreset) {
        if (!this.exportVideoPreset) {
          throw new Error('exportVideoPreset helper method not set');
        }
        return await this.exportVideoPreset(options.source, options.exportPreset, options.onProgress);
      }

      // Handle normalizeAudio
      if (options.normalizeAudio) {
        if (!this.normalizeVideoAudio) {
          throw new Error('normalizeVideoAudio helper method not set');
        }
        return await this.normalizeVideoAudio(options.source, options.normalizeAudio, options.onProgress);
      }

      // Handle applyLUT
      if (options.applyLUT) {
        if (!this.applyLUTToVideo) {
          throw new Error('applyLUTToVideo helper method not set');
        }
        return await this.applyLUTToVideo(options.source, options.applyLUT, options.onProgress);
      }

      // Handle addTransition
      if (options.addTransition) {
        if (!this.addVideoTransition) {
          throw new Error('addVideoTransition helper method not set');
        }
        return await this.addVideoTransition(options.source, options.addTransition, options.onProgress);
      }

      // Handle addAnimatedText
      if (options.addAnimatedText) {
        if (!this.addAnimatedTextToVideo) {
          throw new Error('addAnimatedTextToVideo helper method not set');
        }
        return await this.addAnimatedTextToVideo(options.source, options.addAnimatedText, options.onProgress);
      }

      throw new Error('No video operation specified');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`createVideo failed: ${errorMessage}`);
    }
  }

  // Helper methods - these will be set via dependency injection
  private generateVideoThumbnail?: (videoSource: string | Buffer, options: any, videoInfo: any) => Promise<CanvasResults>;
  private convertVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private trimVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private extractAudio?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private addWatermarkToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private changeVideoSpeed?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private generateVideoPreview?: (videoSource: string | Buffer, options: any, videoInfo: any) => Promise<any>;
  private applyVideoEffects?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private mergeVideos?: (options: any) => Promise<any>;
  private replaceVideoSegment?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private rotateVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private cropVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private compressVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private addTextToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private addFadeToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private reverseVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private createVideoLoop?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private batchProcessVideos?: (options: any) => Promise<any>;
  private detectVideoScenes?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private stabilizeVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private colorCorrectVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private addPictureInPicture?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private createSplitScreen?: (options: any) => Promise<any>;
  private createTimeLapseVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private muteVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private adjustVideoVolume?: (videoSource: string | Buffer, options: any) => Promise<any>;
  private createVideoFromFrames?: (options: any) => Promise<any>;
  private freezeVideoFrame?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  private exportVideoPreset?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  private normalizeVideoAudio?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  private applyLUTToVideo?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  private addVideoTransition?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  private addAnimatedTextToVideo?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;

  /**
   * Sets helper methods from ApexPainter
   */
  setHelperMethods(helpers: {
    generateVideoThumbnail?: (videoSource: string | Buffer, options: any, videoInfo: any) => Promise<CanvasResults>;
    convertVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    trimVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    extractAudio?: (videoSource: string | Buffer, options: any) => Promise<any>;
    addWatermarkToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    changeVideoSpeed?: (videoSource: string | Buffer, options: any) => Promise<any>;
    generateVideoPreview?: (videoSource: string | Buffer, options: any, videoInfo: any) => Promise<any>;
    applyVideoEffects?: (videoSource: string | Buffer, options: any) => Promise<any>;
    mergeVideos?: (options: any) => Promise<any>;
    replaceVideoSegment?: (videoSource: string | Buffer, options: any) => Promise<any>;
    rotateVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    cropVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    compressVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    addTextToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    addFadeToVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    reverseVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    createVideoLoop?: (videoSource: string | Buffer, options: any) => Promise<any>;
    batchProcessVideos?: (options: any) => Promise<any>;
    detectVideoScenes?: (videoSource: string | Buffer, options: any) => Promise<any>;
    stabilizeVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    colorCorrectVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    addPictureInPicture?: (videoSource: string | Buffer, options: any) => Promise<any>;
    createSplitScreen?: (options: any) => Promise<any>;
    createTimeLapseVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    muteVideo?: (videoSource: string | Buffer, options: any) => Promise<any>;
    adjustVideoVolume?: (videoSource: string | Buffer, options: any) => Promise<any>;
    createVideoFromFrames?: (options: any) => Promise<any>;
    freezeVideoFrame?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
    exportVideoPreset?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
    normalizeVideoAudio?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
    applyLUTToVideo?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
    addVideoTransition?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
    addAnimatedTextToVideo?: (videoSource: string | Buffer, options: any, onProgress?: any) => Promise<any>;
  }): void {
    this.generateVideoThumbnail = helpers.generateVideoThumbnail;
    this.convertVideo = helpers.convertVideo;
    this.trimVideo = helpers.trimVideo;
    this.extractAudio = helpers.extractAudio;
    this.addWatermarkToVideo = helpers.addWatermarkToVideo;
    this.changeVideoSpeed = helpers.changeVideoSpeed;
    this.generateVideoPreview = helpers.generateVideoPreview;
    this.applyVideoEffects = helpers.applyVideoEffects;
    this.mergeVideos = helpers.mergeVideos;
    this.replaceVideoSegment = helpers.replaceVideoSegment;
    this.rotateVideo = helpers.rotateVideo;
    this.cropVideo = helpers.cropVideo;
    this.compressVideo = helpers.compressVideo;
    this.addTextToVideo = helpers.addTextToVideo;
    this.addFadeToVideo = helpers.addFadeToVideo;
    this.reverseVideo = helpers.reverseVideo;
    this.createVideoLoop = helpers.createVideoLoop;
    this.batchProcessVideos = helpers.batchProcessVideos;
    this.detectVideoScenes = helpers.detectVideoScenes;
    this.stabilizeVideo = helpers.stabilizeVideo;
    this.colorCorrectVideo = helpers.colorCorrectVideo;
    this.addPictureInPicture = helpers.addPictureInPicture;
    this.createSplitScreen = helpers.createSplitScreen;
    this.createTimeLapseVideo = helpers.createTimeLapseVideo;
    this.muteVideo = helpers.muteVideo;
    this.adjustVideoVolume = helpers.adjustVideoVolume;
    this.createVideoFromFrames = helpers.createVideoFromFrames;
    this.freezeVideoFrame = helpers.freezeVideoFrame;
    this.exportVideoPreset = helpers.exportVideoPreset;
    this.normalizeVideoAudio = helpers.normalizeVideoAudio;
    this.applyLUTToVideo = helpers.applyLUTToVideo;
    this.addVideoTransition = helpers.addVideoTransition;
    this.addAnimatedTextToVideo = helpers.addAnimatedTextToVideo;
  }
}

