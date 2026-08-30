export type ApexifyDiagnosticLevel = "debug" | "info" | "warn" | "error";

export interface ApexifyDiagnosticEvent {
  level: ApexifyDiagnosticLevel;
  code: string;
  message: string;
  details?: Readonly<Record<string, unknown>>;
  timestamp: number;
}

export type ApexifyDiagnosticLogger = (event: ApexifyDiagnosticEvent) => void;

export interface DiagnosticsOptions {
  logger?: ApexifyDiagnosticLogger;
}

/** Optional diagnostics sink. Apexify never writes arbitrary library errors to console. */
export class ApexifyDiagnostics {
  constructor(private readonly logger?: ApexifyDiagnosticLogger) {}

  emit(
    level: ApexifyDiagnosticLevel,
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>
  ): void {
    if (!this.logger) return;
    this.logger({ level, code, message, details, timestamp: Date.now() });
  }
}
