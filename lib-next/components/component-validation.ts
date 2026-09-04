import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumber } from "../runtime/validation";

export function componentFinite(value: number, label: string): number {
  assertFiniteNumber(value, label);
  return value;
}

export function componentPositive(value: number, label: string): number {
  assertFiniteNumber(value, label, { min: 0, exclusiveMin: true });
  return value;
}

export function componentNonNegative(value: number, label: string): number {
  assertFiniteNumber(value, label, { min: 0 });
  return value;
}

export function componentText(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new ApexifyInputError(`${label} must be ${allowEmpty ? "a string" : "a non-empty string"}.`);
  }
  assertWithinLimit("maxTextLength", value.length);
  return value;
}

export function componentImageSource(value: unknown, label: string): asserts value is string | Buffer {
  if (typeof value === "string") {
    if (value.length === 0) throw new ApexifyInputError(`${label} must not be empty.`);
    return;
  }
  if (!Buffer.isBuffer(value) || value.length === 0) throw new ApexifyInputError(`${label} must be a non-empty string or Buffer.`);
}
