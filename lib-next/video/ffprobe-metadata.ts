import type { FfmpegSession } from "./ffmpeg-session";
import type { VideoProbeMetadata, VideoProbeStream } from "../types";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError, ApexifyProcessError } from "../runtime/errors";
import { assertSource } from "../runtime/validation";
import { resolveVideoInputToPath } from "./video-input-resolve";
import { withTempWorkspace } from "./temp-workspace";
import { validateVideoProbeMetadata } from "./video-validation";

function probeOptions(signal?: AbortSignal) {
  const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
  return {
    timeoutMs: ffmpeg.probeTimeoutMs,
    maxStdoutBytes: ffmpeg.maxStdoutBytes,
    maxStderrBytes: ffmpeg.maxStderrBytes,
    signal,
  } as const;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseRate(value: unknown): number {
  if (typeof value !== "string" || !value) return 0;
  const [rawNum, rawDen] = value.split("/");
  const num = Number(rawNum);
  const den = Number(rawDen ?? 1);
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  const rate = num / den;
  return Number.isFinite(rate) && rate >= 0 ? rate : 0;
}

function parseProbeJson(stdout: string): {
  streams?: Array<Record<string, unknown>>;
  format?: Record<string, unknown>;
} {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("ffprobe JSON root was not an object");
    }
    return parsed as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  } catch (cause) {
    throw new ApexifyDecodeError("FFprobe returned malformed metadata JSON.", { cause });
  }
}

function toStream(stream: Record<string, unknown>, index: number): VideoProbeStream {
  const codecType = typeof stream.codec_type === "string" ? stream.codec_type : "unknown";
  return {
    index: Number.isInteger(Number(stream.index)) ? Number(stream.index) : index,
    type: codecType === "video" || codecType === "audio" || codecType === "subtitle" || codecType === "data" || codecType === "attachment"
      ? codecType
      : "unknown",
    codec: typeof stream.codec_name === "string" && stream.codec_name ? stream.codec_name : "unknown",
    codecLongName: typeof stream.codec_long_name === "string" ? stream.codec_long_name : undefined,
    profile: typeof stream.profile === "string" ? stream.profile : undefined,
    width: positiveInteger(stream.width),
    height: positiveInteger(stream.height),
    fps: parseRate(stream.avg_frame_rate) || parseRate(stream.r_frame_rate) || undefined,
    bitrate: finiteNumber(stream.bit_rate, 0) || undefined,
    pixelFormat: typeof stream.pix_fmt === "string" ? stream.pix_fmt : undefined,
    sampleRate: positiveInteger(stream.sample_rate),
    channels: positiveInteger(stream.channels),
    channelLayout: typeof stream.channel_layout === "string" ? stream.channel_layout : undefined,
    duration: finiteNumber(stream.duration, 0) || undefined,
  };
}

