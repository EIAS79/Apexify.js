import type { RenderLimits } from "./config";
import { getDefaultApexifyRuntimeConfig } from "./config";
import { ApexifyResourceLimitError } from "./errors";

function currentLimits(limits?: RenderLimits): RenderLimits {
  return limits ?? getDefaultApexifyRuntimeConfig().limits;
}

export function assertWithinLimit(name: keyof RenderLimits, actual: number, limits?: RenderLimits): void {
  const maximum = currentLimits(limits)[name];
  if (!Number.isFinite(actual) || actual < 0 || actual > maximum) {
    throw new ApexifyResourceLimitError(name, maximum, actual);
  }
}

export function assertCanvasResourceLimits(width: number, height: number, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  assertWithinLimit("maxCanvasDimension", width, resolved);
  assertWithinLimit("maxCanvasDimension", height, resolved);
  assertWithinLimit("maxTotalPixels", width * height, resolved);
}

export function assertGifResourceLimits(width: number, height: number, frameCount: number, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  assertWithinLimit("maxGifDimension", width, resolved);
  assertWithinLimit("maxGifDimension", height, resolved);
  // GIF output pixels are independently bounded before encoder/canvas allocation.
  assertWithinLimit("maxTotalPixels", width * height, resolved);
  assertWithinLimit("maxGifFrames", frameCount, resolved);
  assertWithinLimit("maxGifResourceCost", width * height * Math.max(1, frameCount), resolved);
}

export function estimateAudioBytes(durationSeconds: number, sampleRate: number, channels: number): number {
  return Math.ceil(durationSeconds * sampleRate) * channels * Float32Array.BYTES_PER_ELEMENT;
}

export function assertAudioResourceLimits(options: {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  events?: number;
  layers?: number;
  partials?: number;
}, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  assertWithinLimit("maxAudioDurationSeconds", options.durationSeconds, resolved);
  assertWithinLimit("maxAudioSampleRate", options.sampleRate, resolved);
  if (options.events !== undefined) assertWithinLimit("maxAudioEvents", options.events, resolved);
  if (options.layers !== undefined) assertWithinLimit("maxAudioLayers", options.layers, resolved);
  if (options.partials !== undefined) assertWithinLimit("maxAudioPartials", options.partials, resolved);
  assertWithinLimit("maxAudioBytes", estimateAudioBytes(options.durationSeconds, options.sampleRate, options.channels), resolved);
}

export function assertVideoResourceLimits(options: {
  durationSeconds?: number;
  fps?: number;
  bitrateKbps?: number;
  width?: number;
  height?: number;
  overlays?: number;
}, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  if (options.durationSeconds !== undefined) assertWithinLimit("maxVideoDurationSeconds", options.durationSeconds, resolved);
  if (options.fps !== undefined) assertWithinLimit("maxVideoFps", options.fps, resolved);
  if (options.bitrateKbps !== undefined) assertWithinLimit("maxVideoBitrateKbps", options.bitrateKbps, resolved);
  if (options.width !== undefined && options.height !== undefined) assertCanvasResourceLimits(options.width, options.height, resolved);
  if (options.overlays !== undefined) assertWithinLimit("maxVideoOverlays", options.overlays, resolved);
}

export function assertRemoteBytes(kind: "image" | "video" | "generic", bytes: number, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  if (kind === "image") assertWithinLimit("maxRemoteImageBytes", bytes, resolved);
  else if (kind === "video") assertWithinLimit("maxRemoteVideoBytes", bytes, resolved);
  else {
    const maximum = Math.max(resolved.maxRemoteImageBytes, resolved.maxRemoteVideoBytes);
    if (!Number.isFinite(bytes) || bytes < 0 || bytes > maximum) {
      throw new ApexifyResourceLimitError("maxRemoteVideoBytes", maximum, bytes);
    }
  }
}
