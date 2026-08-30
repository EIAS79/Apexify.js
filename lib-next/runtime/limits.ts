import type { RenderLimits } from "./config";
import { getDefaultApexifyRuntimeConfig } from "./config";
import { ApexifyResourceLimitError } from "./errors";

function currentLimits(limits?: RenderLimits): RenderLimits {
  return limits ?? getDefaultApexifyRuntimeConfig().limits;
}

export function assertWithinLimit(name: keyof RenderLimits, actual: number, limits?: RenderLimits): void {
  const maximum = currentLimits(limits)[name];
  if (!Number.isFinite(actual) || actual < 0) {
    throw new ApexifyResourceLimitError(name, maximum, actual);
  }
  if (actual > maximum) throw new ApexifyResourceLimitError(name, maximum, actual);
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
  assertWithinLimit("maxGifFrames", frameCount, resolved);
  assertWithinLimit("maxGifResourceCost", width * height * Math.max(1, frameCount), resolved);
}

export function assertRemoteBytes(kind: "image" | "video" | "generic", bytes: number, limits?: RenderLimits): void {
  const resolved = currentLimits(limits);
  if (kind === "image") assertWithinLimit("maxRemoteImageBytes", bytes, resolved);
  else if (kind === "video") assertWithinLimit("maxRemoteVideoBytes", bytes, resolved);
  else {
    const maximum = Math.max(resolved.maxRemoteImageBytes, resolved.maxRemoteVideoBytes);
    if (bytes > maximum) throw new ApexifyResourceLimitError("maxRemoteVideoBytes", maximum, bytes);
  }
}
