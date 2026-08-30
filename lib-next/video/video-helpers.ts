import { createCanvas, loadImage } from "@napi-rs/canvas";
import { promises as fs } from "fs";
import path from "path";
import type { CanvasResults, VideoTextOverlayOperation } from "../types";
import { getCanvasContext } from "../core/errors";
import type { FfmpegSession } from "./ffmpeg-session";
import { createFfmpegProgressParser } from "./process-runner";
import { resolveVideoInputToPath } from "./video-input-resolve";
import {
  probeFormatDurationSeconds,
  probeHasAudioStream,
  probeImageDimensions,
} from "./ffprobe-metadata";
import { withTempWorkspace, type TempWorkspace } from "./temp-workspace";
import { writeSafeConcatList } from "./safe-concat";
import {
  buildTextOverlayFilterComplex,
  prepareTextOverlayPngs,
  validateTextOverlayOperation,
} from "./video-text-overlay-apply";

const DEFAULT_AUDIO_RATE = 48_000;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive number.`);
  return value;
}

function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number.`);
  return value;
}

function clampAudioSpeed(value: number): number {
  finite(value, "audio speed");
  return Math.min(4, Math.max(0.25, value));
}

function chainAtempoSegments(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return "";
  let f = factor;
  const parts: string[] = [];
  while (f > 2 + 1e-9) {
    parts.push("atempo=2");
    f /= 2;
  }
  while (f < 0.5 - 1e-9) {
    parts.push("atempo=0.5");
    f /= 0.5;
  }
  if (Math.abs(f - 1) > 1e-6) parts.push(`atempo=${f}`);
  return parts.join(",");
}

function buildPitchSemitonesChain(semitones: number): string {
  finite(semitones, "pitchSemitones");
  const ratio = Math.pow(2, semitones / 12);
  const tempo = chainAtempoSegments(1 / ratio);
  const rate = DEFAULT_AUDIO_RATE * ratio;
  return `asetrate=${rate},aresample=${DEFAULT_AUDIO_RATE}${tempo ? `,${tempo}` : ""}`;
}

function buildMixPitchSpeedSegment(pitchSemitones?: number, speed?: number): string {
  const parts: string[] = [];
  if (pitchSemitones != null && pitchSemitones !== 0) parts.push(buildPitchSemitonesChain(pitchSemitones));
  if (speed != null && speed !== 1) {
    const tempo = chainAtempoSegments(clampAudioSpeed(speed));
    if (tempo) parts.push(tempo);
  }
  return parts.join(",");
}

function qualityArgs(quality: string | undefined, bitrate?: number): string[] {
  if (bitrate !== undefined) return ["-b:v", `${positive(bitrate, "bitrate")}k`];
  const crf: Record<string, string> = { low: "28", medium: "23", high: "18", ultra: "15" };
  return ["-crf", crf[quality || "medium"] || "23"];
}

function positionCoordinates(
  position: string | undefined,
  width: number,
  height: number
): { x: number; y: number; textAlign: "left" | "center" | "right"; textBaseline: "top" | "middle" | "bottom" } {
  switch (position) {
    case "top-left": return { x: 10, y: 10, textAlign: "left", textBaseline: "top" };
    case "top-right": return { x: width - 10, y: 10, textAlign: "right", textBaseline: "top" };
    case "top-center": return { x: width / 2, y: 10, textAlign: "center", textBaseline: "top" };
    case "center": return { x: width / 2, y: height / 2, textAlign: "center", textBaseline: "middle" };
    case "bottom-left": return { x: 10, y: height - 10, textAlign: "left", textBaseline: "bottom" };
    case "bottom-right": return { x: width - 10, y: height - 10, textAlign: "right", textBaseline: "bottom" };
    default: return { x: width / 2, y: height - 10, textAlign: "center", textBaseline: "bottom" };
  }
}

export interface VideoHelpersDependencies {
  checkFFmpegAvailable: () => Promise<boolean>;
  getFFmpegInstallInstructions: () => string;
  getVideoInfo: (videoSource: string | Buffer, skipFFmpegCheck?: boolean) => Promise<any>;
  extractVideoFrame: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: "jpg" | "png",
    quality?: number
  ) => Promise<Buffer | null>;
  createVideo: (options: any) => Promise<any>;
}

/**
 * Video operation implementation. All FFmpeg/ffprobe processes use the shared MediaProcessRunner,
 * all transient files live in operation-isolated TempWorkspace instances, and cleanup is automatic.
 */
export class VideoHelpers {
  constructor(
    private readonly deps: VideoHelpersDependencies,
    private readonly session: FfmpegSession
  ) {}

  private runFfmpeg(
    args: readonly string[],
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void,
    cwd?: string
  ) {
    return this.session.runFfmpeg(args, {
      cwd,
      onStderr: createFfmpegProgressParser(onProgress),
    });
  }

  private withWorkspace<T>(prefix: string, work: (workspace: TempWorkspace) => Promise<T>): Promise<T> {
    return withTempWorkspace({ ...this.session.workspaceOptions, prefix }, work);
  }

