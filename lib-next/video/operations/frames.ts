import { createCanvas, loadImage } from "@napi-rs/canvas";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ApexifyInputError } from "../../runtime/errors";
import { assertVideoResourceLimits, assertWithinLimit } from "../../runtime/limits";
import { resolveMediaBuffer } from "../../media/source";
import { getCanvasContext } from "../../core/errors";
import type { CanvasResults } from "../../types";
import type { VideoFit, VideoOutputFormat, VideoQuality, VideoSource } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { nonNegativeNumber, positiveNumber } from "./filter-graph";

const QUALITY_CRF: Record<VideoQuality, string> = { low: "30", medium: "24", high: "19", ultra: "16" };

function integer(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new ApexifyInputError(`${label} must be a positive integer.`);
  }
  return value;
}

function frameQuality(value: number | undefined, label: string): number {
  const quality = value ?? 2;
  if (!Number.isFinite(quality) || quality < 1 || quality > 31 || !Number.isInteger(quality)) {
    throw new ApexifyInputError(`${label} must be an integer between 1 and 31.`);
  }
  return quality;
}

function outputFormat(value: "jpg" | "png" | undefined): "jpg" | "png" {
  return value ?? "jpg";
}

function encoderForFormat(format: VideoOutputFormat): { codec: string; muxer: string } {
  switch (format) {
    case "webm": return { codec: "libvpx-vp9", muxer: "webm" };
    case "mov": return { codec: "libx264", muxer: "mov" };
    case "mkv": return { codec: "libx264", muxer: "matroska" };
    case "avi": return { codec: "libx264", muxer: "avi" };
    default: return { codec: "libx264", muxer: "mp4" };
  }
}

function inferFormat(outputPath: string, requested?: VideoOutputFormat): VideoOutputFormat {
  const ext = path.extname(outputPath).slice(1).toLowerCase();
  const inferred = (["mp4", "webm", "avi", "mov", "mkv"] as const).find((item) => item === ext);
  const format = requested ?? inferred ?? "mp4";
  if (ext && inferred && requested && requested !== inferred) {
    throw new ApexifyInputError(`createFromFrames output extension .${ext} does not match requested format ${requested}.`);
  }
  return format;
}

