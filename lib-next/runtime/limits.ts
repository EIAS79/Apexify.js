import { ApexifyConfigError, ApexifyResourceLimitError } from "./errors";

export interface RenderLimits {
  maxCanvasDimension: number;
  maxTotalPixels: number;
  maxSceneLayers: number;
  maxNestedSurfaces: number;
  maxTextLength: number;
  maxRemoteAssets: number;
  maxRemoteImageBytes: number;
  maxRemoteVideoBytes: number;
  maxRemoteGenericBytes: number;
  maxDecodedImagePixels: number;
  maxGifFrames: number;
  maxGifDimension: number;
  maxGifPixelWork: number;
  maxAudioDurationSeconds: number;
  maxSampleRate: number;
  maxAudioEvents: number;
  maxVideoDurationSeconds: number;
  maxConcurrentRemoteFetches: number;
}

export const DEFAULT_RENDER_LIMITS: Readonly<RenderLimits> = Object.freeze({
  maxCanvasDimension: 16_384,
  maxTotalPixels: 64_000_000,
  maxSceneLayers: 1_000,
  maxNestedSurfaces: 16,
  maxTextLength: 100_000,
  maxRemoteAssets: 128,
  maxRemoteImageBytes: 32 * 1024 * 1024,
  maxRemoteVideoBytes: 512 * 1024 * 1024,
  maxRemoteGenericBytes: 64 * 1024 * 1024,
  maxDecodedImagePixels: 80_000_000,
  maxGifFrames: 1_000,
  maxGifDimension: 4_096,
  maxGifPixelWork: 512_000_000,
  maxAudioDurationSeconds: 600,
  maxSampleRate: 192_000,
  maxAudioEvents: 10_000,
  maxVideoDurationSeconds: 7_200,
  maxConcurrentRemoteFetches: 8,
});

export type RenderLimitsInput = Partial<RenderLimits>;

const INTEGER_LIMITS = new Set<keyof RenderLimits>([
  "maxCanvasDimension",
  "maxTotalPixels",
  "maxSceneLayers",
  "maxNestedSurfaces",
  "maxTextLength",
  "maxRemoteAssets",
  "maxRemoteImageBytes",
  "maxRemoteVideoBytes",
  "maxRemoteGenericBytes",
  "maxDecodedImagePixels",
  "maxGifFrames",
  "maxGifDimension",
  "maxGifPixelWork",
  "maxSampleRate",
  "maxAudioEvents",
  "maxConcurrentRemoteFetches",
]);

export function resolveRenderLimits(input: RenderLimitsInput = {}): Readonly<RenderLimits> {
  const merged: RenderLimits = { ...DEFAULT_RENDER_LIMITS, ...input };
  for (const [key, raw] of Object.entries(merged) as Array<[keyof RenderLimits, number]>) {
    if (!Number.isFinite(raw) || raw <= 0) {
      throw new ApexifyConfigError(`limits.${key} must be a finite number greater than 0.`);
    }
    if (INTEGER_LIMITS.has(key) && !Number.isInteger(raw)) {
      throw new ApexifyConfigError(`limits.${key} must be an integer.`);
    }
  }
  return Object.freeze(merged);
}

export function assertCanvasWithinLimits(
  width: number,
  height: number,
  limits: Readonly<RenderLimits>,
  operation = "render"
): void {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ApexifyResourceLimitError(`${operation}: dimensions must be finite positive numbers.`, {
      limit: "dimensions",
      maximum: limits.maxCanvasDimension,
    });
  }
  if (width > limits.maxCanvasDimension || height > limits.maxCanvasDimension) {
    throw new ApexifyResourceLimitError(
      `${operation}: dimensions ${width}x${height} exceed maxCanvasDimension ${limits.maxCanvasDimension}.`,
      {
        limit: "maxCanvasDimension",
        maximum: limits.maxCanvasDimension,
        actual: Math.max(width, height),
      }
    );
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > limits.maxTotalPixels) {
    throw new ApexifyResourceLimitError(
      `${operation}: pixel count ${pixels} exceeds maxTotalPixels ${limits.maxTotalPixels}.`,
      { limit: "maxTotalPixels", maximum: limits.maxTotalPixels, actual: pixels }
    );
  }
}

export function assertByteLimit(
  bytes: number,
  maximum: number,
  limitName: string,
  operation: string
): void {
  if (!Number.isFinite(bytes) || bytes < 0) {
    throw new ApexifyResourceLimitError(`${operation}: invalid byte length.`, {
      limit: limitName,
      maximum,
      actual: bytes,
    });
  }
  if (bytes > maximum) {
    throw new ApexifyResourceLimitError(
      `${operation}: ${bytes} bytes exceed ${limitName} (${maximum} bytes).`,
      { limit: limitName, maximum, actual: bytes }
    );
  }
}

export function remoteByteLimitForKind(
  kind: "image" | "video" | "generic",
  limits: Readonly<RenderLimits>
): number {
  if (kind === "image") return limits.maxRemoteImageBytes;
  if (kind === "video") return limits.maxRemoteVideoBytes;
  return limits.maxRemoteGenericBytes;
}
