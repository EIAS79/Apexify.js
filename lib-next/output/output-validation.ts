import type { SaveOptions } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertCollection, assertEnum, assertFiniteNumber, assertNonEmptyString } from "../runtime/validation";
import { inspectDecodedImageSource } from "../image/image-source-validation";

const SAVE_FORMATS = ["png", "jpg", "jpeg", "webp", "avif", "gif"] as const;
const SAVE_NAMING = ["timestamp", "counter", "custom"] as const;

function assertOptionalBoolean(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ApexifyInputError(`${name} must be boolean.`);
  }
}

function assertOptionalString(value: unknown, name: string, maxLength: number, allowEmpty = true): void {
  if (value === undefined) return;
  if (typeof value !== "string" || value.includes("\0") || (!allowEmpty && value.trim().length === 0)) {
    throw new ApexifyInputError(`${name} must be ${allowEmpty ? "a string" : "a non-empty string"} without NUL bytes.`);
  }
  if (value.length > maxLength) {
    throw new ApexifyInputError(`${name} exceeds the maximum length of ${maxLength}.`);
  }
}

export function validateOutputBuffer(value: unknown, name = "output.buffer"): asserts value is Buffer {
  if (!Buffer.isBuffer(value) || value.length === 0) {
    throw new ApexifyInputError(`${name} must be a non-empty Buffer.`);
  }
}

export function validateSaveOptions(options?: SaveOptions): void {
  if (options === undefined) return;
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new ApexifyInputError("save.options must be an object.");
  }
  if (options.directory !== undefined) assertNonEmptyString(options.directory, "save.options.directory", 32_768);
  if (options.filename !== undefined) assertNonEmptyString(options.filename, "save.options.filename", 4_096);
  if (options.format !== undefined) assertEnum(options.format, "save.options.format", SAVE_FORMATS);
  if (options.quality !== undefined) assertFiniteNumber(options.quality, "save.options.quality", { min: 1, max: 100, integer: true });
  assertOptionalBoolean(options.createDirectory, "save.options.createDirectory");
  if (options.naming !== undefined) assertEnum(options.naming, "save.options.naming", SAVE_NAMING);
  if (options.counterStart !== undefined) assertFiniteNumber(options.counterStart, "save.options.counterStart", { min: 1, integer: true });
  assertOptionalString(options.prefix, "save.options.prefix", 1_024);
  assertOptionalString(options.suffix, "save.options.suffix", 1_024);
  assertOptionalBoolean(options.overwrite, "save.options.overwrite");
}

export async function validateSaveRequest(buffer: unknown, options?: SaveOptions): Promise<void> {
  validateOutputBuffer(buffer, "save.buffer");
  validateSaveOptions(options);
  const format = options?.format ?? "png";
  if (format === "jpg" || format === "jpeg" || format === "webp" || format === "avif") {
    await inspectDecodedImageSource(buffer, { label: "save.buffer", requireCanvasBudget: true });
  }
}

export async function validateSaveMultipleRequest(buffers: unknown, options?: SaveOptions): Promise<void> {
  assertCollection(buffers, "saveMultiple.buffers", { min: 1, limit: "maxCollectionItems" });
  validateSaveOptions(options);
  const format = options?.format ?? "png";
  for (let i = 0; i < buffers.length; i++) {
    validateOutputBuffer(buffers[i], `saveMultiple.buffers[${i}]`);
    if (format === "jpg" || format === "jpeg" || format === "webp" || format === "avif") {
      await inspectDecodedImageSource(buffers[i], {
        label: `saveMultiple.buffers[${i}]`,
        requireCanvasBudget: true,
      });
    }
  }
}
