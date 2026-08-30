export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  evictions: number;
  expirations: number;
  failures: number;
  entries: number;
  bytes: number;
}

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
  size: number;
}

export interface BoundedCacheOptions<K, V> {
  enabled?: boolean;
  ttlMs: number;
  maxEntries: number;
  maxBytes: number;
  sizeOf?: (value: V, key: K) => number;
  now?: () => number;
}

export class BoundedCache<K, V> {
  private readonly entries = new Map<K, CacheEntry<V>>();
  private readonly sizeOf: (value: V, key: K) => number;
  private readonly now: () => number;
  private enabled: boolean;
  private bytes = 0;
  private counters = { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0, failures: 0 };

  constructor(private readonly options: BoundedCacheOptions<K, V>) {
    this.enabled = options.enabled !== false;
    this.sizeOf = options.sizeOf ?? (() => 1);
    this.now = options.now ?? Date.now;
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) throw new TypeError("cache ttlMs must be positive");
    if (!Number.isFinite(options.maxEntries) || options.maxEntries <= 0) throw new TypeError("cache maxEntries must be positive");
    if (!Number.isFinite(options.maxBytes) || options.maxBytes <= 0) throw new TypeError("cache maxBytes must be positive");
  }

  get(key: K): V | undefined {
    if (!this.enabled) {
      this.counters.misses += 1;
      return undefined;
    }
    const entry = this.entries.get(key);
    if (!entry) {
      this.counters.misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      this.deleteEntry(key, entry, true);
      this.counters.misses += 1;
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.counters.hits += 1;
    return entry.value;
  }

  set(key: K, value: V): V {
    if (!this.enabled) return value;
    const size = Math.max(0, this.sizeOf(value, key));
    const existing = this.entries.get(key);
    if (existing) this.deleteEntry(key, existing, false);
    if (size > this.options.maxBytes) return value;
    this.entries.set(key, { value, size, expiresAt: this.now() + this.options.ttlMs });
    this.bytes += size;
    this.counters.sets += 1;
    this.evictToBounds();
    return value;
  }

  delete(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.deleteEntry(key, entry, false);
    return true;
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }

  disable(): void {
    this.enabled = false;
    this.clear();
  }

  enable(): void {
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async getOrCreate(key: K, factory: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    try {
      const value = await factory();
      return this.set(key, value);
    } catch (error) {
      this.counters.failures += 1;
      this.delete(key);
      throw error;
    }
  }

  stats(): CacheStats {
    this.pruneExpired();
    return { ...this.counters, entries: this.entries.size, bytes: this.bytes };
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.deleteEntry(key, entry, true);
    }
  }

  private evictToBounds(): void {
    while (this.entries.size > this.options.maxEntries || this.bytes > this.options.maxBytes) {
      const oldest = this.entries.entries().next().value as [K, CacheEntry<V>] | undefined;
      if (!oldest) break;
      this.deleteEntry(oldest[0], oldest[1], false);
      this.counters.evictions += 1;
    }
  }

  private deleteEntry(key: K, entry: CacheEntry<V>, expired: boolean): void {
    if (!this.entries.delete(key)) return;
    this.bytes = Math.max(0, this.bytes - entry.size);
    if (expired) this.counters.expirations += 1;
  }
}
