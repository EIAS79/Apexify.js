import { ApexifyConfigError } from "./errors";

export interface RenderLimits {
  maxCanvasDimension: number;
  maxTotalPixels: number;
  maxSceneLayers: number;
  maxNestedSurfaces: number;
  maxTextLength: number;
  maxRemoteAssets: number;
  maxRemoteImageBytes: number;
  maxRemoteVideoBytes: number;
  maxDecodedImagePixels: number;
  maxGifFrames: number;
  maxGifDimension: number;
  maxGifResourceCost: number;
  maxAudioDurationSeconds: number;
  maxAudioSampleRate: number;
  maxAudioEvents: number;
  maxVideoDurationSeconds: number;
  maxConcurrentRemoteFetches: number;
}

export interface NetworkRuntimeConfig {
  allowedProtocols: readonly ("http:" | "https:")[];
  timeoutMs: number;
  maxRedirects: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  retryJitterRatio: number;
  honorRetryAfter: boolean;
  trustedNetworkAccess: boolean;
  allowedHosts: readonly string[];
  userAgent: string;
}

export interface CacheRuntimeConfig {
  enabled: boolean;
  ttlMs: number;
  maxEntries: number;
  maxBytes: number;
}

export interface DiagnosticsEvent {
  level: "debug" | "info" | "warn" | "error";
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}

export type DiagnosticsHandler = (event: DiagnosticsEvent) => void;

export interface DiagnosticsRuntimeConfig {
  handler?: DiagnosticsHandler;
}

export interface ApexifyRuntimeConfig {
  network: NetworkRuntimeConfig;
  limits: RenderLimits;
  cache: CacheRuntimeConfig;
  diagnostics: DiagnosticsRuntimeConfig;
}

export type ApexifyRuntimeConfigInput = {
  network?: Partial<NetworkRuntimeConfig>;
  limits?: Partial<RenderLimits>;
  cache?: Partial<CacheRuntimeConfig>;
  diagnostics?: DiagnosticsRuntimeConfig;
};

export const DEFAULT_APEXIFY_RUNTIME_CONFIG: Readonly<ApexifyRuntimeConfig> = Object.freeze({
  network: Object.freeze({
    allowedProtocols: Object.freeze(["http:", "https:"] as const),
    timeoutMs: 15_000,
    maxRedirects: 5,
    retryAttempts: 3,
    retryBaseDelayMs: 200,
    retryMaxDelayMs: 3_000,
    retryJitterRatio: 0.2,
    honorRetryAfter: true,
    trustedNetworkAccess: false,
    allowedHosts: Object.freeze([] as string[]),
    userAgent: "Apexify.js/6",
  }),
  limits: Object.freeze({
    maxCanvasDimension: 16_384,
    maxTotalPixels: 67_108_864,
    maxSceneLayers: 2_000,
    maxNestedSurfaces: 64,
    maxTextLength: 1_000_000,
    maxRemoteAssets: 128,
    maxRemoteImageBytes: 32 * 1024 * 1024,
    maxRemoteVideoBytes: 512 * 1024 * 1024,
    maxDecodedImagePixels: 67_108_864,
    maxGifFrames: 1_000,
    maxGifDimension: 4_096,
    maxGifResourceCost: 268_435_456,
    maxAudioDurationSeconds: 600,
    maxAudioSampleRate: 192_000,
    maxAudioEvents: 20_000,
    maxVideoDurationSeconds: 14_400,
    maxConcurrentRemoteFetches: 8,
  }),
  cache: Object.freeze({
    enabled: true,
    ttlMs: 5 * 60_000,
    maxEntries: 128,
    maxBytes: 128 * 1024 * 1024,
  }),
  diagnostics: Object.freeze({}),
});

function finitePositive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new ApexifyConfigError(`${name} must be a finite positive number.`);
  }
  return value;
}

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new ApexifyConfigError(`${name} must be a finite non-negative number.`);
  }
  return value;
}

