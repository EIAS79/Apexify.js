/**
 * Tiny deterministic xorshift32 generator for reproducible raster noise/grain.
 * This is not cryptographic randomness; it exists solely so identical rendering
 * inputs produce identical pixels across runs and golden tests remain stable.
 */
export function createDeterministicRandom(seed = 0x9e3779b9): () => number {
  let state = seed >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

/** Derive a stable 32-bit seed from small numeric render parameters. */
export function rasterSeed(...values: number[]): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const normalized = Number.isFinite(value) ? Math.round(value * 1_000_000) : 0;
    hash ^= normalized >>> 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash || 0x6d2b79f5;
}
