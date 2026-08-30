import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { ApexifyRuntime } from "../runtime/context";
import { ApexifyRemoteFetchError, ApexifyResourceLimitError } from "../runtime/errors";
import { redactUrl, resolveNetworkTarget, type DnsLookup } from "./network-policy";

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface RemoteFetchOptions {
  maxBytes: number;
  signal?: AbortSignal;
  headers?: Readonly<Record<string, string>>;
}

interface RemoteFetchTestHooks {
  lookup?: DnsLookup;
  random?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

class AsyncSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw abortError("Remote fetch aborted before queue acquisition.");
    if (this.active < this.maximum) {
      this.active += 1;
      return () => this.release();
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const waiter = (): void => {
        if (settled) return;
        settled = true;
        signal?.removeEventListener("abort", onAbort);
        this.active += 1;
        resolve();
      };
      const onAbort = (): void => {
        if (settled) return;
        settled = true;
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(abortError("Remote fetch aborted while waiting for concurrency capacity."));
      };
      this.waiters.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) next();
  }
}

function abortError(message: string): ApexifyRemoteFetchError {
  return new ApexifyRemoteFetchError(message, {
    url: "<redacted-url>",
    retryable: false,
    details: { reason: "ABORTED" },
  });
}

function parseRetryAfter(value: string | string[] | undefined, now = Date.now()): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - now);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError("Remote fetch aborted during retry delay."));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError("Remote fetch aborted during retry delay."));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function safeRemoteError(
  url: string | URL,
  message: string,
  options: {
    cause?: unknown;
    status?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    reason?: string;
  } = {}
): ApexifyRemoteFetchError {
  return new ApexifyRemoteFetchError(message, {
    url: redactUrl(url),
    cause: options.cause,
    status: options.status,
    retryable: options.retryable,
    retryAfterMs: options.retryAfterMs,
    details: options.reason ? { reason: options.reason } : undefined,
  });
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApexifyRemoteFetchError)) return true;
  if (error.details?.reason === "ABORTED") return false;
  if (error.status !== undefined) return RETRYABLE_STATUSES.has(error.status);
  return error.retryable;
}

function normalizeFetchFailure(url: string | URL, error: unknown): ApexifyRemoteFetchError | ApexifyResourceLimitError {
  if (error instanceof ApexifyResourceLimitError) return error;
  if (error instanceof ApexifyRemoteFetchError) return error;
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  const reason = code === "ETIMEDOUT" || code === "ECONNRESET" ? code : "NETWORK_FAILURE";
  return safeRemoteError(url, `Remote request failed${code ? ` (${code})` : ""}.`, {
    cause: error,
    retryable: true,
    reason,
  });
}

function readResponseBuffer(
  response: IncomingMessage,
  maxBytes: number,
  url: URL
): Promise<Buffer> {
  const declared = response.headers["content-length"];
  if (declared !== undefined) {
    const declaredBytes = Number(Array.isArray(declared) ? declared[0] : declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      response.destroy();
      throw new ApexifyResourceLimitError(
        `Remote response exceeds configured byte limit (${maxBytes} bytes).`,
        { limit: "remoteBytes", maximum: maxBytes, actual: declaredBytes, details: { url: redactUrl(url) } }
      );
    }
  }

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    response.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        response.destroy();
        reject(new ApexifyResourceLimitError(
          `Remote response exceeded configured byte limit (${maxBytes} bytes).`,
          { limit: "remoteBytes", maximum: maxBytes, actual: total, details: { url: redactUrl(url) } }
        ));
        return;
      }
      chunks.push(bytes);
    });
    response.once("end", () => resolve(Buffer.concat(chunks, total)));
    response.once("error", reject);
  });
}

/** GET-only remote transport with DNS pinning, redirect rechecks, retries and byte/time budgets. */
export class RemoteFetchClient {
  private readonly semaphore: AsyncSemaphore;
  private readonly lookup?: DnsLookup;
  private readonly random: () => number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(
    private readonly runtime: ApexifyRuntime,
    hooks: RemoteFetchTestHooks = {}
  ) {
    this.semaphore = new AsyncSemaphore(runtime.config.limits.maxConcurrentRemoteFetches);
    this.lookup = hooks.lookup;
    this.random = hooks.random ?? Math.random;
    this.sleep = hooks.sleep ?? defaultSleep;
  }

