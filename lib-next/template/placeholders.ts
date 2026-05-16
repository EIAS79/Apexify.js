const PLACEHOLDER = /\{\{\s*([^}|]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}/g;

export interface PlaceholderResolveContext {
  data: Record<string, unknown>;
}

/**
 * Returns value for `key` from dotted paths (`a.b`).
 */
export function lookupData(data: Record<string, unknown>, key: string): unknown {
  const parts = key.trim().split(".").filter(Boolean);
  let cur: unknown = data;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Replaces `{{key}}` and `{{key | default}}` in a string. Throws if a key is missing and no default.
 */
export function resolvePlaceholdersInString(
  input: string,
  ctx: PlaceholderResolveContext,
  onMissing: (token: string) => never
): string {
  return input.replace(PLACEHOLDER, (_full, rawKey: string, rawDefault: string | undefined) => {
    const key = String(rawKey).trim();
    const v = lookupData(ctx.data, key);
    if (v === undefined || v === null) {
      if (rawDefault !== undefined) {
        return String(rawDefault).trim();
      }
      onMissing(key);
    }
    return String(v);
  });
}

/**
 * Coerces post-placeholder strings to boolean for **`visible`** (and similar).
 */
export function coerceVisibleString(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes") return true;
  if (t === "false" || t === "0" || t === "no" || t === "") return false;
  return Boolean(s);
}
