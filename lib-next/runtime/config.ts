import type { ApexifyDiagnosticLogger } from "./diagnostics";
import { ApexifyConfigError } from "./errors";
import {
  DEFAULT_RENDER_LIMITS,
  resolveRenderLimits,
  type RenderLimits,
  type RenderLimitsInput,
} from "./limits";
import {
  DEFAULT_CACHE_OPTIONS,
  resolveCacheOptions,
  type CacheOptions,
  type CacheOptionsInput,
} from "./cache";

export interface NetworkPolicyConfig {
  allowedProtocols: readonly ("http:" | "https:")[];
  allowPrivateNetwork: boolean;
  trustedHosts: readonly string[];
  maxRedirects: number;
  timeoutMs: number;
  retries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterRatio: number;
  honorRetryAfter: boolean;
  maxRetryAfterMs: number;
  userAgent: string;
}

export interface NetworkPolicyInput {
  allowedProtocols?: readonly ("http:" | "https:")[];
  allowPrivateNetwork?: boolean;
  trustedHosts?: readonly string[];
  maxRedirects?: number;
  timeoutMs?: number;
  retries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  retryJitterRatio?: number;
  honorRetryAfter?: boolean;
  maxRetryAfterMs?: number;
  userAgent?: string;
}

export interface FfmpegRuntimeConfig {
  ffmpegPath?: string;
  ffprobePath?: string;
  timeoutMs: number;
}

export interface TempRuntimeConfig {
  directory?: string;
  retainFiles: boolean;
}

export interface ApexifyRuntimeOptions {
  network?: NetworkPolicyInput;
  limits?: RenderLimitsInput;
  cache?: CacheOptionsInput;
  ffmpeg?: Partial<FfmpegRuntimeConfig>;
  temp?: Partial<TempRuntimeConfig>;
  diagnostics?: { logger?: ApexifyDiagnosticLogger };
}

export interface ApexifyRuntimeConfig {
  network: Readonly<NetworkPolicyConfig>;
  limits: Readonly<RenderLimits>;
  cache: Readonly<CacheOptions>;
  ffmpeg: Readonly<FfmpegRuntimeConfig>;
  temp: Readonly<TempRuntimeConfig>;
  diagnostics: Readonly<{ logger?: ApexifyDiagnosticLogger }>;
}

export const DEFAULT_NETWORK_POLICY: Readonly<NetworkPolicyConfig> = Object.freeze({
  allowedProtocols: Object.freeze(["https:", "http:"] as const),
  allowPrivateNetwork: false,
  trustedHosts: Object.freeze([] as string[]),
  maxRedirects: 5,
  timeoutMs: 15_000,
  retries: 2,
  retryBaseDelayMs: 200,
  retryMaxDelayMs: 3_000,
  retryJitterRatio: 0.25,
  honorRetryAfter: true,
  maxRetryAfterMs: 10_000,
  userAgent: "Apexify.js/6",
});

export const DEFAULT_FFMPEG_RUNTIME: Readonly<FfmpegRuntimeConfig> = Object.freeze({
  timeoutMs: 120_000,
});

export const DEFAULT_TEMP_RUNTIME: Readonly<TempRuntimeConfig> = Object.freeze({
  retainFiles: false,
});

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApexifyConfigError(`${name} must be a finite number greater than 0.`);
  }
}

function nonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new ApexifyConfigError(`${name} must be a non-negative integer.`);
  }
}

function resolveNetworkPolicy(input: NetworkPolicyInput = {}): Readonly<NetworkPolicyConfig> {
  const protocols = input.allowedProtocols ?? DEFAULT_NETWORK_POLICY.allowedProtocols;
  if (protocols.length === 0) {
    throw new ApexifyConfigError("network.allowedProtocols must contain at least one protocol.");
  }
  for (const protocol of protocols) {
    if (protocol !== "http:" && protocol !== "https:") {
      throw new ApexifyConfigError(`Unsupported network protocol: ${String(protocol)}`);
    }
  }

  const trustedHosts = (input.trustedHosts ?? DEFAULT_NETWORK_POLICY.trustedHosts).map((host) => {
    const normalized = host.trim().toLowerCase();
    if (!normalized) throw new ApexifyConfigError("network.trustedHosts cannot contain empty values.");
    if (normalized.includes("/") || normalized.includes("://")) {
      throw new ApexifyConfigError("network.trustedHosts entries must be hostnames, not URLs or CIDRs.");
    }
    return normalized;
  });

  const merged: NetworkPolicyConfig = {
    ...DEFAULT_NETWORK_POLICY,
    ...input,
    allowedProtocols: Object.freeze([...protocols]),
    trustedHosts: Object.freeze(trustedHosts),
  };

  nonNegativeInteger(merged.maxRedirects, "network.maxRedirects");
  finitePositive(merged.timeoutMs, "network.timeoutMs");
  nonNegativeInteger(merged.retries, "network.retries");
  finitePositive(merged.retryBaseDelayMs, "network.retryBaseDelayMs");
  finitePositive(merged.retryMaxDelayMs, "network.retryMaxDelayMs");
  if (merged.retryMaxDelayMs < merged.retryBaseDelayMs) {
    throw new ApexifyConfigError("network.retryMaxDelayMs must be >= retryBaseDelayMs.");
  }
  if (!Number.isFinite(merged.retryJitterRatio) || merged.retryJitterRatio < 0 || merged.retryJitterRatio > 1) {
    throw new ApexifyConfigError("network.retryJitterRatio must be between 0 and 1.");
  }
  finitePositive(merged.maxRetryAfterMs, "network.maxRetryAfterMs");
  if (!merged.userAgent.trim()) throw new ApexifyConfigError("network.userAgent cannot be empty.");
  return Object.freeze(merged);
}

export function createRuntimeConfig(input: ApexifyRuntimeOptions = {}): Readonly<ApexifyRuntimeConfig> {
  const ffmpeg: FfmpegRuntimeConfig = { ...DEFAULT_FFMPEG_RUNTIME, ...input.ffmpeg };
  finitePositive(ffmpeg.timeoutMs, "ffmpeg.timeoutMs");

  const temp: TempRuntimeConfig = { ...DEFAULT_TEMP_RUNTIME, ...input.temp };

  return Object.freeze({
    network: resolveNetworkPolicy(input.network),
    limits: resolveRenderLimits(input.limits),
    cache: resolveCacheOptions(input.cache),
    ffmpeg: Object.freeze(ffmpeg),
    temp: Object.freeze(temp),
    diagnostics: Object.freeze({ ...(input.diagnostics ?? {}) }),
  });
}

export {
  DEFAULT_RENDER_LIMITS,
  DEFAULT_CACHE_OPTIONS,
};
