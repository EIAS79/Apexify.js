import { promises as fs } from "node:fs";
import path from "node:path";
import { ApexifyInputError } from "../../runtime/errors";
import type { VideoQuality, VideoOutputFormat, VideoFit } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { buildAtempoChain, buildScaleFilter, finiteNumber, nonNegativeNumber, positiveNumber } from "./filter-graph";

const QUALITY_CRF: Record<VideoQuality, string> = { low: "30", medium: "24", high: "19", ultra: "16" };
const FORMAT_DEFAULTS: Record<VideoOutputFormat, { video: AllowedVideoCodec; audio: AllowedAudioCodec; muxer: string }> = {
  mp4: { video: "libx264", audio: "aac", muxer: "mp4" },
  mov: { video: "libx264", audio: "aac", muxer: "mov" },
  mkv: { video: "libx264", audio: "aac", muxer: "matroska" },
  avi: { video: "libx264", audio: "mp3", muxer: "avi" },
  webm: { video: "libvpx-vp9", audio: "libopus", muxer: "webm" },
};

export type AllowedVideoCodec = "libx264" | "libx265" | "libvpx-vp9" | "libaom-av1" | "copy";
export type AllowedAudioCodec = "aac" | "libopus" | "libvorbis" | "mp3" | "copy" | "none";

function qualityArgs(quality: VideoQuality | undefined, bitrate?: number): string[] {
  if (bitrate !== undefined) return ["-b:v", `${positiveNumber(bitrate, "video bitrate")}k`];
  return ["-crf", QUALITY_CRF[quality ?? "medium"]];
}

function explicitMapArgs(hasAudio: boolean, includeAudio = true): string[] {
  return ["-map", "0:v:0", ...(hasAudio && includeAudio ? ["-map", "0:a?"] : [])];
}

function validateSpeed(speed: number): number {
  positiveNumber(speed, "video speed");
  if (speed < 0.125 || speed > 16) throw new ApexifyInputError("video speed must be between 0.125x and 16x.");
  return speed;
}

function inferFormat(outputPath: string): VideoOutputFormat | undefined {
  const ext = path.extname(outputPath).slice(1).toLowerCase();
  return (["mp4", "webm", "avi", "mov", "mkv"] as const).find((format) => format === ext);
}

function assertFormatMatchesExtension(outputPath: string, format: VideoOutputFormat): void {
  const ext = path.extname(outputPath).slice(1).toLowerCase();
  if (ext && ext !== format) throw new ApexifyInputError(`video output extension .${ext} does not match requested format ${format}.`);
}

