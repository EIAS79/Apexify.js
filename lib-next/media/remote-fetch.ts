import http from "node:http";
import https from "node:https";
import type { LookupAddress, LookupFunction } from "node:net";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyRemoteFetchError, ApexifyResourceLimitError } from "../runtime/errors";
import { emitDiagnostic } from "../runtime/diagnostics";
import { redactUrl, validateRemoteTarget } from "./network-policy";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

let activeRemoteRequests = 0;
const remoteWaiters: Array<() => void> = [];

async function acquireRemoteSlot(maxConcurrent: number): Promise<() => void> {
  while (activeRemoteRequests >= maxConcurrent) {
    await new Promise<void>((resolve) => remoteWaiters.push(resolve));
  }
  activeRemoteRequests += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRemoteRequests -= 1;
    remoteWaiters.shift()?.();
  };
}

export function getRemoteConcurrencyStats(): { active: number; queued: number } {
  return { active: activeRemoteRequests, queued: remoteWaiters.length };
}

export interface RemoteFetchOptions {
  kind?: "image" | "video" | "generic";
  maxBytes?: number;
  timeoutMs?: number;
  attempts?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}

export interface RemoteFetchResult {
  buffer: Buffer;
  finalUrl: string;
  status: number;
  headers: Readonly<Record<string, string | string[] | undefined>>;
}

interface AttemptResult extends RemoteFetchResult {
  retryAfterMs?: number;
}

function defaultMaxBytes(kind: RemoteFetchOptions["kind"]): number {
  const limits = getDefaultApexifyRuntimeConfig().limits;
  if (kind === "video") return limits.maxRemoteVideoBytes;
  if (kind === "generic") return Math.max(limits.maxRemoteImageBytes, limits.maxRemoteVideoBytes);
  return limits.maxRemoteImageBytes;
}

function parseRetryAfter(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(raw);
  if (Number.isFinite(at)) return Math.max(0, at - Date.now());
  return undefined;
}

function retryDelay(attempt: number, retryAfterMs?: number): number {
  const network = getDefaultApexifyRuntimeConfig().network;
  if (network.honorRetryAfter && retryAfterMs !== undefined) {
    return Math.min(retryAfterMs, network.retryMaxDelayMs);
  }
  const base = Math.min(network.retryBaseDelayMs * 2 ** Math.max(0, attempt - 1), network.retryMaxDelayMs);
  const jitter = base * network.retryJitterRatio;
  return Math.max(0, Math.round(base - jitter + Math.random() * jitter * 2));
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Aborted"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createPinnedLookup(addresses: readonly string[]): LookupFunction {
  let cursor = 0;
  return ((hostname: string, options: unknown, callback: unknown) => {
    const cb = callback as (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
    const address = addresses[cursor++ % addresses.length];
    const family = address.includes(":") ? 6 : 4;
    if (typeof options === "object" && options !== null && "all" in options && (options as { all?: boolean }).all) {
      cb(null, [{ address, family }] as LookupAddress[]);
    } else {
      cb(null, address, family);
    }
  }) as LookupFunction;
}

async function requestOnce(
  source: string,
  options: Required<Pick<RemoteFetchOptions, "maxBytes" | "timeoutMs" | "maxRedirects">> & RemoteFetchOptions,
  redirectCount = 0
): Promise<AttemptResult> {
  if (options.signal?.aborted) {
    throw new ApexifyRemoteFetchError("Remote media request was aborted.", { requestUrl: redactUrl(source), cause: options.signal.reason });
  }
  const config = getDefaultApexifyRuntimeConfig();
  const target = await validateRemoteTarget(source, config.network);
  const client = target.url.protocol === "https:" ? https : http;

  return new Promise<AttemptResult>((resolve, reject) => {
    const request = client.request(target.url, {
      method: "GET",
      headers: {
        Accept: "*/*",
        "User-Agent": config.network.userAgent,
        ...options.headers,
      },
      lookup: createPinnedLookup(target.addresses),
      signal: options.signal,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        response.resume();
        if (redirectCount >= options.maxRedirects) {
          reject(new ApexifyRemoteFetchError("Remote media redirect limit exceeded.", {
            status,
            requestUrl: redactUrl(target.url),
            details: { maxRedirects: options.maxRedirects },
          }));
          return;
        }
        let next: string;
        try {
          next = new URL(location, target.url).toString();
        } catch (cause) {
          reject(new ApexifyRemoteFetchError("Remote media redirect URL is invalid.", { status, requestUrl: redactUrl(target.url), cause }));
          return;
        }
        requestOnce(next, options, redirectCount + 1).then(resolve, reject);
        return;
      }

      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
        response.destroy();
        reject(new ApexifyResourceLimitError(options.kind === "video" ? "maxRemoteVideoBytes" : "maxRemoteImageBytes", options.maxBytes, contentLength, {
          details: { requestUrl: redactUrl(target.url) },
        }));
        return;
      }

      if (status < 200 || status >= 300) {
        const retryAfterMs = parseRetryAfter(response.headers["retry-after"]);
        response.resume();
        reject(new ApexifyRemoteFetchError(`Remote media request failed with HTTP ${status}.`, {
          status,
          requestUrl: redactUrl(target.url),
          details: { retryAfterMs },
        }));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | Uint8Array) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > options.maxBytes) {
          response.destroy(new ApexifyResourceLimitError(options.kind === "video" ? "maxRemoteVideoBytes" : "maxRemoteImageBytes", options.maxBytes, bytes, {
            details: { requestUrl: redactUrl(target.url) },
          }));
          return;
        }
        chunks.push(buffer);
      });
      response.once("end", () => {
        if (bytes === 0) {
          reject(new ApexifyRemoteFetchError("Remote media response was empty.", { status, requestUrl: redactUrl(target.url) }));
          return;
        }
        resolve({
          buffer: Buffer.concat(chunks, bytes),
          finalUrl: target.url.toString(),
          status,
          headers: response.headers,
        });
      });
      response.once("error", reject);
    });

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new ApexifyRemoteFetchError(`Remote media request timed out after ${options.timeoutMs}ms.`, {
        requestUrl: redactUrl(target.url),
        details: { timeoutMs: options.timeoutMs },
      }));
    });
    request.once("error", (cause) => {
      if (cause instanceof ApexifyRemoteFetchError || cause instanceof ApexifyResourceLimitError) reject(cause);
      else reject(new ApexifyRemoteFetchError("Remote media request failed.", { requestUrl: redactUrl(target.url), cause }));
    });
    request.end();
  });
}

