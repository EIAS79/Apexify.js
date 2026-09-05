import { ApexifyInputError } from "../runtime/errors";

const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function isPlainCompositionObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Buffer.isBuffer(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function assertSafeCompositionKey(key: string, label: string): void {
  if (UNSAFE_KEYS.has(key)) {
    throw new ApexifyInputError(`${label} contains unsafe key "${key}".`);
  }
}

/**
 * Clones JSON-like composition input while preserving opaque runtime objects by reference.
 * Buffers are copied. Cyclic arrays/plain objects are rejected instead of recursing forever.
 */
export function cloneCompositionValue<T>(input: T, label = "composition value"): T {
  const active = new WeakSet<object>();

  const clone = (value: unknown, path: string): unknown => {
    if (value === null || value === undefined) return value;
    if (Buffer.isBuffer(value)) return Buffer.from(value);
    if (typeof value !== "object") return value;
    if (!Array.isArray(value) && !isPlainCompositionObject(value)) return value;

    if (active.has(value)) {
      throw new ApexifyInputError(`${path} contains a cyclic object graph.`);
    }
    active.add(value);
    try {
      if (Array.isArray(value)) {
        return value.map((item, index) => clone(item, `${path}[${index}]`));
      }
      const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const [key, child] of Object.entries(value)) {
        assertSafeCompositionKey(key, path);
        out[key] = clone(child, `${path}.${key}`);
      }
      return out;
    } finally {
      active.delete(value);
    }
  };

  return clone(input, label) as T;
}
