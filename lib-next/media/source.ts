import { promises as fs } from "node:fs";
import path from "node:path";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyDecodeError, ApexifyInputError, ApexifyResourceLimitError } from "../runtime/errors";
import { BoundedCache } from "./cache";
import { fetchRemoteMedia, type RemoteFetchOptions } from "./remote-fetch";

export type MediaSource = string | Buffer;
export type MediaKind = "image" | "video" | "generic";

export interface ResolveMediaOptions extends Omit<RemoteFetchOptions, "kind"> {
  kind?: MediaKind;
  cache?: boolean;
}

let remoteByteCache: BoundedCache<string, Promise<Buffer>> | undefined;
let remoteCacheSignature = "";

function cacheForRuntime(): BoundedCache<string, Promise<Buffer>> {
  const config = getDefaultApexifyRuntimeConfig().cache;
  const signature = `${config.enabled}:${config.ttlMs}:${config.maxEntries}:${config.maxBytes}`;
  if (!remoteByteCache || signature !== remoteCacheSignature) {
    remoteByteCache = new BoundedCache<string, Promise<Buffer>>({
      enabled: config.enabled,
      ttlMs: config.ttlMs,
      maxEntries: config.maxEntries,
      maxBytes: config.maxBytes,
      sizeOf: () => 1,
    });
    remoteCacheSignature = signature;
  }
  return remoteByteCache;
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

async function fetchRemoteBuffer(source: string, options: ResolveMediaOptions): Promise<Buffer> {
  const useCache = options.cache !== false && getDefaultApexifyRuntimeConfig().cache.enabled;
  const factory = async () => (await fetchRemoteMedia(source, { ...options, kind: options.kind ?? "generic" })).buffer;
  if (!useCache) return factory();
  const cache = cacheForRuntime();
  const existing = cache.get(source);
  if (existing) return existing;
  const pending = factory();
  cache.set(source, pending);
  try {
    return await pending;
  } catch (error) {
    cache.delete(source);
    throw error;
  }
}

export async function resolveMediaInput(source: MediaSource, options: ResolveMediaOptions = {}): Promise<string | Buffer> {
  if (Buffer.isBuffer(source)) {
    if (source.length === 0) throw new ApexifyInputError("Media buffer is empty.");
    const limits = getDefaultApexifyRuntimeConfig().limits;
    const max = options.maxBytes ?? (options.kind === "video" ? limits.maxRemoteVideoBytes : limits.maxRemoteImageBytes);
    if (source.length > max) throw new ApexifyResourceLimitError(options.kind === "video" ? "maxRemoteVideoBytes" : "maxRemoteImageBytes", max, source.length);
    return source;
  }
  if (typeof source !== "string" || !source.trim()) throw new ApexifyInputError("Media source must be a non-empty string path/URL or Buffer.");
  const trimmed = source.trim();
  if (/^https?:\/\//i.test(trimmed)) return fetchRemoteBuffer(trimmed, options);
  if (/^data:/i.test(trimmed)) {
    const data = decodeImageDataUrl(trimmed);
    if (!data) throw new ApexifyDecodeError("Only base64 data:image URLs are supported as data media sources.");
    return data;
  }
  return resolveLocalMediaPath(trimmed);
}

export async function resolveMediaBuffer(source: MediaSource, options: ResolveMediaOptions = {}): Promise<Buffer> {
  const resolved = await resolveMediaInput(source, options);
  if (Buffer.isBuffer(resolved)) return resolved;
  try {
    const buffer = await fs.readFile(resolved);
    if (buffer.length === 0) throw new ApexifyInputError("Media file is empty.", { details: { path: resolved } });
    return buffer;
  } catch (cause) {
    if (cause instanceof ApexifyInputError) throw cause;
    throw new ApexifyInputError("Media file could not be read.", { cause, details: { path: resolved } });
  }
}
