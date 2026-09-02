import { ApexifyInputError } from "./errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "./limits";

export interface NumberRule {
  min?: number;
  max?: number;
  integer?: boolean;
  exclusiveMin?: boolean;
}

export function assertRecord<T>(value: T, name: string): asserts value is T & Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ApexifyInputError(`${name} must be an object.`);
  }
}

export function assertFiniteNumber(value: unknown, name: string, rule: NumberRule = {}): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApexifyInputError(`${name} must be a finite number.`);
  }
  if (rule.integer && !Number.isInteger(value)) {
    throw new ApexifyInputError(`${name} must be an integer.`);
  }
  if (rule.min !== undefined && (rule.exclusiveMin ? value <= rule.min : value < rule.min)) {
    throw new ApexifyInputError(`${name} must be ${rule.exclusiveMin ? ">" : ">="} ${rule.min}.`);
  }
  if (rule.max !== undefined && value > rule.max) {
    throw new ApexifyInputError(`${name} must be <= ${rule.max}.`);
  }
}

export function assertOptionalFiniteNumber(value: unknown, name: string, rule: NumberRule = {}): void {
  if (value !== undefined) assertFiniteNumber(value, name, rule);
}

export function assertOpacity(value: unknown, name: string): void {
  assertOptionalFiniteNumber(value, name, { min: 0, max: 1 });
}

export function assertNonEmptyString(value: unknown, name: string, maxLength?: number): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    throw new ApexifyInputError(`${name} must be a non-empty string without NUL bytes.`);
  }
  if (maxLength !== undefined && value.length > maxLength) {
    throw new ApexifyInputError(`${name} exceeds the maximum length of ${maxLength}.`);
  }
}

export function assertOptionalNonEmptyString(value: unknown, name: string, maxLength?: number): void {
  if (value !== undefined) assertNonEmptyString(value, name, maxLength);
}

export function assertEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new ApexifyInputError(`${name} must be one of: ${allowed.join(", ")}.`);
  }
}

export function assertOptionalEnum<T extends string>(value: unknown, name: string, allowed: readonly T[]): void {
  if (value !== undefined) assertEnum(value, name, allowed);
}

export function assertCollection<T>(value: T, name: string, options: { min?: number; limit?: "maxCollectionItems" | "maxFiltersPerOperation" | "maxBackgroundLayers" | "maxVideoOverlays" | "maxBatchOperations" } = {}): asserts value is T & unknown[] {
  if (!Array.isArray(value)) throw new ApexifyInputError(`${name} must be an array.`);
  if (options.min !== undefined && value.length < options.min) {
    throw new ApexifyInputError(`${name} must contain at least ${options.min} item(s).`);
  }
  if (options.limit) assertWithinLimit(options.limit, value.length);
}

export function assertDimensions(width: unknown, height: unknown, name: string, required = true): void {
  if (!required && width === undefined && height === undefined) return;
  if (required || width !== undefined) assertFiniteNumber(width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
  if (required || height !== undefined) assertFiniteNumber(height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
  if (typeof width === "number" && typeof height === "number") assertCanvasResourceLimits(width, height);
}

export function assertSource(value: unknown, name: string): void {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof URL) {
    if ((Buffer.isBuffer(value) || value instanceof Uint8Array) && value.byteLength === 0) {
      throw new ApexifyInputError(`${name} must not be empty.`);
    }
    return;
  }
  assertNonEmptyString(value, name, 16_384);
}

/** Reject non-finite numeric leaves early without cloning or schema reconstruction. */
export function assertFiniteNumericLeaves(value: unknown, name: string, depth = 0): void {
  if (depth > 12 || value == null || Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof URL) return;
  if (typeof value === "number") {
    assertFiniteNumber(value, name);
    return;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) assertFiniteNumericLeaves(value[i], `${name}[${i}]`, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assertFiniteNumericLeaves(child, `${name}.${key}`, depth + 1);
    }
  }
}

export function assertGradient(value: unknown, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  assertFiniteNumericLeaves(value, name);
  const colors = (value as { colors?: unknown }).colors;
  if (colors !== undefined) {
    assertCollection(colors, `${name}.colors`, { min: 1, limit: "maxCollectionItems" });
    const stops: unknown[] = colors as unknown[];
    for (let i = 0; i < stops.length; i++) {
      const stop: unknown = stops[i];
      assertRecord(stop, `${name}.colors[${i}]`);
      assertFiniteNumber(stop.stop, `${name}.colors[${i}].stop`, { min: 0, max: 1 });
      assertNonEmptyString(stop.color, `${name}.colors[${i}].color`, 256);
    }
  }
}
