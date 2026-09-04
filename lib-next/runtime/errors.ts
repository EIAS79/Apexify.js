export type ApexifyErrorCode =
  | "APEXIFY_INPUT"
  | "APEXIFY_CONFIG"
  | "APEXIFY_RESOURCE_LIMIT"
  | "APEXIFY_REMOTE_FETCH"
  | "APEXIFY_DECODE"
  | "APEXIFY_PROCESS"
  | "APEXIFY_EXTERNAL_SERVICE"
  | "APEXIFY_ASSET"
  | "APEXIFY_PLUGIN";

export interface ApexifyErrorOptions {
  code: ApexifyErrorCode;
  cause?: unknown;
  details?: Readonly<Record<string, unknown>>;
}

export class ApexifyError extends Error {
  readonly code: ApexifyErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(message: string, options: ApexifyErrorOptions) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.details = options.details;
  }
}

export class ApexifyInputError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_INPUT" });
  }
}

export class ApexifyConfigError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_CONFIG" });
  }
}

export class ApexifyResourceLimitError extends ApexifyError {
  readonly limit: string;
  readonly maximum: number;
  readonly actual: number;

  constructor(limit: string, maximum: number, actual: number, options: { cause?: unknown; details?: Readonly<Record<string, unknown>> } = {}) {
    super(`Apexify resource limit exceeded: ${limit} maximum is ${maximum}, received ${actual}.`, {
      ...options,
      code: "APEXIFY_RESOURCE_LIMIT",
      details: { ...options.details, limit, maximum, actual },
    });
    this.limit = limit;
    this.maximum = maximum;
    this.actual = actual;
  }
}

export class ApexifyRemoteFetchError extends ApexifyError {
  readonly status?: number;
  readonly requestUrl?: string;

  constructor(message: string, options: { status?: number; requestUrl?: string; cause?: unknown; details?: Readonly<Record<string, unknown>> } = {}) {
    super(message, {
      code: "APEXIFY_REMOTE_FETCH",
      cause: options.cause,
      details: options.details,
    });
    this.status = options.status;
    this.requestUrl = options.requestUrl;
  }
}

export class ApexifyDecodeError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_DECODE" });
  }
}

export class ApexifyProcessError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_PROCESS" });
  }
}

export class ApexifyExternalServiceError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_EXTERNAL_SERVICE" });
  }
}

export class ApexifyAssetError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_ASSET" });
  }
}

export class ApexifyPluginError extends ApexifyError {
  constructor(message: string, options: Omit<ApexifyErrorOptions, "code"> = {}) {
    super(message, { ...options, code: "APEXIFY_PLUGIN" });
  }
}

export function wrapApexifyError(error: unknown, fallback: string): ApexifyError {
  if (error instanceof ApexifyError) return error;
  return new ApexifyError(fallback, { code: "APEXIFY_INPUT", cause: error });
}
