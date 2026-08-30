import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyDecodeError, ApexifyInputError, ApexifyResourceLimitError } from "../runtime/errors";
import { BoundedCache } from "./cache";
import { validateRemoteTarget } from "./network-policy";
import { fetchRemoteMedia, type RemoteFetchOptions } from "./remote-fetch";

export type MediaSource = string | Buffer | Uint8Array | URL;
export type MediaKind = "image" | "video" | "generic";

export interface ResolveMediaOptions extends Omit<RemoteFetchOptions, "kind"> {
  kind?: MediaKind;
  cache?: boolean;
}

let remoteByteCache: BoundedCache<string, Buffer> | undefined;
let remoteCacheSignature = "";

function cacheForRuntime(): BoundedCache<string, Buffer> {
  const config = getDefaultApexifyRuntimeConfig().cache;
  const signature = `${config.enabled}:${config.ttlMs}:${config.maxEntries}:${config.maxBytes}`;
  if (!remoteByteCache || signature !== remoteCacheSignature) {
    remoteByteCache = new BoundedCache<string, Buffer>({
      enabled: config.enabled,
      ttlMs: config.ttlMs,
      maxEntries: config.maxEntries,
      maxBytes: config.maxBytes,
      sizeOf: (value) => value.byteLength,
    });
    remoteCacheSignature = signature;
  }
  return remoteByteCache;
}

function effectiveMediaMaxBytes(options: ResolveMediaOptions): number {
  if (options.maxBytes !== undefined) return options.maxBytes;
  const limits = getDefaultApexifyRuntimeConfig().limits;
  if (options.kind === "image") return limits.maxRemoteImageBytes;
  if (options.kind === "video") return limits.maxRemoteVideoBytes;
  return Math.max(limits.maxRemoteImageBytes, limits.maxRemoteVideoBytes);
}

function mediaLimitName(options: ResolveMediaOptions): "maxRemoteImageBytes" | "maxRemoteVideoBytes" {
  return options.kind === "image" ? "maxRemoteImageBytes" : "maxRemoteVideoBytes";
}

function assertMediaBytes(buffer: Buffer, options: ResolveMediaOptions): void {
  const maximum = effectiveMediaMaxBytes(options);
  if (buffer.byteLength > maximum) {
    throw new ApexifyResourceLimitError(mediaLimitName(options), maximum, buffer.byteLength);
  }
}

function remoteCacheKey(source: string, options: ResolveMediaOptions): string {
  const maximum = effectiveMediaMaxBytes(options);
  const kind = options.kind ?? "generic";
  return createHash("sha256").update(`${source}\0${kind}\0${maximum}`).digest("hex");
}

export function clearMediaCache(): void {
  remoteByteCache?.clear();
}

export function getMediaCacheStats() {
  return remoteByteCache?.stats() ?? { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0, failures: 0, entries: 0, bytes: 0 };
}

export function decodeImageDataUrl(source: string): Buffer | undefined {
  const trimmed = source.trim();
  const match = /^data:image\/[a-z0-9.+-]+;base64,([a-z0-9+/=\s]+)$/i.exec(trimmed);
  if (!match) return undefined;
  try {
    const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
    return buffer.length > 0 ? buffer : undefined;
  } catch (cause) {
    throw new ApexifyDecodeError("Image data URL could not be decoded.", { cause });
  }
}

export function resolveLocalMediaPath(source: string): string {
  const trimmed = source.trim();
  if (!trimmed) throw new ApexifyInputError("Media source path or URL is required.");
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

export function normalizeMediaSource(source: MediaSource): string | Buffer {
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  if (source instanceof URL) {
    if (source.protocol === "file:") return fileURLToPath(source);
    return source.toString();
  }
  if (typeof source === "string") return source;
  throw new ApexifyInputError("Media source must be a string path/URL, URL, Buffer, or Uint8Array.");
}

async function fetchRemoteBuffer(source: string, options: ResolveMediaOptions): Promise<Buffer> {
  const runtime = getDefaultApexifyRuntimeConfig();
  // Revalidate the target on every call, including cache hits. This prevents a
  // buffer fetched under a temporary trusted allowlist from bypassing a later,
  // stricter SSRF policy.
  await validateRemoteTarget(source, runtime.network);

  // Authenticated/header-dependent responses are deliberately not shared in the
  // global cache because the representation may vary by credentials or headers.
  const useCache = options.cache !== false && runtime.cache.enabled && !options.headers;
  if (!useCache) {
    const buffer = (await fetchRemoteMedia(source, { ...options, kind: options.kind ?? "generic" })).buffer;
    assertMediaBytes(buffer, options);
    return buffer;
  }

  const cache = cacheForRuntime();
  const key = remoteCacheKey(source, options);
  const existing = cache.get(key);
  if (existing) {
    assertMediaBytes(existing, options);
    return existing;
  }

  try {
    const buffer = (await fetchRemoteMedia(source, { ...options, kind: options.kind ?? "generic" })).buffer;
    assertMediaBytes(buffer, options);
    cache.set(key, buffer);
    return buffer;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

export async function resolveMediaInput(source: MediaSource, options: ResolveMediaOptions = {}): Promise<string | Buffer> {
  const normalized = normalizeMediaSource(source);
  if (Buffer.isBuffer(normalized)) {
    if (normalized.length === 0) throw new ApexifyInputError("Media buffer is empty.");
    assertMediaBytes(normalized, options);
    return normalized;
  }
  if (!normalized.trim()) throw new ApexifyInputError("Media source must be a non-empty path/URL or byte source.");
  const trimmed = normalized.trim();
  if (/^https?:\/\//i.test(trimmed)) return fetchRemoteBuffer(trimmed, options);
  if (/^data:/i.test(trimmed)) {
    const data = decodeImageDataUrl(trimmed);
    if (!data) throw new ApexifyDecodeError("Only base64 data:image URLs are supported as data media sources.");
    assertMediaBytes(data, options);
    return data;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    throw new ApexifyInputError("Unsupported media source protocol.");
  }
  return resolveLocalMediaPath(trimmed);
}

export async function resolveMediaBuffer(source: MediaSource, options: ResolveMediaOptions = {}): Promise<Buffer> {
  const resolved = await resolveMediaInput(source, options);
  if (Buffer.isBuffer(resolved)) return resolved;
  try {
    const buffer = await fs.readFile(resolved);
    if (buffer.length === 0) throw new ApexifyInputError("Media file is empty.", { details: { path: resolved } });
    assertMediaBytes(buffer, options);
    return buffer;
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyResourceLimitError) throw cause;
    throw new ApexifyInputError("Media file could not be read.", { cause, details: { path: resolved } });
  }
}
