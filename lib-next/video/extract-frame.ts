import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import type { FfmpegSession } from "./ffmpeg-session";
import { getErrorMessage } from "../core/errors";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { ffprobeVideoFile } from "./ffprobe-metadata";

const execAsync = promisify(exec);

/**
 * Extract one raster frame from a video (legacy `ApexPainter` / `VideoCreator` dependency shape).
 */
export async function extractVideoFrameBuffer(
  session: FfmpegSession,
  videoSource: string | Buffer,
  frameNumber: number = 0,
  timeSeconds?: number,
  outputFormat: "jpg" | "png" = "jpg",
  quality: number = 2
): Promise<Buffer | null> {
  try {
    const ffmpegAvailable = await session.checkAvailable();
    if (!ffmpegAvailable) {
      throw new Error(
        "❌ FFMPEG NOT FOUND\n" +
          "Video processing features require FFmpeg to be installed on your system.\n" +
          session.getInstallInstructions()
      );
    }

    const frameDir = path.join(process.cwd(), ".temp-frames");
    const timestamp = Date.now();
    const frameOutputPath = path.join(frameDir, `frame-${timestamp}.${outputFormat}`);

    const { videoPath, shouldCleanup } = await resolveVideoInputToPath(
      videoSource,
      frameDir,
      `extract-${timestamp}`
    );

    let time: number;
    if (timeSeconds !== undefined) {
      time = timeSeconds;
    } else if (frameNumber === 0) {
      time = 0;
    } else {
      try {
        const videoInfo = await ffprobeVideoFile(videoPath, session, true);
        if (videoInfo && videoInfo.fps > 0) {
          time = frameNumber / videoInfo.fps;
        } else {
          console.warn(`Could not get video FPS, assuming 30 FPS for frame ${frameNumber}`);
          time = frameNumber / 30;
        }
      } catch {
        console.warn(`Could not get video info, assuming 30 FPS for frame ${frameNumber}`);
        time = frameNumber / 30;
      }
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = frameOutputPath.replace(/"/g, '\\"');

    let command: string;
    if (outputFormat === "png") {
      const pixFmt = "-pix_fmt rgba";
      command = `ffmpeg -i "${escapedVideoPath}" -ss ${time} -frames:v 1 ${pixFmt} -y "${escapedOutputPath}"`;
    } else {
      const qualityFlag = `-q:v ${quality}`;
      command = `ffmpeg -i "${escapedVideoPath}" -ss ${time} -frames:v 1 ${qualityFlag} -y "${escapedOutputPath}"`;
    }

    try {
      await execAsync(command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!fs.existsSync(frameOutputPath)) {
        throw new Error("Frame extraction failed - output file not created");
      }

      const buffer = fs.readFileSync(frameOutputPath);

      if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
      if (shouldCleanup && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);

      return buffer;
    } catch (error) {
      if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
      if (shouldCleanup && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
      throw error;
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) {
      throw error;
    }
    throw new Error(`extractVideoFrame failed: ${errorMessage}`);
  }
}
