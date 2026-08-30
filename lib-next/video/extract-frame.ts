import { promises as fs } from "fs";
import type { FfmpegSession } from "./ffmpeg-session";
import { getErrorMessage } from "../core/errors";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { ffprobeVideoFile } from "./ffprobe-metadata";
import { withTempWorkspace } from "./temp-workspace";

function finiteNonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a finite non-negative number.`);
  return value;
}

/** Extract one raster frame from a video using the centralized shell-free runner. */
export async function extractVideoFrameBuffer(
  session: FfmpegSession,
  videoSource: string | Buffer,
  frameNumber: number = 0,
  timeSeconds?: number,
  outputFormat: "jpg" | "png" = "jpg",
  quality: number = 2
): Promise<Buffer | null> {
  try {
    if (!(await session.checkAvailable())) {
      throw new Error(
        "FFMPEG NOT FOUND\nVideo processing features require FFmpeg/ffprobe to be installed.\n" +
          session.getInstallInstructions()
      );
    }
    if (outputFormat !== "jpg" && outputFormat !== "png") {
      throw new Error("extractVideoFrame: outputFormat must be 'jpg' or 'png'.");
    }
    finiteNonNegative(frameNumber, "extractVideoFrame frameNumber");
    if (!Number.isFinite(quality) || quality < 1 || quality > 31) {
      throw new Error("extractVideoFrame quality must be between 1 and 31.");
    }

    return await withTempWorkspace(
      { ...session.workspaceOptions, prefix: "apexify-frame-" },
      async (workspace) => {
        const frameOutputPath = workspace.path(`frame.${outputFormat}`);
        const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "input");

        let time: number;
        if (timeSeconds !== undefined) {
          time = finiteNonNegative(timeSeconds, "extractVideoFrame timeSeconds");
        } else if (frameNumber === 0) {
          time = 0;
        } else {
          const videoInfo = await ffprobeVideoFile(videoPath, session, true);
          time = videoInfo.fps > 0 ? frameNumber / videoInfo.fps : frameNumber / 30;
        }

        const args = ["-i", videoPath, "-ss", String(time), "-frames:v", "1"];
        if (outputFormat === "png") args.push("-pix_fmt", "rgba");
        else args.push("-q:v", String(quality));
        args.push("-y", frameOutputPath);

        await session.runFfmpeg(args);

        const buffer = await fs.readFile(frameOutputPath);
        if (buffer.length === 0) throw new Error("Frame extraction produced an empty file.");
        return buffer;
      }
    );
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) throw error;
    throw new Error(`extractVideoFrame failed: ${errorMessage}`, { cause: error });
  }
}
