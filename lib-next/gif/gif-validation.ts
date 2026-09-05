import type { GIFEncodedFrame, GIFInputFrame, GIFOptions, GIFTextOverlaySpec, GIFWatermarkSpec } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertGifResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection,
  assertEnum,
  assertNonEmptyString,
  assertOptionalFiniteNumber,
  assertOpacity,
  assertRecord,
  assertSource,
} from "../runtime/validation";
import { validateTextProperties } from "../text/text-validation";

const OUTPUTS = ["file", "base64", "attachment", "buffer"] as const;
const DISPOSAL = [0, 1, 2, 3] as const;
const WATERMARK_POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "center"] as const;
const MAX_GIF_DELAY_MS = 655_350;

export function validateGIFTransparentColor(value: unknown, name: string): void {
  if (value === undefined || value === null) return;
  if (typeof value === "number") {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
      throw new ApexifyInputError(`${name} numeric value must be an integer from 0x000000 to 0xFFFFFF.`);
    }
    return;
  }
  if (typeof value !== "string" || !/^(?:#|0x)?[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?$/.test(value.trim())) {
    throw new ApexifyInputError(`${name} must be #RRGGBB, #RRGGBBAA, 0xRRGGBB, or a 24-bit integer.`);
  }
}

export function validateGIFDisposal(value: unknown, name: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !DISPOSAL.includes(value as 0 | 1 | 2 | 3)) {
    throw new ApexifyInputError(`${name} must be 0, 1, 2, or 3.`);
  }
}

