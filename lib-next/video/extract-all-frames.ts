import { promises as fs } from "fs";
import path from "path";
import type { FfmpegSession } from "./ffmpeg-session";
import { getErrorMessage } from "../core/errors";
import { ffprobeVideoFile } from "./ffprobe-metadata";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { withTempWorkspace } from "./temp-workspace";

export interface ExtractAllFramesOptions {
  outputFormat?: "jpg" | "png";
  outputDirectory?: string;
  quality?: number;
  prefix?: string;
  startTime?: number;
  endTime?: number;
}

async function outputDirectory(requested?: string): Promise<string> {
  const result = requested
    ? (path.isAbsolute(requested) ? requested : path.resolve(process.cwd(), requested))
    : path.resolve(process.cwd(), "extracted-frames");
  await fs.mkdir(result, { recursive: true });
  return result;
}

function safePrefix(prefix: string): string {
  if (!prefix || prefix.includes("\0") || /[\\/]/.test(prefix)) {
    throw new Error("extractAllFrames: prefix must be a simple filename prefix.");
  }
  return prefix;
}

/** Extract every frame in a time range while isolating all temporary input state. */
export async function extractAllVideoFrames(
  videoSource: string | Buffer,
  options: ExtractAllFramesOptions | undefined,
  session: FfmpegSession
): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
  try {
    if (!(await session.checkAvailable())) {
      throw new Error(
        "FFMPEG NOT FOUND\nVideo processing features require FFmpeg/ffprobe to be installed.\n" +
          session.getInstallInstructions()
      );
    }

    const outputFormat = options?.outputFormat || "png";
    if (outputFormat !== "png" && outputFormat !== "jpg") {
      throw new Error("extractAllFrames: outputFormat must be 'png' or 'jpg'.");
    }
    const quality = options?.quality ?? 2;
    if (!Number.isFinite(quality) || quality < 1 || quality > 31) {
      throw new Error("extractAllFrames: quality must be between 1 and 31.");
    }
    const prefix = safePrefix(options?.prefix || "frame");
    const outputDir = await outputDirectory(options?.outputDirectory);

    return await withTempWorkspace(
      { ...session.workspaceOptions, prefix: "apexify-allframes-" },
      async (workspace) => {
        const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");
        const videoInfo = await ffprobeVideoFile(videoPath, session, true);
        if (!videoInfo || videoInfo.duration <= 0 || videoInfo.fps <= 0) {
          throw new Error("Could not get usable video information.");
        }

        const startTime = options?.startTime ?? 0;
        const endTime = options?.endTime ?? videoInfo.duration;
        if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime < 0 || endTime <= startTime) {
          throw new Error("extractAllFrames: startTime/endTime must define a finite positive range.");
        }
        const duration = endTime - startTime;
        const outputTemplate = path.join(outputDir, `${prefix}-%06d.${outputFormat}`);
        const args = [
          "-i", videoPath,
          "-ss", String(startTime),
          "-t", String(duration),
          "-fps_mode", "passthrough",
        ];
        if (outputFormat === "png") args.push("-pix_fmt", "rgba");
        else args.push("-pix_fmt", "rgb24", "-q:v", String(quality));
        args.push("-y", outputTemplate);

        await session.runFfmpeg(args, {
          timeoutMs: 300_000,
          maxStdoutBytes: 2 * 1024 * 1024,
          maxStderrBytes: 10 * 1024 * 1024,
        });

        const frames: Array<{ source: string; frameNumber: number; time: number }> = [];
        for (let frameIndex = 0; ; frameIndex++) {
          const framePath = path.join(
            outputDir,
            `${prefix}-${String(frameIndex + 1).padStart(6, "0")}.${outputFormat}`
          );
          try {
            await fs.access(framePath);
          } catch {
            break;
          }
          frames.push({
            source: framePath,
            frameNumber: frameIndex,
            time: startTime + frameIndex / videoInfo.fps,
          });
        }
        return frames;
      }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) throw error;
    throw new Error(`extractAllFrames failed: ${errorMessage}`, { cause: error });
  }
}
