import { ApexifyInputError } from "../../runtime/errors";
import { probeFormatDurationSeconds, probeHasAudioStream } from "../ffprobe-metadata";
import type { MixAudioOperation } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { buildAtempoChain, finiteNumber, nonNegativeNumber, positiveNumber } from "./filter-graph";

const AUDIO_RATE = 48_000;

function volume(value: number | undefined, label: string): number {
  const resolved = finiteNumber(value ?? 1, label);
  if (resolved < 0 || resolved > 4) throw new ApexifyInputError(`${label} must be between 0 and 4.`);
  return resolved;
}

function speed(value: number | undefined, label: string): number {
  const resolved = positiveNumber(value ?? 1, label);
  if (resolved < 0.125 || resolved > 16) throw new ApexifyInputError(`${label} must be between 0.125 and 16.`);
  return resolved;
}

function pitchTempoFilters(pitchSemitones: number | undefined, speedFactor: number | undefined): string[] {
  const filters: string[] = [];
  if (pitchSemitones !== undefined && pitchSemitones !== 0) {
    const semitones = finiteNumber(pitchSemitones, "pitchSemitones");
    if (semitones < -36 || semitones > 36) throw new ApexifyInputError("pitchSemitones must be between -36 and 36.");
    const ratio = 2 ** (semitones / 12);
    filters.push(`asetrate=${AUDIO_RATE}*${Number(ratio.toFixed(10))}`, `aresample=${AUDIO_RATE}`, buildAtempoChain(1 / ratio));
  }
  const tempo = speed(speedFactor, "audio speed");
  if (Math.abs(tempo - 1) > 1e-9) filters.push(buildAtempoChain(tempo));
  return filters;
}

function panFilter(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;
  const pan = finiteNumber(value, "audio pan");
  if (pan < -1 || pan > 1) throw new ApexifyInputError("audio pan must be between -1 and 1.");
  const left = pan > 0 ? 1 - pan : 1;
  const right = pan < 0 ? 1 + pan : 1;
  return `pan=stereo|c0=${Number(left.toFixed(6))}*c0|c1=${Number(right.toFixed(6))}*c1`;
}

function fadeFilters(fadeIn: number | undefined, fadeOut: number | undefined, duration: number): string[] {
  const filters: string[] = [];
  if (fadeIn !== undefined) {
    const d = positiveNumber(fadeIn, "audio fadeIn");
    if (d > duration) throw new ApexifyInputError("audio fadeIn exceeds overlay duration.");
    filters.push(`afade=t=in:st=0:d=${d}`);
  }
  if (fadeOut !== undefined) {
    const d = positiveNumber(fadeOut, "audio fadeOut");
    if (d > duration) throw new ApexifyInputError("audio fadeOut exceeds overlay duration.");
    filters.push(`afade=t=out:st=${Math.max(0, duration - d)}:d=${d}`);
  }
  return filters;
}