export function validateGIFWatermark(value: GIFWatermarkSpec | undefined, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  if (value.enable !== undefined && typeof value.enable !== "boolean") {
    throw new ApexifyInputError(`${name}.enable must be boolean.`);
  }
  assertSource(value.url, `${name}.url`);
  assertOptionalFiniteNumber(value.x, `${name}.x`);
  assertOptionalFiniteNumber(value.y, `${name}.y`);
  assertOpacity(value.opacity, `${name}.opacity`);
  assertOptionalFiniteNumber(value.width, `${name}.width`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(value.height, `${name}.height`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(value.scale, `${name}.scale`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(value.margin, `${name}.margin`, { min: 0 });
  if (value.position !== undefined) assertEnum(value.position, `${name}.position`, WATERMARK_POSITIONS);
  if (value.scale !== undefined && (value.width !== undefined || value.height !== undefined)) {
    throw new ApexifyInputError(`${name}.scale cannot be combined with explicit width/height.`);
  }
}

export function canonicalGIFTextOverlay(value: GIFTextOverlaySpec): Parameters<typeof validateTextProperties>[0] {
  const { fontColor, ...rest } = value;
  const fill = value.fill
    ? { ...value.fill, color: value.fill.color ?? fontColor }
    : undefined;
  return {
    ...rest,
    x: value.x ?? 10,
    y: value.y ?? 30,
    ...(fill !== undefined ? { fill } : {}),
    ...(fill === undefined && value.color === undefined && fontColor !== undefined ? { color: fontColor } : {}),
  };
}

export function validateGIFOverlayOptions(options: GIFOptions): void {
  validateGIFWatermark(options.watermark, "gif.options.watermark");
  if (options.textOverlay !== undefined) {
    assertRecord(options.textOverlay, "gif.options.textOverlay");
    validateTextProperties(canonicalGIFTextOverlay(options.textOverlay));
  }
}

export function validateGIFOutputOptions(options: GIFOptions): void {
  assertEnum(options.outputFormat, "gif.options.outputFormat", OUTPUTS);
  if (options.outputFormat === "file") {
    assertNonEmptyString(options.outputFile, "gif.options.outputFile", 32_768);
  }
  if (options.attachmentName !== undefined) {
    assertNonEmptyString(options.attachmentName, "gif.options.attachmentName", 255);
    if (/[\\/]/.test(options.attachmentName)) {
      throw new ApexifyInputError("gif.options.attachmentName must be a filename, not a path.");
    }
  }
}

export function validateGIFGeneralOptions(options: GIFOptions, frameCountHint = 0): void {
  assertRecord(options, "gif.options");
  assertOptionalFiniteNumber(options.width, "gif.options.width", { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(options.height, "gif.options.height", { min: 0, exclusiveMin: true, integer: true });
  if ((options.width === undefined) !== (options.height === undefined)) {
    throw new ApexifyInputError("gif.options.width and height must be provided together.");
  }
  assertOptionalFiniteNumber(options.repeat, "gif.options.repeat", { min: -1, integer: true, max: 65_535 });
  assertOptionalFiniteNumber(options.quality, "gif.options.quality", { min: 1, max: 30, integer: true });
  assertOptionalFiniteNumber(options.delay, "gif.options.delay", { min: 0, max: MAX_GIF_DELAY_MS });
  assertOptionalFiniteNumber(options.frameCount, "gif.options.frameCount", { min: 1, integer: true });
  assertOptionalFiniteNumber(options.duration, "gif.options.duration", { min: 0, exclusiveMin: true });
  validateGIFDisposal(options.defaultDispose, "gif.options.defaultDispose");
  validateGIFTransparentColor(options.transparentColor, "gif.options.transparentColor");
  if (options.skipResizeWhenDimensionsMatch !== undefined && typeof options.skipResizeWhenDimensionsMatch !== "boolean") {
    throw new ApexifyInputError("gif.options.skipResizeWhenDimensionsMatch must be boolean.");
  }
  if (options.onStart !== undefined && typeof options.onStart !== "function") {
    throw new ApexifyInputError("gif.options.onStart must be a function.");
  }
  if (options.onEnd !== undefined && typeof options.onEnd !== "function") {
    throw new ApexifyInputError("gif.options.onEnd must be a function.");
  }
  if (options.signal !== undefined) {
    const signal = options.signal as AbortSignal;
    if (typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function") {
      throw new ApexifyInputError("gif.options.signal must be an AbortSignal.");
    }
  }

  const delay = options.delay ?? 100;
  const durationCount = options.duration !== undefined && delay > 0 ? Math.ceil(options.duration / delay) : 0;
  const expectedFrames = (options.frameCount ?? durationCount) || frameCountHint;
  if (expectedFrames > 0) assertWithinLimit("maxGifFrames", expectedFrames);
  if (options.width !== undefined && options.height !== undefined) {
    assertGifResourceLimits(options.width, options.height, Math.max(1, expectedFrames));
  }
}

export function validateGIFOptions(options: GIFOptions, frameCountHint = 0): void {
  validateGIFGeneralOptions(options, frameCountHint);
  validateGIFOutputOptions(options);
  validateGIFOverlayOptions(options);
}

export function validateGIFInputFrame(frame: GIFInputFrame, index: number): void {
  const name = `gif.frames[${index}]`;
  assertRecord(frame, name);
  if (frame.duration !== undefined) {
    assertOptionalFiniteNumber(frame.duration, `${name}.duration`, { min: 0, max: MAX_GIF_DELAY_MS });
  }
  if (frame.buffer !== undefined) assertSource(frame.buffer, `${name}.buffer`);
  if (frame.background !== undefined) assertSource(frame.background, `${name}.background`);
  if (frame.buffer === undefined && frame.background === undefined) {
    throw new ApexifyInputError(`${name} requires buffer or background.`);
  }
  if (frame.buffer !== undefined && frame.background !== undefined) {
    throw new ApexifyInputError(`${name} must specify exactly one of buffer or background.`);
  }
  validateGIFDisposal(frame.dispose, `${name}.dispose`);
  validateGIFTransparentColor(frame.transparentColor, `${name}.transparentColor`);
  validateGIFWatermark(frame.watermark, `${name}.watermark`);
}

export function validateGIFInputFrames(frames: GIFInputFrame[]): void {
  assertCollection(frames, "gif.frames", { min: 1 });
  assertWithinLimit("maxGifFrames", frames.length);
  frames.forEach((frame, index) => validateGIFInputFrame(frame, index));
}

export function validateGeneratedGIFFrame(frame: GIFEncodedFrame, index: number): void {
  assertWithinLimit("maxGifFrames", index + 1);
  assertRecord(frame, `gif.generatedFrames[${index}]`);
  assertSource(frame.buffer, `gif.generatedFrames[${index}].buffer`);
  assertOptionalFiniteNumber(frame.duration, `gif.generatedFrames[${index}].duration`, { min: 0, max: MAX_GIF_DELAY_MS });
  validateGIFDisposal(frame.dispose, `gif.generatedFrames[${index}].dispose`);
  validateGIFTransparentColor(frame.transparentColor, `gif.generatedFrames[${index}].transparentColor`);
  validateGIFWatermark(frame.watermark, `gif.generatedFrames[${index}].watermark`);
}
