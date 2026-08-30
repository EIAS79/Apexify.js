import type { GIFEncodedFrame, GIFInputFrame, GIFOptions } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertGifResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection, assertEnum, assertFiniteNumber, assertNonEmptyString, assertOptionalFiniteNumber,
  assertRecord, assertSource,
} from "../runtime/validation";

const OUTPUTS = ["file", "base64", "attachment", "buffer"] as const;
const DISPOSAL = [0, 1, 2, 3] as const;

function validateWatermark(value: unknown, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  if (value.enable !== undefined && typeof value.enable !== "boolean") throw new ApexifyInputError(`${name}.enable must be boolean.`);
  assertNonEmptyString(value.url, `${name}.url`, 16_384);
  assertOptionalFiniteNumber(value.x, `${name}.x`);
  assertOptionalFiniteNumber(value.y, `${name}.y`);
}

function validateDispose(value: unknown, name: string): void {
  if (value === undefined) return;
  if (typeof value !== "number" || !DISPOSAL.includes(value as 0 | 1 | 2 | 3)) {
    throw new ApexifyInputError(`${name} must be 0, 1, 2, or 3.`);
  }
}

export function validateGIFOptions(options: GIFOptions, frameCountHint = 0): void {
  assertRecord(options, "gif.options");
  assertEnum(options.outputFormat, "gif.options.outputFormat", OUTPUTS);
  if (options.outputFormat === "file") assertNonEmptyString(options.outputFile, "gif.options.outputFile", 32_768);
  assertOptionalFiniteNumber(options.width, "gif.options.width", { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(options.height, "gif.options.height", { min: 0, exclusiveMin: true, integer: true });
  if ((options.width === undefined) !== (options.height === undefined)) {
    throw new ApexifyInputError("gif.options.width and height must be provided together.");
  }
  assertOptionalFiniteNumber(options.repeat, "gif.options.repeat", { min: 0, integer: true, max: 65_535 });
  assertOptionalFiniteNumber(options.quality, "gif.options.quality", { min: 1, max: 20, integer: true });
  assertOptionalFiniteNumber(options.delay, "gif.options.delay", { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(options.frameCount, "gif.options.frameCount", { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(options.duration, "gif.options.duration", { min: 0, exclusiveMin: true });
  validateDispose(options.defaultDispose, "gif.options.defaultDispose");
  validateWatermark(options.watermark, "gif.options.watermark");
  if (options.textOverlay !== undefined) {
    assertRecord(options.textOverlay, "gif.options.textOverlay");
    if (typeof options.textOverlay.text !== "string" || options.textOverlay.text.length === 0) throw new ApexifyInputError("gif.options.textOverlay.text must be a non-empty string.");
    assertWithinLimit("maxTextLength", options.textOverlay.text.length);
    assertOptionalFiniteNumber(options.textOverlay.fontSize, "gif.options.textOverlay.fontSize", { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(options.textOverlay.x, "gif.options.textOverlay.x");
    assertOptionalFiniteNumber(options.textOverlay.y, "gif.options.textOverlay.y");
  }
  const expectedFrames = options.frameCount ?? (options.duration !== undefined && options.delay !== undefined ? Math.ceil(options.duration / options.delay) : frameCountHint);
  if (expectedFrames > 0) assertWithinLimit("maxGifFrames", expectedFrames);
  if (options.width !== undefined && options.height !== undefined) assertGifResourceLimits(options.width, options.height, Math.max(1, expectedFrames));
}

export function validateGIFInputFrames(frames: GIFInputFrame[]): void {
  assertCollection(frames, "gif.frames", { min: 1 });
  assertWithinLimit("maxGifFrames", frames.length);
  frames.forEach((frame, i) => {
    const name = `gif.frames[${i}]`;
    assertRecord(frame, name);
    assertFiniteNumber(frame.duration, `${name}.duration`, { min: 0, exclusiveMin: true });
    if (frame.buffer !== undefined) assertSource(frame.buffer, `${name}.buffer`);
    if (frame.background !== undefined) assertSource(frame.background, `${name}.background`);
    if (frame.buffer === undefined && frame.background === undefined) throw new ApexifyInputError(`${name} requires buffer or background.`);
    validateDispose(frame.dispose, `${name}.dispose`);
    validateWatermark(frame.watermark, `${name}.watermark`);
  });
}

export function validateGeneratedGIFFrame(frame: GIFEncodedFrame, index: number): void {
  assertWithinLimit("maxGifFrames", index + 1);
  assertRecord(frame, `gif.generatedFrames[${index}]`);
  assertSource(frame.buffer, `gif.generatedFrames[${index}].buffer`);
  assertOptionalFiniteNumber(frame.duration, `gif.generatedFrames[${index}].duration`, { min: 0, exclusiveMin: true });
  validateDispose(frame.dispose, `gif.generatedFrames[${index}].dispose`);
  validateWatermark(frame.watermark, `gif.generatedFrames[${index}].watermark`);
}
