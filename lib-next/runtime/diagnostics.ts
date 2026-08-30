import type { DiagnosticsEvent } from "./config";
import { getDefaultApexifyRuntimeConfig } from "./config";

export function emitDiagnostic(event: DiagnosticsEvent): void {
  getDefaultApexifyRuntimeConfig().diagnostics.handler?.(event);
}
