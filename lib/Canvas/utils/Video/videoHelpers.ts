/**
 * Video helper functions for ApexPainter
 * This file contains all video processing helper methods that were previously in ApexPainter.ts
 * to keep the main class cleaner and more maintainable.
 */

import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { exec } from "child_process";
import { promisify } from "util";
import axios from 'axios';
import fs from "fs";
import path from "path";
import type { CanvasResults } from "../../extended/CanvasCreator";
import { getCanvasContext } from "../errorUtils";

const execAsync = promisify(exec);

/**
 * Helper function to resolve video source (Buffer, URL, or local path) to a file path
 * Downloads URLs and writes Buffers to temp files as needed
 */
async function resolveVideoSource(
  videoSource: string | Buffer,
  frameDir: string,
  timestamp: number
): Promise<{ videoPath: string; shouldCleanup: boolean }> {
  if (Buffer.isBuffer(videoSource)) {

    const videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
    fs.writeFileSync(videoPath, videoSource);
    return { videoPath, shouldCleanup: true };
  } else if (typeof videoSource === 'string' && /^https?:\/\//.test(videoSource)) {

    const response = await axios({
      method: 'get',
      url: videoSource,
      responseType: 'arraybuffer'
    });
    const videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
    fs.writeFileSync(videoPath, Buffer.from(response.data));
    return { videoPath, shouldCleanup: true };
  } else {

    let resolvedPath = videoSource;
    if (!path.isAbsolute(resolvedPath)) {
      resolvedPath = path.join(process.cwd(), resolvedPath);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Video file not found: ${videoSource}`);
    }
    return { videoPath: resolvedPath, shouldCleanup: false };
  }
}

/**
 * Dependencies interface for VideoHelpers
 */
export interface VideoHelpersDependencies {
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
  createVideo: (options: any) => Promise<any>;
}

/**
 * Video helper functions class
 * All video processing helper methods are contained here
 */
export class VideoHelpers {
  private deps: VideoHelpersDependencies;

  constructor(dependencies: VideoHelpersDependencies) {
    this.deps = dependencies;
  }

  /**
   * Helper to execute FFmpeg with progress tracking
   * @private
   */
  private async executeFFmpegWithProgress(
    command: string,
    options: { timeout?: number; maxBuffer?: number },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const childProcess = exec(command, options, (error) => {
        if (error) reject(error);
        else resolve();
      });

      if (onProgress) {
        let stderrBuffer = '';
        childProcess.stderr?.on('data', (data: Buffer) => {
          stderrBuffer += data.toString();

          const timeMatch = stderrBuffer.match(/time=(\d+):(\d+):(\d+\.\d+)/);
          const durationMatch = stderrBuffer.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);

          if (timeMatch && durationMatch) {
            const currentTime = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
            const totalDuration = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
            const percent = Math.min(100, (currentTime / totalDuration) * 100);
            const speedMatch = stderrBuffer.match(/speed=\s*([\d.]+)x/);
            const speed = speedMatch ? parseFloat(speedMatch[1]) : 1;

            onProgress({ percent, time: currentTime, speed });
          }
        });
      }
    });
  }

  /**
   * Generate video thumbnail (grid of frames)
   */
  async generateVideoThumbnail(
    videoSource: string | Buffer,
    options: {
      count?: number;
      grid?: { cols: number; rows: number };
      width?: number;
      height?: number;
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    },
    videoInfo: any
  ): Promise<CanvasResults> {
    const count = options.count || 9;
    const grid = options.grid || { cols: 3, rows: 3 };
    const frameWidth = options.width || 320;
    const frameHeight = options.height || 180;
    const outputFormat = options.outputFormat || 'jpg';
    const quality = options.quality || 2;

    if (!videoInfo) {
      videoInfo = await this.deps.getVideoInfo(videoSource, true);
    }

    const duration = videoInfo.duration;
const interval = duration / (count + 1);

    const frames: Buffer[] = [];
    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const frame = await this.deps.extractVideoFrame(videoSource, 0, time, outputFormat, quality);
      if (frame) {
        frames.push(frame);
      }
    }

    const thumbnailWidth = frameWidth * grid.cols;
    const thumbnailHeight = frameHeight * grid.rows;
    const canvas = createCanvas(thumbnailWidth, thumbnailHeight);
    const ctx = getCanvasContext(canvas);

    for (let i = 0; i < frames.length; i++) {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const x = col * frameWidth;
      const y = row * frameHeight;

      const frameImage = await loadImage(frames[i]);
      ctx.drawImage(frameImage, x, y, frameWidth, frameHeight);
    }

    return {
      buffer: canvas.toBuffer('image/png'),
      canvas: { width: thumbnailWidth, height: thumbnailHeight }
    };
  }

  /**
   * Convert video format
   */
  async convertVideo(
    videoSource: string | Buffer,
    options: {
      outputPath: string;
      format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      bitrate?: number;
      fps?: number;
      resolution?: { width: number; height: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const format = options.format || 'mp4';
    const qualityPresets: Record<string, string> = {
      low: '-crf 28',
      medium: '-crf 23',
      high: '-crf 18',
      ultra: '-crf 15'
    };
    const qualityFlag = options.bitrate
      ? `-b:v ${options.bitrate}k`
      : qualityPresets[options.quality || 'medium'];

    const fpsFlag = options.fps ? `-r ${options.fps}` : '';
    const resolutionFlag = options.resolution
      ? `-vf scale=${options.resolution.width}:${options.resolution.height}`
      : '';

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${qualityFlag} ${fpsFlag} ${resolutionFlag} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, {
timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Trim/Cut video
   */
  async trimVideo(
    videoSource: string | Buffer,
    options: { startTime: number; endTime: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const duration = options.endTime - options.startTime;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -ss ${options.startTime} -t ${duration} -c copy -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Extract audio from video
   */
  async extractAudio(
    videoSource: string | Buffer,
    options: { outputPath: string; format?: 'mp3' | 'wav' | 'aac' | 'ogg'; bitrate?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024 }
      );
      const hasAudio = stdout.toString().trim() === 'audio';
      if (!hasAudio) {
        throw new Error('Video does not contain an audio stream. Cannot extract audio.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Video does not contain')) {
        throw error;
      }

      throw new Error('Video does not contain an audio stream. Cannot extract audio.');
    }

    const format = options.format || 'mp3';
    const bitrate = options.bitrate || 128;
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vn -acodec ${format === 'mp3' ? 'libmp3lame' : format === 'wav' ? 'pcm_s16le' : format === 'aac' ? 'aac' : 'libvorbis'} -ab ${bitrate}k -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add watermark to video
   */
  async addWatermarkToVideo(
    videoSource: string | Buffer,
    options: {
      watermarkPath: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      opacity?: number;
      size?: { width: number; height: number };
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    let watermarkPath = options.watermarkPath;
    if (!/^https?:\/\//.test(watermarkPath)) {
      watermarkPath = path.join(process.cwd(), watermarkPath);
    }
    if (!fs.existsSync(watermarkPath)) {
      throw new Error(`Watermark file not found: ${options.watermarkPath}`);
    }

    const position = options.position || 'bottom-right';
    const opacity = options.opacity || 0.5;
    const size = options.size ? `scale=${options.size.width}:${options.size.height}` : '';

    const positionMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'W-w-10:10',
      'bottom-left': '10:H-h-10',
      'bottom-right': 'W-w-10:H-h-10',
      'center': '(W-w)/2:(H-h)/2'
    };

    const overlay = positionMap[position];
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedWatermarkPath = watermarkPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const filter = `[1:v]${size ? size + ',' : ''}format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${overlay}`;
    const command = `ffmpeg -i "${escapedVideoPath}" -i "${escapedWatermarkPath}" -filter_complex "${filter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Change video speed
   */
  async changeVideoSpeed(
    videoSource: string | Buffer,
    options: { speed: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    let hasAudio = false;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024 }
      );
      hasAudio = stdout.toString().trim() === 'audio';
    } catch {
      hasAudio = false;
    }

    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
    let command: string;

    if (hasAudio) {

      if (options.speed > 2.0) {
        const atempoCount = Math.ceil(Math.log2(options.speed));
        const atempoValue = Math.pow(2, Math.log2(options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else if (options.speed < 0.5) {

        const atempoCount = Math.ceil(Math.log2(1 / options.speed));
        const atempoValue = Math.pow(0.5, Math.log2(1 / options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else {

        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]atempo=${options.speed}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      }
    } else {

      command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v]" -map "[v]" -y "${escapedOutputPath}"`;
    }

    try {
      await execAsync(command, {
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Generate video preview (multiple frames)
   */
  async generateVideoPreview(
    videoSource: string | Buffer,
    options: {
      count?: number;
      outputDirectory?: string;
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    },
    videoInfo: any
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    const count = options.count || 10;
    const outputDir = options.outputDirectory || path.join(process.cwd(), 'video-preview');
    const outputFormat = options.outputFormat || 'png';
    const quality = options.quality || 2;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!videoInfo) {
      videoInfo = await this.deps.getVideoInfo(videoSource, true);
    }

    const duration = videoInfo.duration;
    const interval = duration / (count + 1);

    const frames: Array<{ source: string; frameNumber: number; time: number }> = [];

    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const frameBuffer = await this.deps.extractVideoFrame(videoSource, 0, time, outputFormat, quality);

      if (frameBuffer) {
        const framePath = path.join(outputDir, `preview-${String(i).padStart(3, '0')}.${outputFormat}`);
        fs.writeFileSync(framePath, frameBuffer);
        frames.push({
          source: framePath,
          frameNumber: i,
          time: time
        });
      }
    }

    return frames;
  }

  /**
   * Apply video effects/filters
   */
  async applyVideoEffects(
    videoSource: string | Buffer,
    options: {
      filters: Array<{
        type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'noise';
        intensity?: number;
        value?: number;
      }>;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const filters: string[] = [];
    for (const filter of options.filters) {
      switch (filter.type) {
        case 'blur':
          filters.push(`boxblur=${filter.intensity || 5}`);
          break;
        case 'brightness':
          filters.push(`eq=brightness=${((filter.value || 0) / 100).toFixed(2)}`);
          break;
        case 'contrast':
          filters.push(`eq=contrast=${1 + ((filter.value || 0) / 100)}`);
          break;
        case 'saturation':
          filters.push(`eq=saturation=${1 + ((filter.value || 0) / 100)}`);
          break;
        case 'grayscale':
          filters.push('hue=s=0');
          break;
        case 'sepia':
          filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
          break;
        case 'invert':
          filters.push('negate');
          break;
        case 'sharpen':
          filters.push(`unsharp=5:5:${filter.intensity || 1.0}:5:5:0.0`);
          break;
        case 'noise':
          filters.push(`noise=alls=${filter.intensity || 20}:allf=t+u`);
          break;
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Merge/Concatenate videos
   */
  async mergeVideos(
    options: {
      videos: Array<string | Buffer>;
      outputPath: string;
      mode?: 'sequential' | 'side-by-side' | 'grid';
      grid?: { cols: number; rows: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const videoPaths: string[] = [];
    const shouldCleanup: boolean[] = [];

    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(video, frameDir, timestamp + i);
      videoPaths.push(videoPath);
      shouldCleanup.push(shouldCleanupVideo);
    }

    const mode = options.mode || 'sequential';
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    let command: string;

    if (mode === 'sequential') {

      const concatFile = path.join(frameDir, `concat-${timestamp}.txt`);
      const concatContent = videoPaths.map(vp => `file '${vp.replace(/'/g, "\\'")}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      command = `ffmpeg -f concat -safe 0 -i "${concatFile.replace(/"/g, '\\"')}" -c copy -y "${escapedOutputPath}"`;
    } else if (mode === 'side-by-side') {
      const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1] || escapedPaths[0]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (mode === 'grid') {
      const grid = options.grid || { cols: 2, rows: 2 };
      const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));

      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1] || escapedPaths[0]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else {
      throw new Error(`Unknown merge mode: ${mode}`);
    }

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      throw error;
    }
  }

  /**
   * Replace segment in video with segment from another video
   */
  async replaceVideoSegment(
    mainVideoSource: string | Buffer,
    options: {
      replacementVideo?: string | Buffer;
      replacementStartTime?: number;
      replacementDuration?: number;
      replacementFrames?: Array<string | Buffer>;
      replacementFps?: number;
      targetStartTime: number;
      targetEndTime: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const tempFiles: string[] = [];
    let shouldCleanupMain = false;
    let shouldCleanupReplacement = false;

    const { videoPath: mainVideoPath, shouldCleanup: shouldCleanupMainValue } = await resolveVideoSource(mainVideoSource, frameDir, timestamp);
    shouldCleanupMain = shouldCleanupMainValue;
    if (shouldCleanupMain) {
      tempFiles.push(mainVideoPath);
    }

    if (!options.replacementVideo && !options.replacementFrames) {
      throw new Error('Either replacementVideo or replacementFrames must be provided');
    }

    if (options.replacementVideo && options.replacementFrames) {
      throw new Error('Cannot specify both replacementVideo and replacementFrames');
    }

    const mainVideoInfo = await this.deps.getVideoInfo(mainVideoPath, true);
    if (!mainVideoInfo) {
      throw new Error('Failed to get main video information');
    }

    if (options.targetStartTime < 0 || options.targetEndTime > mainVideoInfo.duration) {
      throw new Error(`Target time range (${options.targetStartTime}-${options.targetEndTime}s) is outside video duration (${mainVideoInfo.duration}s)`);
    }

    if (options.targetStartTime >= options.targetEndTime) {
      throw new Error('targetStartTime must be less than targetEndTime');
    }

    const targetDuration = options.targetEndTime - options.targetStartTime;
    const escapedMainPath = mainVideoPath.replace(/"/g, '\\"');

    try {

      const part1Path = path.join(frameDir, `part1-${timestamp}.mp4`);
      tempFiles.push(part1Path);

      if (options.targetStartTime > 0) {
        const escapedPart1 = part1Path.replace(/"/g, '\\"');
        const part1Command = `ffmpeg -i "${escapedMainPath}" -t ${options.targetStartTime} -c copy -y "${escapedPart1}"`;
        await execAsync(part1Command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      }

      const replacementSegmentPath = path.join(frameDir, `replacement-segment-${timestamp}.mp4`);
      tempFiles.push(replacementSegmentPath);

      if (options.replacementVideo) {

        const { videoPath: replacementVideoPath, shouldCleanup: shouldCleanupReplacementValue } = await resolveVideoSource(options.replacementVideo, frameDir, timestamp + 1000);
        shouldCleanupReplacement = shouldCleanupReplacementValue;
        if (shouldCleanupReplacement) {
          tempFiles.push(replacementVideoPath);
        }

        const replacementStartTime = options.replacementStartTime || 0;
        const replacementDuration = options.replacementDuration || targetDuration;

        const escapedReplacementPath = replacementVideoPath.replace(/"/g, '\\"');
        const escapedSegment = replacementSegmentPath.replace(/"/g, '\\"');
        const segmentCommand = `ffmpeg -i "${escapedReplacementPath}" -ss ${replacementStartTime} -t ${replacementDuration} -c copy -y "${escapedSegment}"`;
        await execAsync(segmentCommand, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      } else if (options.replacementFrames) {

        const replacementFps = options.replacementFps || 30;
        await this.createVideoFromFrames({
          frames: options.replacementFrames,
          outputPath: replacementSegmentPath,
          fps: replacementFps,
          format: 'mp4',
          quality: 'high'
        });
      }

      const part3Path = path.join(frameDir, `part3-${timestamp}.mp4`);
      tempFiles.push(part3Path);

      const remainingDuration = mainVideoInfo.duration - options.targetEndTime;
      if (remainingDuration > 0) {
        const escapedPart3 = part3Path.replace(/"/g, '\\"');
        const part3Command = `ffmpeg -i "${escapedMainPath}" -ss ${options.targetEndTime} -t ${remainingDuration} -c copy -y "${escapedPart3}"`;
        await execAsync(part3Command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      }

      const concatFile = path.join(frameDir, `concat-${timestamp}.txt`);
      tempFiles.push(concatFile);

      const concatParts: string[] = [];

      if (options.targetStartTime > 0 && fs.existsSync(part1Path) && fs.statSync(part1Path).size > 0) {
        concatParts.push(part1Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }

      if (fs.existsSync(replacementSegmentPath) && fs.statSync(replacementSegmentPath).size > 0) {
        concatParts.push(replacementSegmentPath.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }

      if (remainingDuration > 0 && fs.existsSync(part3Path) && fs.statSync(part3Path).size > 0) {
        concatParts.push(part3Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }

      if (concatParts.length === 0) {
        throw new Error('No valid video segments to concatenate');
      }

      const concatContent = concatParts.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      const escapedConcatFile = concatFile.replace(/"/g, '\\"');
      const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
      const concatCommand = `ffmpeg -f concat -safe 0 -i "${escapedConcatFile}" -c copy -y "${escapedOutputPath}"`;

      await execAsync(concatCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {

          }
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {

          }
        }
      }
      throw error;
    }
  }

  /**
   * Rotate/Flip video
   */
  async rotateVideo(
    videoSource: string | Buffer,
    options: { angle?: 90 | 180 | 270; flip?: 'horizontal' | 'vertical' | 'both'; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const filters: string[] = [];

    if (options.angle) {
      const rotationMap: Record<number, string> = {
        90: 'transpose=1',
        180: 'transpose=1,transpose=1',
        270: 'transpose=2'
      };
      filters.push(rotationMap[options.angle]);
    }

    if (options.flip) {
      if (options.flip === 'horizontal') {
        filters.push('hflip');
      } else if (options.flip === 'vertical') {
        filters.push('vflip');
      } else if (options.flip === 'both') {
        filters.push('hflip', 'vflip');
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Crop video
   */
  async cropVideo(
    videoSource: string | Buffer,
    options: { x: number; y: number; width: number; height: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "crop=${options.width}:${options.height}:${options.x}:${options.y}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Compress/Optimize video
   */
  async compressVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; quality?: 'low' | 'medium' | 'high' | 'ultra'; targetSize?: number; maxBitrate?: number }
  ): Promise<{ outputPath: string; success: boolean; originalSize?: number; compressedSize?: number }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    let originalSize = 0;
    if (Buffer.isBuffer(videoSource)) {
      originalSize = videoSource.length;
    } else {
      originalSize = fs.statSync(videoPath).size;
    }

    const qualityPresets: Record<string, string> = {
      low: '-crf 32 -preset fast',
      medium: '-crf 28 -preset medium',
      high: '-crf 23 -preset slow',
      ultra: '-crf 18 -preset veryslow'
    };

    let qualityFlag = qualityPresets[options.quality || 'medium'];

    if (options.maxBitrate) {
      qualityFlag = `-b:v ${options.maxBitrate}k -maxrate ${options.maxBitrate}k -bufsize ${options.maxBitrate * 2}k`;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${qualityFlag} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      const compressedSize = fs.existsSync(options.outputPath) ? fs.statSync(options.outputPath).size : 0;

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return {
        outputPath: options.outputPath,
        success: true,
        originalSize,
        compressedSize
      };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add text overlay to video
   */
  async addTextToVideo(
    videoSource: string | Buffer,
    options: {
      text: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top-center' | 'bottom-center';
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
      startTime?: number;
      endTime?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const position = options.position || 'bottom-center';
    const fontSize = options.fontSize || 24;
    const fontColor = options.fontColor || 'white';
    const bgColor = options.backgroundColor || 'black@0.5';

    const positionMap: Record<string, string> = {
      'top-left': `x=10:y=10`,
      'top-center': `x=(w-text_w)/2:y=10`,
      'top-right': `x=w-text_w-10:y=10`,
      'center': `x=(w-text_w)/2:y=(h-text_h)/2`,
      'bottom-left': `x=10:y=h-text_h-10`,
      'bottom-center': `x=(w-text_w)/2:y=h-text_h-10`,
      'bottom-right': `x=w-text_w-10:y=h-text_h-10`
    };

    const pos = positionMap[position];
    const textEscaped = options.text.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const timeFilter = options.startTime !== undefined && options.endTime !== undefined
      ? `:enable='between(t,${options.startTime},${options.endTime})'`
      : '';

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "drawtext=text='${textEscaped}':fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${bgColor}:${pos}${timeFilter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Create video from frames/images
   */
  async createVideoFromFrames(
    options: {
      frames: Array<string | Buffer>;
      outputPath: string;
      fps?: number;
      format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      bitrate?: number;
      resolution?: { width: number; height: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    if (!options.frames || options.frames.length === 0) {
      throw new Error('createFromFrames: At least one frame is required');
    }

    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fps = options.fps || 30;
    const format = options.format || 'mp4';
    const qualityPresets: Record<string, string> = {
      low: '-crf 28',
      medium: '-crf 23',
      high: '-crf 18',
      ultra: '-crf 15'
    };
    const qualityFlag = options.bitrate
      ? `-b:v ${options.bitrate}k`
      : qualityPresets[options.quality || 'medium'];

    const framePaths: string[] = [];
    const tempFiles: string[] = [];
    const frameSequenceDir = path.join(frameDir, `frames-${timestamp}`);

    try {

      let frameWidth: number | undefined;
      let frameHeight: number | undefined;

      if (options.resolution) {
        frameWidth = options.resolution.width;
        frameHeight = options.resolution.height;
      } else {

        const firstFrame = options.frames[0];
        let firstFramePath: string;

        if (Buffer.isBuffer(firstFrame)) {
          firstFramePath = path.join(frameDir, `frame-${timestamp}-0.png`);
          fs.writeFileSync(firstFramePath, firstFrame);
          tempFiles.push(firstFramePath);
        } else {
          let resolvedPath = firstFrame;
          if (!/^https?:\/\//.test(resolvedPath)) {
            resolvedPath = path.join(process.cwd(), resolvedPath);
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Frame file not found: ${firstFrame}`);
          }
          firstFramePath = resolvedPath;
        }

        try {
          const { loadImage } = await import('@napi-rs/canvas');
          const img = await loadImage(firstFramePath);
          frameWidth = img.width;
          frameHeight = img.height;
        } catch {

          const escapedPath = firstFramePath.replace(/"/g, '\\"');
          try {
            const { stdout } = await execAsync(
              `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of default=noprint_wrappers=1:nokey=1 "${escapedPath}"`,
              { timeout: 10000, maxBuffer: 1024 * 1024 }
            );
            const [w, h] = stdout.toString().trim().split('\n').map(Number);
            if (w && h) {
              frameWidth = w;
              frameHeight = h;
            }
          } catch {
            throw new Error('Could not determine frame dimensions. Please specify resolution.');
          }
        }
      }

      if (!fs.existsSync(frameSequenceDir)) {
        fs.mkdirSync(frameSequenceDir, { recursive: true });
      }

      for (let i = 0; i < options.frames.length; i++) {
        const frame = options.frames[i];
        let frameBuffer: Buffer;

        if (Buffer.isBuffer(frame)) {
          frameBuffer = frame;
        } else {
          let resolvedPath = frame;
          if (!/^https?:\/\//.test(resolvedPath)) {
            resolvedPath = path.join(process.cwd(), resolvedPath);
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Frame file not found: ${frame}`);
          }
          frameBuffer = fs.readFileSync(resolvedPath);
        }

        const frameNumber = i.toString().padStart(6, '0');
        const framePath = path.join(frameSequenceDir, `frame-${frameNumber}.png`);
        fs.writeFileSync(framePath, frameBuffer);
        tempFiles.push(framePath);
        framePaths.push(framePath);
      }

      const patternPath = path.join(frameSequenceDir, 'frame-%06d.png').replace(/\\/g, '/');
      const escapedPattern = patternPath.replace(/"/g, '\\"');
      const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

      const resolutionFlag = frameWidth && frameHeight
        ? `-vf scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2`
        : '';

      const command = `ffmpeg -framerate ${fps} -i "${escapedPattern}" ${resolutionFlag} ${qualityFlag} -pix_fmt yuv420p -y "${escapedOutputPath}"`;

      await execAsync(command, {
timeout: 600000,
        maxBuffer: 10 * 1024 * 1024
      });

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {

          }
        }
      }

      if (fs.existsSync(frameSequenceDir)) {
        try {
          fs.rmSync(frameSequenceDir, { recursive: true, force: true });
        } catch {

        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {

          }
        }
      }

      if (fs.existsSync(frameSequenceDir)) {
        try {
          fs.rmSync(frameSequenceDir, { recursive: true, force: true });
        } catch {

        }
      }
      throw error;
    }
  }

  /**
   * Add fade effects to video
   */
  async addFadeToVideo(
    videoSource: string | Buffer,
    options: { fadeIn?: number; fadeOut?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const videoInfo = await this.deps.getVideoInfo(videoPath, true);
    const duration = videoInfo?.duration || 0;

    const filters: string[] = [];

    if (options.fadeIn) {
      filters.push(`fade=t=in:st=0:d=${options.fadeIn}`);
    }

    if (options.fadeOut && duration > options.fadeOut) {
      filters.push(`fade=t=out:st=${duration - options.fadeOut}:d=${options.fadeOut}`);
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Reverse video playback
   */
  async reverseVideo(
    videoSource: string | Buffer,
    options: { outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf reverse -af areverse -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Create seamless video loop
   */
  async createVideoLoop(
    videoSource: string | Buffer,
    options: { outputPath: string; smooth?: boolean }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const concatFile = path.join(frameDir, `loop-${timestamp}.txt`);
    const concatContent = `file '${videoPath.replace(/'/g, "\\'")}'\nfile '${videoPath.replace(/'/g, "\\'")}'`;
    fs.writeFileSync(concatFile, concatContent);

    const command = `ffmpeg -f concat -safe 0 -i "${concatFile.replace(/"/g, '\\"')}" -c copy -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });

      if (fs.existsSync(concatFile)) {
        fs.unlinkSync(concatFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (fs.existsSync(concatFile)) {
        fs.unlinkSync(concatFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Batch process multiple videos
   */
  async batchProcessVideos(
    options: { videos: Array<{ source: string | Buffer; operations: any }>; outputDirectory: string }
  ): Promise<Array<{ source: string; output: string; success: boolean }>> {
    if (!fs.existsSync(options.outputDirectory)) {
      fs.mkdirSync(options.outputDirectory, { recursive: true });
    }

    const results: Array<{ source: string; output: string; success: boolean }> = [];

    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      const outputPath = path.join(options.outputDirectory, `batch-${i + 1}.mp4`);

      try {

        await this.deps.createVideo({
          source: video.source,
          ...video.operations
        });

        results.push({
          source: typeof video.source === 'string' ? video.source : 'buffer',
          output: outputPath,
          success: true
        });
      } catch (error) {
        results.push({
          source: typeof video.source === 'string' ? video.source : 'buffer',
          output: outputPath,
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Detect scene changes in video
   */
  async detectVideoScenes(
    videoSource: string | Buffer,
    options: { threshold?: number; outputPath?: string }
  ): Promise<Array<{ time: number; scene: number }>> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const threshold = options.threshold || 0.3;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const sceneFile = path.join(frameDir, `scenes-${timestamp}.txt`);

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 | grep "pts_time" | awk '{print $6}' | sed 's/time=//'`;

    try {
      const { stdout } = await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      const times = stdout.toString().trim().split('\n').filter(t => t).map(parseFloat);

      const scenes = times.map((time, index) => ({ time, scene: index + 1 }));

      if (options.outputPath && scenes.length > 0) {
        fs.writeFileSync(options.outputPath, JSON.stringify(scenes, null, 2));
      }

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (fs.existsSync(sceneFile)) {
        fs.unlinkSync(sceneFile);
      }

      return scenes;
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (fs.existsSync(sceneFile)) {
        fs.unlinkSync(sceneFile);
      }

      return [];
    }
  }

  /**
   * Stabilize video (reduce shake)
   */
  async stabilizeVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; smoothing?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const smoothing = options.smoothing || 10;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const transformsFile = path.join(frameDir, `transforms-${timestamp}.trf`);

    const analyzeCommand = `ffmpeg -i "${escapedVideoPath}" -vf vidstabdetect=shakiness=5:accuracy=15:result="${transformsFile.replace(/"/g, '\\"')}" -f null -`;

    const transformCommand = `ffmpeg -i "${escapedVideoPath}" -vf vidstabtransform=smoothing=${smoothing}:input="${transformsFile.replace(/"/g, '\\"')}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(analyzeCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      await execAsync(transformCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      if (fs.existsSync(transformsFile)) {
        fs.unlinkSync(transformsFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      const simpleCommand = `ffmpeg -i "${escapedVideoPath}" -vf "hqdn3d=4:3:6:4.5" -y "${escapedOutputPath}"`;
      try {
        await execAsync(simpleCommand, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        return { outputPath: options.outputPath, success: true };
      } catch (fallbackError) {
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        throw error;
      }
    }
  }

  /**
   * Color correct video
   */
  async colorCorrectVideo(
    videoSource: string | Buffer,
    options: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      hue?: number;
      temperature?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const filters: string[] = [];

    if (options.brightness !== undefined) {
      filters.push(`eq=brightness=${(options.brightness / 100).toFixed(2)}`);
    }
    if (options.contrast !== undefined) {
      filters.push(`eq=contrast=${1 + (options.contrast / 100)}`);
    }
    if (options.saturation !== undefined) {
      filters.push(`eq=saturation=${1 + (options.saturation / 100)}`);
    }
    if (options.hue !== undefined) {
      filters.push(`hue=h=${options.hue}`);
    }
    if (options.temperature !== undefined) {

      const temp = options.temperature;
      if (temp > 0) {
        filters.push(`colorbalance=rs=${temp/100}:gs=-${temp/200}:bs=-${temp/100}`);
      } else {
        filters.push(`colorbalance=rs=${temp/100}:gs=${-temp/200}:bs=${-temp/100}`);
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add picture-in-picture
   */
  async addPictureInPicture(
    videoSource: string | Buffer,
    options: {
      overlayVideo: string | Buffer;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      size?: { width: number; height: number };
      opacity?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();

    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const { videoPath: overlayPath, shouldCleanup: shouldCleanupOverlay } = await resolveVideoSource(options.overlayVideo, frameDir, timestamp + 1000);

    const position = options.position || 'bottom-right';
    const size = options.size || { width: 320, height: 180 };
    const opacity = options.opacity || 1.0;

    const positionMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'W-w-10:10',
      'bottom-left': '10:H-h-10',
      'bottom-right': 'W-w-10:H-h-10',
      'center': '(W-w)/2:(H-h)/2'
    };

    const overlay = positionMap[position];
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOverlayPath = overlayPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const filter = `[1:v]scale=${size.width}:${size.height},format=rgba,colorchannelmixer=aa=${opacity}[overlay];[0:v][overlay]overlay=${overlay}`;
    const command = `ffmpeg -i "${escapedVideoPath}" -i "${escapedOverlayPath}" -filter_complex "${filter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (shouldCleanupOverlay && fs.existsSync(overlayPath)) {
        fs.unlinkSync(overlayPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (shouldCleanupOverlay && fs.existsSync(overlayPath)) {
        fs.unlinkSync(overlayPath);
      }
      throw error;
    }
  }

  /**
   * Create split screen video
   */
  async createSplitScreen(
    options: {
      videos: Array<string | Buffer>;
      layout?: 'side-by-side' | 'top-bottom' | 'grid';
      grid?: { cols: number; rows: number };
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const videoPaths: string[] = [];
    const shouldCleanup: boolean[] = [];

    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      if (Buffer.isBuffer(video)) {
        const tempPath = path.join(frameDir, `temp-video-${timestamp}-${i}.mp4`);
        fs.writeFileSync(tempPath, video);
        videoPaths.push(tempPath);
        shouldCleanup.push(true);
      } else {
        let resolvedPath = video;
        if (!/^https?:\/\//.test(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found: ${video}`);
        }
        videoPaths.push(resolvedPath);
        shouldCleanup.push(false);
      }
    }

    const layout = options.layout || 'side-by-side';
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
    const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));

    let command: string;

    if (layout === 'side-by-side' && videoPaths.length >= 2) {
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (layout === 'top-bottom' && videoPaths.length >= 2) {
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -filter_complex "[0:v][1:v]vstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (layout === 'grid' && videoPaths.length >= 4) {
      const grid = options.grid || { cols: 2, rows: 2 };

      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -i "${escapedPaths[2]}" -i "${escapedPaths[3]}" -filter_complex "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else {
      throw new Error(`Invalid layout or insufficient videos for ${layout}`);
    }

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      throw error;
    }
  }

  /**
   * Create time-lapse video
   */
  async createTimeLapseVideo(
    videoSource: string | Buffer,
    options: { speed?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const speed = options.speed || 10;

    return await this.changeVideoSpeed(videoSource, { speed, outputPath: options.outputPath });
  }

  /**
   * Mute video (remove audio) - supports full mute or partial mute with time ranges
   */
  async muteVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; ranges?: Array<{ start: number; end: number }> }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    let command: string;

    if (options.ranges && options.ranges.length > 0) {

      const volumeFilters = options.ranges.map(range =>
        `volume=enable='between(t,${range.start},${range.end})':volume=0`
      ).join(',');
      command = `ffmpeg -i "${escapedVideoPath}" -af "${volumeFilters}" -y "${escapedOutputPath}"`;
    } else {

      command = `ffmpeg -i "${escapedVideoPath}" -an -y "${escapedOutputPath}"`;
    }

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Adjust video volume
   */
  async adjustVideoVolume(
    videoSource: string | Buffer,
    options: { volume?: number; outputPath: string; ranges?: Array<{ start: number; end: number; volume: number }> }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    let command: string;

    if (options.ranges && options.ranges.length > 0) {

      const volumeFilters = options.ranges.map(range => {
        const volumeMultiplier = range.volume / 100;
        return `volume=enable='between(t,${range.start},${range.end})':volume=${volumeMultiplier}`;
      }).join(',');
      command = `ffmpeg -i "${escapedVideoPath}" -af "${volumeFilters}" -y "${escapedOutputPath}"`;
    } else {

      const volumeMultiplier = (options.volume || 100) / 100;
      command = `ffmpeg -i "${escapedVideoPath}" -af "volume=${volumeMultiplier}" -y "${escapedOutputPath}"`;
    }

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Freeze video frame at specific time
   */
  async freezeVideoFrame(
    videoSource: string | Buffer,
    options: { time: number; duration: number; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const videoInfo = await this.deps.getVideoInfo(videoPath, true);
    if (!videoInfo) {
      throw new Error('Failed to get video information');
    }

    if (options.time < 0 || options.time > videoInfo.duration) {
      throw new Error(`Freeze time (${options.time}s) is outside video duration (${videoInfo.duration}s)`);
    }

    try {

      const freezeFramePath = path.join(frameDir, `freeze-frame-${timestamp}.png`);
      const escapedVideoPath = videoPath.replace(/"/g, '\\"');
      const escapedFramePath = freezeFramePath.replace(/"/g, '\\"');

      await execAsync(
        `ffmpeg -i "${escapedVideoPath}" -ss ${options.time} -vframes 1 -y "${escapedFramePath}"`,
        { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
      );

      const part1Path = path.join(frameDir, `part1-${timestamp}.mp4`);
      const freezePartPath = path.join(frameDir, `freeze-part-${timestamp}.mp4`);
      const part3Path = path.join(frameDir, `part3-${timestamp}.mp4`);
      const concatFile = path.join(frameDir, `concat-${timestamp}.txt`);

      const escapedPart1 = part1Path.replace(/"/g, '\\"');
      const escapedFreeze = freezePartPath.replace(/"/g, '\\"');
      const escapedPart3 = part3Path.replace(/"/g, '\\"');
      const escapedOutput = options.outputPath.replace(/"/g, '\\"');

      if (options.time > 0) {
        await execAsync(
          `ffmpeg -i "${escapedVideoPath}" -t ${options.time} -c copy -y "${escapedPart1}"`,
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
        );
      }

      await execAsync(
        `ffmpeg -loop 1 -i "${escapedFramePath}" -t ${options.duration} -c:v libx264 -pix_fmt yuv420p -y "${escapedFreeze}"`,
        { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
      );

      const remainingDuration = videoInfo.duration - options.time;
      if (remainingDuration > 0) {
        await execAsync(
          `ffmpeg -i "${escapedVideoPath}" -ss ${options.time} -c copy -y "${escapedPart3}"`,
          { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }
        );
      }

      const concatParts: string[] = [];
      if (options.time > 0 && fs.existsSync(part1Path)) {
        concatParts.push(part1Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }
      if (fs.existsSync(freezePartPath)) {
        concatParts.push(freezePartPath.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }
      if (remainingDuration > 0 && fs.existsSync(part3Path)) {
        concatParts.push(part3Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }

      const concatContent = concatParts.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      const escapedConcat = concatFile.replace(/"/g, '\\"');
      await this.executeFFmpegWithProgress(
        `ffmpeg -f concat -safe 0 -i "${escapedConcat}" -c copy -y "${escapedOutput}"`,
        { timeout: 600000, maxBuffer: 20 * 1024 * 1024 },
        onProgress
      );

      const tempFiles = [freezeFramePath, part1Path, freezePartPath, part3Path, concatFile];
      for (const file of tempFiles) {
        if (fs.existsSync(file)) {
          try { fs.unlinkSync(file); } catch {}
        }
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Export video with preset settings
   */
  async exportVideoPreset(
    videoSource: string | Buffer,
    options: { preset: string; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const presets: Record<string, { resolution: { width: number; height: number }; fps: number; bitrate: number; format: string }> = {
      youtube: { resolution: { width: 1920, height: 1080 }, fps: 30, bitrate: 8000, format: 'mp4' },
      instagram: { resolution: { width: 1080, height: 1080 }, fps: 30, bitrate: 3500, format: 'mp4' },
      tiktok: { resolution: { width: 1080, height: 1920 }, fps: 30, bitrate: 4000, format: 'mp4' },
      twitter: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 5000, format: 'mp4' },
      facebook: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 4000, format: 'mp4' },
      '4k': { resolution: { width: 3840, height: 2160 }, fps: 30, bitrate: 50000, format: 'mp4' },
      '1080p': { resolution: { width: 1920, height: 1080 }, fps: 30, bitrate: 8000, format: 'mp4' },
      '720p': { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 5000, format: 'mp4' },
      mobile: { resolution: { width: 720, height: 1280 }, fps: 30, bitrate: 2500, format: 'mp4' },
      web: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 3000, format: 'webm' }
    };

    const preset = presets[options.preset.toLowerCase()];
    if (!preset) {
      throw new Error(`Unknown export preset: ${options.preset}`);
    }

    return await this.convertVideo(videoSource, {
      outputPath: options.outputPath,
      format: preset.format as any,
      quality: 'high',
      bitrate: preset.bitrate,
      fps: preset.fps,
      resolution: preset.resolution
    });
  }

  /**
   * Normalize audio levels
   */
  async normalizeVideoAudio(
    videoSource: string | Buffer,
    options: { targetLevel?: number; method?: 'peak' | 'rms' | 'lufs'; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const method = options.method || 'lufs';
    const targetLevel = options.targetLevel || (method === 'lufs' ? -23 : -1);
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    let command: string;
    if (method === 'lufs') {

      command = `ffmpeg -i "${escapedVideoPath}" -af "loudnorm=I=${targetLevel}:TP=-1.5:LRA=11" -c:v copy -y "${escapedOutputPath}"`;
    } else if (method === 'peak') {

      command = `ffmpeg -i "${escapedVideoPath}" -af "volume=${targetLevel}dB" -c:v copy -y "${escapedOutputPath}"`;
    } else {

      command = `ffmpeg -i "${escapedVideoPath}" -af "volume=${targetLevel}dB" -c:v copy -y "${escapedOutputPath}"`;
    }

    try {
      await this.executeFFmpegWithProgress(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, onProgress);
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Apply LUT (Look-Up Table) to video
   */
  async applyLUTToVideo(
    videoSource: string | Buffer,
    options: { lutPath: string; intensity?: number; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    let lutPath = options.lutPath;
    if (!/^https?:\/\//.test(lutPath)) {
      lutPath = path.join(process.cwd(), lutPath);
    }
    if (!fs.existsSync(lutPath)) {
      throw new Error(`LUT file not found: ${options.lutPath}`);
    }

    const intensity = options.intensity ?? 1.0;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedLutPath = lutPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "lut3d='${escapedLutPath}',format=yuv420p" -c:v libx264 -crf 18 -y "${escapedOutputPath}"`;

    try {
      await this.executeFFmpegWithProgress(command, { timeout: 600000, maxBuffer: 10 * 1024 * 1024 }, onProgress);
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add video transition between two videos
   */
  async addVideoTransition(
    videoSource: string | Buffer,
    options: { type: string; duration: number; direction?: string; secondVideo?: string | Buffer; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    if (!options.secondVideo && options.type !== 'fade') {
      throw new Error('addTransition: secondVideo is required for transition types other than fade');
    }

    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();

    const { videoPath: video1Path, shouldCleanup: shouldCleanup1 } = await resolveVideoSource(videoSource, frameDir, timestamp);

    let video2Path: string | undefined;
    let shouldCleanup2 = false;
    if (options.secondVideo) {
      const { videoPath: video2PathResolved, shouldCleanup: shouldCleanup2Value } = await resolveVideoSource(options.secondVideo, frameDir, timestamp + 1000);
      video2Path = video2PathResolved;
      shouldCleanup2 = shouldCleanup2Value;
    }

    const video1Info = await this.deps.getVideoInfo(video1Path, true);
    if (!video1Info) {
      throw new Error('Failed to get video information');
    }

    const width = video1Info.width;
    const height = video1Info.height;

    const escapedVideo1 = video1Path.replace(/"/g, '\\"');
    const escapedOutput = options.outputPath.replace(/"/g, '\\"');

    if (options.type === 'fade' && !options.secondVideo) {

      const fadeType = options.direction === 'out' ? 'fade=t=out' : 'fade=t=in';
      const command = `ffmpeg -i "${escapedVideo1}" -vf "${fadeType}:st=0:d=${options.duration}" -c:a copy -y "${escapedOutput}"`;

      try {
        await this.executeFFmpegWithProgress(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, onProgress);
        if (shouldCleanup1 && fs.existsSync(video1Path)) {
          fs.unlinkSync(video1Path);
        }
        return { outputPath: options.outputPath, success: true };
      } catch (error) {
        if (shouldCleanup1 && fs.existsSync(video1Path)) {
          fs.unlinkSync(video1Path);
        }
        throw error;
      }
    }

    if (!video2Path) {
      throw new Error('Second video is required for this transition type');
    }

    const video2Info = await this.deps.getVideoInfo(video2Path, true);
    if (!video2Info) {
      throw new Error('Failed to get second video information');
    }

    const finalWidth = Math.max(width, video2Info.width);
    const finalHeight = Math.max(height, video2Info.height);

    const escapedVideo2 = video2Path.replace(/"/g, '\\"');

    const xfadeTypes: Record<string, string> = {
      fade: 'fade',
      wipe: 'wipeleft',
      slide: 'slideleft',
      zoom: 'zoom',
      rotate: 'rotate',
      dissolve: 'fade',
      blur: 'fade',
      circle: 'circleopen',
      pixelize: 'pixelize'
    };

    let xfadeType = xfadeTypes[options.type] || 'fade';

    if (options.direction) {
      const dirMap: Record<string, Record<string, string>> = {
        wipe: { left: 'wipeleft', right: 'wiperight', up: 'wipeup', down: 'wipedown' },
        slide: { left: 'slideleft', right: 'slideright', up: 'slideup', down: 'slidedown' },
        zoom: { in: 'zoomin', out: 'zoomout' }
      };

      if (dirMap[options.type] && dirMap[options.type][options.direction]) {
        xfadeType = dirMap[options.type][options.direction];
      }
    }

    const transitionOffset = video1Info.duration - options.duration;

    const command = `ffmpeg -i "${escapedVideo1}" -i "${escapedVideo2}" -filter_complex "[0:v]scale=${finalWidth}:${finalHeight}[v0];[1:v]scale=${finalWidth}:${finalHeight}[v1];[v0][v1]xfade=transition=${xfadeType}:duration=${options.duration}:offset=${transitionOffset}[v]" -map "[v]" -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a copy -y "${escapedOutput}"`;

    try {
      await this.executeFFmpegWithProgress(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 }, onProgress);

      if (shouldCleanup1 && fs.existsSync(video1Path)) {
        fs.unlinkSync(video1Path);
      }
      if (shouldCleanup2 && fs.existsSync(video2Path)) {
        fs.unlinkSync(video2Path);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanup1 && fs.existsSync(video1Path)) {
        fs.unlinkSync(video1Path);
      }
      if (shouldCleanup2 && fs.existsSync(video2Path)) {
        fs.unlinkSync(video2Path);
      }
      throw error;
    }
  }

  /**
   * Add animated text to video
   */
  async addAnimatedTextToVideo(
    videoSource: string | Buffer,
    options: {
      text: string;
      animation?: string;
      startTime: number;
      endTime: number;
      position?: { x: number; y: number } | string;
      fontSize?: number;
      fontColor?: string;
      fontPath?: string;
      fontName?: string;
      fontFamily?: string;
      backgroundColor?: string;
      outputPath: string;
    },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const { videoPath, shouldCleanup: shouldCleanupVideo } = await resolveVideoSource(videoSource, frameDir, timestamp);

    const fontSize = options.fontSize || 24;
    const fontColor = options.fontColor || 'white';
    const bgColor = options.backgroundColor || 'black@0.5';
    const animation = options.animation || 'none';
    const duration = options.endTime - options.startTime;

    let positionStr: string;
    if (typeof options.position === 'string') {
      const positionMap: Record<string, string> = {
        'top-left': 'x=10:y=10',
        'top-center': 'x=(w-text_w)/2:y=10',
        'top-right': 'x=w-text_w-10:y=10',
        'center': 'x=(w-text_w)/2:y=(h-text_h)/2',
        'bottom-left': 'x=10:y=h-text_h-10',
        'bottom-center': 'x=(w-text_w)/2:y=h-text_h-10',
        'bottom-right': 'x=w-text_w-10:y=h-text_h-10'
      };
      positionStr = positionMap[options.position] || positionMap['bottom-center'];
    } else {
      positionStr = `x=${options.position?.x || 10}:y=${options.position?.y || 10}`;
    }

    let animationFilter = '';
    if (animation === 'fade') {
      animationFilter = `:alpha='if(lt(t,${options.startTime}),0,if(lt(t,${options.startTime}+1), (t-${options.startTime})/1, if(lt(t,${options.endTime}-1), 1, if(lt(t,${options.endTime}), (${options.endTime}-t)/1, 0))))'`;
    } else if (animation === 'slide') {
      animationFilter = `:x='if(lt(t,${options.startTime}),-text_w,if(lt(t,${options.startTime}+1), (w-text_w)*(t-${options.startTime})/1, if(lt(t,${options.endTime}-1), w-text_w-10, if(lt(t,${options.endTime}), w-text_w-10+(w)*(t-${options.endTime})/1, w))))'`;
    }

    const textEscaped = options.text.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const drawtextFilter = `drawtext=text='${textEscaped}':fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${bgColor}:${positionStr}${animationFilter}:enable='between(t,${options.startTime},${options.endTime})'`;
    const command = `ffmpeg -i "${escapedVideoPath}" -vf "${drawtextFilter}" -y "${escapedOutputPath}"`;

    try {
      await this.executeFFmpegWithProgress(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, onProgress);
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }
}

