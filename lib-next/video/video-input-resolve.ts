import type { TempWorkspace } from "./temp-workspace";
import { currentApexifyRuntime } from "../runtime/context";
import {
  inferMediaExtensionFromBuffer,
  resolveVideoSourceToPath,
  type ResolvedVideoSource,
} from "../media/video-source";

export type ResolvedVideoInput = ResolvedVideoSource;
export { inferMediaExtensionFromBuffer };

/**
 * Internal compatibility bridge for existing video operation modules.
 * Source classification, SSRF policy, byte limits, retries and caching live exclusively in media/.
 */
export function resolveVideoInputToPath(
  videoSource: string | Buffer,
  workspace: TempWorkspace,
  basename = "input"
): Promise<ResolvedVideoInput> {
  return resolveVideoSourceToPath(
    videoSource,
    workspace,
    basename,
    currentApexifyRuntime()
  );
}
