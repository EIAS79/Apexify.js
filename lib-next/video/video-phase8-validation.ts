import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import type { VideoCreationOptions, VideoOperationControls } from "./video-options";
import type { VideoPipelineLayer, VideoPipelineRenderOptions, VideoPipelineSpliceLayer } from "../types";

function finite(value: unknown, label: string, options: { min?: number; max?: number; integer?: boolean; exclusiveMin?: boolean } = {}): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new ApexifyInputError(`${label} must be a finite number.`);
  if (options.integer && !Number.isInteger(value)) throw new ApexifyInputError(`${label} must be an integer.`);
  if (options.min !== undefined && (options.exclusiveMin ? value <= options.min : value < options.min)) {
    throw new ApexifyInputError(`${label} must be ${options.exclusiveMin ? ">" : ">="} ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) throw new ApexifyInputError(`${label} must be <= ${options.max}.`);
  return value;
}

function enumValue<T extends string>(value: unknown, label: string, allowed: readonly T[]): void {
  if (value !== undefined && (typeof value !== "string" || !allowed.includes(value as T))) {
    throw new ApexifyInputError(`${label} must be one of: ${allowed.join(", ")}.`);
  }
}

function validateControls(controls: VideoOperationControls, label: string): void {
  if (controls.signal !== undefined) {
    const signal = controls.signal as unknown as { aborted?: unknown; addEventListener?: unknown; removeEventListener?: unknown };
    if (typeof signal !== "object" || signal === null || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function") {
      throw new ApexifyInputError(`${label}.signal must be an AbortSignal.`);
    }
  }
  if (controls.timeoutMs !== undefined) finite(controls.timeoutMs, `${label}.timeoutMs`, { min: 0, exclusiveMin: true });
  if (controls.overwrite !== undefined && typeof controls.overwrite !== "boolean") throw new ApexifyInputError(`${label}.overwrite must be a boolean.`);
  if (controls.onProgress !== undefined && typeof controls.onProgress !== "function") throw new ApexifyInputError(`${label}.onProgress must be a function.`);
}

function validateGrid(grid: { cols?: number; rows?: number; cellWidth?: number; cellHeight?: number; gap?: number } | undefined, label: string, inputCount: number): void {
  if (!grid) return;
  if (grid.cols === undefined || grid.rows === undefined) throw new ApexifyInputError(`${label} requires cols and rows when provided.`);
  const cols = finite(grid.cols, `${label}.cols`, { min: 1, integer: true });
  const rows = finite(grid.rows, `${label}.rows`, { min: 1, integer: true });
  if (cols * rows < inputCount) throw new ApexifyInputError(`${label} has fewer cells than video inputs.`);
  if (grid.cellWidth !== undefined) finite(grid.cellWidth, `${label}.cellWidth`, { min: 0, exclusiveMin: true, integer: true });
  if (grid.cellHeight !== undefined) finite(grid.cellHeight, `${label}.cellHeight`, { min: 0, exclusiveMin: true, integer: true });
  if (grid.gap !== undefined) finite(grid.gap, `${label}.gap`, { min: 0 });
}

export function validatePhase8VideoOptions(options: VideoCreationOptions): void {
  validateControls(options, "video");

  if (options.convert) {
    enumValue(options.convert.videoCodec, "video.convert.videoCodec", ["libx264", "libx265", "libvpx-vp9", "libaom-av1", "copy"] as const);
    enumValue(options.convert.audioCodec, "video.convert.audioCodec", ["aac", "libopus", "libvorbis", "mp3", "copy", "none"] as const);
    enumValue(options.convert.pixelFormat, "video.convert.pixelFormat", ["yuv420p", "yuv422p", "yuv444p", "rgba"] as const);
    enumValue(options.convert.resolution?.fit, "video.convert.resolution.fit", ["contain", "cover", "stretch"] as const);
    if (options.convert.resolution && options.convert.resolution.width === undefined && options.convert.resolution.height === undefined) {
      throw new ApexifyInputError("video.convert.resolution requires width and/or height.");
    }
  }
  if (options.trim) enumValue(options.trim.mode, "video.trim.mode", ["accurate", "copy"] as const);

  if (options.addWatermark) {
    enumValue(options.addWatermark.size?.fit, "video.addWatermark.size.fit", ["contain", "cover", "stretch"] as const);
    if (options.addWatermark.marginX !== undefined) finite(options.addWatermark.marginX, "video.addWatermark.marginX", { min: 0 });
    if (options.addWatermark.marginY !== undefined) finite(options.addWatermark.marginY, "video.addWatermark.marginY", { min: 0 });
    if (options.addWatermark.startTime !== undefined) finite(options.addWatermark.startTime, "video.addWatermark.startTime", { min: 0 });
    if (options.addWatermark.endTime !== undefined) finite(options.addWatermark.endTime, "video.addWatermark.endTime", { min: 0, exclusiveMin: true });
    if (options.addWatermark.startTime !== undefined && options.addWatermark.endTime !== undefined && options.addWatermark.endTime <= options.addWatermark.startTime) {
      throw new ApexifyInputError("video.addWatermark.endTime must be greater than startTime.");
    }
  }

  if (options.merge) {
    assertWithinLimit("maxVideoMergeInputs", options.merge.videos.length);
    enumValue(options.merge.direction, "video.merge.direction", ["horizontal", "vertical"] as const);
    enumValue(options.merge.audioPolicy, "video.merge.audioPolicy", ["preserve", "first", "mix", "none"] as const);
    if (options.merge.mode === "side-by-side" && options.merge.videos.length !== 2) {
      throw new ApexifyInputError("video.merge side-by-side mode requires exactly two videos.");
    }
    if (options.merge.mode === "grid") validateGrid(options.merge.grid, "video.merge.grid", options.merge.videos.length);
  }

  if (options.replaceSegment) {
    enumValue(options.replaceSegment.durationPolicy, "video.replaceSegment.durationPolicy", ["fit", "trim", "preserve"] as const);
  }

  if (options.mixAudio) {
    assertWithinLimit("maxVideoAudioTracks", options.mixAudio.overlays.length);
    enumValue(options.mixAudio.durationPolicy, "video.mixAudio.durationPolicy", ["video", "shortest", "longest"] as const);
    options.mixAudio.overlays.forEach((track, index) => {
      if (track.pan !== undefined) finite(track.pan, `video.mixAudio.overlays[${index}].pan`, { min: -1, max: 1 });
      if (track.fadeIn !== undefined) finite(track.fadeIn, `video.mixAudio.overlays[${index}].fadeIn`, { min: 0, exclusiveMin: true });
      if (track.fadeOut !== undefined) finite(track.fadeOut, `video.mixAudio.overlays[${index}].fadeOut`, { min: 0, exclusiveMin: true });
    });
  }

  if (options.createFromFrames) {
    assertWithinLimit("maxVideoExtractedFrames", options.createFromFrames.frames.length);
    enumValue(options.createFromFrames.resolution?.fit, "video.createFromFrames.resolution.fit", ["contain", "cover", "stretch"] as const);
  }
  if (options.extractFrames?.times) assertWithinLimit("maxVideoExtractedFrames", options.extractFrames.times.length);
  if (options.generateThumbnail?.count !== undefined) assertWithinLimit("maxVideoExtractedFrames", options.generateThumbnail.count);
  if (options.generatePreview?.count !== undefined) assertWithinLimit("maxVideoExtractedFrames", options.generatePreview.count);

  if (options.splitScreen) {
    assertWithinLimit("maxVideoMergeInputs", options.splitScreen.videos.length);
    enumValue(options.splitScreen.audioPolicy, "video.splitScreen.audioPolicy", ["preserve", "first", "mix", "none"] as const);
    if (options.splitScreen.layout === "grid") validateGrid(options.splitScreen.grid, "video.splitScreen.grid", options.splitScreen.videos.length);
    if ((options.splitScreen.layout === undefined || options.splitScreen.layout === "side-by-side" || options.splitScreen.layout === "top-bottom") && options.splitScreen.videos.length !== 2) {
      throw new ApexifyInputError("video.splitScreen side-by-side/top-bottom layouts require exactly two videos.");
    }
  }
}

export function validatePhase8PipelineLayers(layers: VideoPipelineLayer[]): void {
  assertWithinLimit("maxVideoPipelineLayers", layers.length);
  const splices = layers.filter((layer): layer is VideoPipelineSpliceLayer => layer.kind === "splice").slice().sort((a, b) => a.targetStartTime - b.targetStartTime);
  for (let index = 1; index < splices.length; index++) {
    if (splices[index]!.targetStartTime < splices[index - 1]!.targetEndTime) {
      throw new ApexifyInputError("videoPipeline splice ranges must not overlap.");
    }
  }
  if (splices.length > 1 && splices.some((splice) => splice.durationPolicy === "preserve")) {
    throw new ApexifyInputError("videoPipeline does not allow durationPolicy='preserve' with multiple splices because later timeline coordinates would become ambiguous.");
  }
  for (const [index, splice] of splices.entries()) {
    enumValue(splice.durationPolicy, `videoPipeline.splice[${index}].durationPolicy`, ["fit", "trim", "preserve"] as const);
  }

  let tracks = 0;
  for (const [layerIndex, layer] of layers.entries()) {
    if (layer.kind !== "audio") continue;
    tracks += layer.tracks.length;
    enumValue(layer.durationPolicy, `videoPipeline.layers[${layerIndex}].durationPolicy`, ["video", "shortest", "longest"] as const);
    for (const [trackIndex, track] of layer.tracks.entries()) {
      if (track.type !== "file") continue;
      if (track.pan !== undefined) finite(track.pan, `videoPipeline.layers[${layerIndex}].tracks[${trackIndex}].pan`, { min: -1, max: 1 });
      if (track.fadeIn !== undefined) finite(track.fadeIn, `videoPipeline.layers[${layerIndex}].tracks[${trackIndex}].fadeIn`, { min: 0, exclusiveMin: true });
      if (track.fadeOut !== undefined) finite(track.fadeOut, `videoPipeline.layers[${layerIndex}].tracks[${trackIndex}].fadeOut`, { min: 0, exclusiveMin: true });
    }
  }
  assertWithinLimit("maxVideoAudioTracks", tracks);
}

export function validatePhase8PipelineRenderOptions(options: VideoPipelineRenderOptions): void {
  validateControls(options, "videoPipeline.render");
}