/** Run ffprobe on an existing local file via the authoritative shell-free process layer. */
export async function ffprobeVideoFile(
  videoPath: string,
  session: FfmpegSession,
  skipFfmpegCheck = false,
  signal?: AbortSignal
): Promise<VideoProbeMetadata> {
  if (!skipFfmpegCheck && !(await session.checkAvailable())) {
    throw new ApexifyProcessError("Video processing features require FFmpeg/ffprobe to be installed.", {
      details: { installInstructions: session.getInstallInstructions() },
    });
  }

  const { stdout } = await session.runFfprobe([
    "-v", "error",
    "-show_entries", "stream=index,codec_type,codec_name,codec_long_name,profile,width,height,avg_frame_rate,r_frame_rate,bit_rate,pix_fmt,sample_rate,channels,channel_layout,duration",
    "-show_entries", "format=duration,format_name,format_long_name,bit_rate,size",
    "-of", "json",
    videoPath,
  ], probeOptions(signal));

  const raw = parseProbeJson(stdout);
  const streams = Array.isArray(raw.streams) ? raw.streams.map(toStream) : [];
  const videoStream = streams.find((stream) => stream.type === "video" && stream.width && stream.height);
  if (!videoStream) {
    throw new ApexifyDecodeError("Input does not contain a decodable video stream.", {
      details: { streamTypes: streams.map((stream) => stream.type) },
    });
  }
  const audioStreams = streams.filter((stream) => stream.type === "audio");
  const format = raw.format ?? {};
  const duration = finiteNumber(format.duration, videoStream.duration ?? 0);
  if (!(duration > 0)) {
    throw new ApexifyDecodeError("Video duration is missing, zero, or unknown.");
  }
  const width = videoStream.width!;
  const height = videoStream.height!;
  const fps = videoStream.fps ?? 0;
  if (!(fps > 0)) {
    throw new ApexifyDecodeError("Video frame rate is missing or invalid.");
  }
  const bitrate = videoStream.bitrate ?? finiteNumber(format.bit_rate, 0);
  const container = typeof format.format_name === "string" && format.format_name ? format.format_name : "unknown";
  const metadata: VideoProbeMetadata = {
    duration,
    width,
    height,
    fps,
    bitrate,
    format: container,
    container,
    containerLongName: typeof format.format_long_name === "string" ? format.format_long_name : undefined,
    codec: videoStream.codec,
    pixelFormat: videoStream.pixelFormat,
    audio: audioStreams.length > 0,
    audioCodec: audioStreams[0]?.codec,
    audioStreams: audioStreams.length,
    streams,
    size: finiteNumber(format.size, 0) || undefined,
  };
  validateVideoProbeMetadata(metadata);
  return metadata;
}

export async function probeHasAudioStream(mediaPath: string, session: FfmpegSession, signal?: AbortSignal): Promise<boolean> {
  const { stdout } = await session.runFfprobe([
    "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", mediaPath,
  ], probeOptions(signal));
  return stdout.trim().length > 0;
}

export async function probeFormatDurationSeconds(mediaPath: string, session: FfmpegSession, signal?: AbortSignal): Promise<number> {
  const { stdout } = await session.runFfprobe([
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath,
  ], probeOptions(signal));
  const value = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(value) || value <= 0) throw new ApexifyDecodeError("Media duration is missing, zero, or unknown.");
  return value;
}

export async function probeVideoCodec(mediaPath: string, session: FfmpegSession, signal?: AbortSignal): Promise<string> {
  const { stdout } = await session.runFfprobe([
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", mediaPath,
  ], probeOptions(signal));
  const codec = stdout.trim();
  if (!codec) throw new ApexifyDecodeError("Video codec could not be determined.");
  return codec;
}

export async function probeVideoCodecSource(source: string | Buffer, session: FfmpegSession, signal?: AbortSignal): Promise<string> {
  assertSource(source, "video.codec.source");
  return withTempWorkspace({ ...session.workspaceOptions, prefix: "apexify-codec-" }, async (workspace) => {
    const { videoPath } = await resolveVideoInputToPath(source, workspace, "codec-input", { signal });
    return probeVideoCodec(videoPath, session, signal);
  });
}

export async function probeImageDimensions(mediaPath: string, session: FfmpegSession, signal?: AbortSignal): Promise<{ width: number; height: number } | undefined> {
  const { stdout } = await session.runFfprobe([
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", mediaPath,
  ], probeOptions(signal));
  const [width, height] = stdout.trim().split("x").map(Number);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : undefined;
}

/** Resolve Buffer/local/remote source into an isolated workspace, then probe and clean up. */
export async function probeVideoMetadata(
  videoSource: string | Buffer,
  session: FfmpegSession,
  skipFfmpegCheck = false,
  signal?: AbortSignal
): Promise<VideoProbeMetadata> {
  assertSource(videoSource, "video.getVideoInfo.source");
  try {
    return await withTempWorkspace({ ...session.workspaceOptions, prefix: "apexify-probe-" }, async (workspace) => {
      const { videoPath } = await resolveVideoInputToPath(videoSource, workspace, "probe-input", { signal });
      return ffprobeVideoFile(videoPath, session, skipFfmpegCheck, signal);
    });
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    if (error instanceof TypeError || error instanceof SyntaxError) {
      throw new ApexifyInputError("Video metadata input is invalid.", { cause: error });
    }
    throw new ApexifyProcessError("Video metadata probe failed.", { cause: error });
  }
}
