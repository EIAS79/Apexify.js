import axios, { AxiosError } from "axios";
import path from "path";

const DEFAULT_REMOTE_IMAGE_TIMEOUT_MS = 15_000;
const DEFAULT_REMOTE_IMAGE_ATTEMPTS = 3;
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface RemoteImageFetchOptions {
  timeoutMs?: number;
  attempts?: number;
}

export class RemoteImageFetchError extends Error {
  readonly url: string;
  readonly status?: number;
  readonly code?: string;

  constructor(
    message: string,
    options: { url: string; status?: number; code?: string; cause?: unknown }
  ) {
    super(message, { cause: options.cause });
    this.name = "RemoteImageFetchError";
    this.url = options.url;
    this.status = options.status;
    this.code = options.code;
  }
}

function decodeDataUrlImageBase64(input: string): Buffer | undefined {
  const trimmed = input.trim();
  if (!/^data:image\//i.test(trimmed)) return undefined;

  const marker = ";base64,";
  const markerIndex = trimmed.toLowerCase().indexOf(marker);
  if (markerIndex === -1) return undefined;

  const payload = trimmed.slice(markerIndex + marker.length).replace(/\s/g, "");
  if (!payload) return undefined;

  const buffer = Buffer.from(payload, "base64");
  return buffer.length > 0 ? buffer : undefined;
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

    return new Date(expirySeconds * 1000);
  } catch {
    return undefined;
  }
}

export function assertRemoteImageUrlFresh(source: string): void {
  const expiresAt = getDiscordAttachmentExpiry(source);
  if (!expiresAt || expiresAt.getTime() > Date.now()) return;

  throw new RemoteImageFetchError(
    `Discord attachment URL expired at ${expiresAt.toISOString()}. Obtain a fresh attachment URL before rendering.`,
    { url: source, code: "DISCORD_ATTACHMENT_EXPIRED" }
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(attempt: number): number {
  return Math.min(250 * 2 ** Math.max(0, attempt - 1), 1_000);
}

function normalizeNetworkError(source: string, error: unknown): RemoteImageFetchError {
  if (error instanceof RemoteImageFetchError) return error;

  if (error instanceof AxiosError) {
    const code = error.code;
    if (code === "ECONNABORTED" || code === "ETIMEDOUT") {
      return new RemoteImageFetchError(
        `Remote image request timed out${error.config?.timeout ? ` after ${error.config.timeout}ms` : ""}.`,
        { url: source, code: code ?? "TIMEOUT", cause: error }
      );
    }

    return new RemoteImageFetchError(
      `Remote image request failed${code ? ` (${code})` : ""}: ${error.message}`,
      { url: source, code, cause: error }
    );
  }

  const message = error instanceof Error ? error.message : String(error);
  return new RemoteImageFetchError(`Remote image request failed: ${message}`, {
    url: source,
    cause: error,
  });
}

function shouldRetry(error: RemoteImageFetchError): boolean {
  if (error.code === "DISCORD_ATTACHMENT_EXPIRED") return false;
  if (error.status !== undefined) return TRANSIENT_HTTP_STATUSES.has(error.status);
  return true;
}

export async function fetchRemoteImageBuffer(
  source: string,
  options: RemoteImageFetchOptions = {}
): Promise<Buffer> {
  assertRemoteImageUrlFresh(source);

  const timeoutMs = Math.max(1, options.timeoutMs ?? DEFAULT_REMOTE_IMAGE_TIMEOUT_MS);
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_REMOTE_IMAGE_ATTEMPTS));
  let lastError: RemoteImageFetchError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await axios.get<ArrayBuffer>(source, {
        responseType: "arraybuffer",
        timeout: timeoutMs,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      if (response.status >= 200 && response.status < 300) {
        const buffer = Buffer.isBuffer(response.data)
          ? response.data
          : Buffer.from(response.data);

        if (buffer.length === 0) {
          throw new RemoteImageFetchError("Remote image response was empty.", {
            url: source,
            status: response.status,
            code: "EMPTY_REMOTE_IMAGE",
          });
        }

        return buffer;
      }

      const statusText = response.statusText ? ` ${response.statusText}` : "";
      throw new RemoteImageFetchError(
        `Failed to fetch remote image: HTTP ${response.status}${statusText}.`,
        { url: source, status: response.status, code: `HTTP_${response.status}` }
      );
    } catch (error) {
      lastError = normalizeNetworkError(source, error);
      if (attempt >= attempts || !shouldRetry(lastError)) {
        throw lastError;
      }
      await sleep(retryDelayMs(attempt));
    }
  }

  throw lastError ?? new RemoteImageFetchError("Failed to fetch remote image.", { url: source });
}

/**
 * Resolves raster input into bytes or a filesystem path.
 * HTTP(S) sources use bounded retries and a timeout; data URLs and Buffers are decoded locally.
 */
export async function resolveRasterInput(source: string | Buffer): Promise<string | Buffer> {
  if (Buffer.isBuffer(source)) {
    if (source.length === 0) throw new Error("Image buffer is empty.");
    return source;
  }

  const trimmed = source.trim();
  if (!trimmed) throw new Error("Image path or URL is required.");

  if (/^https?:\/\//i.test(trimmed)) {
    return fetchRemoteImageBuffer(trimmed);
  }

  const dataBuffer = decodeDataUrlImageBase64(trimmed);
  if (dataBuffer) return dataBuffer;

  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}
