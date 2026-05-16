/** Matches **`$name`** or **`$palette.slot`** as a full token (trimmed). */
export const LONE_ASSET_REF = /^\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)$/;

/** Replaces embedded **`$ref`** segments in a string; each segment resolves to a string (Buffers are not allowed in the middle of text). */
export const EMBEDDED_ASSET_TOKEN = /\$([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/g;

export type AssetResolveFn = (refPath: string) => string | Buffer;

/**
 * Resolves a single leaf string: lone **`$ref`** → string or Buffer; otherwise replaces embedded **`$ref`** with string values only.
 */
export function resolveAssetStringLeaf(s: string, resolve: AssetResolveFn): string | Buffer {
  const trimmed = s.trim();
  const lone = LONE_ASSET_REF.exec(trimmed);
  if (lone && lone[0] === trimmed) {
    return resolve(lone[1]!);
  }
  return s.replace(EMBEDDED_ASSET_TOKEN, (_full, refPath: string) => {
    const r = resolve(refPath);
    if (typeof r === "string") return r;
    throw new Error(
      `Cannot embed Buffer asset "${refPath}" inside a longer string; use the asset as the whole field value (e.g. "$${refPath}").`
    );
  });
}

/** Walks any JSON-like tree and resolves asset references in string leaves (deep copy). */
export function resolveAssetRefsDeep(input: unknown, resolve: AssetResolveFn): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return resolveAssetStringLeaf(input, resolve);
  if (typeof input !== "object") return input;
  if (Buffer.isBuffer(input)) return input;
  if (Array.isArray(input)) return input.map((v) => resolveAssetRefsDeep(v, resolve));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    out[k] = resolveAssetRefsDeep(v, resolve);
  }
  return out;
}
