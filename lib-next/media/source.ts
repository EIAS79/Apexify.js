import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { ApexifyRuntime } from "../runtime/context";
import { defaultApexifyRuntime } from "../runtime/context";
import { assertByteLimit, remoteByteLimitForKind } from "../runtime/limits";
import {
  ApexifyDecodeError,
  ApexifyInputError,
  ApexifyRemoteFetchError,
  ApexifyResourceLimitError,
} from "../runtime/errors";
import { getRemoteFetchClient } from "./remote-client-registry";
import { redactUrl } from "./network-policy";

export type MediaKind = "image" | "video" | "generic";
export type MediaSource = string | Buffer;

export interface MediaResolveOptions {
  signal?: AbortSignal;
}

export interface ResolvedMediaInput {
  kind: "buffer" | "path";
  value: Buffer | string;
  origin: "buffer" | "data" | "remote" | "file";
}

function decodeDataUrl(input: string): Buffer | undefined {
  if (!/^data:/i.test(input)) return undefined;
  const comma = input.indexOf(",");
  if (comma < 0) throw new ApexifyInputError("Malformed data URL: missing payload separator.");
  const metadata = input.slice(5, comma);
  const payload = input.slice(comma + 1);
  try {
    return /;base64(?:;|$)/i.test(metadata)
      ? Buffer.from(payload.replace(/\s/g, ""), "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");
  } catch (error) {
    throw new ApexifyInputError("Malformed data URL payload.", { cause: error });
  }
}

function schemeOf(input: string): string | undefined {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(input);
  return match?.[1]?.toLowerCase();
}

function isFilesystemPath(input: string): boolean {
  return path.isAbsolute(input) || path.win32.isAbsolute(input) || /^[a-zA-Z]:[\\/]/.test(input);
}

function limitName(kind: MediaKind): string {
  if (kind === "image") return "maxRemoteImageBytes";
  if (kind === "video") return "maxRemoteVideoBytes";
  return "maxRemoteGenericBytes";
}

function getDiscordAttachmentExpiry(source: string): Date | undefined {
  try {
    const url = new URL(source);
    const hostname = url.hostname.toLowerCase();
    const isDiscordCdn =
      hostname === "cdn.discordapp.com" ||
      hostname === "media.discordapp.net" ||
      hostname.endsWith(".discordapp.net");
    if (!isDiscordCdn) return undefined;
    const expiryHex = url.searchParams.get("ex");
    if (!expiryHex || !/^[0-9a-f]+$/i.test(expiryHex)) return undefined;
    const expirySeconds = Number.parseInt(expiryHex, 16);
    if (!Number.isFinite(expirySeconds)) return undefined;
    return new Date(expirySeconds * 1_000);
  } catch {
    return undefined;
  }
}

export function assertRemoteImageUrlFresh(source: string): void {
  const expiresAt = getDiscordAttachmentExpiry(source);
  if (!expiresAt || expiresAt.getTime() > Date.now()) return;
  throw new ApexifyRemoteFetchError(
    `Discord attachment URL expired at ${expiresAt.toISOString()}. Obtain a fresh attachment URL before rendering.`,
    {
      url: redactUrl(source),
      details: { reason: "DISCORD_ATTACHMENT_EXPIRED" },
    }
  );
}

function acceptHeader(kind: MediaKind): string {
  if (kind === "image") return "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
  if (kind === "video") return "video/*,audio/*,application/octet-stream;q=0.8,*/*;q=0.5";
  return "*/*";
}

export class MediaSourceResolver {
  constructor(private readonly runtime: ApexifyRuntime = defaultApexifyRuntime) {}

