import type { AssetKind, AssetRegistrationInfo, AssetValue } from "../types";
import { cloneCompositionValue, isPlainCompositionObject } from "../composition/clone";
import { ApexifyAssetError, ApexifyInputError } from "../runtime/errors";

interface AssetRegistration {
  kind: AssetKind;
  value: AssetValue;
}

const ASSET_NAME = /^[A-Za-z_]\w*$/;
const PATH_SEGMENT = /^(?:[A-Za-z_]\w*|\d+)$/;

function validateName(name: string): void {
  if (typeof name !== "string" || !ASSET_NAME.test(name) || name === "__proto__" || name === "constructor" || name === "prototype") {
    throw new ApexifyInputError(`AssetManager: invalid asset name "${String(name)}".`);
  }
}

function validatePathSegment(segment: string, refPath: string): void {
  if (!PATH_SEGMENT.test(segment) || segment === "__proto__" || segment === "constructor" || segment === "prototype") {
    throw new ApexifyAssetError(`AssetManager: invalid reference path "${refPath}".`);
  }
}

function validatePalette(name: string, colors: Record<string, string>, method: string): void {
  if (!isPlainCompositionObject(colors)) {
    throw new ApexifyInputError(`AssetManager.${method}: colors must be a plain object.`);
  }
  for (const [key, value] of Object.entries(colors)) {
    validatePathSegment(key, `${name}.${key}`);
    if (typeof value !== "string") {
      throw new ApexifyInputError(`AssetManager.${method}: ${key} must be a string.`);
    }
  }
}

function validateAssetValue(value: unknown, label: string): asserts value is AssetValue {
  const active = new WeakSet<object>();

  const visit = (current: unknown, path: string): void => {
    if (current === null || typeof current === "string" || typeof current === "number" || typeof current === "boolean") return;
    if (Buffer.isBuffer(current)) return;
    if (typeof current !== "object") {
      throw new ApexifyInputError(`${path} must contain only JSON-like values or Buffers.`);
    }
    if (!Array.isArray(current) && !isPlainCompositionObject(current)) {
      throw new ApexifyInputError(`${path} contains an unsupported object; only arrays, plain records, and Buffers are allowed.`);
    }
    if (active.has(current)) {
      throw new ApexifyInputError(`${path} contains a cyclic object graph.`);
    }

    active.add(current);
    try {
      if (Array.isArray(current)) {
        current.forEach((item, index) => visit(item, `${path}[${index}]`));
      } else {
        for (const [key, child] of Object.entries(current)) {
          if (key === "__proto__" || key === "prototype" || key === "constructor") {
            throw new ApexifyInputError(`${path} contains unsafe key "${key}".`);
          }
          visit(child, `${path}.${key}`);
        }
      }
    } finally {
      active.delete(current);
    }
  };

  visit(value, label);
}

/**
 * Named asset registry used by scenes, templates, and opt-in imperative composition.
 * Registrations reject duplicate root names by default; use explicit `replace*` methods when replacement is intended.
 */
export class AssetManager {
  private readonly registry = new Map<string, AssetRegistration>();

  private register(name: string, kind: AssetKind, value: AssetValue, replace: boolean): this {
    validateName(name);
    const exists = this.registry.has(name);
    if (!replace && exists) {
      throw new ApexifyAssetError(`AssetManager: asset "${name}" is already registered; use an explicit replace method.`);
    }
    if (replace && !exists) {
      throw new ApexifyAssetError(`AssetManager: cannot replace unknown asset "${name}".`);
    }
    this.registry.set(name, { kind, value: cloneCompositionValue(value, `asset.${name}`) });
    return this;
  }

  loadImage(id: string, source: string | Buffer): this {
    if (typeof source !== "string" && !Buffer.isBuffer(source)) {
      throw new ApexifyInputError("AssetManager.loadImage: source must be a string or Buffer.");
    }
    return this.register(id, "image", source, false);
  }

  replaceImage(id: string, source: string | Buffer): this {
    if (typeof source !== "string" && !Buffer.isBuffer(source)) {
      throw new ApexifyInputError("AssetManager.replaceImage: source must be a string or Buffer.");
    }
    return this.register(id, "image", source, true);
  }

  loadFont(id: string, fontPath: string): this {
    if (typeof fontPath !== "string" || fontPath.length === 0) {
      throw new ApexifyInputError("AssetManager.loadFont: fontPath must be a non-empty string.");
    }
    return this.register(id, "font", fontPath, false);
  }

  replaceFont(id: string, fontPath: string): this {
    if (typeof fontPath !== "string" || fontPath.length === 0) {
      throw new ApexifyInputError("AssetManager.replaceFont: fontPath must be a non-empty string.");
    }
    return this.register(id, "font", fontPath, true);
  }

  loadPalette(name: string, colors: Record<string, string>): this {
    validatePalette(name, colors, "loadPalette");
    return this.register(name, "palette", colors, false);
  }

  replacePalette(name: string, colors: Record<string, string>): this {
    validatePalette(name, colors, "replacePalette");
    return this.register(name, "palette", colors, true);
  }

  /** Register JSON-like composition data (including scalars, arrays, plain records, and Buffers). */
  loadValue(name: string, value: AssetValue): this {
    validateAssetValue(value, `AssetManager.loadValue(${name})`);
    return this.register(name, "value", value, false);
  }

  replaceValue(name: string, value: AssetValue): this {
    validateAssetValue(value, `AssetManager.replaceValue(${name})`);
    return this.register(name, "value", value, true);
  }

  unregisterImage(id: string): this {
    return this.unregisterKind(id, "image");
  }

  unregisterFont(id: string): this {
    return this.unregisterKind(id, "font");
  }

  unregisterPalette(name: string): this {
    return this.unregisterKind(name, "palette");
  }

  private unregisterKind(name: string, kind: AssetKind): this {
    const entry = this.registry.get(name);
    if (entry?.kind === kind) this.registry.delete(name);
    return this;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  delete(name: string): boolean {
    return this.registry.delete(name);
  }

  clear(): this {
    this.registry.clear();
    return this;
  }

  list(): AssetRegistrationInfo[] {
    return [...this.registry.entries()].map(([name, entry]) => ({ name, kind: entry.kind }));
  }

  /** Resolves a root asset or a dotted nested object/array path (without the leading `$`). */
  resolve(refPath: string): AssetValue {
    if (typeof refPath !== "string" || refPath.length === 0) {
      throw new ApexifyAssetError("AssetManager: reference path must be a non-empty string.");
    }
    const segments = refPath.split(".");
    segments.forEach((segment) => validatePathSegment(segment, refPath));
    const root = segments.shift()!;
    const registration = this.registry.get(root);
    if (!registration) throw new ApexifyAssetError(`AssetManager: unknown reference "${refPath}".`);

    let current: unknown = registration.value;
    for (const segment of segments) {
      if (Array.isArray(current)) {
        const index = Number(segment);
        if (!Number.isInteger(index) || index < 0 || index >= current.length) {
          throw new ApexifyAssetError(`AssetManager: missing nested property "${refPath}".`);
        }
        current = current[index];
        continue;
      }
      if (!isPlainCompositionObject(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
        throw new ApexifyAssetError(`AssetManager: missing nested property "${refPath}".`);
      }
      current = current[segment];
    }
    return cloneCompositionValue(current as AssetValue, `asset reference ${refPath}`);
  }
}