export class AudioOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async mix(source: string | Buffer, options: MixAudioOperation, controls: VideoRunControls = {}) {
    if (!options.overlays?.length) throw new ApexifyInputError("mixAudio requires at least one overlay.");
    return this.runtime.withWorkspace("apexify-mix-audio-", async (workspace) => {
      const video = await this.runtime.resolve(source, workspace, "video", controls);
      const info = await this.runtime.probeFile(video.videoPath, controls);
      const mainHasAudio = info.audio && await probeHasAudioStream(video.videoPath, this.runtime.session, controls.signal);
      const keepOriginal = options.keepOriginalAudio !== false;
      const args: string[] = ["-i", video.videoPath];
      const trackInputs: Array<{ inputIndex: number; start: number; sourceStart: number; duration: number; filters: string[] }> = [];
      let maxAudioEnd = keepOriginal && mainHasAudio ? info.duration : 0;

      for (let i = 0; i < options.overlays.length; i += 1) {
        const overlay = options.overlays[i]!;
        const resolved = await this.runtime.resolve(overlay.source, workspace, `audio-${i}`, controls);
        const sourceDuration = await probeFormatDurationSeconds(resolved.videoPath, this.runtime.session, controls.signal);
        const sourceStart = nonNegativeNumber(overlay.sourceStart ?? 0, `mixAudio.overlays[${i}].sourceStart`);
        if (sourceStart >= sourceDuration) throw new ApexifyInputError(`mixAudio.overlays[${i}].sourceStart is outside the source.`);
        const start = nonNegativeNumber(overlay.startTime, `mixAudio.overlays[${i}].startTime`);
        const available = sourceDuration - sourceStart;
        const requested = overlay.duration === undefined ? available : positiveNumber(overlay.duration, `mixAudio.overlays[${i}].duration`);
        const clipDuration = Math.min(requested, available);
        if (clipDuration <= 0) throw new ApexifyInputError(`mixAudio.overlays[${i}] has no playable duration.`);
        const filters = [
          `atrim=start=${sourceStart}:duration=${clipDuration}`,
          "asetpts=PTS-STARTPTS",
          `aresample=${AUDIO_RATE}`,
          ...pitchTempoFilters(overlay.pitchSemitones, overlay.speed),
          "aformat=sample_fmts=fltp:channel_layouts=stereo",
          `volume=${volume(overlay.volume, `mixAudio.overlays[${i}].volume`)}`,
          ...fadeFilters(overlay.fadeIn, overlay.fadeOut, clipDuration),
        ];
        const pan = panFilter(overlay.pan);
        if (pan) filters.push(pan);
        const delayMs = Math.round(start * 1000);
        if (delayMs > 0) filters.push(`adelay=${delayMs}|${delayMs}`);
        args.push("-i", resolved.videoPath);
        trackInputs.push({ inputIndex: i + 1, start, sourceStart, duration: clipDuration, filters });
        const effectiveDuration = clipDuration / speed(overlay.speed, "audio speed");
        maxAudioEnd = Math.max(maxAudioEnd, start + effectiveDuration);
      }

      const graph: string[] = [];
      const labels: string[] = [];
      if (keepOriginal && mainHasAudio) {
        const originalFilters = [
          `aresample=${AUDIO_RATE}`,
          ...pitchTempoFilters(options.originalPitchSemitones, options.originalSpeed),
          "aformat=sample_fmts=fltp:channel_layouts=stereo",
          `volume=${volume(options.originalVolume, "mixAudio.originalVolume")}`,
        ];
        graph.push(`[0:a:0]${originalFilters.join(",")}[a0]`);
        labels.push("[a0]");
      }
      for (let i = 0; i < trackInputs.length; i += 1) {
        const track = trackInputs[i]!;
        graph.push(`[${track.inputIndex}:a:0]${track.filters.join(",")}[a${i + 1}]`);
        labels.push(`[a${i + 1}]`);
      }
      if (!labels.length) throw new ApexifyInputError("mixAudio resolved no audio streams.");
      const policy = options.durationPolicy ?? "video";
      const amixDuration = policy === "shortest" ? "shortest" : "longest";
      graph.push(`${labels.join("")}amix=inputs=${labels.length}:duration=${amixDuration}:normalize=0,alimiter=limit=0.95[aout]`);

      let outputDuration = info.duration;
      let videoMap = "0:v:0";
      if (policy === "longest" && maxAudioEnd > info.duration + 0.001) {
        const extension = maxAudioEnd - info.duration;
        graph.push(`[0:v:0]tpad=stop_mode=clone:stop_duration=${extension}[vout]`);
        videoMap = "[vout]";
        outputDuration = maxAudioEnd;
      } else if (policy === "shortest") {
        outputDuration = Math.min(info.duration, maxAudioEnd || info.duration);
      }

      args.push("-filter_complex", graph.join(";"), "-map", videoMap, "-map", "[aout]");
      if (videoMap === "0:v:0") args.push("-c:v", "copy");
      else args.push("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p");
      args.push("-c:a", "aac", "-b:a", "192k");
      if (policy === "video") args.push("-t", String(info.duration));
      else if (policy === "shortest") args.push("-shortest");
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, outputDuration);
      return { outputPath: options.outputPath, success: true, durationPolicy: policy } as const;
    });
  }
}