  async resolve(
    source: MediaSource,
    kind: MediaKind = "generic",
    options: MediaResolveOptions = {}
  ): Promise<ResolvedMediaInput> {
    const maximum = remoteByteLimitForKind(kind, this.runtime.config.limits);
    const limit = limitName(kind);

    if (Buffer.isBuffer(source)) {
      if (source.length === 0) throw new ApexifyInputError("Media buffer is empty.");
      assertByteLimit(source.length, maximum, limit, "media buffer");
      return { kind: "buffer", value: source, origin: "buffer" };
    }

    if (typeof source !== "string" || !source.trim()) {
      throw new ApexifyInputError("Media source must be a non-empty path, URL, data URL, or Buffer.");
    }

    const trimmed = source.trim();
    const data = decodeDataUrl(trimmed);
    if (data) {
      if (data.length === 0) throw new ApexifyInputError("Data URL payload is empty.");
      assertByteLimit(data.length, maximum, limit, "data URL");
      return { kind: "buffer", value: data, origin: "data" };
    }

    // A drive-letter path such as C:\\assets\\x.png is not a custom URL scheme.
    if (!isFilesystemPath(trimmed)) {
      const scheme = schemeOf(trimmed);
      if (scheme) {
        if (scheme !== "http" && scheme !== "https") {
          throw new ApexifyInputError(`Unsupported media-source protocol: ${scheme}:`);
        }
        if (kind === "image") assertRemoteImageUrlFresh(trimmed);
        const key = `${kind}:${trimmed}`;
        const bytes = await this.runtime.remoteBytesCache.getOrCreate(key, () =>
          getRemoteFetchClient(this.runtime).fetchBuffer(trimmed, {
            maxBytes: maximum,
            signal: options.signal,
            headers: { Accept: acceptHeader(kind) },
          })
        );
        return { kind: "buffer", value: bytes, origin: "remote" };
      }
    }

    const resolvedPath = path.isAbsolute(trimmed) || path.win32.isAbsolute(trimmed)
      ? trimmed
      : path.resolve(process.cwd(), trimmed);
    const stat = await fs.stat(resolvedPath).catch((error: unknown) => {
      throw new ApexifyInputError("Media file does not exist or is not accessible.", { cause: error });
    });
    if (!stat.isFile()) throw new ApexifyInputError("Media source path must resolve to a file.");
    assertByteLimit(stat.size, maximum, limit, "media file");
    return { kind: "path", value: resolvedPath, origin: "file" };
  }

  async resolveBuffer(
    source: MediaSource,
    kind: MediaKind = "generic",
    options: MediaResolveOptions = {}
  ): Promise<Buffer> {
    const resolved = await this.resolve(source, kind, options);
    if (resolved.kind === "buffer") return resolved.value as Buffer;
    return fs.readFile(resolved.value as string);
  }

  async resolveImageInput(
    source: MediaSource,
    options: MediaResolveOptions = {}
  ): Promise<string | Buffer> {
    const resolved = await this.resolve(source, "image", options);
    const input = resolved.value;
    try {
      const metadata = await sharp(input).metadata();
      if (metadata.width && metadata.height) {
        const pixels = metadata.width * metadata.height;
        if (!Number.isSafeInteger(pixels) || pixels > this.runtime.config.limits.maxDecodedImagePixels) {
          throw new ApexifyResourceLimitError(
            `Decoded image pixel count ${pixels} exceeds maxDecodedImagePixels ${this.runtime.config.limits.maxDecodedImagePixels}.`,
            {
              limit: "maxDecodedImagePixels",
              maximum: this.runtime.config.limits.maxDecodedImagePixels,
              actual: pixels,
            }
          );
        }
      }
      return input;
    } catch (error) {
      if (error instanceof ApexifyResourceLimitError) throw error;
      throw new ApexifyDecodeError("Failed to inspect image metadata before decode.", { cause: error });
    }
  }
}

export async function resolveMediaInput(
  source: MediaSource,
  kind: MediaKind = "generic",
  runtime: ApexifyRuntime = defaultApexifyRuntime,
  options: MediaResolveOptions = {}
): Promise<ResolvedMediaInput> {
  return new MediaSourceResolver(runtime).resolve(source, kind, options);
}

export async function resolveMediaBuffer(
  source: MediaSource,
  kind: MediaKind = "generic",
  runtime: ApexifyRuntime = defaultApexifyRuntime,
  options: MediaResolveOptions = {}
): Promise<Buffer> {
  return new MediaSourceResolver(runtime).resolveBuffer(source, kind, options);
}

export async function resolveImageInput(
  source: MediaSource,
  runtime: ApexifyRuntime = defaultApexifyRuntime,
  options: MediaResolveOptions = {}
): Promise<string | Buffer> {
  return new MediaSourceResolver(runtime).resolveImageInput(source, options);
}
