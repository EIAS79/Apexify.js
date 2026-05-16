/**
 * Optional named extension APIs (e.g. QR helpers) without bloating the core painter class.
 */
export class PluginHost {
  private readonly registry = new Map<string, unknown>();

  /**
   * Registers an extension object under **`name`**. Throws if **`name`** is already used.
   */
  use<T extends object>(name: string, api: T): T {
    if (this.registry.has(name)) {
      throw new Error(`PluginHost: "${name}" is already registered.`);
    }
    this.registry.set(name, api);
    return api;
  }

  get<T>(name: string): T | undefined {
    return this.registry.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  remove(name: string): boolean {
    return this.registry.delete(name);
  }
}
