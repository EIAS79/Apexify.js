// lib/checkUpdates.ts

export type ApexifyUpdateStatus = {
    packageName: string;
    currentVersion: string | null;
    latestVersion: string | null;
    updateAvailable: boolean;
    message?: string;
  };
  
  type CheckUpdateOptions = {
    packageName?: string;
    silent?: boolean;
  };
  
  function cleanVersion(version?: string): string | null {
    if (!version) return null;
    return version.replace(/^(\^|~|>=|<=|>|<)/, "").trim();
  }
  
  function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  
    const length = Math.max(pa.length, pb.length);
  
    for (let i = 0; i < length; i += 1) {
      const na = pa[i] ?? 0;
      const nb = pb[i] ?? 0;
  
      if (na > nb) return 1;
      if (na < nb) return -1;
    }
  
    return 0;
  }
  
  async function readInstalledVersion(packageName: string): Promise<string | null> {
    try {
      const fs = await import("fs");
      const path = await import("path");
  
      const packageJsonPath = path.resolve(process.cwd(), "package.json");
  
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
  
      const raw = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(raw) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        optionalDependencies?: Record<string, string>;
      };
  
      const version =
        packageJson.dependencies?.[packageName] ??
        packageJson.devDependencies?.[packageName] ??
        packageJson.optionalDependencies?.[packageName];
  
      return cleanVersion(version);
    } catch {
      return null;
    }
  }
  
  async function fetchLatestVersion(packageName: string): Promise<string | null> {
    try {
      const encoded = encodeURIComponent(packageName);
      const response = await fetch(`https://registry.npmjs.org/${encoded}/latest`);
  
      if (!response.ok) {
        return null;
      }
  
      const data = (await response.json()) as { version?: string };
      return cleanVersion(data.version);
    } catch {
      return null;
    }
  }
  
  export async function checkApexifyUpdates(
    options: CheckUpdateOptions = {}
  ): Promise<ApexifyUpdateStatus> {
    const packageName = options.packageName ?? "apexify.js";
    const silent = options.silent ?? false;
  
    const currentVersion = await readInstalledVersion(packageName);
    const latestVersion = await fetchLatestVersion(packageName);
  
    const updateAvailable =
      Boolean(currentVersion && latestVersion) &&
      compareVersions(latestVersion as string, currentVersion as string) > 0;
  
    const result: ApexifyUpdateStatus = {
      packageName,
      currentVersion,
      latestVersion,
      updateAvailable,
    };
  
    if (updateAvailable) {
      result.message = `A new version of ${packageName} is available: ${currentVersion} → ${latestVersion}`;
  
      if (!silent) {
        console.log(`\x1b[36m${result.message}\x1b[0m`);
      }
    }
  
    return result;
  }