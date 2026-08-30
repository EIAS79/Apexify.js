import type { VideoCreationOptions } from "./video-creator";
import { ApexifyInputError } from "../runtime/errors";
import { assertVideoResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection, assertFiniteNumber, assertFiniteNumericLeaves, assertNonEmptyString, assertOpacity,
  assertOptionalFiniteNumber, assertRecord, assertSource,
} from "../runtime/validation";

function outputPath(value: unknown, name: string): void { assertNonEmptyString(value, name, 32_768); }
function duration(value: unknown, name: string, optional = true): void {
  if (optional && value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ durationSeconds: value as number });
}
function time(value: unknown, name: string, optional = true): void {
  if (optional && value === undefined) return;
  assertFiniteNumber(value, name, { min: 0 });
  assertVideoResourceLimits({ durationSeconds: value as number });
}
function fps(value: unknown, name: string): void {
  if (value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ fps: value as number });
}
function bitrate(value: unknown, name: string): void {
  if (value === undefined) return;
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: true });
  assertVideoResourceLimits({ bitrateKbps: value as number });
}
function dimensions(value: unknown, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  const width = value.width;
  const height = value.height;
  if (width === undefined || height === undefined) throw new ApexifyInputError(`${name} requires width and height.`);
  assertFiniteNumber(width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
  assertVideoResourceLimits({ width, height });
}
function grid(value: unknown, name: string, inputCount?: number): void {
  if (value === undefined) return;
  assertRecord(value, name);
  assertFiniteNumber(value.cols, `${name}.cols`, { min: 1, integer: true });
  assertFiniteNumber(value.rows, `${name}.rows`, { min: 1, integer: true });
  assertWithinLimit("maxCollectionItems", value.cols * value.rows);
  if (inputCount !== undefined && value.cols * value.rows < inputCount) throw new ApexifyInputError(`${name} has fewer cells than inputs.`);
}
function range(start: unknown, end: unknown, name: string): void {
  time(start, `${name}.start`, false); time(end, `${name}.end`, false);
  if ((end as number) <= (start as number)) throw new ApexifyInputError(`${name}.end must be greater than start.`);
  duration((end as number) - (start as number), `${name}.duration`, false);
}
function validateRanges(value: unknown, name: string): void {
  if (value === undefined) return;
  assertCollection(value, name, { limit: "maxVideoOverlays" });
  value.forEach((r, i) => { assertRecord(r, `${name}[${i}]`); range(r.start, r.end, `${name}[${i}]`); });
}

/** Validate all public createVideo configuration before FFmpeg/ffprobe or source resolution. */
export function validateVideoCreationOptions(options: VideoCreationOptions): void {
  assertRecord(options, "video");
  assertSource(options.source, "video.source");
  assertFiniteNumericLeaves(options, "video");

  if (options.extractFrame) {
    assertRecord(options.extractFrame, "video.extractFrame");
    time(options.extractFrame.time, "video.extractFrame.time");
    assertOptionalFiniteNumber(options.extractFrame.frame, "video.extractFrame.frame", { min: 0, integer: true });
    assertOptionalFiniteNumber(options.extractFrame.width, "video.extractFrame.width", { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(options.extractFrame.height, "video.extractFrame.height", { min: 0, exclusiveMin: true, integer: true });
    if (options.extractFrame.width !== undefined && options.extractFrame.height !== undefined) assertVideoResourceLimits({ width: options.extractFrame.width, height: options.extractFrame.height });
    assertOptionalFiniteNumber(options.extractFrame.quality, "video.extractFrame.quality", { min: 1, max: 100, integer: true });
  }
  if (options.extractFrames) {
    if (options.extractFrames.times) {
      assertCollection(options.extractFrames.times, "video.extractFrames.times", { min: 1, limit: "maxVideoOverlays" });
      options.extractFrames.times.forEach((v, i) => time(v, `video.extractFrames.times[${i}]`, false));
    }
    duration(options.extractFrames.interval, "video.extractFrames.interval");
    if (options.extractFrames.frameSelection) range(options.extractFrames.frameSelection.start ?? 0, options.extractFrames.frameSelection.end, "video.extractFrames.frameSelection");
  }
  if (options.extractAllFrames) {
    time(options.extractAllFrames.startTime, "video.extractAllFrames.startTime");
    if (options.extractAllFrames.endTime !== undefined) {
      const start = options.extractAllFrames.startTime ?? 0; range(start, options.extractAllFrames.endTime, "video.extractAllFrames.range");
    }
  }
  if (options.generateThumbnail) {
    assertOptionalFiniteNumber(options.generateThumbnail.count, "video.generateThumbnail.count", { min: 1, integer: true });
    if (options.generateThumbnail.count !== undefined) assertWithinLimit("maxVideoOverlays", options.generateThumbnail.count);
    grid(options.generateThumbnail.grid, "video.generateThumbnail.grid");
    if (options.generateThumbnail.width !== undefined && options.generateThumbnail.height !== undefined) assertVideoResourceLimits({ width: options.generateThumbnail.width, height: options.generateThumbnail.height });
  }
  if (options.convert) {
    outputPath(options.convert.outputPath, "video.convert.outputPath"); bitrate(options.convert.bitrate, "video.convert.bitrate"); fps(options.convert.fps, "video.convert.fps"); dimensions(options.convert.resolution, "video.convert.resolution");
  }
  if (options.trim) { outputPath(options.trim.outputPath, "video.trim.outputPath"); range(options.trim.startTime, options.trim.endTime, "video.trim"); }
  if (options.extractAudio) { outputPath(options.extractAudio.outputPath, "video.extractAudio.outputPath"); bitrate(options.extractAudio.bitrate, "video.extractAudio.bitrate"); }
  if (options.addWatermark) {
    assertSource(options.addWatermark.watermarkPath, "video.addWatermark.watermarkPath"); outputPath(options.addWatermark.outputPath, "video.addWatermark.outputPath"); assertOpacity(options.addWatermark.opacity, "video.addWatermark.opacity"); dimensions(options.addWatermark.size, "video.addWatermark.size");
  }
  if (options.changeSpeed) { assertFiniteNumber(options.changeSpeed.speed, "video.changeSpeed.speed", { min: 0, exclusiveMin: true, max: 16 }); outputPath(options.changeSpeed.outputPath, "video.changeSpeed.outputPath"); }
  if (options.generatePreview?.count !== undefined) { assertFiniteNumber(options.generatePreview.count, "video.generatePreview.count", { min: 1, integer: true }); assertWithinLimit("maxVideoOverlays", options.generatePreview.count); }
  if (options.applyEffects) { assertCollection(options.applyEffects.filters, "video.applyEffects.filters", { min: 1, limit: "maxFiltersPerOperation" }); outputPath(options.applyEffects.outputPath, "video.applyEffects.outputPath"); }
  if (options.merge) {
    assertCollection(options.merge.videos, "video.merge.videos", { min: 1, limit: "maxCollectionItems" }); options.merge.videos.forEach((s, i) => assertSource(s, `video.merge.videos[${i}]`)); outputPath(options.merge.outputPath, "video.merge.outputPath"); grid(options.merge.grid, "video.merge.grid", options.merge.videos.length);
  }
  if (options.replaceSegment) {
    range(options.replaceSegment.targetStartTime, options.replaceSegment.targetEndTime, "video.replaceSegment.target");
    time(options.replaceSegment.replacementStartTime, "video.replaceSegment.replacementStartTime"); duration(options.replaceSegment.replacementDuration, "video.replaceSegment.replacementDuration"); fps(options.replaceSegment.replacementFps, "video.replaceSegment.replacementFps"); outputPath(options.replaceSegment.outputPath, "video.replaceSegment.outputPath");
    if (options.replaceSegment.replacementVideo !== undefined) assertSource(options.replaceSegment.replacementVideo, "video.replaceSegment.replacementVideo");
    if (options.replaceSegment.replacementFrames) { assertCollection(options.replaceSegment.replacementFrames, "video.replaceSegment.replacementFrames", { min: 1, limit: "maxVideoOverlays" }); }
  }
  if (options.crop) { assertFiniteNumber(options.crop.x, "video.crop.x", { min: 0 }); assertFiniteNumber(options.crop.y, "video.crop.y", { min: 0 }); assertVideoResourceLimits({ width: options.crop.width, height: options.crop.height }); outputPath(options.crop.outputPath, "video.crop.outputPath"); }
  if (options.compress) { outputPath(options.compress.outputPath, "video.compress.outputPath"); bitrate(options.compress.maxBitrate, "video.compress.maxBitrate"); }
  if (options.addText) { if (!options.addText.text) throw new ApexifyInputError("video.addText.text must be non-empty."); assertWithinLimit("maxTextLength", options.addText.text.length); time(options.addText.startTime, "video.addText.startTime"); if (options.addText.endTime !== undefined) range(options.addText.startTime ?? 0, options.addText.endTime, "video.addText.range"); outputPath(options.addText.outputPath, "video.addText.outputPath"); }
  if (options.addFade) { duration(options.addFade.fadeIn, "video.addFade.fadeIn"); duration(options.addFade.fadeOut, "video.addFade.fadeOut"); outputPath(options.addFade.outputPath, "video.addFade.outputPath"); }
  if (options.batch) { assertCollection(options.batch.videos, "video.batch.videos", { min: 1, limit: "maxBatchOperations" }); options.batch.videos.forEach((v, i) => { assertRecord(v, `video.batch.videos[${i}]`); assertSource(v.source, `video.batch.videos[${i}].source`); }); outputPath(options.batch.outputDirectory, "video.batch.outputDirectory"); }
  if (options.pictureInPicture) { assertSource(options.pictureInPicture.overlayVideo, "video.pictureInPicture.overlayVideo"); dimensions(options.pictureInPicture.size, "video.pictureInPicture.size"); assertOpacity(options.pictureInPicture.opacity, "video.pictureInPicture.opacity"); outputPath(options.pictureInPicture.outputPath, "video.pictureInPicture.outputPath"); }
  if (options.splitScreen) { assertCollection(options.splitScreen.videos, "video.splitScreen.videos", { min: 1, limit: "maxCollectionItems" }); options.splitScreen.videos.forEach((s, i) => assertSource(s, `video.splitScreen.videos[${i}]`)); grid(options.splitScreen.grid, "video.splitScreen.grid", options.splitScreen.videos.length); outputPath(options.splitScreen.outputPath, "video.splitScreen.outputPath"); }
  if (options.mixAudio) { assertCollection(options.mixAudio.overlays, "video.mixAudio.overlays", { min: 1, limit: "maxVideoOverlays" }); outputPath(options.mixAudio.outputPath, "video.mixAudio.outputPath"); options.mixAudio.overlays.forEach((o, i) => { assertRecord(o, `video.mixAudio.overlays[${i}]`); assertSource(o.source, `video.mixAudio.overlays[${i}].source`); time(o.startTime, `video.mixAudio.overlays[${i}].startTime`, false); duration(o.duration, `video.mixAudio.overlays[${i}].duration`); time(o.sourceStart, `video.mixAudio.overlays[${i}].sourceStart`); assertOptionalFiniteNumber(o.volume, `video.mixAudio.overlays[${i}].volume`, { min: 0, max: 4 }); assertOptionalFiniteNumber(o.speed, `video.mixAudio.overlays[${i}].speed`, { min: 0, exclusiveMin: true, max: 16 }); }); }
  if (options.mute) { outputPath(options.mute.outputPath, "video.mute.outputPath"); validateRanges(options.mute.ranges, "video.mute.ranges"); }
  if (options.adjustVolume) { outputPath(options.adjustVolume.outputPath, "video.adjustVolume.outputPath"); assertOptionalFiniteNumber(options.adjustVolume.volume, "video.adjustVolume.volume", { min: 0, max: 4 }); validateRanges(options.adjustVolume.ranges, "video.adjustVolume.ranges"); }
  if (options.createFromFrames) { assertCollection(options.createFromFrames.frames, "video.createFromFrames.frames", { min: 1, limit: "maxVideoOverlays" }); options.createFromFrames.frames.forEach((s, i) => assertSource(s, `video.createFromFrames.frames[${i}]`)); outputPath(options.createFromFrames.outputPath, "video.createFromFrames.outputPath"); fps(options.createFromFrames.fps, "video.createFromFrames.fps"); bitrate(options.createFromFrames.bitrate, "video.createFromFrames.bitrate"); dimensions(options.createFromFrames.resolution, "video.createFromFrames.resolution"); }
  if (options.freezeFrame) { time(options.freezeFrame.time, "video.freezeFrame.time", false); duration(options.freezeFrame.duration, "video.freezeFrame.duration", false); outputPath(options.freezeFrame.outputPath, "video.freezeFrame.outputPath"); }
  if (options.addTransition) { duration(options.addTransition.duration, "video.addTransition.duration", false); if (options.addTransition.secondVideo !== undefined) assertSource(options.addTransition.secondVideo, "video.addTransition.secondVideo"); outputPath(options.addTransition.outputPath, "video.addTransition.outputPath"); }
  if (options.addTextOverlay) { assertFiniteNumericLeaves(options.addTextOverlay, "video.addTextOverlay"); const clips = (options.addTextOverlay as { overlays?: unknown[] }).overlays; if (clips) { assertWithinLimit("maxVideoOverlays", clips.length); for (const clip of clips) { const text = (clip as { text?: unknown }).text; if (typeof text === "string") assertWithinLimit("maxTextLength", text.length); } } }
  if (options.addAnimatedText) { if (!options.addAnimatedText.text) throw new ApexifyInputError("video.addAnimatedText.text must be non-empty."); assertWithinLimit("maxTextLength", options.addAnimatedText.text.length); range(options.addAnimatedText.startTime, options.addAnimatedText.endTime, "video.addAnimatedText.range"); outputPath(options.addAnimatedText.outputPath, "video.addAnimatedText.outputPath"); }

  const operationKeys = Object.keys(options).filter((key) => key !== "source" && key !== "onProgress");
  if (operationKeys.length === 0) throw new ApexifyInputError("video requires at least one operation.");
}

export function validateVideoProbeMetadata(metadata: unknown): void {
  assertRecord(metadata, "video.metadata");
  duration(metadata.duration, "video.metadata.duration", false);
  assertFiniteNumber(metadata.width, "video.metadata.width", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(metadata.height, "video.metadata.height", { min: 0, exclusiveMin: true, integer: true });
  fps(metadata.fps, "video.metadata.fps"); bitrate(metadata.bitrate, "video.metadata.bitrate");
  assertVideoResourceLimits({ width: metadata.width, height: metadata.height });
}
