import { AsyncLocalStorage } from "node:async_hooks";
import type { ApexifyPlugin } from "../types";
import { ApexifyInputError, ApexifyPluginError } from "../runtime/errors";

function validatePluginName(name: unknown, label = "plugin name"): asserts name is string {
  if (typeof name !== "string" || !/^[A-Za-z_][\w.-]*$/.test(name)) {
    throw new ApexifyInputError(`${label} must be a non-empty identifier-like string.`);
  }
}

interface RegistryUndoEntry {
  existed: boolean;
  value?: unknown;
}

interface PluginInstallTransaction {
  active: boolean;
  undo: Map<string, RegistryUndoEntry>;
}

/**
 * Named plugin API registry plus serialized, transactional installation lifecycle.
 * Registry mutations made from a plugin's own async installation context are rolled back when that installation fails;
 * unrelated application registry writes that happen concurrently are preserved.
 */
export class PluginHost {
  private registry = new Map<string, unknown>();
  private readonly installedNames = new Set<string>();
  private readonly pendingNames = new Set<string>();
  private readonly installContext = new AsyncLocalStorage<PluginInstallTransaction>();
  private installTail: Promise<void> = Promise.resolve();

  private recordMutation(name: string): void {
    const transaction = this.installContext.getStore();
    if (!transaction?.active || transaction.undo.has(name)) return;
    if (this.registry.has(name)) {
      transaction.undo.set(name, { existed: true, value: this.registry.get(name) });
    } else {
      transaction.undo.set(name, { existed: false });
    }
  }

  private rollback(transaction: PluginInstallTransaction): void {
    transaction.active = false;
    for (const [name, entry] of transaction.undo) {
      if (entry.existed) this.registry.set(name, entry.value);
      else this.registry.delete(name);
    }
  }

  use<T extends object>(name: string, api: T): T {
    validatePluginName(name, "PluginHost API name");
    if (api === null || typeof api !== "object") throw new ApexifyInputError("PluginHost.use: api must be an object.");
    if (this.registry.has(name)) throw new ApexifyPluginError(`PluginHost: API "${name}" is already registered.`);
    this.recordMutation(name);
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
    this.recordMutation(name);
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
      const transaction: PluginInstallTransaction = { active: true, undo: new Map() };
      try {
        await this.installContext.run(transaction, () => plugin.install(host));
        transaction.active = false;
        this.installedNames.add(plugin.name);
      } catch (error) {
        this.rollback(transaction);
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
