export type AudioSeed = number | string;

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seedToUint32(seed: AudioSeed): number {
  if (typeof seed === "number") return seed >>> 0;
  return hashString(seed);
}

/** Create an operation-local RNG. Undefined intentionally preserves nondeterministic default behavior. */
export function createAudioRandom(seed?: AudioSeed): () => number {
  if (seed === undefined) return Math.random;
  let state = seedToUint32(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Derive independent deterministic streams without shared mutable RNG state. */
export function deriveAudioSeed(seed: AudioSeed | undefined, scope: string | number): AudioSeed | undefined {
  if (seed === undefined) return undefined;
  return `${typeof seed}:${String(seed)}:${String(scope)}`;
}
