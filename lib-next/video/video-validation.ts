import type {
  VideoCreationOptions,
} from "./video-creator";
import type {
  VideoPipelineLayer,
  VideoPipelineRenderOptions,
  VideoTextOverlayClip,
} from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertVideoResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection,
  assertFiniteNumber,
  assertFiniteNumericLeaves,
  assertNonEmptyString,
  assertOpacity,
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  assertRecord,
  assertSource,
} from "../runtime/validation";
import { validateTextProperties } from "../text/text-validation";
import { validateSynthSequenceOptions, validateSynthSoundOptions } from "../audio-synth/audio-validation";
import { applyPresetOverrides } from "../audio-synth/preset-overrides";
import { getPresetDefinition } from "../audio-synth/presets";
import { inspectWavPcm16 } from "../audio-synth/wav-encode";

const VIDEO_OPERATION_KEYS = [
  "getInfo", "extractFrame", "extractFrames", "extractAllFrames", "generateThumbnail", "convert",
  "trim", "extractAudio", "addWatermark", "changeSpeed", "generatePreview", "applyEffects", "merge",
  "replaceSegment", "rotate", "crop", "compress", "addText", "addFade", "reverse", "createLoop", "batch",
  "detectScenes", "stabilize", "colorCorrect", "pictureInPicture", "splitScreen", "createTimeLapse",
  "removeAudio", "mixAudio", "mute", "adjustVolume", "createFromFrames", "detectFormat", "freezeFrame",
  "exportPreset", "normalizeAudio", "applyLUT", "addTransition", "addTextOverlay", "addAnimatedText",
] as const satisfies readonly (keyof VideoCreationOptions)[];

function outputPath(value: unknown, name: string): void {
  assertNonEmptyString(value, name, 32_768);
}

function duration(value: unknown, name: string, optional = true): void {
  if (optional && value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ durationSeconds: value });
}

function time(value: unknown, name: string, optional = true): void {
  if (optional && value === undefined) return;
  assertFiniteNumber(value, name, { min: 0 });
  assertVideoResourceLimits({ durationSeconds: value });
}

function fps(value: unknown, name: string): void {
  if (value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ fps: value });
}

function bitrate(value: unknown, name: string): void {
  if (value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ bitrateKbps: value });
}