function drawFitted(
  ctx: ReturnType<typeof getCanvasContext>,
  image: Awaited<ReturnType<typeof loadImage>>,
  width: number,
  height: number,
  fit: VideoFit
): void {
  if (fit === "stretch") {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }
  const scale = fit === "cover"
    ? Math.max(width / image.width, height / image.height)
    : Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

async function assertWritable(pathname: string, overwrite: boolean): Promise<void> {
  if (overwrite) return;
  try {
    await fs.access(pathname);
    throw new ApexifyInputError(`Output already exists and overwrite=false: ${pathname}`);
  } catch (error) {
    if (error instanceof ApexifyInputError) throw error;
  }
}

async function ensureOutputDirectory(requested: string | undefined, fallback: string): Promise<string> {
  const output = path.resolve(requested ?? fallback);
  await fs.mkdir(output, { recursive: true });
  return output;
}

export class FrameOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async extractOne(
    source: VideoSource,
    options: { time?: number; frame?: number; width?: number; height?: number; outputFormat?: "jpg" | "png"; quality?: number },
    controls: VideoRunControls = {}
  ): Promise<{ buffer: Buffer; canvas: { width: number; height: number } }> {
    return this.runtime.withWorkspace("apexify-frame-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      let time: number;
      if (options.time !== undefined) {
        time = nonNegativeNumber(options.time, "extractFrame time");
      } else if (options.frame !== undefined) {
        const frame = nonNegativeNumber(options.frame, "extractFrame frame");
        if (!Number.isInteger(frame)) throw new ApexifyInputError("extractFrame frame must be an integer.");
        time = frame / info.fps;
      } else {
        time = 0;
      }
      if (time > info.duration + 0.001) throw new ApexifyInputError("extractFrame time is outside source duration.");
      const format = outputFormat(options.outputFormat);
      const quality = frameQuality(options.quality, "extractFrame quality");
      const framePath = workspace.path(`frame.${format}`);
      const args = ["-ss", String(time), "-i", videoPath, "-frames:v", "1"];
      if (format === "jpg") args.push("-q:v", String(quality));
      args.push(...this.runtime.outputArgs(framePath, true));
      await this.runtime.runFfmpeg(args, controls, Math.max(0.001, info.duration - time));
      const raw = await fs.readFile(framePath);
      if (!raw.length) throw new ApexifyInputError("Frame extraction produced an empty image.");
      const image = await loadImage(raw);
      const width = options.width ?? image.width;
      const height = options.height ?? image.height;
      if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        throw new ApexifyInputError("extractFrame width and height must be positive integers.");
      }
      assertVideoResourceLimits({ width, height });
      if (width === image.width && height === image.height) {
        return { buffer: raw, canvas: { width, height } };
      }
      const canvas = createCanvas(width, height);
      getCanvasContext(canvas).drawImage(image, 0, 0, width, height);
      return { buffer: canvas.toBuffer(format === "png" ? "image/png" : "image/jpeg"), canvas: { width, height } };
    });
  }

  async extractTimes(
    source: VideoSource,
    times: number[],
    options: { outputFormat?: "jpg" | "png"; quality?: number } = {},
    controls: VideoRunControls = {}
  ): Promise<Buffer[]> {
    if (!Array.isArray(times) || times.length === 0) throw new ApexifyInputError("extractFrames.times requires at least one timestamp.");
    assertWithinLimit("maxVideoExtractedFrames", times.length);
    const format = outputFormat(options.outputFormat);
    const quality = frameQuality(options.quality, "extractFrames quality");
    return this.runtime.withWorkspace("apexify-frame-times-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const result: Buffer[] = [];
      for (let i = 0; i < times.length; i++) {
        const time = nonNegativeNumber(times[i]!, `extractFrames.times[${i}]`);
        if (time > info.duration + 0.001) throw new ApexifyInputError(`extractFrames.times[${i}] is outside source duration.`);
        const framePath = workspace.path(`frame-${String(i).padStart(6, "0")}.${format}`);
        const args = ["-ss", String(time), "-i", videoPath, "-frames:v", "1"];
        if (format === "jpg") args.push("-q:v", String(quality));
        args.push(...this.runtime.outputArgs(framePath, true));
        await this.runtime.runFfmpeg(args, controls, Math.max(0.001, info.duration - time));
        result.push(await fs.readFile(framePath));
      }
      return result;
    });
  }

  async extractInterval(
    source: VideoSource,
    options: {
      interval: number;
      frameSelection?: { start?: number; end?: number };
      outputFormat?: "jpg" | "png";
      quality?: number;
      outputDirectory?: string;
    },
    controls: VideoRunControls = {}
  ): Promise<Array<{ source: string; isRemote: boolean }>> {
    const intervalMs = positiveNumber(options.interval, "extractFrames interval");
    const format = outputFormat(options.outputFormat);
    const quality = frameQuality(options.quality, "extractFrames quality");
    const outputDirectory = await ensureOutputDirectory(options.outputDirectory, "extracted-frames");
    return this.runtime.withWorkspace("apexify-interval-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const fps = 1000 / intervalMs;
      assertVideoResourceLimits({ fps });
      const totalFrames = Math.max(1, Math.floor(info.duration * fps));
      const startFrame = options.frameSelection?.start ?? 0;
      const endFrame = options.frameSelection?.end ?? totalFrames - 1;
      if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame) || startFrame < 0 || endFrame < startFrame || endFrame >= totalFrames) {
        throw new ApexifyInputError("extractFrames frameSelection must be an increasing integer range inside the generated frame count.");
      }
      const count = endFrame - startFrame + 1;
      assertWithinLimit("maxVideoExtractedFrames", count);
      const startTime = startFrame / fps;
      const duration = count / fps;
      const template = path.join(outputDirectory, `frame-%06d.${format}`);
      if (controls.overwrite === false) {
        const first = path.join(outputDirectory, `frame-${String(1).padStart(6, "0")}.${format}`);
        await assertWritable(first, false);
      }
      const args = ["-ss", String(startTime), "-i", videoPath, "-t", String(duration), "-vf", `fps=${fps}`];
      if (format === "jpg") args.push("-q:v", String(quality));
      args.push(...this.runtime.outputArgs(template, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, duration);
      const result: Array<{ source: string; isRemote: boolean }> = [];
      for (let i = 1; i <= count; i++) {
        const framePath = path.join(outputDirectory, `frame-${String(i).padStart(6, "0")}.${format}`);
        try {
          await fs.access(framePath);
          result.push({ source: framePath, isRemote: false });
        } catch {
          break;
        }
      }
      return result;
    });
  }

  async extractAll(
    source: VideoSource,
    options: { outputFormat?: "jpg" | "png"; outputDirectory?: string; quality?: number; prefix?: string; startTime?: number; endTime?: number } = {},
    controls: VideoRunControls = {}
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    const format = outputFormat(options.outputFormat ?? "png");
    const quality = frameQuality(options.quality, "extractAllFrames quality");
    const prefix = options.prefix ?? "frame";
    if (!prefix || prefix.includes("\0") || /[\\/]/.test(prefix)) throw new ApexifyInputError("extractAllFrames prefix must be a simple filename prefix.");
    const outputDirectory = await ensureOutputDirectory(options.outputDirectory, "extracted-frames");
    return this.runtime.withWorkspace("apexify-allframes-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const start = nonNegativeNumber(options.startTime ?? 0, "extractAllFrames startTime");
      const end = options.endTime ?? info.duration;
      if (!Number.isFinite(end) || end <= start || end > info.duration + 0.001) throw new ApexifyInputError("extractAllFrames range is outside the source duration.");
      const duration = end - start;
      const estimatedCount = Math.ceil(duration * info.fps) + 1;
      assertWithinLimit("maxVideoExtractedFrames", estimatedCount);
      const template = path.join(outputDirectory, `${prefix}-%06d.${format}`);
      const args = ["-ss", String(start), "-i", videoPath, "-t", String(duration), "-fps_mode", "passthrough"];
      if (format === "jpg") args.push("-q:v", String(quality));
      args.push(...this.runtime.outputArgs(template, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, duration);
      const result: Array<{ source: string; frameNumber: number; time: number }> = [];
      for (let i = 1; i <= estimatedCount; i++) {
        const framePath = path.join(outputDirectory, `${prefix}-${String(i).padStart(6, "0")}.${format}`);
        try {
          await fs.access(framePath);
        } catch {
          break;
        }
        result.push({ source: framePath, frameNumber: i - 1, time: start + (i - 1) / info.fps });
      }
      return result;
    });
  }

  async thumbnail(
    source: VideoSource,
    options: { count?: number; grid?: { cols: number; rows: number }; width?: number; height?: number; outputFormat?: "jpg" | "png"; quality?: number },
    controls: VideoRunControls = {}
  ): Promise<CanvasResults> {
    const count = integer(options.count ?? 9, "thumbnail count");
    assertWithinLimit("maxVideoExtractedFrames", count);
    const grid = options.grid ?? { cols: 3, rows: 3 };
    const cols = integer(grid.cols, "thumbnail grid cols");
    const rows = integer(grid.rows, "thumbnail grid rows");
    if (cols * rows < count) throw new ApexifyInputError("thumbnail grid does not have enough cells for count.");
    const frameWidth = integer(options.width ?? 320, "thumbnail frame width");
    const frameHeight = integer(options.height ?? 180, "thumbnail frame height");
    const totalWidth = frameWidth * cols;
    const totalHeight = frameHeight * rows;
    assertVideoResourceLimits({ width: totalWidth, height: totalHeight });
    const format = outputFormat(options.outputFormat);
    const quality = frameQuality(options.quality, "thumbnail quality");

    return this.runtime.withWorkspace("apexify-thumbnail-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const canvas = createCanvas(totalWidth, totalHeight);
      const ctx = getCanvasContext(canvas);
      const interval = info.duration / (count + 1);
      for (let i = 0; i < count; i++) {
        const framePath = workspace.path(`thumb-${String(i).padStart(4, "0")}.${format}`);
        const args = ["-ss", String(interval * (i + 1)), "-i", videoPath, "-frames:v", "1"];
        if (format === "jpg") args.push("-q:v", String(quality));
        args.push(...this.runtime.outputArgs(framePath, true));
        await this.runtime.runFfmpeg(args, controls, info.duration);
        const frame = await loadImage(await fs.readFile(framePath));
        const col = i % cols;
        const row = Math.floor(i / cols);
        ctx.drawImage(frame, col * frameWidth, row * frameHeight, frameWidth, frameHeight);
      }
      return { buffer: canvas.toBuffer("image/png"), canvas: { width: totalWidth, height: totalHeight } };
    });
  }

  async preview(
    source: VideoSource,
    options: { count?: number; outputDirectory?: string; outputFormat?: "jpg" | "png"; quality?: number },
    controls: VideoRunControls = {}
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    const count = integer(options.count ?? 10, "preview count");
    assertWithinLimit("maxVideoExtractedFrames", count);
    const outputDirectory = await ensureOutputDirectory(options.outputDirectory, "video-preview");
    const format = outputFormat(options.outputFormat ?? "png");
    const quality = frameQuality(options.quality, "preview quality");
    return this.runtime.withWorkspace("apexify-preview-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const interval = info.duration / (count + 1);
      const result: Array<{ source: string; frameNumber: number; time: number }> = [];
      for (let i = 0; i < count; i++) {
        const time = interval * (i + 1);
        const outputPath = path.join(outputDirectory, `preview-${String(i + 1).padStart(4, "0")}.${format}`);
        await assertWritable(outputPath, controls.overwrite !== false);
        const args = ["-ss", String(time), "-i", videoPath, "-frames:v", "1"];
        if (format === "jpg") args.push("-q:v", String(quality));
        args.push(...this.runtime.outputArgs(outputPath, controls.overwrite !== false));
        await this.runtime.runFfmpeg(args, controls, info.duration);
        result.push({ source: outputPath, frameNumber: i + 1, time });
      }
      return result;
    });
  }

  async createFromFrames(
    options: { frames: VideoSource[]; outputPath: string; fps?: number; format?: VideoOutputFormat; quality?: VideoQuality; bitrate?: number; resolution?: { width?: number; height?: number; fit?: VideoFit } },
    controls: VideoRunControls = {}
  ) {
    if (!Array.isArray(options.frames) || options.frames.length === 0) throw new ApexifyInputError("createFromFrames requires at least one frame.");
    assertWithinLimit("maxVideoExtractedFrames", options.frames.length);
    const fps = positiveNumber(options.fps ?? 30, "createFromFrames fps");
    assertVideoResourceLimits({ fps });
    const format = inferFormat(options.outputPath, options.format);
    const { codec, muxer } = encoderForFormat(format);
    const quality = options.quality ?? "medium";
    if (options.bitrate !== undefined) positiveNumber(options.bitrate, "createFromFrames bitrate");

    return this.runtime.withWorkspace("apexify-frames-video-", async (workspace) => {
      const frameDir = await workspace.ensureDirectory("frames");
      let width = options.resolution?.width;
      let height = options.resolution?.height;
      for (let i = 0; i < options.frames.length; i++) {
        if (controls.signal?.aborted) throw controls.signal.reason ?? new Error("Video frame creation aborted.");
        const bytes = await resolveMediaBuffer(options.frames[i]!, { kind: "image", cache: false, signal: controls.signal });
        const image = await loadImage(bytes);
        if (i === 0) {
          width = width ?? image.width;
          height = height ?? image.height;
          width = integer(width, "createFromFrames width");
          height = integer(height, "createFromFrames height");
          assertVideoResourceLimits({ width, height });
        }
        const canvas = createCanvas(width!, height!);
        const ctx = getCanvasContext(canvas);
        ctx.clearRect(0, 0, width!, height!);
        drawFitted(ctx, image, width!, height!, options.resolution?.fit ?? "contain");
        await fs.writeFile(path.join(frameDir, `frame-${String(i).padStart(6, "0")}.png`), canvas.toBuffer("image/png"));
      }
      const pattern = path.join(frameDir, "frame-%06d.png");
      const args = ["-framerate", String(fps), "-i", pattern, "-c:v", codec];
      if (options.bitrate !== undefined) args.push("-b:v", `${options.bitrate}k`);
      else args.push("-crf", QUALITY_CRF[quality]);
      if (codec === "libx264") args.push("-pix_fmt", "yuv420p");
      if (format === "mp4" || format === "mov") args.push("-movflags", "+faststart");
      args.push("-f", muxer, ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, options.frames.length / fps);
      return { outputPath: options.outputPath, success: true, frames: options.frames.length, fps } as const;
    });
  }
}
