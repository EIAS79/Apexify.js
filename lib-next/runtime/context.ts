import { BoundedCache, type CacheStatistics } from "./cache";
import { createRuntimeConfig, type ApexifyRuntimeConfig, type ApexifyRuntimeOptions } from "./config";
import { ApexifyDiagnostics } from "./diagnostics";

export interface ApexifyRuntimeCacheStatistics {
  remoteBytes: CacheStatistics;
}

/** Per-painter runtime context shared by all cross-cutting infrastructure. */
export class ApexifyRuntime {
  readonly config: Readonly<ApexifyRuntimeConfig>;
  readonly diagnostics: ApexifyDiagnostics;
  readonly remoteBytesCache: BoundedCache<string, Buffer>;

  constructor(options: ApexifyRuntimeOptions = {}) {
    this.config = createRuntimeConfig(options);
    this.diagnostics = new ApexifyDiagnostics(this.config.diagnostics.logger);
    this.remoteBytesCache = new BoundedCache<string, Buffer>(
      this.config.cache,
      (value) => value.length
    );
  }

  clearCaches(): void {
    this.remoteBytesCache.clear();
  }

  setCacheEnabled(enabled: boolean): void {
    this.remoteBytesCache.setEnabled(enabled);
  }

  cacheStats(): ApexifyRuntimeCacheStatistics {
    return { remoteBytes: this.remoteBytesCache.stats() };
  }
}

export function createApexifyRuntime(options: ApexifyRuntimeOptions = {}): ApexifyRuntime {
  return new ApexifyRuntime(options);
}

/** Backward-compatible runtime for direct helper imports outside an ApexPainter instance. */
export const defaultApexifyRuntime = new ApexifyRuntime();
