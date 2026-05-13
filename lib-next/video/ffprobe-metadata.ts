import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import type { FfmpegSession } from "./ffmpeg-session";
import type { VideoProbeMetadata } from "../types/video";
import { getErrorMessage } from "../core/errors";
import { resolveVideoInputToPath } from "./video-input-resolve";

const execAsync = promisify(exec);

/**
 * Run ffprobe on an existing file path (does not delete the file).
 */
export async function ffprobeVideoFile(
  videoPath: string,
  session: FfmpegSession,
  skipFfmpegCheck: boolean = false
): Promise<VideoProbeMetadata> {
  if (!skipFfmpegCheck) {
    const ok = await session.checkAvailable();
    if (!ok) {
      throw new Error(
        "❌ FFMPEG NOT FOUND\n" +
          "Video processing features require FFmpeg to be installed on your system.\n" +
          session.getInstallInstructions()
      );
    }
  }

  const escapedPath = videoPath.replace(/"/g, '\\"');
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration,format_name -of json "${escapedPath}"`,
    {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    }
  );

  const info = JSON.parse(stdout) as {
    streams?: Array<{ width?: string; height?: string; r_frame_rate?: string; bit_rate?: string }>;
    format?: { duration?: string; bit_rate?: string; format_name?: string };
  };
  const videoStream = info.streams?.find((s) => s.width && s.height) || info.streams?.[0];
  const format = info.format || {};

  const fps = videoStream?.r_frame_rate
    ? (() => {
        const [num, den] = videoStream.r_frame_rate!.split("/").map(Number);
        return den ? num / den : num;
      })()
    : 30;

  return {
    duration: parseFloat(format.duration || "0"),
    width: parseInt(videoStream?.width || "0", 10),
    height: parseInt(videoStream?.height || "0", 10),
    fps,
    bitrate: parseInt(videoStream?.bit_rate || format.bit_rate || "0", 10),
    format: format.format_name || "unknown",
  };
}

/**
 * Resolve `videoSource` to a path, probe, then delete temp inputs when applicable.
 */
export async function probeVideoMetadata(
  videoSource: string | Buffer,
  session: FfmpegSession,
  skipFfmpegCheck: boolean = false
): Promise<VideoProbeMetadata | null> {
  try {
    const frameDir = path.join(process.cwd(), ".temp-frames");
    const { videoPath, shouldCleanup } = await resolveVideoInputToPath(
      videoSource,
      frameDir,
      `probe-${Date.now()}`
    );

    const result = await ffprobeVideoFile(videoPath, session, skipFfmpegCheck);

    if (shouldCleanup && fs.existsSync(videoPath)) {
      fs.unlinkSync(videoPath);
    }

    return result;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) {
      throw error;
    }
    throw new Error(`getVideoInfo failed: ${errorMessage}`);
  }
}
