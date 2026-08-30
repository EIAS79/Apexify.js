import { AsyncLocalStorage } from "node:async_hooks";
import { BoundedCache, type CacheStatistics } from "./cache";
import { createRuntimeConfig, type ApexifyRuntimeConfig, type ApexifyRuntimeOptions } from "./config";
import { ApexifyDiagnostics } from "./diagnostics";

export interface ApexifyRuntimeCacheStatistics {
  remoteBytes: CacheStatistics;
}

const runtimeStorage = new AsyncLocalStorage<ApexifyRuntime>();

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

  /** Run a synchronous or asynchronous call tree under this painter's runtime policy. */
  run<T>(operation: () => T): T {
    return runtimeStorage.run(this, operation);
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

/** Safe default for direct helper imports outside an ApexPainter call tree. */
export const defaultApexifyRuntime = new ApexifyRuntime();

export function currentApexifyRuntime(): ApexifyRuntime {
  return runtimeStorage.getStore() ?? defaultApexifyRuntime;
}
