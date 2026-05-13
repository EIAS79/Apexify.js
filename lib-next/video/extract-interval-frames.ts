import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import axios from "axios";
import type { FfmpegSession } from "./ffmpeg-session";
import type { ExtractFramesOptions } from "../types/video";
import { getErrorMessage } from "../core/errors";

const execAsync = promisify(exec);

function validateExtractFramesInputs(videoSource: string | Buffer, options: ExtractFramesOptions): void {
  if (!videoSource) {
    throw new Error("extractFrames: videoSource is required.");
  }
  if (!options || typeof options !== "object") {
    throw new Error("extractFrames: options object is required.");
  }
  if (typeof options.interval !== "number" || options.interval <= 0) {
    throw new Error("extractFrames: options.interval must be a positive number (milliseconds).");
  }
  if (options.outputFormat && !["jpg", "png"].includes(options.outputFormat)) {
    throw new Error("extractFrames: outputFormat must be 'jpg' or 'png'.");
  }
}

/**
 * Interval-based multi-frame extraction (legacy `ApexPainter.extractFrames` when using `interval`).
 */
export async function extractFramesAtInterval(
  videoSource: string | Buffer,
  options: ExtractFramesOptions,
  session: FfmpegSession
): Promise<Array<{ source: string; isRemote: boolean }>> {
  try {
    const ffmpegAvailable = await session.checkAvailable();
    if (!ffmpegAvailable) {
      throw new Error(
        "❌ FFMPEG NOT FOUND\n" +
          "Video processing features require FFmpeg to be installed on your system.\n" +
          session.getInstallInstructions()
      );
    }

    validateExtractFramesInputs(videoSource, options);

    const frames: Array<{ source: string; isRemote: boolean }> = [];
    const frameDir = path.join(process.cwd(), ".temp-frames", `frames-${Date.now()}`);

    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const tempVideoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
    let videoPath: string;
    let shouldCleanupVideo = false;

    if (Buffer.isBuffer(videoSource)) {
      videoPath = tempVideoPath;
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else if (typeof videoSource === "string" && /^https?:\/\//i.test(videoSource)) {
      const response = await axios({
        method: "get",
        url: videoSource,
        responseType: "arraybuffer",
      });
      videoPath = tempVideoPath;
      fs.writeFileSync(videoPath, Buffer.from(response.data));
      shouldCleanupVideo = true;
    } else if (typeof videoSource === "string") {
      videoPath = path.isAbsolute(videoSource) ? videoSource : path.join(process.cwd(), videoSource);
      if (!fs.existsSync(videoPath)) {
        throw new Error("Video file not found at specified path.");
      }
    } else {
      throw new Error("extractFrames: videoSource must be a string path/URL or Buffer.");
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const { stdout: probeOutput } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
      { maxBuffer: 10 * 1024 * 1024 }
    );

    const duration = parseFloat(probeOutput.trim());
    if (isNaN(duration) || duration <= 0) {
      throw new Error("Video duration not found in metadata.");
    }

    const outputFormat = options.outputFormat || "jpg";
    const fps = 1000 / options.interval;
    const totalFrames = Math.floor(duration * fps);

    const startFrame = options.frameSelection?.start || 0;
    const endFrame =
      options.frameSelection?.end !== undefined
        ? Math.min(options.frameSelection.end, totalFrames - 1)
        : totalFrames - 1;

    const outputFileTemplate = path.join(frameDir, `frame-%03d.${outputFormat}`);
    const qualityFlag = outputFormat === "jpg" ? "-q:v 2" : "";
    const pixFmt = outputFormat === "png" ? "-pix_fmt rgba" : "-pix_fmt yuvj420p";

    const startTime = startFrame / fps;
    const endTime = (endFrame + 1) / fps;
    const durationToExtract = endTime - startTime;

    const escapedOutputTemplate = outputFileTemplate.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -ss ${startTime} -t ${durationToExtract} -vf fps=${fps} ${pixFmt} ${qualityFlag} -y "${escapedOutputTemplate}"`;

    try {
      await execAsync(command, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });

      const actualFrameCount = endFrame - startFrame + 1;
      for (let i = 0; i < actualFrameCount; i++) {
        const framePath = path.join(frameDir, `frame-${String(i + 1).padStart(3, "0")}.${outputFormat}`);

        if (fs.existsSync(framePath)) {
          frames.push({
            source: framePath,
            isRemote: false,
          });
        }
      }

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return frames;
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) {
      throw error;
    }
    throw new Error(`extractFrames failed: ${errorMessage}`);
  }
}
