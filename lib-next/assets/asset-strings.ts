import type { AssetResolveFn, AssetValue } from "../types";
import { isPlainCompositionObject } from "../composition/clone";
import { ApexifyAssetError } from "../runtime/errors";

/** Matches a full `$name` / `$value.path.0` token after trimming. */
export const LONE_ASSET_REF = /^\$([A-Za-z_]\w*(?:\.(?:[A-Za-z_]\w*|\d+))*)$/;
/** Matches embedded asset tokens. Escape a literal dollar sign as `$$`. */
export const EMBEDDED_ASSET_TOKEN = /\$([A-Za-z_]\w*(?:\.(?:[A-Za-z_]\w*|\d+))*)/g;

export type { AssetResolveFn };

const ESCAPED_DOLLAR = "\uE000APEXIFY_DOLLAR\uE001";

function printableEmbeddedAsset(value: AssetValue, refPath: string): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  throw new ApexifyAssetError(
    `Cannot embed non-scalar asset "${refPath}" inside a longer string; use "$${refPath}" as the whole field value.`
  );
}

/**
 * Resolves one string leaf. `$$` emits a literal `$`; a full `$ref` may resolve to structured data or Buffer;
 * embedded refs are limited to printable scalar values.
 */
export function resolveAssetStringLeaf(s: string, resolve: AssetResolveFn): AssetValue {
  const protectedInput = s.replace(/\$\$/g, ESCAPED_DOLLAR);
  const trimmed = protectedInput.trim();
  const lone = LONE_ASSET_REF.exec(trimmed);
  if (lone && lone[0] === trimmed) return resolve(lone[1]!);

  return protectedInput
    .replace(EMBEDDED_ASSET_TOKEN, (_full, refPath: string) => printableEmbeddedAsset(resolve(refPath), refPath))
    .replaceAll(ESCAPED_DOLLAR, "$");
}

/**
 * Authoritative deep asset resolver. Arrays and plain records are cloned, Buffers and opaque runtime objects are
 * retained, and cyclic composition graphs are rejected deterministically.
 */
export function resolveAssetRefsDeep(input: unknown, resolve: AssetResolveFn): unknown {
  const active = new WeakSet<object>();

  const walk = (value: unknown, path: string): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === "string") return resolveAssetStringLeaf(value, resolve);
    if (typeof value !== "object" || Buffer.isBuffer(value)) return value;
    if (!Array.isArray(value) && !isPlainCompositionObject(value)) return value;
    if (active.has(value)) throw new ApexifyAssetError(`${path} contains a cyclic object graph.`);

    active.add(value);
    try {
      if (Array.isArray(value)) return value.map((item, index) => walk(item, `${path}[${index}]`));
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, child] of Object.entries(value)) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") {
          throw new ApexifyAssetError(`${path} contains unsafe key "${key}".`);
        }
        out[key] = walk(child, `${path}.${key}`);
      }
      return out;
    } finally {
      active.delete(value);
    }
  };

  return walk(input, "asset input");
}
