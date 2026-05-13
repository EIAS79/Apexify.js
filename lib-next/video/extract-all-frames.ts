import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import axios from "axios";
import type { FfmpegSession } from "./ffmpeg-session";
import { getErrorMessage } from "../core/errors";
import { ffprobeVideoFile } from "./ffprobe-metadata";

const execAsync = promisify(exec);

export interface ExtractAllFramesOptions {
  outputFormat?: "jpg" | "png";
  outputDirectory?: string;
  quality?: number;
  prefix?: string;
  startTime?: number;
  endTime?: number;
}

/**
 * Extract every frame in a time range to numbered files (legacy `extractAllFrames`).
 */
export async function extractAllVideoFrames(
  videoSource: string | Buffer,
  options: ExtractAllFramesOptions | undefined,
  session: FfmpegSession
): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
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
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    let videoPath: string;
    let shouldCleanupVideo = false;

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else if (typeof videoSource === "string" && videoSource.startsWith("http")) {
      const response = await axios({
        method: "get",
        url: videoSource,
        responseType: "arraybuffer",
      });
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, Buffer.from(response.data));
      shouldCleanupVideo = true;
    } else {
      const resolved = path.isAbsolute(videoSource) ? videoSource : path.join(process.cwd(), videoSource);
      if (!fs.existsSync(resolved)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolved;
    }

    const videoInfo = await ffprobeVideoFile(videoPath, session, true);
    if (!videoInfo) {
      throw new Error("Could not get video information");
    }

    const outputFormat = options?.outputFormat || "png";
    const outputDir = options?.outputDirectory || path.join(process.cwd(), "extracted-frames");
    const prefix = options?.prefix || "frame";
    const quality = options?.quality ?? 2;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const startTime = options?.startTime ?? 0;
    const endTime = options?.endTime ?? videoInfo.duration;
    const duration = endTime - startTime;

    const qualityFlag = outputFormat === "jpg" ? `-q:v ${quality}` : "";
    const pixFmt = outputFormat === "png" ? "-pix_fmt rgba" : "-pix_fmt rgb24";
    const outputTemplate = path.join(outputDir, `${prefix}-%06d.${outputFormat}`);

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputTemplate = outputTemplate.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -ss ${startTime} -t ${duration} -fps_mode passthrough ${pixFmt} ${qualityFlag} -y "${escapedOutputTemplate}"`;

    await execAsync(command, {
      timeout: 300000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const frames: Array<{ source: string; frameNumber: number; time: number }> = [];
    let frameIndex = 0;
    let currentTime = startTime;

    while (true) {
      const frameNumber = frameIndex + 1;
      const framePath = path.join(outputDir, `${prefix}-${String(frameNumber).padStart(6, "0")}.${outputFormat}`);

      if (fs.existsSync(framePath)) {
        frames.push({
          source: framePath,
          frameNumber: frameIndex,
          time: currentTime,
        });
        currentTime += 1 / videoInfo.fps;
        frameIndex++;
      } else {
        break;
      }
    }

    if (shouldCleanupVideo && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    console.log(`✅ Extracted ${frames.length} frames from video`);
    return frames;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) {
      throw error;
    }
    throw new Error(`extractAllFrames failed: ${errorMessage}`);
  }
}
