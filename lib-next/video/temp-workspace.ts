import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";

export interface TempWorkspaceOptions {
  /** Parent directory. Defaults to central runtime policy, APEXIFY_TEMP_DIR, then OS temp. */
  rootDirectory?: string;
  /** Debug-only opt out of cleanup. Defaults to central runtime policy or APEXIFY_RETAIN_TEMP_FILES=true. */
  retain?: boolean;
  prefix?: string;
}

export class TempWorkspace {
  readonly directory: string;
  readonly retain: boolean;

  constructor(directory: string, retain: boolean) {
    this.directory = directory;
    this.retain = retain;
  }

  path(name: string): string {
    if (!name || name.includes("\0") || path.isAbsolute(name)) {
      throw new Error("TempWorkspace path must be a non-empty relative path without NUL bytes.");
    }
    const normalized = path.normalize(name);
    if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
      throw new Error("TempWorkspace path may not escape the workspace directory.");
    }
    return path.join(this.directory, normalized);
  }

  async ensureDirectory(name: string): Promise<string> {
    const target = this.path(name);
    await fs.mkdir(target, { recursive: true });
    return target;
  }

  async writeFile(name: string, data: string | Buffer): Promise<string> {
    const target = this.path(name);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    return target;
  }

  async cleanup(): Promise<void> {
    if (this.retain) return;
    await fs.rm(this.directory, { recursive: true, force: true });
  }
}

function configuredRetain(options?: TempWorkspaceOptions): boolean {
  if (options?.retain !== undefined) return options.retain;
  const runtime = getDefaultApexifyRuntimeConfig().temp;
  if (runtime.retainFiles) return true;
  return process.env.APEXIFY_RETAIN_TEMP_FILES === "true";
}

/** Create an operation-isolated workspace using fs.mkdtemp's atomic uniqueness guarantee. */
export async function createTempWorkspace(
  options: TempWorkspaceOptions = {}
): Promise<TempWorkspace> {
  const runtime = getDefaultApexifyRuntimeConfig().temp;
  const root = options.rootDirectory ?? runtime.rootDirectory ?? process.env.APEXIFY_TEMP_DIR ?? os.tmpdir();
  const prefix = (options.prefix ?? "apexify-").replace(/[^a-zA-Z0-9._-]/g, "-");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, prefix));
  return new TempWorkspace(directory, configuredRetain(options));
}

/** Always cleans the workspace in finally unless explicit debug retention is enabled. */
export async function withTempWorkspace<T>(
  options: TempWorkspaceOptions,
  work: (workspace: TempWorkspace) => Promise<T>
): Promise<T> {
  const workspace = await createTempWorkspace(options);
  try {
    return await work(workspace);
  } finally {
    await workspace.cleanup();
  }
}
