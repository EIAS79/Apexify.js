export type ApexifyErrorCode =
  | "APEXIFY_ERROR"
  | "INPUT_ERROR"
  | "CONFIG_ERROR"
  | "RESOURCE_LIMIT"
  | "REMOTE_FETCH"
  | "DECODE_ERROR"
  | "PROCESS_ERROR"
  | "EXTERNAL_SERVICE";

export interface ApexifyErrorOptions {
  code?: ApexifyErrorCode | string;
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
  retryable?: boolean;
}

/** Base error for all Apexify operational/runtime failures. */
export class ApexifyError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;

  constructor(message: string, options: ApexifyErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code ?? "APEXIFY_ERROR";
    this.details = options.details;
    this.retryable = options.retryable ?? false;
  }

  toJSON(): Readonly<Record<string, unknown>> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class ApexifyInputError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "INPUT_ERROR" });
  }
}

export class ApexifyConfigError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "CONFIG_ERROR" });
  }
}

export class ApexifyResourceLimitError extends ApexifyError {
  readonly limit: string;
  readonly maximum: number;
  readonly actual?: number;

  constructor(
    message: string,
    options: Omit<ApexifyErrorOptions, "code" | "details"> & {
      limit: string;
      maximum: number;
      actual?: number;
      details?: Readonly<Record<string, unknown>>;
    }
  ) {
    super(message, {
      ...options,
      code: "RESOURCE_LIMIT",
      details: {
        limit: options.limit,
        maximum: options.maximum,
        ...(options.actual !== undefined ? { actual: options.actual } : {}),
        ...options.details,
      },
    });
    this.limit = options.limit;
    this.maximum = options.maximum;
    this.actual = options.actual;
  }
}

export class ApexifyRemoteFetchError extends ApexifyError {
  readonly url: string;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    options: Omit<ApexifyErrorOptions, "code" | "details"> & {
      url: string;
      status?: number;
      retryAfterMs?: number;
      details?: Readonly<Record<string, unknown>>;
    }
  ) {
    super(message, {
      ...options,
      code: "REMOTE_FETCH",
      details: {
        url: options.url,
        ...(options.status !== undefined ? { status: options.status } : {}),
        ...(options.retryAfterMs !== undefined ? { retryAfterMs: options.retryAfterMs } : {}),
        ...options.details,
      },
    });
    this.url = options.url;
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
  }
}

export class ApexifyDecodeError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "DECODE_ERROR" });
  }
}

export class ApexifyProcessError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "PROCESS_ERROR" });
  }
}

export class ApexifyExternalServiceError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "EXTERNAL_SERVICE" });
  }
}

export function getApexifyErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