function dimensions(value: unknown, name: string): { width: number; height: number } | undefined {
  if (value === undefined) return undefined;
  assertRecord(value, name);
  const width = value.width;
  const height = value.height;
  if (width === undefined || height === undefined) throw new ApexifyInputError(`${name} requires width and height.`);
  assertFiniteNumber(width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
  assertVideoResourceLimits({ width, height });
  return { width, height };
}

function grid(value: unknown, name: string, inputCount?: number): { cols: number; rows: number } | undefined {
  if (value === undefined) return undefined;
  assertRecord(value, name);
  assertFiniteNumber(value.cols, `${name}.cols`, { min: 1, integer: true });
  assertFiniteNumber(value.rows, `${name}.rows`, { min: 1, integer: true });
  const cells = value.cols * value.rows;
  assertWithinLimit("maxCollectionItems", cells);
  if (inputCount !== undefined && cells < inputCount) throw new ApexifyInputError(`${name} has fewer cells than inputs.`);
  return { cols: value.cols, rows: value.rows };
}

function range(start: unknown, end: unknown, name: string): void {
  time(start, `${name}.start`, false);
  time(end, `${name}.end`, false);
  const startValue = start as number;
  const endValue = end as number;
  if (endValue <= startValue) throw new ApexifyInputError(`${name}.end must be greater than start.`);
  duration(endValue - startValue, `${name}.duration`, false);
}

function validateRanges(value: unknown, name: string): void {
  if (value === undefined) return;
  assertCollection(value, name, { limit: "maxVideoOverlays" });
  value.forEach((item, i) => {
    assertRecord(item, `${name}[${i}]`);
    range(item.start, item.end, `${name}[${i}]`);
  });
}

function validateTextOverlay(overlay: VideoTextOverlayClip, name: string): void {
  assertRecord(overlay, name);
  validateTextProperties(overlay);
  range(overlay.startTime, overlay.endTime, `${name}.range`);
  assertOpacity(overlay.overlayOpacity, `${name}.overlayOpacity`);
  for (const [transitionName, transition] of [["transitionIn", overlay.transitionIn], ["transitionOut", overlay.transitionOut]] as const) {
    if (!transition) continue;
    assertRecord(transition, `${name}.${transitionName}`);
    assertOptionalFiniteNumber(transition.duration, `${name}.${transitionName}.duration`, { min: 0 });
    if (transition.custom) {
      assertRecord(transition.custom, `${name}.${transitionName}.custom`);
      for (const key of ["x", "y", "alpha", "scale"] as const) {
        if (transition.custom[key] !== undefined) {
          assertNonEmptyString(transition.custom[key], `${name}.${transitionName}.custom.${key}`, 4_096);
        }
      }
    }
  }
}

function activeVideoOperations(options: VideoCreationOptions): string[] {
  const active: string[] = [];
  for (const key of VIDEO_OPERATION_KEYS) {
    const value = options[key];
    if (value === null) throw new ApexifyInputError(`video.${String(key)} must not be null.`);
    if (typeof value === "boolean") {
      if (value) active.push(String(key));
    } else if (value !== undefined) {
      active.push(String(key));
    }
  }
  return active;
}

/** Validate all public createVideo configuration before FFmpeg/ffprobe or source resolution. */
export function validateVideoCreationOptions(options: VideoCreationOptions): void {
  assertRecord(options, "video");
  assertSource(options.source, "video.source");
  assertFiniteNumericLeaves(options, "video");
  if (options.onProgress !== undefined && typeof options.onProgress !== "function") {
    throw new ApexifyInputError("video.onProgress must be a function when provided.");
  }

  const active = activeVideoOperations(options);
  if (active.length !== 1) {
    throw new ApexifyInputError(`video requires exactly one operation; received ${active.length}: ${active.join(", ") || "none"}.`);
  }

  if (options.extractFrame) {
    const op = options.extractFrame;
    if (op.frame !== undefined && op.time !== undefined) throw new ApexifyInputError("video.extractFrame must specify frame or time, not both.");
    time(op.time, "video.extractFrame.time");
    assertOptionalFiniteNumber(op.frame, "video.extractFrame.frame", { min: 0, integer: true });
    assertOptionalFiniteNumber(op.width, "video.extractFrame.width", { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(op.height, "video.extractFrame.height", { min: 0, exclusiveMin: true, integer: true });
    if ((op.width === undefined) !== (op.height === undefined)) throw new ApexifyInputError("video.extractFrame width and height must be provided together.");
    if (op.width !== undefined && op.height !== undefined) assertVideoResourceLimits({ width: op.width, height: op.height });
    assertOptionalEnum(op.outputFormat, "video.extractFrame.outputFormat", ["jpg", "png"] as const);
    assertOptionalFiniteNumber(op.quality, "video.extractFrame.quality", { min: 1, max: 31, integer: true });
  }

  if (options.extractFrames) {
    const op = options.extractFrames;
    const modes = Number(op.times !== undefined) + Number(op.interval !== undefined);
    if (modes !== 1) throw new ApexifyInputError("video.extractFrames requires exactly one of times or interval.");
    if (op.times) {
      assertCollection(op.times, "video.extractFrames.times", { min: 1, limit: "maxVideoOverlays" });
      op.times.forEach((value, i) => time(value, `video.extractFrames.times[${i}]`, false));
    }
    duration(op.interval, "video.extractFrames.interval");
    if (op.frameSelection) {
      if (op.frameSelection.end === undefined) throw new ApexifyInputError("video.extractFrames.frameSelection.end is required when frameSelection is provided.");
      range(op.frameSelection.start ?? 0, op.frameSelection.end, "video.extractFrames.frameSelection");
    }
    assertOptionalEnum(op.outputFormat, "video.extractFrames.outputFormat", ["jpg", "png"] as const);
    assertOptionalFiniteNumber(op.quality, "video.extractFrames.quality", { min: 1, max: 31, integer: true });
    if (op.outputDirectory !== undefined) outputPath(op.outputDirectory, "video.extractFrames.outputDirectory");
  }

  if (options.extractAllFrames) {
    const op = options.extractAllFrames;
    time(op.startTime, "video.extractAllFrames.startTime");
    if (op.endTime !== undefined) range(op.startTime ?? 0, op.endTime, "video.extractAllFrames.range");
    assertOptionalEnum(op.outputFormat, "video.extractAllFrames.outputFormat", ["jpg", "png"] as const);
    assertOptionalFiniteNumber(op.quality, "video.extractAllFrames.quality", { min: 1, max: 31, integer: true });
    if (op.outputDirectory !== undefined) outputPath(op.outputDirectory, "video.extractAllFrames.outputDirectory");
    if (op.prefix !== undefined) assertNonEmptyString(op.prefix, "video.extractAllFrames.prefix", 256);
  }

  if (options.generateThumbnail) {
    const op = options.generateThumbnail;
    const count = op.count ?? 9;
    assertFiniteNumber(count, "video.generateThumbnail.count", { min: 1, integer: true });
    assertWithinLimit("maxVideoOverlays", count);
    const g = grid(op.grid ?? { cols: 3, rows: 3 }, "video.generateThumbnail.grid")!;
    const width = op.width ?? 320;
    const height = op.height ?? 180;
    assertFiniteNumber(width, "video.generateThumbnail.width", { min: 0, exclusiveMin: true, integer: true });
    assertFiniteNumber(height, "video.generateThumbnail.height", { min: 0, exclusiveMin: true, integer: true });
    assertVideoResourceLimits({ width: width * g.cols, height: height * g.rows });
    assertOptionalEnum(op.outputFormat, "video.generateThumbnail.outputFormat", ["jpg", "png"] as const);
    assertOptionalFiniteNumber(op.quality, "video.generateThumbnail.quality", { min: 1, max: 31, integer: true });
  }

  if (options.convert) {
    outputPath(options.convert.outputPath, "video.convert.outputPath");
    bitrate(options.convert.bitrate, "video.convert.bitrate");
    fps(options.convert.fps, "video.convert.fps");
    dimensions(options.convert.resolution, "video.convert.resolution");
  }
  if (options.trim) {
    outputPath(options.trim.outputPath, "video.trim.outputPath");
    range(options.trim.startTime, options.trim.endTime, "video.trim");
  }
  if (options.extractAudio) {
    outputPath(options.extractAudio.outputPath, "video.extractAudio.outputPath");
    bitrate(options.extractAudio.bitrate, "video.extractAudio.bitrate");
  }
  if (options.addWatermark) {
    assertSource(options.addWatermark.watermarkPath, "video.addWatermark.watermarkPath");
    outputPath(options.addWatermark.outputPath, "video.addWatermark.outputPath");
    assertOpacity(options.addWatermark.opacity, "video.addWatermark.opacity");
    dimensions(options.addWatermark.size, "video.addWatermark.size");
  }
  if (options.changeSpeed) {
    assertFiniteNumber(options.changeSpeed.speed, "video.changeSpeed.speed", { min: 0, exclusiveMin: true, max: 16 });
    outputPath(options.changeSpeed.outputPath, "video.changeSpeed.outputPath");
  }
  if (options.generatePreview) {
    const op = options.generatePreview;
    const count = op.count ?? 10;
    assertFiniteNumber(count, "video.generatePreview.count", { min: 1, integer: true });
    assertWithinLimit("maxVideoOverlays", count);
    if (op.outputDirectory !== undefined) outputPath(op.outputDirectory, "video.generatePreview.outputDirectory");
    assertOptionalEnum(op.outputFormat, "video.generatePreview.outputFormat", ["jpg", "png"] as const);
    assertOptionalFiniteNumber(op.quality, "video.generatePreview.quality", { min: 1, max: 31, integer: true });
  }
  if (options.applyEffects) {
    assertCollection(options.applyEffects.filters, "video.applyEffects.filters", { min: 1, limit: "maxFiltersPerOperation" });
    outputPath(options.applyEffects.outputPath, "video.applyEffects.outputPath");
  }
  if (options.merge) {
    assertCollection(options.merge.videos, "video.merge.videos", { min: 1, limit: "maxCollectionItems" });
    options.merge.videos.forEach((source, i) => assertSource(source, `video.merge.videos[${i}]`));
    outputPath(options.merge.outputPath, "video.merge.outputPath");
    if (options.merge.mode === "grid") grid(options.merge.grid, "video.merge.grid", options.merge.videos.length);
  }
  if (options.replaceSegment) {
    const op = options.replaceSegment;
    range(op.targetStartTime, op.targetEndTime, "video.replaceSegment.target");
    time(op.replacementStartTime, "video.replaceSegment.replacementStartTime");
    duration(op.replacementDuration, "video.replaceSegment.replacementDuration");
    fps(op.replacementFps, "video.replaceSegment.replacementFps");
    outputPath(op.outputPath, "video.replaceSegment.outputPath");
    const replacements = Number(op.replacementVideo !== undefined) + Number(op.replacementFrames !== undefined);
    if (replacements !== 1) throw new ApexifyInputError("video.replaceSegment requires exactly one replacementVideo or replacementFrames.");
    if (op.replacementVideo !== undefined) assertSource(op.replacementVideo, "video.replaceSegment.replacementVideo");
    if (op.replacementFrames) {
      assertCollection(op.replacementFrames, "video.replaceSegment.replacementFrames", { min: 1, limit: "maxVideoOverlays" });
      op.replacementFrames.forEach((source, i) => assertSource(source, `video.replaceSegment.replacementFrames[${i}]`));
    }
  }
  if (options.rotate) {
    const angle = options.rotate.angle as unknown;
    if (angle !== undefined) {
      assertFiniteNumber(angle, "video.rotate.angle", { integer: true });
      if (angle !== 90 && angle !== 180 && angle !== 270) {
        throw new ApexifyInputError("video.rotate.angle must be 90, 180, or 270.");
      }
    }
    assertOptionalEnum(options.rotate.flip, "video.rotate.flip", ["horizontal", "vertical", "both"] as const);
    outputPath(options.rotate.outputPath, "video.rotate.outputPath");
  }
  if (options.crop) {
    assertFiniteNumber(options.crop.x, "video.crop.x", { min: 0 });
    assertFiniteNumber(options.crop.y, "video.crop.y", { min: 0 });
    assertFiniteNumber(options.crop.width, "video.crop.width", { min: 0, exclusiveMin: true, integer: true });
    assertFiniteNumber(options.crop.height, "video.crop.height", { min: 0, exclusiveMin: true, integer: true });
    assertVideoResourceLimits({ width: options.crop.width, height: options.crop.height });
    outputPath(options.crop.outputPath, "video.crop.outputPath");
  }
  if (options.compress) {
    outputPath(options.compress.outputPath, "video.compress.outputPath");
    bitrate(options.compress.maxBitrate, "video.compress.maxBitrate");
    assertOptionalFiniteNumber(options.compress.targetSize, "video.compress.targetSize", { min: 0, exclusiveMin: true });
  }
  if (options.addText) {
    assertNonEmptyString(options.addText.text, "video.addText.text", 1_000_000);
    assertWithinLimit("maxTextLength", options.addText.text.length);
    time(options.addText.startTime, "video.addText.startTime");
    if (options.addText.endTime !== undefined) range(options.addText.startTime ?? 0, options.addText.endTime, "video.addText.range");
    outputPath(options.addText.outputPath, "video.addText.outputPath");
  }
  if (options.addFade) {
    duration(options.addFade.fadeIn, "video.addFade.fadeIn");
    duration(options.addFade.fadeOut, "video.addFade.fadeOut");
    outputPath(options.addFade.outputPath, "video.addFade.outputPath");
  }
  if (options.reverse) outputPath(options.reverse.outputPath, "video.reverse.outputPath");
  if (options.createLoop) outputPath(options.createLoop.outputPath, "video.createLoop.outputPath");
  if (options.batch) {
    assertCollection(options.batch.videos, "video.batch.videos", { min: 1, limit: "maxBatchOperations" });
    options.batch.videos.forEach((item, i) => {
      assertRecord(item, `video.batch.videos[${i}]`);
      assertSource(item.source, `video.batch.videos[${i}].source`);
      assertRecord(item.operations, `video.batch.videos[${i}].operations`);
    });
    outputPath(options.batch.outputDirectory, "video.batch.outputDirectory");
  }
  if (options.detectScenes) {
    assertOptionalFiniteNumber(options.detectScenes.threshold, "video.detectScenes.threshold", { min: 0, max: 1 });
    if (options.detectScenes.outputPath !== undefined) outputPath(options.detectScenes.outputPath, "video.detectScenes.outputPath");
  }
  if (options.stabilize) {
    assertOptionalFiniteNumber(options.stabilize.smoothing, "video.stabilize.smoothing", { min: 0 });
    outputPath(options.stabilize.outputPath, "video.stabilize.outputPath");
  }
  if (options.colorCorrect) outputPath(options.colorCorrect.outputPath, "video.colorCorrect.outputPath");
  if (options.pictureInPicture) {
    assertSource(options.pictureInPicture.overlayVideo, "video.pictureInPicture.overlayVideo");
    dimensions(options.pictureInPicture.size, "video.pictureInPicture.size");
    assertOpacity(options.pictureInPicture.opacity, "video.pictureInPicture.opacity");
    outputPath(options.pictureInPicture.outputPath, "video.pictureInPicture.outputPath");
  }
  if (options.splitScreen) {
    assertCollection(options.splitScreen.videos, "video.splitScreen.videos", { min: 1, limit: "maxCollectionItems" });
    options.splitScreen.videos.forEach((source, i) => assertSource(source, `video.splitScreen.videos[${i}]`));
    if (options.splitScreen.layout === "grid") grid(options.splitScreen.grid, "video.splitScreen.grid", options.splitScreen.videos.length);
    outputPath(options.splitScreen.outputPath, "video.splitScreen.outputPath");
  }
  if (options.createTimeLapse) {
    assertOptionalFiniteNumber(options.createTimeLapse.speed, "video.createTimeLapse.speed", { min: 0, exclusiveMin: true, max: 16 });
    outputPath(options.createTimeLapse.outputPath, "video.createTimeLapse.outputPath");
  }
  if (options.removeAudio) outputPath(options.removeAudio.outputPath, "video.removeAudio.outputPath");
  if (options.mixAudio) {
    const op = options.mixAudio;
    assertCollection(op.overlays, "video.mixAudio.overlays", { min: 1, limit: "maxVideoOverlays" });
    outputPath(op.outputPath, "video.mixAudio.outputPath");
    assertOptionalFiniteNumber(op.originalVolume, "video.mixAudio.originalVolume", { min: 0, max: 4 });
    assertOptionalFiniteNumber(op.originalSpeed, "video.mixAudio.originalSpeed", { min: 0, exclusiveMin: true, max: 16 });
    op.overlays.forEach((overlay, i) => {
      const name = `video.mixAudio.overlays[${i}]`;
      assertRecord(overlay, name);
      assertSource(overlay.source, `${name}.source`);
      time(overlay.startTime, `${name}.startTime`, false);
      duration(overlay.duration, `${name}.duration`);
      time(overlay.sourceStart, `${name}.sourceStart`);
      assertOptionalFiniteNumber(overlay.volume, `${name}.volume`, { min: 0, max: 4 });
      assertOptionalFiniteNumber(overlay.speed, `${name}.speed`, { min: 0, exclusiveMin: true, max: 16 });
      assertOptionalFiniteNumber(overlay.pitchSemitones, `${name}.pitchSemitones`);
    });
  }
  if (options.mute) {
    outputPath(options.mute.outputPath, "video.mute.outputPath");
    validateRanges(options.mute.ranges, "video.mute.ranges");
  }
  if (options.adjustVolume) {
    outputPath(options.adjustVolume.outputPath, "video.adjustVolume.outputPath");
    assertOptionalFiniteNumber(options.adjustVolume.volume, "video.adjustVolume.volume", { min: 0, max: 4 });
    validateRanges(options.adjustVolume.ranges, "video.adjustVolume.ranges");
  }
  if (options.createFromFrames) {
    const op = options.createFromFrames;
    assertCollection(op.frames, "video.createFromFrames.frames", { min: 1, limit: "maxVideoOverlays" });
    op.frames.forEach((source, i) => assertSource(source, `video.createFromFrames.frames[${i}]`));
    outputPath(op.outputPath, "video.createFromFrames.outputPath");
    fps(op.fps, "video.createFromFrames.fps");
    bitrate(op.bitrate, "video.createFromFrames.bitrate");
    dimensions(op.resolution, "video.createFromFrames.resolution");
  }
  if (options.freezeFrame) {
    time(options.freezeFrame.time, "video.freezeFrame.time", false);
    duration(options.freezeFrame.duration, "video.freezeFrame.duration", false);
    outputPath(options.freezeFrame.outputPath, "video.freezeFrame.outputPath");
  }
  if (options.exportPreset) outputPath(options.exportPreset.outputPath, "video.exportPreset.outputPath");
  if (options.normalizeAudio) {
    assertOptionalFiniteNumber(options.normalizeAudio.targetLevel, "video.normalizeAudio.targetLevel");
    outputPath(options.normalizeAudio.outputPath, "video.normalizeAudio.outputPath");
  }
  if (options.applyLUT) {
    assertNonEmptyString(options.applyLUT.lutPath, "video.applyLUT.lutPath", 32_768);
    assertOptionalFiniteNumber(options.applyLUT.intensity, "video.applyLUT.intensity", { min: 0, max: 1 });
    outputPath(options.applyLUT.outputPath, "video.applyLUT.outputPath");
  }
  if (options.addTransition) {
    duration(options.addTransition.duration, "video.addTransition.duration", false);
    if (options.addTransition.secondVideo !== undefined) assertSource(options.addTransition.secondVideo, "video.addTransition.secondVideo");
    outputPath(options.addTransition.outputPath, "video.addTransition.outputPath");
  }
  if (options.addTextOverlay) {
    const op = options.addTextOverlay;
    assertCollection(op.overlays, "video.addTextOverlay.overlays", { min: 1, limit: "maxVideoOverlays" });
    op.overlays.forEach((overlay, i) => validateTextOverlay(overlay, `video.addTextOverlay.overlays[${i}]`));
    outputPath(op.outputPath, "video.addTextOverlay.outputPath");
  }
  if (options.addAnimatedText) {
    assertNonEmptyString(options.addAnimatedText.text, "video.addAnimatedText.text", 1_000_000);
    assertWithinLimit("maxTextLength", options.addAnimatedText.text.length);
    range(options.addAnimatedText.startTime, options.addAnimatedText.endTime, "video.addAnimatedText.range");
    outputPath(options.addAnimatedText.outputPath, "video.addAnimatedText.outputPath");
  }
}

export function validateVideoProbeMetadata(metadata: unknown): void {
  assertRecord(metadata, "video.metadata");
  duration(metadata.duration, "video.metadata.duration", false);
  assertFiniteNumber(metadata.width, "video.metadata.width", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(metadata.height, "video.metadata.height", { min: 0, exclusiveMin: true, integer: true });
  fps(metadata.fps, "video.metadata.fps");
  assertFiniteNumber(metadata.bitrate, "video.metadata.bitrate", { min: 0 });
  if (metadata.bitrate > 0) assertVideoResourceLimits({ bitrateKbps: metadata.bitrate / 1000 });
  assertVideoResourceLimits({ width: metadata.width, height: metadata.height });
  assertNonEmptyString(metadata.format, "video.metadata.format", 256);
}

export function validateVideoPipelineLayers(layers: VideoPipelineLayer[]): void {
  assertCollection(layers, "videoPipeline.layers", { min: 1, limit: "maxCollectionItems" });
  const sources = layers.filter((layer) => layer.kind === "source");
  const trims = layers.filter((layer) => layer.kind === "trim");
  if (sources.length !== 1) throw new ApexifyInputError(`videoPipeline requires exactly one source layer; received ${sources.length}.`);
  if (trims.length > 1) throw new ApexifyInputError("videoPipeline supports at most one trim layer.");

  let overlayCount = 0;
  let audioTrackCount = 0;
  layers.forEach((layer, index) => {
    const name = `videoPipeline.layers[${index}]`;
    assertRecord(layer, name);
    if (layer.id !== undefined) assertNonEmptyString(layer.id, `${name}.id`, 256);
    if (layer.kind === "source") {
      assertSource(layer.source, `${name}.source`);
    } else if (layer.kind === "trim") {
      range(layer.startTime, layer.endTime, `${name}.range`);
    } else if (layer.kind === "splice") {
      range(layer.targetStartTime, layer.targetEndTime, `${name}.target`);
      time(layer.replacementStartTime, `${name}.replacementStartTime`);
      duration(layer.replacementDuration, `${name}.replacementDuration`);
      fps(layer.replacementFps, `${name}.replacementFps`);
      const replacements = Number(layer.replacementVideo !== undefined) + Number(layer.replacementFrames !== undefined);
      if (replacements !== 1) throw new ApexifyInputError(`${name} requires exactly one replacementVideo or replacementFrames.`);
      if (layer.replacementVideo !== undefined) assertSource(layer.replacementVideo, `${name}.replacementVideo`);
      if (layer.replacementFrames) {
        assertCollection(layer.replacementFrames, `${name}.replacementFrames`, { min: 1, limit: "maxVideoOverlays" });
        layer.replacementFrames.forEach((source, i) => assertSource(source, `${name}.replacementFrames[${i}]`));
      }
    } else if (layer.kind === "text") {
      assertCollection(layer.overlays, `${name}.overlays`, { min: 1, limit: "maxVideoOverlays" });
      overlayCount += layer.overlays.length;
      assertWithinLimit("maxVideoOverlays", overlayCount);
      layer.overlays.forEach((overlay, i) => validateTextOverlay(overlay, `${name}.overlays[${i}]`));
    } else if (layer.kind === "audio") {
      assertCollection(layer.tracks, `${name}.tracks`, { min: 1, limit: "maxVideoOverlays" });
      audioTrackCount += layer.tracks.length;
      assertWithinLimit("maxVideoOverlays", audioTrackCount);
      assertOptionalFiniteNumber(layer.originalVolume, `${name}.originalVolume`, { min: 0, max: 4 });
      assertOptionalFiniteNumber(layer.originalSpeed, `${name}.originalSpeed`, { min: 0, exclusiveMin: true, max: 16 });
      assertOptionalFiniteNumber(layer.originalPitchSemitones, `${name}.originalPitchSemitones`);
      layer.tracks.forEach((track, trackIndex) => {
        const trackName = `${name}.tracks[${trackIndex}]`;
        assertRecord(track, trackName);
        time(track.startTime, `${trackName}.startTime`, false);
        if (track.type === "file") {
          assertSource(track.source, `${trackName}.source`);
          duration(track.duration, `${trackName}.duration`);
          time(track.sourceStart, `${trackName}.sourceStart`);
          assertOptionalFiniteNumber(track.volume, `${trackName}.volume`, { min: 0, max: 4 });
          assertOptionalFiniteNumber(track.speed, `${trackName}.speed`, { min: 0, exclusiveMin: true, max: 16 });
          assertOptionalFiniteNumber(track.pitchSemitones, `${trackName}.pitchSemitones`);
        } else if (track.type === "preset") {
          assertOptionalFiniteNumber(track.gain, `${trackName}.gain`, { min: 0, max: 4 });
          assertOptionalFiniteNumber(track.volume, `${trackName}.volume`, { min: 0, max: 4 });
          assertOptionalFiniteNumber(track.transpose, `${trackName}.transpose`);
          try {
            validateSynthSoundOptions(applyPresetOverrides(getPresetDefinition(track.preset), {
              volume: track.volume,
              transpose: track.transpose,
            }));
          } catch (error) {
            if (error instanceof ApexifyInputError) throw error;
            throw new ApexifyInputError(`${trackName}.preset is invalid.`, { cause: error });
          }
        } else if (track.type === "synth") {
          assertOptionalFiniteNumber(track.gain, `${trackName}.gain`, { min: 0, max: 4 });
          validateSynthSoundOptions(track.sound);
        } else if (track.type === "sequence") {
          validateSynthSequenceOptions({ events: track.events, tail: track.tail, masterGain: track.masterGain });
        } else if (track.type === "wav") {
          if (!Buffer.isBuffer(track.wav)) throw new ApexifyInputError(`${trackName}.wav must be a Buffer.`);
          inspectWavPcm16(track.wav);
          assertOptionalFiniteNumber(track.volume, `${trackName}.volume`, { min: 0, max: 4 });
        } else {
          throw new ApexifyInputError(`${trackName}.type is unsupported.`);
        }
      });
    } else {
      throw new ApexifyInputError(`${name}.kind is unsupported.`);
    }
  });
}

export function validateVideoPipelineRenderOptions(options: VideoPipelineRenderOptions): void {
  assertRecord(options, "videoPipeline.render");
  outputPath(options.outputPath, "videoPipeline.render.outputPath");
  assertOptionalEnum(options.preset, "videoPipeline.render.preset", ["export", "preview"] as const);
  if (options.onProgress !== undefined && typeof options.onProgress !== "function") {
    throw new ApexifyInputError("videoPipeline.render.onProgress must be a function when provided.");
  }
}