  async generateVideoThumbnail(
    videoSource: string | Buffer,
    options: {
      count?: number;
      grid?: { cols: number; rows: number };
      width?: number;
      height?: number;
      outputFormat?: "jpg" | "png";
      quality?: number;
    },
    videoInfo: any
  ): Promise<CanvasResults> {
    const count = Math.max(1, Math.floor(options.count ?? 9));
    const grid = options.grid ?? { cols: 3, rows: 3 };
    const frameWidth = positive(options.width ?? 320, "thumbnail width");
    const frameHeight = positive(options.height ?? 180, "thumbnail height");
    const outputFormat = options.outputFormat ?? "jpg";
    const quality = options.quality ?? 2;
    if (!videoInfo) videoInfo = await this.deps.getVideoInfo(videoSource, true);
    const duration = positive(videoInfo?.duration, "video duration");
    const interval = duration / (count + 1);
    const frames: Buffer[] = [];
    for (let i = 1; i <= count; i++) {
      const frame = await this.deps.extractVideoFrame(videoSource, 0, interval * i, outputFormat, quality);
      if (frame) frames.push(frame);
    }

    const thumbnailWidth = frameWidth * positive(grid.cols, "grid cols");
    const thumbnailHeight = frameHeight * positive(grid.rows, "grid rows");
    const canvas = createCanvas(thumbnailWidth, thumbnailHeight);
    const ctx = getCanvasContext(canvas);
    for (let i = 0; i < frames.length; i++) {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const frameImage = await loadImage(frames[i]);
      ctx.drawImage(frameImage, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
    }
    return { buffer: canvas.toBuffer("image/png"), canvas: { width: thumbnailWidth, height: thumbnailHeight } };
  }

  async convertVideo(
    videoSource: string | Buffer,
    options: {
      outputPath: string;
      format?: "mp4" | "webm" | "avi" | "mov" | "mkv";
      quality?: "low" | "medium" | "high" | "ultra";
      bitrate?: number;
      fps?: number;
      resolution?: { width: number; height: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-convert-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
      const args = ["-i", videoPath, ...qualityArgs(options.quality, options.bitrate)];
      if (options.fps !== undefined) args.push("-r", String(positive(options.fps, "fps")));
      if (options.resolution) {
        args.push("-vf", `scale=${positive(options.resolution.width, "resolution width")}:${positive(options.resolution.height, "resolution height")}`);
      }
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async trimVideo(
    videoSource: string | Buffer,
    options: { startTime: number; endTime: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const start = nonNegative(options.startTime, "trim startTime");
    const end = positive(options.endTime, "trim endTime");
    if (end <= start) throw new Error("trimVideo: endTime must be greater than startTime.");
    return this.withWorkspace("apexify-trim-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
      await this.runFfmpeg(["-i", videoPath, "-ss", String(start), "-t", String(end - start), "-c", "copy", "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async extractAudio(
    videoSource: string | Buffer,
    options: { outputPath: string; format?: "mp3" | "wav" | "aac" | "ogg"; bitrate?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-audio-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
      if (!(await probeHasAudioStream(videoPath, this.session))) {
        throw new Error("Video does not contain an audio stream. Cannot extract audio.");
      }
      const format = options.format ?? "mp3";
      const codecs: Record<string, string> = { mp3: "libmp3lame", wav: "pcm_s16le", aac: "aac", ogg: "libvorbis" };
      await this.runFfmpeg([
        "-i", videoPath, "-vn", "-acodec", codecs[format] || "libmp3lame",
        "-ab", `${positive(options.bitrate ?? 128, "audio bitrate")}k`, "-y", options.outputPath,
      ]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async addWatermarkToVideo(
    videoSource: string | Buffer,
    options: {
      watermarkPath: string;
      position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
      opacity?: number;
      size?: { width: number; height: number };
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-watermark-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "video");
      const { videoPath: watermarkPath } = await resolveVideoInputToPath(options.watermarkPath, workspace, "watermark");
      const opacity = finite(options.opacity ?? 0.5, "watermark opacity");
      if (opacity < 0 || opacity > 1) throw new Error("watermark opacity must be between 0 and 1.");
      const positionMap: Record<string, string> = {
        "top-left": "10:10", "top-right": "W-w-10:10", "bottom-left": "10:H-h-10",
        "bottom-right": "W-w-10:H-h-10", center: "(W-w)/2:(H-h)/2",
      };
      const size = options.size
        ? `scale=${positive(options.size.width, "watermark width")}:${positive(options.size.height, "watermark height")},`
        : "";
      const filter = `[1:v]${size}format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${positionMap[options.position || "bottom-right"]}`;
      await this.runFfmpeg(["-i", videoPath, "-i", watermarkPath, "-filter_complex", filter, "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async changeVideoSpeed(
    videoSource: string | Buffer,
    options: { speed: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const speed = positive(options.speed, "video speed");
    return this.withWorkspace("apexify-speed-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
      const hasAudio = await probeHasAudioStream(videoPath, this.session);
      const video = `setpts=${1 / speed}*PTS`;
      if (hasAudio) {
        const audio = chainAtempoSegments(speed) || "anull";
        await this.runFfmpeg([
          "-i", videoPath, "-filter_complex", `[0:v]${video}[v];[0:a]${audio}[a]`,
          "-map", "[v]", "-map", "[a]", "-y", options.outputPath,
        ]);
      } else {
        await this.runFfmpeg(["-i", videoPath, "-vf", video, "-an", "-y", options.outputPath]);
      }
      return { outputPath: options.outputPath, success: true };
    });
  }

  async generateVideoPreview(
    videoSource: string | Buffer,
    options: { count?: number; outputDirectory?: string; outputFormat?: "jpg" | "png"; quality?: number },
    videoInfo: any
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    const count = Math.max(1, Math.floor(options.count ?? 10));
    const outputDir = options.outputDirectory
      ? (path.isAbsolute(options.outputDirectory) ? options.outputDirectory : path.resolve(process.cwd(), options.outputDirectory))
      : path.resolve(process.cwd(), "video-preview");
    await fs.mkdir(outputDir, { recursive: true });
    if (!videoInfo) videoInfo = await this.deps.getVideoInfo(videoSource, true);
    const duration = positive(videoInfo?.duration, "video duration");
    const interval = duration / (count + 1);
    const frames: Array<{ source: string; frameNumber: number; time: number }> = [];
    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const buffer = await this.deps.extractVideoFrame(videoSource, 0, time, options.outputFormat ?? "png", options.quality ?? 2);
      if (!buffer) continue;
      const framePath = path.join(outputDir, `preview-${String(i).padStart(3, "0")}.${options.outputFormat ?? "png"}`);
      await fs.writeFile(framePath, buffer);
      frames.push({ source: framePath, frameNumber: i, time });
    }
    return frames;
  }

  async applyVideoEffects(
    videoSource: string | Buffer,
    options: {
      filters: Array<{ type: "blur" | "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "invert" | "sharpen" | "noise"; intensity?: number; value?: number }>;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const filters: string[] = [];
    for (const filter of options.filters) {
      const intensity = filter.intensity ?? 0;
      const value = filter.value ?? 0;
      if (filter.intensity !== undefined) finite(intensity, `${filter.type} intensity`);
      if (filter.value !== undefined) finite(value, `${filter.type} value`);
      switch (filter.type) {
        case "blur": filters.push(`boxblur=${filter.intensity ?? 5}`); break;
        case "brightness": filters.push(`eq=brightness=${(value / 100).toFixed(2)}`); break;
        case "contrast": filters.push(`eq=contrast=${1 + value / 100}`); break;
        case "saturation": filters.push(`eq=saturation=${1 + value / 100}`); break;
        case "grayscale": filters.push("hue=s=0"); break;
        case "sepia": filters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131"); break;
        case "invert": filters.push("negate"); break;
        case "sharpen": filters.push(`unsharp=5:5:${filter.intensity ?? 1}:5:5:0`); break;
        case "noise": filters.push(`noise=alls=${filter.intensity ?? 20}:allf=t+u`); break;
      }
    }
    return this.withWorkspace("apexify-effects-", async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
      const args = ["-i", videoPath];
      if (filters.length) args.push("-vf", filters.join(","));
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async mergeVideos(options: {
    videos: Array<string | Buffer>;
    outputPath: string;
    mode?: "sequential" | "side-by-side" | "grid";
    grid?: { cols: number; rows: number };
  }): Promise<{ outputPath: string; success: boolean }> {
    if (!options.videos.length) throw new Error("mergeVideos: at least one video is required.");
    return this.withWorkspace("apexify-merge-", async (workspace) => {
      const paths: string[] = [];
      for (let i = 0; i < options.videos.length; i++) {
        paths.push((await resolveVideoInputToPath(options.videos[i], workspace, `input-${i}`)).videoPath);
      }
      const mode = options.mode ?? "sequential";
      if (mode === "sequential") {
        const concatFile = await writeSafeConcatList(workspace, paths);
        await this.runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-y", options.outputPath]);
      } else if (mode === "side-by-side") {
        const a = paths[0];
        const b = paths[1] ?? paths[0];
        await this.runFfmpeg(["-i", a, "-i", b, "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", "-y", options.outputPath]);
      } else if (mode === "grid") {
        // Phase 8 owns generalized grid semantics; Phase 1 preserves the existing two-input behavior securely.
        const a = paths[0];
        const b = paths[1] ?? paths[0];
        await this.runFfmpeg(["-i", a, "-i", b, "-filter_complex", "[0:v][1:v]hstack=inputs=2[v]", "-map", "[v]", "-y", options.outputPath]);
      } else {
        throw new Error(`Unknown merge mode: ${String(mode)}`);
      }
      return { outputPath: options.outputPath, success: true };
    });
  }

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
    if ((!options.replacementVideo && !options.replacementFrames) || (options.replacementVideo && options.replacementFrames)) {
      throw new Error("replaceVideoSegment: provide exactly one of replacementVideo or replacementFrames.");
    }
    return this.withWorkspace("apexify-replace-", async (workspace) => {
      const mainPath = (await resolveVideoInputToPath(mainVideoSource, workspace, "main")).videoPath;
      const info = await this.deps.getVideoInfo(mainPath, true);
      if (!info) throw new Error("Failed to get main video information.");
      const start = nonNegative(options.targetStartTime, "targetStartTime");
      const end = positive(options.targetEndTime, "targetEndTime");
      if (end <= start || end > info.duration) throw new Error("replaceVideoSegment: target range is outside video duration.");
      const targetDuration = end - start;
      const parts: string[] = [];

      if (start > 0) {
        const p = workspace.path("part-1.mp4");
        await this.runFfmpeg(["-i", mainPath, "-t", String(start), "-c", "copy", "-y", p]);
        parts.push(p);
      }

      const replacementPath = workspace.path("replacement.mp4");
      if (options.replacementVideo) {
        const source = (await resolveVideoInputToPath(options.replacementVideo, workspace, "replacement-source")).videoPath;
        const rs = nonNegative(options.replacementStartTime ?? 0, "replacementStartTime");
        const rd = positive(options.replacementDuration ?? targetDuration, "replacementDuration");
        await this.runFfmpeg(["-i", source, "-ss", String(rs), "-t", String(rd), "-c", "copy", "-y", replacementPath]);
      } else {
        await this.createVideoFromFrames({
          frames: options.replacementFrames!, outputPath: replacementPath,
          fps: options.replacementFps ?? 30, format: "mp4", quality: "high",
        });
      }
      parts.push(replacementPath);

      const remaining = info.duration - end;
      if (remaining > 0) {
        const p = workspace.path("part-3.mp4");
        await this.runFfmpeg(["-i", mainPath, "-ss", String(end), "-t", String(remaining), "-c", "copy", "-y", p]);
        parts.push(p);
      }

      const concatFile = await writeSafeConcatList(workspace, parts, "replace-concat.txt");
      await this.runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async rotateVideo(
    videoSource: string | Buffer,
    options: { angle?: 90 | 180 | 270; flip?: "horizontal" | "vertical" | "both"; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const filters: string[] = [];
    if (options.angle === 90) filters.push("transpose=1");
    if (options.angle === 180) filters.push("transpose=1", "transpose=1");
    if (options.angle === 270) filters.push("transpose=2");
    if (options.flip === "horizontal" || options.flip === "both") filters.push("hflip");
    if (options.flip === "vertical" || options.flip === "both") filters.push("vflip");
    return this.withWorkspace("apexify-rotate-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const args = ["-i", videoPath];
      if (filters.length) args.push("-vf", filters.join(","));
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async cropVideo(
    videoSource: string | Buffer,
    options: { x: number; y: number; width: number; height: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const filter = `crop=${positive(options.width, "crop width")}:${positive(options.height, "crop height")}:${nonNegative(options.x, "crop x")}:${nonNegative(options.y, "crop y")}`;
    return this.withWorkspace("apexify-crop-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      await this.runFfmpeg(["-i", videoPath, "-vf", filter, "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async compressVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; quality?: "low" | "medium" | "high" | "ultra"; targetSize?: number; maxBitrate?: number }
  ): Promise<{ outputPath: string; success: boolean; originalSize?: number; compressedSize?: number }> {
    return this.withWorkspace("apexify-compress-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const originalSize = Buffer.isBuffer(videoSource) ? videoSource.length : (await fs.stat(videoPath)).size;
      const args = ["-i", videoPath];
      if (options.maxBitrate !== undefined) {
        const b = positive(options.maxBitrate, "maxBitrate");
        args.push("-b:v", `${b}k`, "-maxrate", `${b}k`, "-bufsize", `${b * 2}k`);
      } else {
        const presets: Record<string, string[]> = {
          low: ["-crf", "32", "-preset", "fast"], medium: ["-crf", "28", "-preset", "medium"],
          high: ["-crf", "23", "-preset", "slow"], ultra: ["-crf", "18", "-preset", "veryslow"],
        };
        args.push(...(presets[options.quality ?? "medium"] || presets.medium));
      }
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      let compressedSize = 0;
      try { compressedSize = (await fs.stat(options.outputPath)).size; } catch { /* output validation handled by FFmpeg exit */ }
      return { outputPath: options.outputPath, success: true, originalSize, compressedSize };
    });
  }

  /** Deprecated drawtext API, now implemented via canvas-rendered PNG overlays so user text never enters FFmpeg filter syntax. */
  async addTextToVideo(
    videoSource: string | Buffer,
    options: {
      text: string;
      position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center" | "top-center" | "bottom-center";
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
      startTime?: number;
      endTime?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const info = await this.deps.getVideoInfo(videoSource, true);
    if (!info?.width || !info?.height) throw new Error("addText: could not determine video dimensions.");
    const pos = positionCoordinates(options.position, info.width, info.height);
    const startTime = nonNegative(options.startTime ?? 0, "text startTime");
    const endTime = options.endTime ?? info.duration;
    positive(endTime, "text endTime");
    const overlay = {
      text: options.text,
      x: pos.x,
      y: pos.y,
      font: { size: positive(options.fontSize ?? 24, "fontSize"), family: "Arial" },
      fill: { color: options.fontColor ?? "white" },
      placement: { textAlign: pos.textAlign, textBaseline: pos.textBaseline },
      startTime,
      endTime,
    } as any;
    return this.addTextOverlayToVideo(videoSource, { overlays: [overlay], outputPath: options.outputPath });
  }

  async createVideoFromFrames(options: {
    frames: Array<string | Buffer>;
    outputPath: string;
    fps?: number;
    format?: "mp4" | "webm" | "avi" | "mov" | "mkv";
    quality?: "low" | "medium" | "high" | "ultra";
    bitrate?: number;
    resolution?: { width: number; height: number };
  }): Promise<{ outputPath: string; success: boolean }> {
    if (!options.frames?.length) throw new Error("createFromFrames: at least one frame is required.");
    const fps = positive(options.fps ?? 30, "fps");
    return this.withWorkspace("apexify-frames-video-", async (workspace) => {
      const frameDir = await workspace.ensureDirectory("frames");
      let frameWidth = options.resolution?.width;
      let frameHeight = options.resolution?.height;

      for (let i = 0; i < options.frames.length; i++) {
        const source = options.frames[i];
        let bytes: Buffer;
        if (Buffer.isBuffer(source)) {
          bytes = source;
        } else {
          if (/^https?:\/\//i.test(source)) {
            throw new Error("createFromFrames: remote frame URLs are not supported by this API; provide a Buffer or local path.");
          }
          const local = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
          bytes = await fs.readFile(local);
        }
        if (i === 0 && (!frameWidth || !frameHeight)) {
          try {
            const image = await loadImage(bytes);
            frameWidth = image.width;
            frameHeight = image.height;
          } catch {
            const temp = await workspace.writeFile("first-frame.bin", bytes);
            const dims = await probeImageDimensions(temp, this.session);
            frameWidth = dims?.width;
            frameHeight = dims?.height;
          }
        }
        await fs.writeFile(path.join(frameDir, `frame-${String(i).padStart(6, "0")}.png`), bytes);
      }

      if (!frameWidth || !frameHeight) throw new Error("Could not determine frame dimensions. Please specify resolution.");
      positive(frameWidth, "frame width");
      positive(frameHeight, "frame height");
      const filter = `scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2`;
      const pattern = path.join(frameDir, "frame-%06d.png");
      await this.runFfmpeg([
        "-framerate", String(fps), "-i", pattern, "-vf", filter,
        ...qualityArgs(options.quality, options.bitrate), "-pix_fmt", "yuv420p", "-y", options.outputPath,
      ]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async addFadeToVideo(
    videoSource: string | Buffer,
    options: { fadeIn?: number; fadeOut?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-fade-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const info = await this.deps.getVideoInfo(videoPath, true);
      const filters: string[] = [];
      if (options.fadeIn !== undefined) filters.push(`fade=t=in:st=0:d=${positive(options.fadeIn, "fadeIn")}`);
      if (options.fadeOut !== undefined) {
        const d = positive(options.fadeOut, "fadeOut");
        if (info?.duration > d) filters.push(`fade=t=out:st=${info.duration - d}:d=${d}`);
      }
      const args = ["-i", videoPath];
      if (filters.length) args.push("-vf", filters.join(","));
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async reverseVideo(videoSource: string | Buffer, options: { outputPath: string }) {
    return this.withWorkspace("apexify-reverse-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const hasAudio = await probeHasAudioStream(videoPath, this.session);
      const args = ["-i", videoPath, "-vf", "reverse"];
      if (hasAudio) args.push("-af", "areverse");
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async createVideoLoop(videoSource: string | Buffer, options: { outputPath: string; smooth?: boolean }) {
    return this.withWorkspace("apexify-loop-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const concatFile = await writeSafeConcatList(workspace, [videoPath, videoPath], "loop.txt");
      await this.runFfmpeg(["-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async batchProcessVideos(options: { videos: Array<{ source: string | Buffer; operations: any }>; outputDirectory: string }) {
    await fs.mkdir(options.outputDirectory, { recursive: true });
    const results: Array<{ source: string; output: string; success: boolean }> = [];
    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      const outputPath = path.join(options.outputDirectory, `batch-${i + 1}.mp4`);
      try {
        await this.deps.createVideo({ source: video.source, ...video.operations });
        results.push({ source: typeof video.source === "string" ? video.source : "buffer", output: outputPath, success: true });
      } catch {
        results.push({ source: typeof video.source === "string" ? video.source : "buffer", output: outputPath, success: false });
      }
    }
    return results;
  }

  async detectVideoScenes(
    videoSource: string | Buffer,
    options: { threshold?: number; outputPath?: string }
  ): Promise<Array<{ time: number; scene: number }>> {
    const threshold = finite(options.threshold ?? 0.3, "scene threshold");
    if (threshold < 0 || threshold > 1) throw new Error("scene threshold must be between 0 and 1.");
    return this.withWorkspace("apexify-scenes-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const { stderr } = await this.runFfmpeg([
        "-i", videoPath, "-vf", `select=gt(scene\\,${threshold}),showinfo`, "-f", "null", "-",
      ]);
      const times: number[] = [];
      for (const match of stderr.matchAll(/pts_time:([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi)) {
        const time = Number(match[1]);
        if (Number.isFinite(time)) times.push(time);
      }
      const scenes = times.map((time, index) => ({ time, scene: index + 1 }));
      if (options.outputPath) await fs.writeFile(options.outputPath, JSON.stringify(scenes, null, 2));
      return scenes;
    });
  }

  async stabilizeVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; smoothing?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    const smoothing = nonNegative(options.smoothing ?? 10, "stabilization smoothing");
    return this.withWorkspace("apexify-stabilize-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      try {
        await this.runFfmpeg(["-i", videoPath, "-vf", "vidstabdetect=shakiness=5:accuracy=15:result=transforms.trf", "-f", "null", "-"], undefined, workspace.directory);
        await this.runFfmpeg(["-i", videoPath, "-vf", `vidstabtransform=smoothing=${smoothing}:input=transforms.trf`, "-y", options.outputPath], undefined, workspace.directory);
      } catch {
        await this.runFfmpeg(["-i", videoPath, "-vf", "hqdn3d=4:3:6:4.5", "-y", options.outputPath]);
      }
      return { outputPath: options.outputPath, success: true };
    });
  }

  async colorCorrectVideo(
    videoSource: string | Buffer,
    options: { brightness?: number; contrast?: number; saturation?: number; hue?: number; temperature?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const filters: string[] = [];
    if (options.brightness !== undefined) filters.push(`eq=brightness=${(finite(options.brightness, "brightness") / 100).toFixed(2)}`);
    if (options.contrast !== undefined) filters.push(`eq=contrast=${1 + finite(options.contrast, "contrast") / 100}`);
    if (options.saturation !== undefined) filters.push(`eq=saturation=${1 + finite(options.saturation, "saturation") / 100}`);
    if (options.hue !== undefined) filters.push(`hue=h=${finite(options.hue, "hue")}`);
    if (options.temperature !== undefined) {
      const t = finite(options.temperature, "temperature");
      filters.push(`colorbalance=rs=${t / 100}:gs=${-t / 200}:bs=${-t / 100}`);
    }
    return this.withWorkspace("apexify-color-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const args = ["-i", videoPath];
      if (filters.length) args.push("-vf", filters.join(","));
      args.push("-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async addPictureInPicture(
    videoSource: string | Buffer,
    options: {
      overlayVideo: string | Buffer;
      position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
      size?: { width: number; height: number };
      opacity?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-pip-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "main")).videoPath;
      const overlayPath = (await resolveVideoInputToPath(options.overlayVideo, workspace, "overlay")).videoPath;
      const size = options.size ?? { width: 320, height: 180 };
      const opacity = finite(options.opacity ?? 1, "PIP opacity");
      if (opacity < 0 || opacity > 1) throw new Error("PIP opacity must be between 0 and 1.");
      const positions: Record<string, string> = {
        "top-left": "10:10", "top-right": "W-w-10:10", "bottom-left": "10:H-h-10",
        "bottom-right": "W-w-10:H-h-10", center: "(W-w)/2:(H-h)/2",
      };
      const filter = `[1:v]scale=${positive(size.width, "PIP width")}:${positive(size.height, "PIP height")},format=rgba,colorchannelmixer=aa=${opacity}[overlay];[0:v][overlay]overlay=${positions[options.position || "bottom-right"]}`;
      await this.runFfmpeg(["-i", videoPath, "-i", overlayPath, "-filter_complex", filter, "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async createSplitScreen(options: {
    videos: Array<string | Buffer>;
    layout?: "side-by-side" | "top-bottom" | "grid";
    grid?: { cols: number; rows: number };
    outputPath: string;
  }): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-split-", async (workspace) => {
      const paths: string[] = [];
      for (let i = 0; i < options.videos.length; i++) {
        paths.push((await resolveVideoInputToPath(options.videos[i], workspace, `input-${i}`)).videoPath);
      }
      const args: string[] = [];
      for (const p of paths) args.push("-i", p);
      const layout = options.layout ?? "side-by-side";
      let filter: string;
      if (layout === "side-by-side" && paths.length >= 2) filter = "[0:v][1:v]hstack=inputs=2[v]";
      else if (layout === "top-bottom" && paths.length >= 2) filter = "[0:v][1:v]vstack=inputs=2[v]";
      else if (layout === "grid" && paths.length >= 4) filter = "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[v]";
      else throw new Error(`Invalid layout or insufficient videos for ${layout}`);
      args.push("-filter_complex", filter, "-map", "[v]", "-y", options.outputPath);
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async createTimeLapseVideo(videoSource: string | Buffer, options: { speed?: number; outputPath: string }) {
    return this.changeVideoSpeed(videoSource, { speed: options.speed ?? 10, outputPath: options.outputPath });
  }

  async muteVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; ranges?: Array<{ start: number; end: number }> }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-mute-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      if (options.ranges?.length) {
        const filters = options.ranges.map((range) => {
          const start = nonNegative(range.start, "mute range start");
          const end = positive(range.end, "mute range end");
          if (end <= start) throw new Error("mute range end must be greater than start.");
          return `volume=enable='between(t,${start},${end})':volume=0`;
        });
        await this.runFfmpeg(["-i", videoPath, "-af", filters.join(","), "-c:v", "copy", "-y", options.outputPath]);
      } else {
        await this.runFfmpeg(["-i", videoPath, "-c:v", "copy", "-an", "-y", options.outputPath]);
      }
      return { outputPath: options.outputPath, success: true };
    });
  }

  async mixVideoAudio(
    videoSource: string | Buffer,
    options: {
      outputPath: string;
      overlays: Array<{
        source: string | Buffer;
        startTime: number;
        duration?: number;
        sourceStart?: number;
        volume?: number;
        speed?: number;
        pitchSemitones?: number;
      }>;
      keepOriginalAudio?: boolean;
      originalVolume?: number;
      originalSpeed?: number;
      originalPitchSemitones?: number;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    if (!options.overlays?.length) throw new Error("mixAudio: provide at least one overlay.");
    return this.withWorkspace("apexify-mix-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "video")).videoPath;
      const info = await this.deps.getVideoInfo(videoPath, true);
      const videoDuration = positive(info?.duration, "video duration");
      const mainHasAudio = await probeHasAudioStream(videoPath, this.session);
      const keepOriginal = options.keepOriginalAudio !== false;

      const prepared: Array<{ path: string; tag: string; segment: string }> = [];
      for (let i = 0; i < options.overlays.length; i++) {
        const ov = options.overlays[i];
        const media = (await resolveVideoInputToPath(ov.source, workspace, `audio-${i}`)).videoPath;
        const startTime = nonNegative(ov.startTime, "overlay startTime");
        const sourceStart = nonNegative(ov.sourceStart ?? 0, "overlay sourceStart");
        const volume = finite(ov.volume ?? 1, "overlay volume");
        const sourceDuration = await probeFormatDurationSeconds(media, this.session);
        const room = Math.max(0, videoDuration - startTime);
        const available = Math.max(0, sourceDuration - sourceStart);
        const playLen = Math.min(ov.duration ?? Math.min(available, room), available, room);
        if (playLen < 0.04) continue;
        const tag = `ov${prepared.length}`;
        const mid = buildMixPitchSpeedSegment(ov.pitchSemitones, ov.speed);
        const delay = Math.round(startTime * 1000);
        const inputIndex = prepared.length + 1;
        const segment = `[${inputIndex}:a]atrim=start=${sourceStart}:duration=${playLen},asetpts=PTS-STARTPTS,aresample=${DEFAULT_AUDIO_RATE},${mid ? `${mid},` : ""}aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${volume},adelay=${delay}|${delay}[${tag}];`;
        prepared.push({ path: media, tag, segment });
      }
      if (!prepared.length) throw new Error("mixAudio: no usable overlays.");

      const args: string[] = ["-i", videoPath];
      for (const item of prepared) args.push("-i", item.path);
      let filter = "";
      const labels: string[] = [];
      if (keepOriginal && mainHasAudio) {
        const mid = buildMixPitchSpeedSegment(options.originalPitchSemitones, options.originalSpeed);
        filter += `[0:a]aresample=${DEFAULT_AUDIO_RATE},${mid ? `${mid},` : ""}aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${finite(options.originalVolume ?? 1, "originalVolume")}[m0];`;
        labels.push("[m0]");
      }
      for (const item of prepared) {
        filter += item.segment;
        labels.push(`[${item.tag}]`);
      }
      filter += `${labels.join("")}amix=inputs=${labels.length}:duration=longest:normalize=${keepOriginal && mainHasAudio ? 1 : 0}[amixed];`;
      filter += "[amixed]alimiter=limit=0.95:attack=5:release=50[outa]";
      args.push(
        "-filter_complex", filter, "-map", "0:v", "-map", "[outa]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(videoDuration), "-y", options.outputPath
      );
      await this.runFfmpeg(args);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async adjustVideoVolume(
    videoSource: string | Buffer,
    options: {
      volume?: number;
      outputPath: string;
      ranges?: Array<{ start: number; end: number; volume: number; speed?: number; pitchSemitones?: number }>;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-volume-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      let filter: string;
      if (options.ranges?.length) {
        const segments: string[] = [];
        for (const range of options.ranges) {
          const start = nonNegative(range.start, "volume range start");
          const end = positive(range.end, "volume range end");
          if (end <= start) throw new Error("volume range end must exceed start.");
          const enable = `enable='between(t\\,${start}\\,${end})'`;
          segments.push(`volume=${enable}:volume=${finite(range.volume, "range volume") / 100}`);
          if ((range.speed != null && range.speed !== 1) || (range.pitchSemitones != null && range.pitchSemitones !== 0)) {
            const rb: string[] = [];
            if (range.speed != null && range.speed !== 1) rb.push(`tempo=${clampAudioSpeed(range.speed)}`);
            if (range.pitchSemitones != null && range.pitchSemitones !== 0) rb.push(`pitch=${finite(range.pitchSemitones, "pitchSemitones") * 100}`);
            segments.push(`rubberband=${rb.join(":")}:${enable}`);
          }
        }
        filter = segments.join(",");
      } else {
        filter = `volume=${finite(options.volume ?? 100, "volume") / 100}`;
      }
      await this.runFfmpeg(["-i", videoPath, "-af", filter, "-c:v", "copy", "-y", options.outputPath]);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async freezeVideoFrame(
    videoSource: string | Buffer,
    options: { time: number; duration: number; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const freezeTime = nonNegative(options.time, "freeze time");
    const freezeDuration = positive(options.duration, "freeze duration");
    return this.withWorkspace("apexify-freeze-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const info = await this.deps.getVideoInfo(videoPath, true);
      if (!info || freezeTime > info.duration) throw new Error("Freeze time is outside video duration.");
      const frame = workspace.path("freeze.png");
      await this.runFfmpeg(["-i", videoPath, "-ss", String(freezeTime), "-frames:v", "1", "-y", frame]);
      const parts: string[] = [];
      if (freezeTime > 0) {
        const p = workspace.path("before.mp4");
        await this.runFfmpeg(["-i", videoPath, "-t", String(freezeTime), "-c", "copy", "-y", p]);
        parts.push(p);
      }
      const frozen = workspace.path("frozen.mp4");
      await this.runFfmpeg(["-loop", "1", "-i", frame, "-t", String(freezeDuration), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", frozen]);
      parts.push(frozen);
      if (info.duration > freezeTime) {
        const p = workspace.path("after.mp4");
        await this.runFfmpeg(["-i", videoPath, "-ss", String(freezeTime), "-c", "copy", "-y", p]);
        parts.push(p);
      }
      const concat = await writeSafeConcatList(workspace, parts, "freeze-concat.txt");
      await this.runFfmpeg(["-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", "-y", options.outputPath], onProgress);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async exportVideoPreset(
    videoSource: string | Buffer,
    options: { preset: string; outputPath: string },
    _onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const presets: Record<string, { resolution: { width: number; height: number }; fps: number; bitrate: number; format: string }> = {
      youtube: { resolution: { width: 1920, height: 1080 }, fps: 30, bitrate: 8000, format: "mp4" },
      instagram: { resolution: { width: 1080, height: 1080 }, fps: 30, bitrate: 3500, format: "mp4" },
      tiktok: { resolution: { width: 1080, height: 1920 }, fps: 30, bitrate: 4000, format: "mp4" },
      twitter: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 5000, format: "mp4" },
      facebook: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 4000, format: "mp4" },
      "4k": { resolution: { width: 3840, height: 2160 }, fps: 30, bitrate: 50000, format: "mp4" },
      "1080p": { resolution: { width: 1920, height: 1080 }, fps: 30, bitrate: 8000, format: "mp4" },
      "720p": { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 5000, format: "mp4" },
      mobile: { resolution: { width: 720, height: 1280 }, fps: 30, bitrate: 2500, format: "mp4" },
      web: { resolution: { width: 1280, height: 720 }, fps: 30, bitrate: 3000, format: "webm" },
    };
    const preset = presets[options.preset.toLowerCase()];
    if (!preset) throw new Error(`Unknown export preset: ${options.preset}`);
    return this.convertVideo(videoSource, {
      outputPath: options.outputPath,
      format: preset.format as any,
      quality: "high",
      bitrate: preset.bitrate,
      fps: preset.fps,
      resolution: preset.resolution,
    });
  }

  async normalizeVideoAudio(
    videoSource: string | Buffer,
    options: { targetLevel?: number; method?: "peak" | "rms" | "lufs"; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const method = options.method ?? "lufs";
    const target = finite(options.targetLevel ?? (method === "lufs" ? -23 : -1), "targetLevel");
    const filter = method === "lufs" ? `loudnorm=I=${target}:TP=-1.5:LRA=11` : `volume=${target}dB`;
    return this.withWorkspace("apexify-normalize-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      await this.runFfmpeg(["-i", videoPath, "-af", filter, "-c:v", "copy", "-y", options.outputPath], onProgress);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async applyLUTToVideo(
    videoSource: string | Buffer,
    options: { lutPath: string; intensity?: number; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    return this.withWorkspace("apexify-lut-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const sourceLut = (await resolveVideoInputToPath(options.lutPath, workspace, "lut-source")).videoPath;
      const safeLut = workspace.path("lut.cube");
      await fs.copyFile(sourceLut, safeLut);
      // Use a generated relative filename and cwd so no user-controlled path enters filter syntax.
      await this.runFfmpeg(
        ["-i", videoPath, "-vf", "lut3d=filename=lut.cube,format=yuv420p", "-c:v", "libx264", "-crf", "18", "-y", options.outputPath],
        onProgress,
        workspace.directory
      );
      return { outputPath: options.outputPath, success: true };
    });
  }

  async addVideoTransition(
    videoSource: string | Buffer,
    options: { type: string; duration: number; direction?: string; secondVideo?: string | Buffer; outputPath: string },
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    const duration = positive(options.duration, "transition duration");
    return this.withWorkspace("apexify-transition-", async (workspace) => {
      const first = (await resolveVideoInputToPath(videoSource, workspace, "first")).videoPath;
      const firstInfo = await this.deps.getVideoInfo(first, true);
      if (!firstInfo) throw new Error("Failed to get first video information.");
      if (options.type === "fade" && !options.secondVideo) {
        const fade = options.direction === "out" ? "fade=t=out" : "fade=t=in";
        await this.runFfmpeg(["-i", first, "-vf", `${fade}:st=0:d=${duration}`, "-c:a", "copy", "-y", options.outputPath], onProgress);
        return { outputPath: options.outputPath, success: true };
      }
      if (!options.secondVideo) throw new Error("Second video is required for this transition type.");
      const second = (await resolveVideoInputToPath(options.secondVideo, workspace, "second")).videoPath;
      const secondInfo = await this.deps.getVideoInfo(second, true);
      if (!secondInfo) throw new Error("Failed to get second video information.");
      const types: Record<string, string> = {
        fade: "fade", wipe: "wipeleft", slide: "slideleft", zoom: "zoomin", rotate: "radial",
        dissolve: "fade", blur: "fade", circle: "circleopen", pixelize: "pixelize",
      };
      const directionMaps: Record<string, Record<string, string>> = {
        wipe: { left: "wipeleft", right: "wiperight", up: "wipeup", down: "wipedown" },
        slide: { left: "slideleft", right: "slideright", up: "slideup", down: "slidedown" },
        zoom: { in: "zoomin", out: "zoomout" },
      };
      let transition = types[options.type];
      if (!transition) throw new Error(`Unsupported transition type: ${options.type}`);
      if (options.direction && directionMaps[options.type]?.[options.direction]) transition = directionMaps[options.type][options.direction];
      const width = Math.max(firstInfo.width, secondInfo.width);
      const height = Math.max(firstInfo.height, secondInfo.height);
      const offset = Math.max(0, firstInfo.duration - duration);
      const filter = `[0:v]scale=${width}:${height}[v0];[1:v]scale=${width}:${height}[v1];[v0][v1]xfade=transition=${transition}:duration=${duration}:offset=${offset}[v]`;
      await this.runFfmpeg([
        "-i", first, "-i", second, "-filter_complex", filter, "-map", "[v]",
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-y", options.outputPath,
      ], onProgress);
      return { outputPath: options.outputPath, success: true };
    });
  }

  async addTextOverlayToVideo(
    videoSource: string | Buffer,
    options: VideoTextOverlayOperation,
    onProgress?: (progress: { percent: number; time: number; speed: number }) => void
  ): Promise<{ outputPath: string; success: boolean }> {
    validateTextOverlayOperation(options);
    return this.withWorkspace("apexify-text-overlay-", async (workspace) => {
      const videoPath = (await resolveVideoInputToPath(videoSource, workspace, "input")).videoPath;
      const info = await this.deps.getVideoInfo(videoPath, true);
      if (!info?.width || !info?.height) throw new Error("addTextOverlay: could not read video dimensions.");
      const { pngPaths } = await prepareTextOverlayPngs(workspace.directory, 0, options.overlays, info.width, info.height);
      const { filterComplex, outputLabel } = buildTextOverlayFilterComplex(options.overlays.length, options.overlays, info.width, info.height);
      const args: string[] = ["-i", videoPath];
      for (const png of pngPaths) args.push("-i", png);
      args.push("-filter_complex", filterComplex, "-map", `[${outputLabel}]`);
      if (await probeHasAudioStream(videoPath, this.session)) args.push("-map", "0:a?", "-c:a", "copy");
      args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-y", options.outputPath);
      await this.runFfmpeg(args, onProgress);
      return { outputPath: options.outputPath, success: true };
    });
  }

  /** Deprecated animated drawtext path, now rendered through safe canvas text overlays. */
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
    const info = await this.deps.getVideoInfo(videoSource, true);
    if (!info?.width || !info?.height) throw new Error("addAnimatedText: could not determine video dimensions.");
    const named = typeof options.position === "string" ? positionCoordinates(options.position, info.width, info.height) : undefined;
    const x = typeof options.position === "object" ? finite(options.position.x, "text x") : named!.x;
    const y = typeof options.position === "object" ? finite(options.position.y, "text y") : named!.y;
    const animation = options.animation ?? "none";
    const transitionIn = animation.includes("fade")
      ? { type: "fade" as const, duration: Math.min(1, Math.max(0, options.endTime - options.startTime)) }
      : animation.includes("slide")
        ? { type: "slideLeft" as const, duration: Math.min(1, Math.max(0, options.endTime - options.startTime)) }
        : animation.includes("zoom")
          ? { type: "zoomIn" as const, duration: Math.min(1, Math.max(0, options.endTime - options.startTime)) }
          : undefined;
    const overlay = {
      text: options.text,
      x,
      y,
      font: { size: positive(options.fontSize ?? 24, "fontSize"), family: options.fontFamily || options.fontName || "Arial" },
      fill: { color: options.fontColor ?? "white" },
      placement: {
        textAlign: named?.textAlign ?? "left",
        textBaseline: named?.textBaseline ?? "top",
      },
      startTime: nonNegative(options.startTime, "text startTime"),
      endTime: positive(options.endTime, "text endTime"),
      transitionIn,
    } as any;
    return this.addTextOverlayToVideo(videoSource, { overlays: [overlay], outputPath: options.outputPath }, onProgress);
  }
}