export function resolveApexifyRuntimeConfig(input: ApexifyRuntimeConfigInput = {}): Readonly<ApexifyRuntimeConfig> {
  const network: NetworkRuntimeConfig = {
    ...DEFAULT_APEXIFY_RUNTIME_CONFIG.network,
    ...input.network,
    allowedProtocols: Object.freeze([...(input.network?.allowedProtocols ?? DEFAULT_APEXIFY_RUNTIME_CONFIG.network.allowedProtocols)]),
    allowedHosts: Object.freeze((input.network?.allowedHosts ?? DEFAULT_APEXIFY_RUNTIME_CONFIG.network.allowedHosts).map((host) => host.toLowerCase())),
  };
  const limits: RenderLimits = { ...DEFAULT_APEXIFY_RUNTIME_CONFIG.limits, ...input.limits };
  const cache: CacheRuntimeConfig = { ...DEFAULT_APEXIFY_RUNTIME_CONFIG.cache, ...input.cache };
  const diagnostics: DiagnosticsRuntimeConfig = { ...DEFAULT_APEXIFY_RUNTIME_CONFIG.diagnostics, ...input.diagnostics };

  network.timeoutMs = finitePositive("network.timeoutMs", network.timeoutMs);
  network.maxRedirects = Math.floor(finiteNonNegative("network.maxRedirects", network.maxRedirects));
  network.retryAttempts = Math.floor(finitePositive("network.retryAttempts", network.retryAttempts));
  network.retryBaseDelayMs = finiteNonNegative("network.retryBaseDelayMs", network.retryBaseDelayMs);
  network.retryMaxDelayMs = finiteNonNegative("network.retryMaxDelayMs", network.retryMaxDelayMs);
  network.retryJitterRatio = finiteNonNegative("network.retryJitterRatio", network.retryJitterRatio);
  if (network.retryJitterRatio > 1) throw new ApexifyConfigError("network.retryJitterRatio must be <= 1.");
  if (network.retryMaxDelayMs < network.retryBaseDelayMs) throw new ApexifyConfigError("network.retryMaxDelayMs must be >= network.retryBaseDelayMs.");
  if (network.allowedProtocols.length === 0 || network.allowedProtocols.some((p) => p !== "http:" && p !== "https:")) {
    throw new ApexifyConfigError("network.allowedProtocols may contain only http: and https: and cannot be empty.");
  }
  if (network.trustedNetworkAccess && network.allowedHosts.length === 0) {
    throw new ApexifyConfigError("network.trustedNetworkAccess requires at least one explicit network.allowedHosts entry.");
  }

  for (const [key, value] of Object.entries(limits)) finitePositive(`limits.${key}`, value);
  cache.ttlMs = finitePositive("cache.ttlMs", cache.ttlMs);
  cache.maxEntries = Math.floor(finitePositive("cache.maxEntries", cache.maxEntries));
  cache.maxBytes = finitePositive("cache.maxBytes", cache.maxBytes);

  return Object.freeze({
    network: Object.freeze(network),
    limits: Object.freeze(limits),
    cache: Object.freeze(cache),
    diagnostics: Object.freeze(diagnostics),
  });
}

let defaultRuntimeConfig = resolveApexifyRuntimeConfig();

export function getDefaultApexifyRuntimeConfig(): Readonly<ApexifyRuntimeConfig> {
  return defaultRuntimeConfig;
}

export function configureApexifyRuntime(input: ApexifyRuntimeConfigInput): Readonly<ApexifyRuntimeConfig> {
  defaultRuntimeConfig = resolveApexifyRuntimeConfig({
    network: { ...defaultRuntimeConfig.network, ...input.network },
    limits: { ...defaultRuntimeConfig.limits, ...input.limits },
    cache: { ...defaultRuntimeConfig.cache, ...input.cache },
    diagnostics: { ...defaultRuntimeConfig.diagnostics, ...input.diagnostics },
  });
  return defaultRuntimeConfig;
}

export function resetApexifyRuntimeConfig(): Readonly<ApexifyRuntimeConfig> {
  defaultRuntimeConfig = resolveApexifyRuntimeConfig();
  return defaultRuntimeConfig;
}
