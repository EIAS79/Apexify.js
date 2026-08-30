import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyRemoteFetchError, ApexifyResourceLimitError } from "../runtime/errors";
import { emitDiagnostic } from "../runtime/diagnostics";
import { redactUrl, validateRemoteTarget } from "./network-policy";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type PinnedLookupAddress = { address: string; family: 4 | 6 };
type ReleaseRemoteSlot = () => void;
type RemoteWaiter = {
  settled: boolean;
  resolve: (release: ReleaseRemoteSlot) => void;
  reject: (error: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

let activeRemoteRequests = 0;
const remoteWaiters: RemoteWaiter[] = [];

function makeReleaseRemoteSlot(): ReleaseRemoteSlot {
  let released = false;
  return () => {
    if (released) return;
    released = true;

    while (remoteWaiters.length > 0) {
      const waiter = remoteWaiters.shift()!;
      if (waiter.settled) continue;
      waiter.settled = true;
      if (waiter.signal && waiter.onAbort) waiter.signal.removeEventListener("abort", waiter.onAbort);
      waiter.resolve(makeReleaseRemoteSlot());
      return;
    }

    activeRemoteRequests = Math.max(0, activeRemoteRequests - 1);
  };
}

async function acquireRemoteSlot(maxConcurrent: number, signal?: AbortSignal, source?: string): Promise<ReleaseRemoteSlot> {
  if (signal?.aborted) {
    throw new ApexifyRemoteFetchError("Remote media request was aborted before it acquired a network slot.", {
      requestUrl: source ? redactUrl(source) : undefined,
      cause: signal.reason,
    });
  }

  if (activeRemoteRequests < maxConcurrent) {
    activeRemoteRequests += 1;
    return makeReleaseRemoteSlot();
  }

  return new Promise<ReleaseRemoteSlot>((resolve, reject) => {
    const waiter: RemoteWaiter = { settled: false, resolve, reject, signal };
    if (signal) {
      waiter.onAbort = () => {
        if (waiter.settled) return;
        waiter.settled = true;
        const index = remoteWaiters.indexOf(waiter);
        if (index >= 0) remoteWaiters.splice(index, 1);
        reject(new ApexifyRemoteFetchError("Remote media request was aborted while waiting for a network slot.", {
          requestUrl: source ? redactUrl(source) : undefined,
          cause: signal.reason,
        }));
      };
      signal.addEventListener("abort", waiter.onAbort, { once: true });
    }
    remoteWaiters.push(waiter);
  });
}

export function getRemoteConcurrencyStats(): { active: number; queued: number } {
  return { active: activeRemoteRequests, queued: remoteWaiters.filter((waiter) => !waiter.settled).length };
}

export interface RemoteFetchOptions {
  kind?: "image" | "video" | "generic";
  maxBytes?: number;
  timeoutMs?: number;
  attempts?: number;
  maxRedirects?: number;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
  method?: "GET" | "POST";
  body?: string | Buffer;
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

function remoteLimitName(kind: RemoteFetchOptions["kind"]): "maxRemoteImageBytes" | "maxRemoteVideoBytes" {
  return kind === "image" ? "maxRemoteImageBytes" : "maxRemoteVideoBytes";
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
    let settled = false;
    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createPinnedLookup(addresses: readonly string[]): LookupFunction {
  let cursor = 0;
  return ((_hostname: string, options: unknown, callback: unknown) => {
    const cb = callback as (error: NodeJS.ErrnoException | null, address: string | PinnedLookupAddress[], family?: number) => void;
    const address = addresses[cursor++ % addresses.length];
    const family: 4 | 6 = address.includes(":") ? 6 : 4;
    if (typeof options === "object" && options !== null && "all" in options && (options as { all?: boolean }).all) {
      cb(null, [{ address, family }]);
    } else {
      cb(null, address, family);
    }
  }) as LookupFunction;
}

function timeoutError(source: string | URL, timeoutMs: number): ApexifyRemoteFetchError {
  return new ApexifyRemoteFetchError(`Remote media request timed out after ${timeoutMs}ms.`, {
    requestUrl: redactUrl(source),
    details: { timeoutMs },
  });
}

async function validateTargetBeforeDeadline(source: string, deadline: number, timeoutMs: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError(source, timeoutMs);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      validateRemoteTarget(source, getDefaultApexifyRuntimeConfig().network),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(timeoutError(source, timeoutMs)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasHeader(headers: Readonly<Record<string, string>>, name: string): boolean {
  const wanted = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === wanted);
}

function withoutBodyHeaders(headers: Readonly<Record<string, string>> | undefined): Readonly<Record<string, string>> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).filter(([key]) => !["content-length", "transfer-encoding"].includes(key.toLowerCase()))
  );
}

function redirectRequestOptions(status: number, options: RemoteFetchOptions): RemoteFetchOptions {
  const method = options.method ?? "GET";
  if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
    return { ...options, method: "GET", body: undefined, headers: withoutBodyHeaders(options.headers) };
  }
  return options;
}

async function requestOnce(
  source: string,
  options: Required<Pick<RemoteFetchOptions, "maxBytes" | "timeoutMs" | "maxRedirects">> & RemoteFetchOptions,
  redirectCount = 0,
  deadline = Date.now() + options.timeoutMs
): Promise<AttemptResult> {
  if (options.signal?.aborted) {
    throw new ApexifyRemoteFetchError("Remote media request was aborted.", { requestUrl: redactUrl(source), cause: options.signal.reason });
  }

  const config = getDefaultApexifyRuntimeConfig();
  const target = await validateTargetBeforeDeadline(source, deadline, options.timeoutMs);
  const client = target.url.protocol === "https:" ? https : http;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw timeoutError(target.url, options.timeoutMs);

  return new Promise<AttemptResult>((resolve, reject) => {
    let settled = false;
    const finishResolve = (value: AttemptResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      resolve(value);
    };
    const finishReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(wallTimer);
      reject(error);
    };

    const body = options.body === undefined
      ? undefined
      : Buffer.isBuffer(options.body)
        ? options.body
        : Buffer.from(options.body, "utf8");
    const headers: Record<string, string> = {
      Accept: "*/*",
      "User-Agent": config.network.userAgent,
      ...options.headers,
    };
    if (body && !hasHeader(headers, "content-length")) headers["Content-Length"] = String(body.byteLength);

    const request = client.request(target.url, {
      method: options.method ?? "GET",
      headers,
      lookup: createPinnedLookup(target.addresses),
      signal: options.signal,
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (REDIRECT_STATUSES.has(status) && location) {
        response.resume();
        if (redirectCount >= options.maxRedirects) {
          finishReject(new ApexifyRemoteFetchError("Remote media redirect limit exceeded.", {
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
          finishReject(new ApexifyRemoteFetchError("Remote media redirect URL is invalid.", { status, requestUrl: redactUrl(target.url), cause }));
          return;
        }
        requestOnce(next, { ...options, ...redirectRequestOptions(status, options) }, redirectCount + 1, deadline).then(finishResolve, finishReject);
        return;
      }

      const contentLength = Number(response.headers["content-length"] ?? 0);
      if (Number.isFinite(contentLength) && contentLength > options.maxBytes) {
        const error = new ApexifyResourceLimitError(remoteLimitName(options.kind), options.maxBytes, contentLength, {
          details: { requestUrl: redactUrl(target.url) },
        });
        response.destroy(error);
        finishReject(error);
        return;
      }

      if (status < 200 || status >= 300) {
        const retryAfterMs = parseRetryAfter(response.headers["retry-after"]);
        response.resume();
        finishReject(new ApexifyRemoteFetchError(`Remote media request failed with HTTP ${status}.`, {
          status,
          requestUrl: redactUrl(target.url),
          details: { retryAfterMs },
        }));
        return;
      }

      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer | Uint8Array) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > options.maxBytes) {
          const error = new ApexifyResourceLimitError(remoteLimitName(options.kind), options.maxBytes, bytes, {
            details: { requestUrl: redactUrl(target.url) },
          });
          response.destroy(error);
          finishReject(error);
          return;
        }
        chunks.push(buffer);
      });
      response.once("end", () => {
        if (bytes === 0) {
          finishReject(new ApexifyRemoteFetchError("Remote media response was empty.", { status, requestUrl: redactUrl(target.url) }));
          return;
        }
        finishResolve({
          buffer: Buffer.concat(chunks, bytes),
          finalUrl: target.url.toString(),
          status,
          headers: response.headers,
        });
      });
      response.once("error", finishReject);
    });

    const wallTimer = setTimeout(() => {
      request.destroy(timeoutError(target.url, options.timeoutMs));
    }, remaining);

    request.setTimeout(Math.min(options.timeoutMs, remaining), () => {
      request.destroy(timeoutError(target.url, options.timeoutMs));
    });
    request.once("error", (cause) => {
      if (cause instanceof ApexifyRemoteFetchError || cause instanceof ApexifyResourceLimitError) finishReject(cause);
      else if (options.signal?.aborted) {
        finishReject(new ApexifyRemoteFetchError("Remote media request was aborted.", {
          requestUrl: redactUrl(target.url),
          cause: options.signal.reason ?? cause,
        }));
      } else {
        finishReject(new ApexifyRemoteFetchError("Remote media request failed.", { requestUrl: redactUrl(target.url), cause }));
      }
    });
    if (body) request.write(body);
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
  if (/aborted/i.test(error.message)) return false;
  return true;
}

export async function fetchRemoteMedia(source: string, options: RemoteFetchOptions = {}): Promise<RemoteFetchResult> {
  const config = getDefaultApexifyRuntimeConfig();
  const maxBytes = options.maxBytes ?? defaultMaxBytes(options.kind);
  const timeoutMs = options.timeoutMs ?? config.network.timeoutMs;
  const defaultAttempts = (options.method ?? "GET") === "GET" ? config.network.retryAttempts : 1;
  const attempts = Math.max(1, Math.floor(options.attempts ?? defaultAttempts));
  const maxRedirects = Math.max(0, Math.floor(options.maxRedirects ?? config.network.maxRedirects));
  const release = await acquireRemoteSlot(config.limits.maxConcurrentRemoteFetches, options.signal, source);
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const result = await requestOnce(source, { ...options, maxBytes, timeoutMs, maxRedirects });
        emitDiagnostic({
          level: "debug",
          code: "REMOTE_FETCH_SUCCESS",
          message: "Remote request completed.",
          details: { url: redactUrl(result.finalUrl), bytes: result.buffer.length, attempt, method: options.method ?? "GET" },
        });
        return result;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts || !retryable(error) || options.signal?.aborted) throw error;
        const delayMs = retryDelay(attempt, retryAfterFromError(error));
        emitDiagnostic({
          level: "debug",
          code: "REMOTE_FETCH_RETRY",
          message: "Retrying remote request.",
          details: { url: redactUrl(source), attempt, delayMs, method: options.method ?? "GET" },
        });
        await sleep(delayMs, options.signal);
      }
    }
    throw lastError;
  } finally {
    release();
  }
}