function retryAfterFromError(error: unknown): number | undefined {
  if (!(error instanceof ApexifyRemoteFetchError)) return undefined;
  const value = error.details?.retryAfterMs;
  return typeof value === "number" ? value : undefined;
}

function retryable(error: unknown): boolean {
  if (error instanceof ApexifyResourceLimitError) return false;
  if (!(error instanceof ApexifyRemoteFetchError)) return false;
  if (error.status !== undefined) return RETRYABLE_STATUSES.has(error.status);
  if (error.message.includes("aborted")) return false;
  return true;
}

export async function fetchRemoteMedia(source: string, options: RemoteFetchOptions = {}): Promise<RemoteFetchResult> {
  const config = getDefaultApexifyRuntimeConfig();
  const maxBytes = options.maxBytes ?? defaultMaxBytes(options.kind);
  const timeoutMs = options.timeoutMs ?? config.network.timeoutMs;
  const attempts = Math.max(1, Math.floor(options.attempts ?? config.network.retryAttempts));
  const maxRedirects = Math.max(0, Math.floor(options.maxRedirects ?? config.network.maxRedirects));
  const release = await acquireRemoteSlot(config.limits.maxConcurrentRemoteFetches);
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await requestOnce(source, { ...options, maxBytes, timeoutMs, maxRedirects });
        emitDiagnostic({
          level: "debug",
          code: "REMOTE_FETCH_SUCCESS",
          message: "Remote media fetched.",
          details: { url: redactUrl(result.finalUrl), bytes: result.buffer.length, attempt },
        });
        return result;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !retryable(error) || options.signal?.aborted) throw error;
        const delayMs = retryDelay(attempt, retryAfterFromError(error));
        emitDiagnostic({
          level: "debug",
          code: "REMOTE_FETCH_RETRY",
          message: "Retrying remote media request.",
          details: { url: redactUrl(source), attempt, delayMs },
        });
        await sleep(delayMs, options.signal);
      }
    }
    throw lastError;
  } finally {
    release();
  }
}
