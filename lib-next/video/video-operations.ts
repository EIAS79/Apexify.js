import { promises as fs } from "node:fs";
import path from "node:path";
import { ApexifyInputError, ApexifyProcessError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import type { FfmpegSession } from "./ffmpeg-session";
import { probeVideoCodecSource } from "./ffprobe-metadata";
import type { VideoCreationOptions, VideoOperationControls, VideoSource } from "./video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./operations/runtime";
import { TranscodeOperations } from "./operations/transcode";
import { MergeOperations } from "./operations/merge";
import { OverlayOperations } from "./operations/overlays";
import { AudioOperations } from "./operations/audio";
import { FrameOperations } from "./operations/frames";
import { StructureOperations } from "./operations/structure";
import { AdvancedVideoOperations } from "./operations/advanced";

const BATCH_OUTPUT_OPERATIONS = new Set([
  "convert", "trim", "extractAudio", "addWatermark", "changeSpeed", "applyEffects", "merge",
  "replaceSegment", "rotate", "crop", "compress", "addText", "addFade", "reverse", "createLoop",
  "stabilize", "colorCorrect", "pictureInPicture", "splitScreen", "createTimeLapse", "removeAudio",
  "mixAudio", "mute", "adjustVolume", "createFromFrames", "freezeFrame", "exportPreset", "normalizeAudio",
  "applyLUT", "addTransition", "addTextOverlay", "addAnimatedText",
]);

function controlsFrom(options: VideoOperationControls): VideoRunControls {
  return {
    signal: options.signal,
    timeoutMs: options.timeoutMs,
    overwrite: options.overwrite,
    onProgress: options.onProgress,
  };
}

function operationKeys(options: VideoCreationOptions): string[] {
  const ignored = new Set(["source", "signal", "timeoutMs", "overwrite", "onProgress"]);
  return Object.entries(options)
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== false)
    .map(([key]) => key);
}

/**
 * Cohesive video service. Public routing is here; implementation remains split by domain.
 * No operation module reaches child_process directly or bypasses the central media resolver.
 */
export class VideoOperations {
  readonly runtime: VideoOperationRuntime;
  readonly transcode: TranscodeOperations;
  readonly merge: MergeOperations;
  readonly overlays: OverlayOperations;
  readonly audio: AudioOperations;
  readonly frames: FrameOperations;
  readonly structure: StructureOperations;
  readonly advanced: AdvancedVideoOperations;

  constructor(readonly session: FfmpegSession) {
    this.runtime = new VideoOperationRuntime(session);
    this.transcode = new TranscodeOperations(this.runtime);
    this.merge = new MergeOperations(this.runtime);
    this.overlays = new OverlayOperations(this.runtime);
    this.audio = new AudioOperations(this.runtime);
    this.frames = new FrameOperations(this.runtime);
    this.structure = new StructureOperations(this.runtime);
    this.advanced = new AdvancedVideoOperations(this.runtime);
  }

  private async ensureAvailable(): Promise<void> {
    if (!(await this.session.checkAvailable())) {
      throw new ApexifyProcessError("Video processing features require FFmpeg/ffprobe to be installed.", {
        details: { installInstructions: this.session.getInstallInstructions() },
      });
    }
  }

  async getInfo(source: VideoSource, controls: VideoRunControls = {}) {
    await this.ensureAvailable();
    return this.runtime.withWorkspace("apexify-video-info-", async (workspace) => {
      const resolved = await this.runtime.resolve(source, workspace, "input", controls);
      return this.runtime.probeFile(resolved.videoPath, controls);
    });
  }

  async codec(source: VideoSource, controls: VideoRunControls = {}): Promise<string> {
    await this.ensureAvailable();
    return probeVideoCodecSource(source, this.session, controls.signal);
  }

