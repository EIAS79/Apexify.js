import type { FfmpegSession } from "./ffmpeg-session";
import type { VideoProbeMetadata } from "../types";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyError, ApexifyProcessError } from "../runtime/errors";
import { assertSource } from "../runtime/validation";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { withTempWorkspace } from "./temp-workspace";
import { validateVideoProbeMetadata } from "./video-validation";

function probeOptions() {
  const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
  return {
    timeoutMs: ffmpeg.probeTimeoutMs,
    maxStdoutBytes: ffmpeg.maxStdoutBytes,
    maxStderrBytes: ffmpeg.maxStderrBytes,
  } as const;
}

/** Run ffprobe on an existing file path using the centralized shell-free runner. */
export async function ffprobeVideoFile(
  videoPath: string,
  session: FfmpegSession,
  skipFfmpegCheck: boolean = false
): Promise<VideoProbeMetadata> {
  if (!skipFfmpegCheck && !(await session.checkAvailable())) {
    throw new ApexifyProcessError(
      "Video processing features require FFmpeg/ffprobe to be installed.",
      { details: { installInstructions: session.getInstallInstructions() } }
    );
  }

  const { stdout } = await session.runFfprobe(
    [
      "-v", "error",
      "-show_entries", "stream=width,height,r_frame_rate,bit_rate",
      "-show_entries", "format=duration,format_name,bit_rate",
      "-of", "json",
      videoPath,
    ],
    probeOptions()
  );

  const info = JSON.parse(stdout) as {
    streams?: Array<{ width?: number | string; height?: number | string; r_frame_rate?: string; bit_rate?: string }>;
    format?: { duration?: string; bit_rate?: string; format_name?: string };
  };
  const videoStream = info.streams?.find((s) => Number(s.width) > 0 && Number(s.height) > 0) || info.streams?.[0];
  const format = info.format || {};
  const fps = videoStream?.r_frame_rate
    ? (() => {
        const [num, den] = videoStream.r_frame_rate!.split("/").map(Number);
        return den ? num / den : num;
      })()
    : 30;

  const metadata: VideoProbeMetadata = {
    duration: Number.parseFloat(format.duration || "0"),
    width: Number.parseInt(String(videoStream?.width || "0"), 10),
    height: Number.parseInt(String(videoStream?.height || "0"), 10),
    fps: Number.isFinite(fps) ? fps : 0,
    bitrate: Number.parseInt(String(videoStream?.bit_rate || format.bit_rate || "0"), 10),
    format: format.format_name || "unknown",
  };
  // Enforce input video resource budgets immediately after the lightweight probe and before FFmpeg transforms.
  validateVideoProbeMetadata(metadata);
  return metadata;
}

export async function probeHasAudioStream(mediaPath: string, session: FfmpegSession): Promise<boolean> {
  try {
    const { stdout } = await session.runFfprobe(
      ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=index", "-of", "csv=p=0", mediaPath],
      probeOptions()
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

export async function probeFormatDurationSeconds(mediaPath: string, session: FfmpegSession): Promise<number> {
  try {
    const { stdout } = await session.runFfprobe(
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath],
      probeOptions()
    );
    const value = Number.parseFloat(stdout.trim());
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export async function probeVideoCodec(mediaPath: string, session: FfmpegSession): Promise<string> {
  try {
    const { stdout } = await session.runFfprobe(
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath],
      probeOptions()
    );
    return stdout.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export async function probeVideoCodecSource(
  source: string | Buffer,
  session: FfmpegSession
): Promise<string> {
  assertSource(source, "video.codec.source");
  return withTempWorkspace(
    { ...session.workspaceOptions, prefix: "apexify-codec-" },
    async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(source, workspace, "codec-input");
      return probeVideoCodec(videoPath, session);
    }
  );
}

export async function probeImageDimensions(
  mediaPath: string,
  session: FfmpegSession
): Promise<{ width: number; height: number } | undefined> {
  try {
    const { stdout } = await session.runFfprobe(
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", mediaPath],
      probeOptions()
    );
    const [width, height] = stdout.trim().split("x").map(Number);
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
      ? { width, height }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Resolve a source inside an isolated workspace, probe it, validate it, and guarantee cleanup. */
export async function probeVideoMetadata(
  videoSource: string | Buffer,
  session: FfmpegSession,
  skipFfmpegCheck: boolean = false
): Promise<VideoProbeMetadata | null> {
  assertSource(videoSource, "video.getVideoInfo.source");
  try {
    return await withTempWorkspace(
      { ...session.workspaceOptions, prefix: "apexify-probe-" },
      async (workspace) => {
        const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "probe-input");
        return ffprobeVideoFile(videoPath, session, skipFfmpegCheck);
      }
    );
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyProcessError("Video metadata probe failed.", { cause: error });
  }
}
