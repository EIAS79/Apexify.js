import type { PlaceholderResolveContext } from "../types";

export type { PlaceholderResolveContext };

const PLACEHOLDER = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;
const WHOLE_PLACEHOLDER = /^\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}$/;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);

/** Own-property dotted lookup. Missing/null intermediates return undefined. */
export function lookupData(data: Record<string, unknown>, key: string): unknown {
  const parts = key.trim().split(".").filter(Boolean);
  let current: unknown = data;
  for (const part of parts) {
    if (UNSAFE_PATH_SEGMENTS.has(part)) return undefined;
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolvePlaceholderValue(
  input: string,
  ctx: PlaceholderResolveContext,
  onMissing: (token: string) => never
): unknown {
  const whole = WHOLE_PLACEHOLDER.exec(input.trim());
  if (whole) {
    const key = whole[1]!.trim();
    const value = lookupData(ctx.data, key);
    if (value === undefined || value === null) {
      if (whole[2] !== undefined) return whole[2].trim();
      return onMissing(key);
    }
    return value;
  }
  return resolvePlaceholdersInString(input, ctx, onMissing);
}

/** Embedded placeholders stringify values; nullish values use the explicit default or throw. */
export function resolvePlaceholdersInString(
  input: string,
  ctx: PlaceholderResolveContext,
  onMissing: (token: string) => never
): string {
  return input.replace(PLACEHOLDER, (_full, rawKey: string, rawDefault: string | undefined) => {
    const key = String(rawKey).trim();
    const value = lookupData(ctx.data, key);
    if (value === undefined || value === null) {
      if (rawDefault !== undefined) return String(rawDefault).trim();
      onMissing(key);
    }
    return String(value);
  });
}

export function coerceVisibleString(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "") return false;
  return Boolean(value);
}