  async create(options: VideoCreationOptions): Promise<unknown> {
    await this.ensureAvailable();
    const controls = controlsFrom(options);
    const source = options.source;

    if (options.getInfo) return this.getInfo(source, controls);
    if (options.extractFrame) return this.frames.extractOne(source, options.extractFrame, controls);
    if (options.extractFrames?.times) return this.frames.extractTimes(source, options.extractFrames.times, options.extractFrames, controls);
    if (options.extractFrames?.interval !== undefined) return this.frames.extractInterval(source, {
      interval: options.extractFrames.interval,
      frameSelection: options.extractFrames.frameSelection,
      outputFormat: options.extractFrames.outputFormat,
      quality: options.extractFrames.quality,
      outputDirectory: options.extractFrames.outputDirectory,
    }, controls);
    if (options.extractAllFrames) return this.frames.extractAll(source, options.extractAllFrames, controls);
    if (options.generateThumbnail) return this.frames.thumbnail(source, options.generateThumbnail, controls);
    if (options.convert) return this.transcode.convert(source, options.convert, controls);
    if (options.trim) return this.transcode.trim(source, options.trim, controls);
    if (options.extractAudio) return this.transcode.extractAudio(source, options.extractAudio, controls);
    if (options.addWatermark) return this.overlays.watermark(source, options.addWatermark, controls);
    if (options.changeSpeed) return this.transcode.speed(source, options.changeSpeed, controls);
    if (options.generatePreview) return this.frames.preview(source, options.generatePreview, controls);
    if (options.applyEffects) return this.transcode.effects(source, options.applyEffects, controls);
    if (options.merge) return this.merge.merge(options.merge, controls);
    if (options.replaceSegment) return this.structure.replaceSegment(source, options.replaceSegment, controls);
    if (options.rotate) return this.transcode.rotate(source, options.rotate, controls);
    if (options.crop) return this.transcode.crop(source, options.crop, controls);
    if (options.compress) return this.transcode.compress(source, options.compress, controls);
    if (options.addText) return this.overlays.deprecatedText(source, options.addText, controls);
    if (options.addFade) return this.transcode.fade(source, options.addFade, controls);
    if (options.reverse) return this.transcode.reverse(source, options.reverse.outputPath, controls);
    if (options.createLoop) return this.advanced.loop(source, options.createLoop, controls);
    if (options.batch) return this.batch(options.batch, controls);
    if (options.detectScenes) return this.advanced.detectScenes(source, options.detectScenes, controls);
    if (options.stabilize) return this.advanced.stabilize(source, options.stabilize, controls);
    if (options.colorCorrect) return this.transcode.colorCorrect(source, options.colorCorrect, controls);
    if (options.pictureInPicture) return this.overlays.pictureInPicture(source, options.pictureInPicture, controls);
    if (options.splitScreen) return this.merge.splitScreen(options.splitScreen, controls);
    if (options.createTimeLapse) return this.transcode.speed(source, { speed: options.createTimeLapse.speed ?? 10, outputPath: options.createTimeLapse.outputPath }, controls);
    if (options.removeAudio) return this.transcode.removeAudio(source, options.removeAudio.outputPath, controls);
    if (options.mixAudio) return this.audio.mix(source, options.mixAudio, controls);
    if (options.mute) return this.transcode.mute(source, options.mute, controls);
    if (options.adjustVolume) return this.transcode.adjustVolume(source, options.adjustVolume, controls);
    if (options.createFromFrames) return this.frames.createFromFrames(options.createFromFrames, controls);
    if (options.detectFormat) {
      const info = await this.getInfo(source, controls);
      return {
        format: info.format,
        codec: info.codec,
        container: info.container,
        width: info.width,
        height: info.height,
        fps: info.fps,
        bitrate: info.bitrate,
        duration: info.duration,
        audio: info.audio,
        audioCodec: info.audioCodec,
      };
    }
    if (options.freezeFrame) return this.advanced.freezeFrame(source, options.freezeFrame, controls);
    if (options.exportPreset) return this.advanced.exportPreset(source, options.exportPreset, controls);
    if (options.normalizeAudio) return this.transcode.normalizeAudio(source, options.normalizeAudio, controls);
    if (options.applyLUT) return this.advanced.applyLUT(source, options.applyLUT, controls);
    if (options.addTransition) return this.advanced.transition(source, options.addTransition, controls);
    if (options.addTextOverlay) return this.overlays.text(source, options.addTextOverlay, controls);
    if (options.addAnimatedText) return this.overlays.deprecatedAnimatedText(source, options.addAnimatedText, controls);

    throw new ApexifyInputError("No video operation specified.");
  }

  private async batch(
    options: { videos: Array<{ source: VideoSource; operations: Record<string, unknown> }>; outputDirectory: string },
    controls: VideoRunControls
  ) {
    assertWithinLimit("maxBatchOperations", options.videos.length);
    const directory = path.resolve(options.outputDirectory);
    await fs.mkdir(directory, { recursive: true });
    const results: Array<{ source: string; output: string; success: boolean; error?: string }> = [];
    for (let index = 0; index < options.videos.length; index++) {
      const item = options.videos[index]!;
      const entries = Object.entries(item.operations).filter(([, value]) => value !== undefined && value !== false);
      if (entries.length !== 1) throw new ApexifyInputError(`video.batch.videos[${index}].operations must contain exactly one operation.`);
      const [key, raw] = entries[0]!;
      if (!BATCH_OUTPUT_OPERATIONS.has(key)) throw new ApexifyInputError(`video.batch operation '${key}' is not an output-file operation.`);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ApexifyInputError(`video.batch operation '${key}' must be an options object.`);
      const output = path.join(directory, `batch-${String(index + 1).padStart(4, "0")}.mp4`);
      const nested = {
        source: item.source,
        [key]: { ...(raw as Record<string, unknown>), outputPath: output },
        signal: controls.signal,
        timeoutMs: controls.timeoutMs,
        overwrite: controls.overwrite,
      } as unknown as VideoCreationOptions;
      try {
        await this.create(nested);
        results.push({ source: typeof item.source === "string" ? item.source : "buffer", output, success: true });
      } catch (error) {
        results.push({
          source: typeof item.source === "string" ? item.source : "buffer",
          output,
          success: false,
          error: error instanceof Error ? error.message : "Unknown video batch error",
        });
      }
    }
    return results;
  }

  describeOperation(options: VideoCreationOptions): string {
    const active = operationKeys(options);
    return active.length === 1 ? active[0]! : active.join(",");
  }
}
