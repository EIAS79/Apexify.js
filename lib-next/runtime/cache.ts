import { ApexifyConfigError } from "./errors";

export interface CacheOptions {
  enabled: boolean;
  maxEntries: number;
  maxBytes: number;
  ttlMs: number;
}

export type CacheOptionsInput = Partial<CacheOptions>;

export const DEFAULT_CACHE_OPTIONS: Readonly<CacheOptions> = Object.freeze({
  enabled: true,
  maxEntries: 256,
  maxBytes: 64 * 1024 * 1024,
  ttlMs: 5 * 60_000,
});

export interface CacheStatistics {
  enabled: boolean;
  entries: number;
  bytes: number;
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  expirations: number;
  failures: number;
}

interface CacheEntry<V> {
  value: V;
  size: number;
  expiresAt: number;
}

export type CacheValueSizer<V> = (value: V) => number;

export function resolveCacheOptions(input: CacheOptionsInput = {}): Readonly<CacheOptions> {
  const merged: CacheOptions = { ...DEFAULT_CACHE_OPTIONS, ...input };
  if (!Number.isInteger(merged.maxEntries) || merged.maxEntries <= 0) {
    throw new ApexifyConfigError("cache.maxEntries must be a positive integer.");
  }
  if (!Number.isFinite(merged.maxBytes) || merged.maxBytes <= 0) {
    throw new ApexifyConfigError("cache.maxBytes must be a finite number greater than 0.");
  }
  if (!Number.isFinite(merged.ttlMs) || merged.ttlMs <= 0) {
    throw new ApexifyConfigError("cache.ttlMs must be a finite number greater than 0.");
  }
  return Object.freeze(merged);
}

/** One authoritative bounded cache implementation: LRU + TTL + byte/entry budgets. */
export class BoundedCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private currentBytes = 0;
  private enabled: boolean;
  private hits = 0;
  private misses = 0;
  private sets = 0;
  private evictions = 0;
  private expirations = 0;
  private failures = 0;

  constructor(
    private readonly options: Readonly<CacheOptions> = DEFAULT_CACHE_OPTIONS,
    private readonly sizeOf: CacheValueSizer<V> = () => 1
  ) {
    this.enabled = options.enabled;
  }

  get(key: K): V | undefined {
    if (!this.enabled) {
      this.misses += 1;
      return undefined;
    }
    const entry = this.entries.get(key);
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.removeEntry(key, entry);
      this.expirations += 1;
      this.misses += 1;
      return undefined;
    }
    // Map insertion order is the LRU order: refresh on hit.
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.hits += 1;
    return entry.value;
  }

  set(key: K, value: V): boolean {
    if (!this.enabled) return false;
    const size = this.normalizedSize(value);
    if (size > this.options.maxBytes) return false;

    const existing = this.entries.get(key);
    if (existing) this.removeEntry(key, existing);

    const entry: CacheEntry<V> = {
      value,
      size,
      expiresAt: Date.now() + this.options.ttlMs,
    };
    this.entries.set(key, entry);
    this.currentBytes += size;
    this.sets += 1;
    this.evictOverflow();
    return this.entries.has(key);
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.removeEntry(key, entry);
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.currentBytes = 0;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.clear();
  }

  async getOrCreate(key: K, factory: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    try {
      const value = await factory();
      this.set(key, value);
      return value;
    } catch (error) {
      // Failed values/promises never remain cached.
      this.delete(key);
      this.failures += 1;
      throw error;
    }
  }

  stats(): CacheStatistics {
    this.pruneExpired();
    return {
      enabled: this.enabled,
      entries: this.entries.size,
      bytes: this.currentBytes,
      hits: this.hits,
      misses: this.misses,
      sets: this.sets,
      evictions: this.evictions,
      expirations: this.expirations,
      failures: this.failures,
    };
  }

  private normalizedSize(value: V): number {
    const size = this.sizeOf(value);
    if (!Number.isFinite(size) || size < 0) {
      throw new ApexifyConfigError("Cache value sizer must return a finite non-negative byte count.");
    }
    return Math.ceil(size);
  }

  private pruneExpired(): void {
    if (this.entries.size === 0) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt > now) continue;
      this.removeEntry(key, entry);
      this.expirations += 1;
    }
  }

  private evictOverflow(): void {
    this.pruneExpired();
    while (
      this.entries.size > this.options.maxEntries ||
      this.currentBytes > this.options.maxBytes
    ) {
      const first = this.entries.entries().next();
      if (first.done) break;
      const [key, entry] = first.value;
      this.removeEntry(key, entry);
      this.evictions += 1;
    }
  }

  private removeEntry(key: K, entry: CacheEntry<V>): void {
    if (!this.entries.delete(key)) return;
    this.currentBytes = Math.max(0, this.currentBytes - entry.size);
  }
}