export class TranscodeOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async convert(source: string | Buffer, options: {
    outputPath: string;
    format?: VideoOutputFormat;
    videoCodec?: AllowedVideoCodec;
    audioCodec?: AllowedAudioCodec;
    pixelFormat?: "yuv420p" | "yuv422p" | "yuv444p" | "rgba";
    quality?: VideoQuality;
    bitrate?: number;
    fps?: number;
    resolution?: { width?: number; height?: number; fit?: VideoFit };
  }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-convert-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const format = options.format ?? inferFormat(options.outputPath) ?? "mp4";
      assertFormatMatchesExtension(options.outputPath, format);
      const defaults = FORMAT_DEFAULTS[format];
      const videoCodec = options.videoCodec ?? defaults.video;
      const audioCodec = options.audioCodec ?? defaults.audio;
      const scale = options.resolution ? buildScaleFilter(options.resolution) : undefined;
      if (videoCodec === "copy" && (scale || options.fps !== undefined || options.pixelFormat !== undefined || options.bitrate !== undefined || options.quality !== undefined)) {
        throw new ApexifyInputError("video.convert videoCodec=copy cannot be combined with transform/quality options.");
      }
      const args: string[] = ["-i", videoPath, ...explicitMapArgs(info.audio, audioCodec !== "none")];
      if (scale) args.push("-vf", scale);
      if (options.fps !== undefined) args.push("-r", String(positiveNumber(options.fps, "fps")));
      args.push("-c:v", videoCodec);
      if (videoCodec !== "copy") args.push(...qualityArgs(options.quality, options.bitrate));
      if (options.pixelFormat && videoCodec !== "copy") args.push("-pix_fmt", options.pixelFormat);
      if (audioCodec === "none") args.push("-an");
      else if (info.audio) args.push("-c:a", audioCodec);
      if (format === "mp4" || format === "mov") args.push("-movflags", "+faststart");
      args.push("-f", defaults.muxer, ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async trim(source: string | Buffer, options: { startTime: number; endTime: number; outputPath: string; mode?: "accurate" | "copy" }, controls: VideoRunControls = {}) {
    const start = nonNegativeNumber(options.startTime, "trim startTime");
    const end = positiveNumber(options.endTime, "trim endTime");
    if (end <= start) throw new ApexifyInputError("trim endTime must be greater than startTime.");
    return this.runtime.withWorkspace("apexify-trim-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (start >= info.duration || end > info.duration + 0.001) throw new ApexifyInputError("trim range is outside the source duration.");
      const duration = end - start;
      const copy = options.mode === "copy";
      const args = copy
        ? ["-ss", String(start), "-i", videoPath, "-t", String(duration), "-map", "0", "-c", "copy"]
        : ["-i", videoPath, "-ss", String(start), "-t", String(duration), ...explicitMapArgs(info.audio), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...(info.audio ? ["-c:a", "aac"] : [])];
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, duration);
      return { outputPath: options.outputPath, success: true, mode: copy ? "copy" : "accurate" } as const;
    });
  }

  async extractAudio(source: string | Buffer, options: { outputPath: string; format?: "mp3" | "wav" | "aac" | "ogg"; bitrate?: number }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-audio-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (!info.audio) throw new ApexifyInputError("Video does not contain an audio stream.");
      const format = options.format ?? "mp3";
      const codecs: Record<typeof format, string> = { mp3: "libmp3lame", wav: "pcm_s16le", aac: "aac", ogg: "libvorbis" };
      const args = ["-i", videoPath, "-map", "0:a:0", "-vn", "-c:a", codecs[format]];
      if (format !== "wav") args.push("-b:a", `${positiveNumber(options.bitrate ?? 128, "audio bitrate")}k`);
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async speed(source: string | Buffer, options: { speed: number; outputPath: string }, controls: VideoRunControls = {}) {
    const speed = validateSpeed(options.speed);
    return this.runtime.withWorkspace("apexify-speed-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const expected = info.duration / speed;
      const video = `setpts=${Number((1 / speed).toFixed(10))}*PTS`;
      const args: string[] = ["-i", videoPath];
      if (info.audio) {
        args.push("-filter_complex", `[0:v]${video}[v];[0:a]${buildAtempoChain(speed)}[a]`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac");
      } else {
        args.push("-vf", video, "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p");
      }
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, expected);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async effects(source: string | Buffer, options: { filters: Array<{ type: "blur" | "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "invert" | "sharpen" | "noise"; intensity?: number; value?: number }>; outputPath: string }, controls: VideoRunControls = {}) {
    if (!options.filters.length) throw new ApexifyInputError("video.applyEffects requires at least one filter.");
    const filters = options.filters.map((filter, index) => buildEffectFilter(filter, index));
    return this.videoFilter(source, filters.join(","), options.outputPath, controls, "effects", "19");
  }

  async rotate(source: string | Buffer, options: { angle?: 90 | 180 | 270; flip?: "horizontal" | "vertical" | "both"; outputPath: string }, controls: VideoRunControls = {}) {
    const filters: string[] = [];
    if (options.angle === 90) filters.push("transpose=1");
    else if (options.angle === 180) filters.push("hflip", "vflip");
    else if (options.angle === 270) filters.push("transpose=2");
    if (options.flip === "horizontal" || options.flip === "both") filters.push("hflip");
    if (options.flip === "vertical" || options.flip === "both") filters.push("vflip");
    if (!filters.length) throw new ApexifyInputError("video.rotate requires angle or flip.");
    return this.videoFilter(source, filters.join(","), options.outputPath, controls, "rotate");
  }

  async crop(source: string | Buffer, options: { x: number; y: number; width: number; height: number; outputPath: string }, controls: VideoRunControls = {}) {
    const x = nonNegativeNumber(options.x, "crop x");
    const y = nonNegativeNumber(options.y, "crop y");
    const width = positiveNumber(options.width, "crop width");
    const height = positiveNumber(options.height, "crop height");
    return this.runtime.withWorkspace("apexify-crop-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (x + width > info.width || y + height > info.height) throw new ApexifyInputError("crop rectangle exceeds source dimensions.");
      const filter = `crop=${Math.floor(width)}:${Math.floor(height)}:${x}:${y}`;
      const args = ["-i", videoPath, "-vf", filter, ...explicitMapArgs(info.audio), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...(info.audio ? ["-c:a", "copy"] : []), ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async compress(source: string | Buffer, options: { outputPath: string; quality?: VideoQuality; targetSize?: number; maxBitrate?: number }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-compress-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const originalSize = (await fs.stat(videoPath)).size;
      const args: string[] = ["-i", videoPath, ...explicitMapArgs(info.audio), "-c:v", "libx264"];
      let targetBitrate = options.maxBitrate;
      if (options.targetSize !== undefined) {
        positiveNumber(options.targetSize, "targetSize");
        if (options.maxBitrate !== undefined) throw new ApexifyInputError("compress targetSize and maxBitrate are mutually exclusive.");
        const totalKbps = (options.targetSize * 1024 * 1024 * 8) / Math.max(info.duration, 0.001) / 1000;
        targetBitrate = Math.max(64, totalKbps - (info.audio ? 128 : 0));
      }
      if (targetBitrate !== undefined) args.push("-b:v", `${Math.floor(positiveNumber(targetBitrate, "compression bitrate"))}k`, "-maxrate", `${Math.floor(targetBitrate)}k`, "-bufsize", `${Math.floor(targetBitrate * 2)}k`);
      else args.push("-crf", QUALITY_CRF[options.quality ?? "medium"]);
      args.push("-pix_fmt", "yuv420p");
      if (info.audio) args.push("-c:a", "aac", "-b:a", "128k");
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration);
      const compressedSize = (await fs.stat(options.outputPath)).size;
      return { outputPath: options.outputPath, success: true, originalSize, compressedSize } as const;
    });
  }

  async fade(source: string | Buffer, options: { fadeIn?: number; fadeOut?: number; outputPath: string }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-fade-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const filters: string[] = [];
      if (options.fadeIn !== undefined) {
        const d = positiveNumber(options.fadeIn, "fadeIn");
        if (d > info.duration) throw new ApexifyInputError("fadeIn exceeds source duration.");
        filters.push(`fade=t=in:st=0:d=${d}`);
      }
      if (options.fadeOut !== undefined) {
        const d = positiveNumber(options.fadeOut, "fadeOut");
        if (d > info.duration) throw new ApexifyInputError("fadeOut exceeds source duration.");
        filters.push(`fade=t=out:st=${Math.max(0, info.duration - d)}:d=${d}`);
      }
      if (!filters.length) throw new ApexifyInputError("addFade requires fadeIn and/or fadeOut.");
      return this.videoFilterResolved(videoPath, info.audio, info.duration, filters.join(","), options.outputPath, controls, "18");
    });
  }

  async reverse(source: string | Buffer, outputPath: string, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-reverse-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const args = ["-i", videoPath, "-vf", "reverse", ...(info.audio ? ["-af", "areverse"] : []), ...explicitMapArgs(info.audio), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...(info.audio ? ["-c:a", "aac"] : []), ...this.runtime.outputArgs(outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath, success: true } as const;
    });
  }

  async removeAudio(source: string | Buffer, outputPath: string, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-remove-audio-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const args = ["-i", videoPath, "-map", "0:v:0", "-c:v", "copy", "-an", ...this.runtime.outputArgs(outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath, success: true } as const;
    });
  }

  async mute(source: string | Buffer, options: { outputPath: string; ranges?: Array<{ start: number; end: number }> }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-mute-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (!info.audio) throw new ApexifyInputError("Video does not contain audio to mute.");
      const args: string[] = ["-i", videoPath, "-map", "0:v:0"];
      if (options.ranges?.length) {
        const filters = options.ranges.map((range) => {
          const start = nonNegativeNumber(range.start, "mute range start");
          const end = positiveNumber(range.end, "mute range end");
          if (end <= start || end > info.duration) throw new ApexifyInputError("mute range is invalid or outside source duration.");
          return `volume=enable='between(t\\,${start}\\,${end})':volume=0`;
        });
        args.push("-map", "0:a:0", "-af", filters.join(","), "-c:v", "copy", "-c:a", "aac");
      } else args.push("-c:v", "copy", "-an");
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async adjustVolume(source: string | Buffer, options: { outputPath: string; volume?: number; ranges?: Array<{ start: number; end: number; volume: number; speed?: number; pitchSemitones?: number }> }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-volume-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (!info.audio) throw new ApexifyInputError("Video does not contain audio to adjust.");
      if (options.ranges?.some((range) => range.speed !== undefined || range.pitchSemitones !== undefined)) {
        throw new ApexifyInputError("Range-local speed/pitch adjustment is deprecated; use videoPipeline audio tracks instead.");
      }
      const filters = options.ranges?.length
        ? options.ranges.map((range) => {
            const start = nonNegativeNumber(range.start, "volume range start");
            const end = positiveNumber(range.end, "volume range end");
            if (end <= start || end > info.duration) throw new ApexifyInputError("volume range is invalid or outside source duration.");
            return `volume=volume=${finiteNumber(range.volume, "range volume") / 100}:enable='between(t\\,${start}\\,${end})'`;
          }).join(",")
        : `volume=${finiteNumber(options.volume ?? 100, "volume") / 100}`;
      const args = ["-i", videoPath, "-map", "0:v:0", "-map", "0:a:0", "-af", filters, "-c:v", "copy", "-c:a", "aac", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async normalizeAudio(source: string | Buffer, options: { targetLevel?: number; method?: "peak" | "rms" | "lufs"; outputPath: string }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-normalize-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (!info.audio) throw new ApexifyInputError("Video does not contain audio to normalize.");
      const method = options.method ?? "lufs";
      const target = finiteNumber(options.targetLevel ?? (method === "lufs" ? -23 : -1), "targetLevel");
      const filter = method === "lufs" ? `loudnorm=I=${target}:TP=-1.5:LRA=11` : `volume=${target}dB`;
      const args = ["-i", videoPath, "-map", "0:v:0", "-map", "0:a:0", "-af", filter, "-c:v", "copy", "-c:a", "aac", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async colorCorrect(source: string | Buffer, options: { brightness?: number; contrast?: number; saturation?: number; hue?: number; temperature?: number; outputPath: string }, controls: VideoRunControls = {}) {
    const filters: string[] = [];
    if (options.brightness !== undefined) {
      const value = finiteNumber(options.brightness, "brightness");
      if (value < -100 || value > 100) throw new ApexifyInputError("brightness must be between -100 and 100.");
      filters.push(`eq=brightness=${Number((value / 100).toFixed(4))}`);
    }
    if (options.contrast !== undefined) {
      const value = finiteNumber(options.contrast, "contrast");
      if (value < -100 || value > 100) throw new ApexifyInputError("contrast must be between -100 and 100.");
      filters.push(`eq=contrast=${Number((1 + value / 100).toFixed(4))}`);
    }
    if (options.saturation !== undefined) {
      const value = finiteNumber(options.saturation, "saturation");
      if (value < -100 || value > 300) throw new ApexifyInputError("saturation must be between -100 and 300.");
      filters.push(`eq=saturation=${Number((1 + value / 100).toFixed(4))}`);
    }
    if (options.hue !== undefined) {
      const value = finiteNumber(options.hue, "hue");
      if (value < -360 || value > 360) throw new ApexifyInputError("hue must be between -360 and 360 degrees.");
      filters.push(`hue=h=${value}`);
    }
    if (options.temperature !== undefined) {
      const value = finiteNumber(options.temperature, "temperature");
      if (value < -100 || value > 100) throw new ApexifyInputError("temperature must be between -100 and 100.");
      filters.push(`colorbalance=rs=${value / 100}:gs=${-value / 200}:bs=${-value / 100}`);
    }
    if (!filters.length) throw new ApexifyInputError("colorCorrect requires at least one correction value.");
    return this.videoFilter(source, filters.join(","), options.outputPath, controls, "color");
  }

  private async videoFilter(source: string | Buffer, filter: string, outputPath: string, controls: VideoRunControls, prefix: string, crf = "18") {
    return this.runtime.withWorkspace(`apexify-${prefix}-`, async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      return this.videoFilterResolved(videoPath, info.audio, info.duration, filter, outputPath, controls, crf);
    });
  }

  private async videoFilterResolved(videoPath: string, hasAudio: boolean, duration: number, filter: string, outputPath: string, controls: VideoRunControls, crf: string) {
    const args = ["-i", videoPath, "-vf", filter, ...explicitMapArgs(hasAudio), "-c:v", "libx264", "-crf", crf, "-pix_fmt", "yuv420p", ...(hasAudio ? ["-c:a", "copy"] : []), ...this.runtime.outputArgs(outputPath, controls.overwrite !== false)];
    await this.runtime.runFfmpeg(args, controls, duration);
    return { outputPath, success: true } as const;
  }
}

function buildEffectFilter(filter: { type: "blur" | "brightness" | "contrast" | "saturation" | "grayscale" | "sepia" | "invert" | "sharpen" | "noise"; intensity?: number; value?: number }, index: number): string {
  const label = `video.applyEffects.filters[${index}]`;
  switch (filter.type) {
    case "blur": {
      if (filter.value !== undefined) throw new ApexifyInputError(`${label}.value is not used by blur; use intensity.`);
      const intensity = finiteNumber(filter.intensity ?? 5, `${label}.intensity`);
      if (intensity < 0 || intensity > 50) throw new ApexifyInputError(`${label}.intensity must be 0..50.`);
      return `boxblur=${intensity}`;
    }
    case "brightness": {
      if (filter.intensity !== undefined) throw new ApexifyInputError(`${label}.intensity is not used by brightness; use value.`);
      const value = finiteNumber(filter.value ?? 0, `${label}.value`);
      if (value < -100 || value > 100) throw new ApexifyInputError(`${label}.value must be -100..100.`);
      return `eq=brightness=${Number((value / 100).toFixed(4))}`;
    }
    case "contrast": {
      if (filter.intensity !== undefined) throw new ApexifyInputError(`${label}.intensity is not used by contrast; use value.`);
      const value = finiteNumber(filter.value ?? 0, `${label}.value`);
      if (value < -100 || value > 100) throw new ApexifyInputError(`${label}.value must be -100..100.`);
      return `eq=contrast=${Number((1 + value / 100).toFixed(4))}`;
    }
    case "saturation": {
      if (filter.intensity !== undefined) throw new ApexifyInputError(`${label}.intensity is not used by saturation; use value.`);
      const value = finiteNumber(filter.value ?? 0, `${label}.value`);
      if (value < -100 || value > 300) throw new ApexifyInputError(`${label}.value must be -100..300.`);
      return `eq=saturation=${Number((1 + value / 100).toFixed(4))}`;
    }
    case "grayscale":
      if (filter.value !== undefined || filter.intensity !== undefined) throw new ApexifyInputError(`${label} does not accept value/intensity.`);
      return "hue=s=0";
    case "sepia":
      if (filter.value !== undefined || filter.intensity !== undefined) throw new ApexifyInputError(`${label} does not accept value/intensity.`);
      return "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131";
    case "invert":
      if (filter.value !== undefined || filter.intensity !== undefined) throw new ApexifyInputError(`${label} does not accept value/intensity.`);
      return "negate";
    case "sharpen": {
      if (filter.value !== undefined) throw new ApexifyInputError(`${label}.value is not used by sharpen; use intensity.`);
      const intensity = finiteNumber(filter.intensity ?? 1, `${label}.intensity`);
      if (intensity < 0 || intensity > 5) throw new ApexifyInputError(`${label}.intensity must be 0..5.`);
      return `unsharp=5:5:${intensity}:5:5:0`;
    }
    case "noise": {
      if (filter.value !== undefined) throw new ApexifyInputError(`${label}.value is not used by noise; use intensity.`);
      const intensity = finiteNumber(filter.intensity ?? 20, `${label}.intensity`);
      if (intensity < 0 || intensity > 100) throw new ApexifyInputError(`${label}.intensity must be 0..100.`);
      return `noise=alls=${intensity}:allf=t+u`;
    }
  }
}
