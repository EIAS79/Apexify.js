import type { ApexifyRuntimeConfig, ApexifyRuntimeConfigInput } from "./config";
import {
  getDefaultApexifyRuntimeConfig,
  resetDefaultApexifyRuntimeConfig,
  setDefaultApexifyRuntimeConfig,
} from "./config";

/** Merge a partial runtime policy into the current process-wide configuration. */
export function configureApexifyRuntime(input: ApexifyRuntimeConfigInput): Readonly<ApexifyRuntimeConfig> {
  const current = getDefaultApexifyRuntimeConfig();
  return setDefaultApexifyRuntimeConfig({
    network: { ...current.network, ...input.network },
    limits: { ...current.limits, ...input.limits },
    cache: { ...current.cache, ...input.cache },
    ffmpeg: { ...current.ffmpeg, ...input.ffmpeg },
    temp: { ...current.temp, ...input.temp },
    diagnostics: { ...current.diagnostics, ...input.diagnostics },
  });
}

/** Restore the process-wide runtime policy to Apexify defaults. */
export function resetApexifyRuntimeConfig(): Readonly<ApexifyRuntimeConfig> {
  return resetDefaultApexifyRuntimeConfig();
}