  async fetchBuffer(input: string | URL, options: RemoteFetchOptions): Promise<Buffer> {
    if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) {
      throw new ApexifyResourceLimitError("Remote fetch maxBytes must be greater than 0.", {
        limit: "remoteBytes",
        maximum: options.maxBytes,
      });
    }
    const release = await this.semaphore.acquire(options.signal);
    try {
      return await this.fetchWithRetries(input, options);
    } finally {
      release();
    }
  }

  private async fetchWithRetries(input: string | URL, options: RemoteFetchOptions): Promise<Buffer> {
    const policy = this.runtime.config.network;
    let lastError: unknown;
    for (let attempt = 0; attempt <= policy.retries; attempt += 1) {
      try {
        return await this.fetchWithRedirects(input, options);
      } catch (error) {
        lastError = normalizeFetchFailure(input, error);
        if (attempt >= policy.retries || !isRetryable(lastError)) throw lastError;

        const retryAfter =
          policy.honorRetryAfter && lastError instanceof ApexifyRemoteFetchError
            ? lastError.retryAfterMs
            : undefined;
        const exponential = Math.min(
          policy.retryMaxDelayMs,
          policy.retryBaseDelayMs * 2 ** attempt
        );
        const jitter = exponential * policy.retryJitterRatio * ((this.random() * 2) - 1);
        const calculated = Math.max(0, Math.round(exponential + jitter));
        const delay = retryAfter !== undefined
          ? Math.min(policy.maxRetryAfterMs, retryAfter)
          : calculated;

        this.runtime.diagnostics.emit("warn", "REMOTE_FETCH_RETRY", "Retrying remote media request.", {
          attempt: attempt + 1,
          delayMs: delay,
          url: redactUrl(input),
        });
        await this.sleep(delay, options.signal);
      }
    }
    throw normalizeFetchFailure(input, lastError);
  }

  private async fetchWithRedirects(input: string | URL, options: RemoteFetchOptions): Promise<Buffer> {
    let current = typeof input === "string" ? new URL(input) : new URL(input.toString());
    const policy = this.runtime.config.network;

    for (let redirect = 0; redirect <= policy.maxRedirects; redirect += 1) {
      const target = await resolveNetworkTarget(current, policy, this.lookup);
      const result = await this.requestOnce(target.url, target.address, target.family, options);
      if (result.kind === "body") return result.buffer;
      if (redirect >= policy.maxRedirects) {
        throw safeRemoteError(current, `Remote request exceeded ${policy.maxRedirects} redirects.`, {
          reason: "TOO_MANY_REDIRECTS",
        });
      }
      current = new URL(result.location, current);
    }

    throw safeRemoteError(current, "Remote request redirect resolution failed.", {
      reason: "REDIRECT_FAILURE",
    });
  }

  private requestOnce(
    url: URL,
    address: string,
    family: 4 | 6,
    options: RemoteFetchOptions
  ): Promise<{ kind: "body"; buffer: Buffer } | { kind: "redirect"; location: string }> {
    const policy = this.runtime.config.network;
    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        reject(abortError("Remote fetch aborted before request."));
        return;
      }

      const transport = url.protocol === "https:" ? https : http;
      let settled = false;
      const request = transport.request({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || undefined,
        method: "GET",
        path: `${url.pathname}${url.search}`,
        headers: {
          "User-Agent": policy.userAgent,
          Accept: "*/*",
          ...options.headers,
        },
        lookup: (_hostname, _options, callback) => callback(null, address, family),
      }, async (response) => {
        try {
          const status = response.statusCode ?? 0;
          if (REDIRECT_STATUSES.has(status)) {
            const location = response.headers.location;
            response.resume();
            if (!location) {
              throw safeRemoteError(url, `Remote redirect HTTP ${status} did not include Location.`, {
                status,
                reason: "REDIRECT_WITHOUT_LOCATION",
              });
            }
            settled = true;
            cleanup();
            resolve({ kind: "redirect", location });
            return;
          }

          if (status < 200 || status >= 300) {
            const retryAfterMs = parseRetryAfter(response.headers["retry-after"]);
            response.resume();
            throw safeRemoteError(url, `Remote request returned HTTP ${status}.`, {
              status,
              retryable: RETRYABLE_STATUSES.has(status),
              retryAfterMs,
              reason: "HTTP_STATUS",
            });
          }

          const buffer = await readResponseBuffer(response, options.maxBytes, url);
          if (buffer.length === 0) {
            throw safeRemoteError(url, "Remote response was empty.", {
              status,
              reason: "EMPTY_RESPONSE",
            });
          }
          settled = true;
          cleanup();
          resolve({ kind: "body", buffer });
        } catch (error) {
          if (settled) return;
          settled = true;
          cleanup();
          reject(error);
        }
      });

      const onAbort = (): void => {
        request.destroy(abortError("Remote fetch aborted."));
      };
      const cleanup = (): void => {
        options.signal?.removeEventListener("abort", onAbort);
      };

      options.signal?.addEventListener("abort", onAbort, { once: true });
      request.setTimeout(policy.timeoutMs, () => {
        request.destroy(safeRemoteError(url, `Remote request timed out after ${policy.timeoutMs}ms.`, {
          retryable: true,
          reason: "TIMEOUT",
        }));
      });
      request.once("error", (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      });
      request.end();
    });
  }
}
