import { promises as fs } from "fs";
import path from "path";
import type { FfmpegSession } from "./ffmpeg-session";
import type { ExtractFramesOptions } from "../types";
import { getErrorMessage } from "../core/errors";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { probeFormatDurationSeconds } from "./ffprobe-metadata";
import { withTempWorkspace } from "./temp-workspace";

function validateExtractFramesInputs(videoSource: string | Buffer, options: ExtractFramesOptions): void {
  if (!videoSource) throw new Error("extractFrames: videoSource is required.");
  if (!options || typeof options !== "object") throw new Error("extractFrames: options object is required.");
  if (!Number.isFinite(options.interval) || options.interval <= 0) {
    throw new Error("extractFrames: options.interval must be a finite positive number (milliseconds).");
  }
  if (options.outputFormat && !["jpg", "png"].includes(options.outputFormat)) {
    throw new Error("extractFrames: outputFormat must be 'jpg' or 'png'.");
  }
}

async function resolveOutputDirectory(requested?: string): Promise<string> {
  if (requested) {
    const output = path.isAbsolute(requested) ? requested : path.resolve(process.cwd(), requested);
    await fs.mkdir(output, { recursive: true });
    return output;
  }
  const parent = path.resolve(process.cwd(), "extracted-frames");
  await fs.mkdir(parent, { recursive: true });
  return fs.mkdtemp(path.join(parent, "apexify-"));
}

/** Interval-based multi-frame extraction with isolated transient media state. */
export async function extractFramesAtInterval(
  videoSource: string | Buffer,
  options: ExtractFramesOptions,
  session: FfmpegSession
): Promise<Array<{ source: string; isRemote: boolean }>> {
  try {
    if (!(await session.checkAvailable())) {
      throw new Error(
        "FFMPEG NOT FOUND\nVideo processing features require FFmpeg/ffprobe to be installed.\n" +
          session.getInstallInstructions()
      );
    }
    validateExtractFramesInputs(videoSource, options);

    const outputDir = await resolveOutputDirectory(options.outputDirectory);
    return await withTempWorkspace(
      { ...session.workspaceOptions, prefix: "apexify-interval-" },
      async (workspace) => {
        const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
        const duration = await probeFormatDurationSeconds(videoPath, session);
        if (duration <= 0) throw new Error("Video duration not found in metadata.");

        const outputFormat = options.outputFormat || "jpg";
        const fps = 1000 / options.interval;
        const totalFrames = Math.floor(duration * fps);
        const startFrame = options.frameSelection?.start ?? 0;
        const endFrame = options.frameSelection?.end !== undefined
          ? Math.min(options.frameSelection.end, totalFrames - 1)
          : totalFrames - 1;
        if (!Number.isFinite(startFrame) || !Number.isFinite(endFrame) || startFrame < 0 || endFrame < startFrame) {
          throw new Error("extractFrames: invalid frameSelection range.");
        }

        const startTime = startFrame / fps;
        const durationToExtract = (endFrame + 1) / fps - startTime;
        const outputTemplate = path.join(outputDir, `frame-%03d.${outputFormat}`);
        const args = [
          "-i", videoPath,
          "-ss", String(startTime),
          "-t", String(durationToExtract),
          "-vf", `fps=${fps}`,
        ];
        if (outputFormat === "png") args.push("-pix_fmt", "rgba");
        else args.push("-pix_fmt", "yuvj420p", "-q:v", "2");
        args.push("-y", outputTemplate);

        await session.runFfmpeg(args, {
          timeoutMs: 60_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 10 * 1024 * 1024,
        });

        const frames: Array<{ source: string; isRemote: boolean }> = [];
        const actualFrameCount = endFrame - startFrame + 1;
        for (let i = 0; i < actualFrameCount; i++) {
          const framePath = path.join(outputDir, `frame-${String(i + 1).padStart(3, "0")}.${outputFormat}`);
          try {
            await fs.access(framePath);
            frames.push({ source: framePath, isRemote: false });
          } catch {
            break;
          }
        }
        return frames;
      }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) throw error;
    throw new Error(`extractFrames failed: ${errorMessage}`, { cause: error });
  }
}
