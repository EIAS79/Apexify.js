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
import { positiveNumber } from "./filter-graph";

const QUALITY_CRF: Record<VideoQuality, string> = { low: "30", medium: "24", high: "19", ultra: "16" };

function integer(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new ApexifyInputError(`${label} must be a positive integer.`);
  }
  return value;
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

export class FrameOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async thumbnail(
    source: VideoSource,
    options: {
      count?: number;
      grid?: { cols: number; rows: number };
      width?: number;
      height?: number;
      outputFormat?: "jpg" | "png";
      quality?: number;
    },
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
    const outputFormat = options.outputFormat ?? "jpg";
    const quality = options.quality ?? 2;
    if (!Number.isFinite(quality) || quality < 1 || quality > 31) throw new ApexifyInputError("thumbnail quality must be between 1 and 31.");

    return this.runtime.withWorkspace("apexify-thumbnail-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const canvas = createCanvas(totalWidth, totalHeight);
      const ctx = getCanvasContext(canvas);
      const interval = info.duration / (count + 1);
      for (let i = 0; i < count; i++) {
        const framePath = workspace.path(`thumb-${String(i).padStart(4, "0")}.${outputFormat}`);
        const args = ["-i", videoPath, "-ss", String(interval * (i + 1)), "-frames:v", "1"];
        if (outputFormat === "jpg") args.push("-q:v", String(quality));
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
    const outputDirectory = path.resolve(options.outputDirectory ?? "video-preview");
    await fs.mkdir(outputDirectory, { recursive: true });
    const outputFormat = options.outputFormat ?? "png";
    const quality = options.quality ?? 2;
    if (!Number.isFinite(quality) || quality < 1 || quality > 31) throw new ApexifyInputError("preview quality must be between 1 and 31.");

    return this.runtime.withWorkspace("apexify-preview-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const interval = info.duration / (count + 1);
      const result: Array<{ source: string; frameNumber: number; time: number }> = [];
      for (let i = 0; i < count; i++) {
        const time = interval * (i + 1);
        const outputPath = path.join(outputDirectory, `preview-${String(i + 1).padStart(4, "0")}.${outputFormat}`);
        await assertWritable(outputPath, controls.overwrite !== false);
        const args = ["-i", videoPath, "-ss", String(time), "-frames:v", "1"];
        if (outputFormat === "jpg") args.push("-q:v", String(quality));
        args.push(...this.runtime.outputArgs(outputPath, controls.overwrite !== false));
        await this.runtime.runFfmpeg(args, controls, info.duration);
        result.push({ source: outputPath, frameNumber: i + 1, time });
      }
      return result;
    });
  }

  async createFromFrames(
    options: {
      frames: VideoSource[];
      outputPath: string;
      fps?: number;
      format?: VideoOutputFormat;
      quality?: VideoQuality;
      bitrate?: number;
      resolution?: { width?: number; height?: number; fit?: VideoFit };
    },
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
      let firstWidth = 0;
      let firstHeight = 0;

      for (let i = 0; i < options.frames.length; i++) {
        if (controls.signal?.aborted) throw controls.signal.reason ?? new Error("Video frame creation aborted.");
        const bytes = await resolveMediaBuffer(options.frames[i], { kind: "image", cache: false, signal: controls.signal });
        const image = await loadImage(bytes);
        if (i === 0) {
          firstWidth = image.width;
          firstHeight = image.height;
          width = width ?? firstWidth;
          height = height ?? firstHeight;
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
