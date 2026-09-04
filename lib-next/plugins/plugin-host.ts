import type { ApexifyPlugin } from "../types";
import { ApexifyInputError, ApexifyPluginError } from "../runtime/errors";

function validatePluginName(name: unknown, label = "plugin name"): asserts name is string {
  if (typeof name !== "string" || !/^[A-Za-z_][\w.-]*$/.test(name)) {
    throw new ApexifyInputError(`${label} must be a non-empty identifier-like string.`);
  }
}

/**
 * Named plugin API registry plus serialized, transactional installation lifecycle.
 * Registry changes made through this host are rolled back when installation throws/rejects.
 */
export class PluginHost {
  private registry = new Map<string, unknown>();
  private readonly installedNames = new Set<string>();
  private readonly pendingNames = new Set<string>();
  private installTail: Promise<void> = Promise.resolve();

  use<T extends object>(name: string, api: T): T {
    validatePluginName(name, "PluginHost API name");
    if (api === null || typeof api !== "object") throw new ApexifyInputError("PluginHost.use: api must be an object.");
    if (this.registry.has(name)) throw new ApexifyPluginError(`PluginHost: API "${name}" is already registered.`);
    this.registry.set(name, api);
    return api;
  }

  get<T extends object = object>(name: string): T | undefined {
    return this.registry.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.registry.has(name);
  }

  remove(name: string): boolean {
    return this.registry.delete(name);
  }

  list(): string[] {
    return [...this.registry.keys()];
  }

  isInstalled(name: string): boolean {
    return this.installedNames.has(name);
  }

  listInstalled(): string[] {
    return [...this.installedNames];
  }

  install<T>(plugin: ApexifyPlugin<T>, host: T): Promise<void> {
    if (!plugin || typeof plugin !== "object") return Promise.reject(new ApexifyInputError("ApexPainter.use: plugin must be an object."));
    validatePluginName(plugin.name);
    if (typeof plugin.install !== "function") return Promise.reject(new ApexifyInputError(`Plugin "${plugin.name}" must define install(host).`));
    if (this.installedNames.has(plugin.name) || this.pendingNames.has(plugin.name)) {
      return Promise.reject(new ApexifyPluginError(`Plugin "${plugin.name}" is already installed or installing.`));
    }

    this.pendingNames.add(plugin.name);
    const run = this.installTail.catch(() => undefined).then(async () => {
      if (this.installedNames.has(plugin.name)) throw new ApexifyPluginError(`Plugin "${plugin.name}" is already installed.`);
      const snapshot = new Map(this.registry);
      try {
        await plugin.install(host);
        this.installedNames.add(plugin.name);
      } catch (error) {
        this.registry = snapshot;
        throw new ApexifyPluginError(`Plugin "${plugin.name}" installation failed; PluginHost registrations were rolled back.`, {
          cause: error,
          details: { plugin: plugin.name },
        });
      }
    });

    this.installTail = run.then(() => undefined, () => undefined);
    return run.finally(() => {
      this.pendingNames.delete(plugin.name);
    });
  }
}
