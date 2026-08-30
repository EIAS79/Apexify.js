import { ApexifyConfigError } from "./errors";

export interface RenderLimits {
  maxCanvasDimension: number;
  maxTotalPixels: number;
  maxCollectionItems: number;
  maxBackgroundLayers: number;
  maxFiltersPerOperation: number;
  maxSceneLayers: number;
  maxNestedSurfaces: number;
  maxSceneDepth: number;
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
  maxAudioLayers: number;
  maxAudioPartials: number;
  maxAudioBytes: number;
  maxVideoDurationSeconds: number;
  maxVideoFps: number;
  maxVideoBitrateKbps: number;
  maxVideoOverlays: number;
  maxBatchOperations: number;
  maxBatchConcurrency: number;
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

export interface FfmpegRuntimeConfig {
  ffmpegPath?: string;
  ffprobePath?: string;
  processTimeoutMs: number;
  probeTimeoutMs: number;
  maxStdoutBytes: number;
  maxStderrBytes: number;
}

export interface TempRuntimeConfig {
  rootDirectory?: string;
  retainFiles: boolean;
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
  ffmpeg: FfmpegRuntimeConfig;
  temp: TempRuntimeConfig;
  diagnostics: DiagnosticsRuntimeConfig;
}

export type ApexifyRuntimeConfigInput = {
  network?: Partial<NetworkRuntimeConfig>;
  limits?: Partial<RenderLimits>;
  cache?: Partial<CacheRuntimeConfig>;
  ffmpeg?: Partial<FfmpegRuntimeConfig>;
  temp?: Partial<TempRuntimeConfig>;
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
    maxCollectionItems: 2_048,
    maxBackgroundLayers: 128,
    maxFiltersPerOperation: 64,
    maxSceneLayers: 2_000,
    maxNestedSurfaces: 64,
    maxSceneDepth: 32,
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
    maxAudioLayers: 1_024,
    maxAudioPartials: 4_096,
    maxAudioBytes: 256 * 1024 * 1024,
    maxVideoDurationSeconds: 14_400,
    maxVideoFps: 240,
    maxVideoBitrateKbps: 200_000,
    maxVideoOverlays: 256,
    maxBatchOperations: 256,
    maxBatchConcurrency: 4,
    maxConcurrentRemoteFetches: 8,
  }),
  cache: Object.freeze({
    enabled: true,
    ttlMs: 5 * 60_000,
    maxEntries: 128,
    maxBytes: 128 * 1024 * 1024,
  }),
  ffmpeg: Object.freeze({
    processTimeoutMs: 5 * 60_000,
    probeTimeoutMs: 5_000,
    maxStdoutBytes: 10 * 1024 * 1024,
    maxStderrBytes: 30 * 1024 * 1024,
  }),
  temp: Object.freeze({ retainFiles: false }),
  diagnostics: Object.freeze({}),
});

function finitePositive(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new ApexifyConfigError(`${name} must be a finite positive number.`);
  return value;
}

function finitePositiveInteger(name: string, value: number): number {
  finitePositive(name, value);
  if (!Number.isInteger(value)) throw new ApexifyConfigError(`${name} must be an integer.`);
  return value;
}

function finiteNonNegative(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new ApexifyConfigError(`${name} must be a finite non-negative number.`);
  return value;
}

function optionalNonEmptyString(name: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new ApexifyConfigError(`${name} must be a non-empty string without NUL bytes when provided.`);
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
  const ffmpeg: FfmpegRuntimeConfig = { ...DEFAULT_APEXIFY_RUNTIME_CONFIG.ffmpeg, ...input.ffmpeg };
  const temp: TempRuntimeConfig = { ...DEFAULT_APEXIFY_RUNTIME_CONFIG.temp, ...input.temp };
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

  for (const [key, value] of Object.entries(limits)) finitePositiveInteger(`limits.${key}`, value);
  if (limits.maxSceneDepth > limits.maxNestedSurfaces) {
    throw new ApexifyConfigError("limits.maxSceneDepth must be <= limits.maxNestedSurfaces.");
  }
  if (limits.maxBatchConcurrency > limits.maxBatchOperations) {
    throw new ApexifyConfigError("limits.maxBatchConcurrency must be <= limits.maxBatchOperations.");
  }
  cache.ttlMs = finitePositive("cache.ttlMs", cache.ttlMs);
  cache.maxEntries = Math.floor(finitePositive("cache.maxEntries", cache.maxEntries));
  cache.maxBytes = finitePositive("cache.maxBytes", cache.maxBytes);

  ffmpeg.ffmpegPath = optionalNonEmptyString("ffmpeg.ffmpegPath", ffmpeg.ffmpegPath);
  ffmpeg.ffprobePath = optionalNonEmptyString("ffmpeg.ffprobePath", ffmpeg.ffprobePath);
  ffmpeg.processTimeoutMs = finitePositive("ffmpeg.processTimeoutMs", ffmpeg.processTimeoutMs);
  ffmpeg.probeTimeoutMs = finitePositive("ffmpeg.probeTimeoutMs", ffmpeg.probeTimeoutMs);
  ffmpeg.maxStdoutBytes = finitePositive("ffmpeg.maxStdoutBytes", ffmpeg.maxStdoutBytes);
  ffmpeg.maxStderrBytes = finitePositive("ffmpeg.maxStderrBytes", ffmpeg.maxStderrBytes);
  temp.rootDirectory = optionalNonEmptyString("temp.rootDirectory", temp.rootDirectory);
  if (typeof temp.retainFiles !== "boolean") throw new ApexifyConfigError("temp.retainFiles must be a boolean.");
  if (diagnostics.handler !== undefined && typeof diagnostics.handler !== "function") {
    throw new ApexifyConfigError("diagnostics.handler must be a function when provided.");
  }

  return Object.freeze({
    network: Object.freeze(network), limits: Object.freeze(limits), cache: Object.freeze(cache),
    ffmpeg: Object.freeze(ffmpeg), temp: Object.freeze(temp), diagnostics: Object.freeze(diagnostics),
  });
}

let defaultRuntimeConfig = resolveApexifyRuntimeConfig();
export function getDefaultApexifyRuntimeConfig(): Readonly<ApexifyRuntimeConfig> { return defaultRuntimeConfig; }
export function configureApexifyRuntime(input: ApexifyRuntimeConfigInput): Readonly<ApexifyRuntimeConfig> {
  defaultRuntimeConfig = resolveApexifyRuntimeConfig({
    network: { ...defaultRuntimeConfig.network, ...input.network }, limits: { ...defaultRuntimeConfig.limits, ...input.limits },
    cache: { ...defaultRuntimeConfig.cache, ...input.cache }, ffmpeg: { ...defaultRuntimeConfig.ffmpeg, ...input.ffmpeg },
    temp: { ...defaultRuntimeConfig.temp, ...input.temp }, diagnostics: { ...defaultRuntimeConfig.diagnostics, ...input.diagnostics },
  });
  return defaultRuntimeConfig;
}
export function resetApexifyRuntimeConfig(): Readonly<ApexifyRuntimeConfig> {
  defaultRuntimeConfig = resolveApexifyRuntimeConfig(); return defaultRuntimeConfig;
}
