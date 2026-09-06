import type {
  BatchOperation,
  ChainOperation,
  BatchChainAssetOpts,
  BatchChainPainter,
} from "../types";
import { resolveAssetRefsDeep } from "../assets/asset-strings";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCollection, assertFiniteNumber } from "../runtime/validation";

export type { BatchChainAssetOpts, BatchChainPainter } from "../types";

function abortError(scope: "batch" | "chain"): ApexifyInputError {
  return new ApexifyInputError(`${scope}: operation aborted.`, { details: { aborted: true } });
}

function throwIfAborted(signal: AbortSignal | undefined, scope: "batch" | "chain"): void {
  if (signal?.aborted) throw abortError(scope);
}

function resolveChainMethod(painter: object, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = painter;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function resolveConcurrency(requested: number | undefined): number {
  const maximum = getDefaultApexifyRuntimeConfig().limits.maxBatchConcurrency;
  if (requested === undefined) return maximum;
  assertFiniteNumber(requested, "batch.concurrency", { min: 1, integer: true });
  if (requested > maximum) {
    throw new ApexifyInputError(`batch.concurrency must not exceed runtime limits.maxBatchConcurrency (${maximum}).`);
  }
  return requested;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  signal: AbortSignal | undefined,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstFailure: unknown;
  const workerCount = Math.min(items.length, concurrency);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (firstFailure === undefined) {
        throwIfAborted(signal, "batch");
        const index = nextIndex++;
        if (index >= items.length) return;
        try {
          results[index] = await worker(items[index]!, index);
        } catch (cause) {
          firstFailure = cause;
          return;
        }
      }
    })
  );
  if (firstFailure !== undefined) throw firstFailure;
  throwIfAborted(signal, "batch");
  return results;
}

function rethrowOperationError(error: unknown, message: string, details: Record<string, unknown>): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyInputError(message, { cause: error, details });
}

/**
 * Process multiple operations with bounded concurrency. Results always preserve input order.
 * Failure policy is fail-fast: no new work is scheduled after the first failure; already-running work is allowed to settle.
 */
export async function batchOperations(
  painter: BatchChainPainter,
  operations: BatchOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer[]> {
  assertCollection(operations, "batch.operations", { min: 1, limit: "maxBatchOperations" });
  if (opts?.resolveAssetRefs && !opts.resolve) {
    throw new ApexifyInputError("batch: resolveAssetRefs requires opts.resolve (use ApexPainter.batch).");
  }
  throwIfAborted(opts?.signal, "batch");
  const concurrency = resolveConcurrency(opts?.concurrency);

  return mapWithConcurrency(operations, concurrency, opts?.signal, async (op, index) => {
    try {
      throwIfAborted(opts?.signal, "batch");
      switch (op.type) {
        case "canvas": {
          const canvasResult = await painter.createCanvas(op.config, { resolveAssetRefs: opts?.resolveAssetRefs });
          return canvasResult.buffer;
        }
        case "image": {
          const baseCanvas = await painter.createCanvas({ width: 800, height: 600 }, { resolveAssetRefs: opts?.resolveAssetRefs });
          return painter.createImage(op.config, baseCanvas, undefined, { resolveAssetRefs: opts?.resolveAssetRefs });
        }
        case "text": {
          const textBaseCanvas = await painter.createCanvas({ width: 800, height: 600 }, { resolveAssetRefs: opts?.resolveAssetRefs });
          return painter.createText(op.config, textBaseCanvas, { resolveAssetRefs: opts?.resolveAssetRefs });
        }
      }
    } catch (error) {
      rethrowOperationError(error, `batch: operation ${index} failed.`, { index, type: op.type });
    }
  });
}

/**
 * Chain operations sequentially. A failure or abort stops all later steps; successful prior mutations are not rolled back.
 */
export async function chainOperations(
  painter: BatchChainPainter,
  operations: ChainOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer> {
  assertCollection(operations, "chain.operations", { min: 1, limit: "maxBatchOperations" });
  if (opts?.resolveAssetRefs && !opts.resolve) {
    throw new ApexifyInputError("chain: resolveAssetRefs requires opts.resolve (use ApexPainter.chain).");
  }
  if (opts?.concurrency !== undefined) resolveConcurrency(opts.concurrency);
  throwIfAborted(opts?.signal, "chain");

  let currentBuffer: Buffer | undefined;
  for (let index = 0; index < operations.length; index++) {
    const op = operations[index]!;
    try {
      throwIfAborted(opts?.signal, "chain");
      if (typeof op.method !== "string" || op.method.length === 0) throw new ApexifyInputError(`chain: operation ${index} method must be non-empty.`);
      if (!Array.isArray(op.args)) throw new ApexifyInputError(`chain: operation ${index} args must be an array.`);
      const method = op.method.includes(".")
        ? resolveChainMethod(painter as object, op.method)
        : (painter as unknown as Record<string, unknown>)[op.method];
      if (typeof method !== "function") throw new ApexifyInputError(`chain: method "${op.method}" does not exist on painter.`);

      const resolve = opts?.resolveAssetRefs ? opts.resolve : undefined;
      const args = op.args.map((arg) => {
        if (arg === "current" || (typeof arg === "object" && arg !== null && (arg as { __isCurrentBuffer?: boolean }).__isCurrentBuffer)) {
          if (!currentBuffer) throw new ApexifyInputError(`chain: operation ${index} requested current buffer before one was produced.`);
          return currentBuffer;
        }
        return resolve ? resolveAssetRefsDeep(arg, resolve) : arg;
      });

      const result = await (method as (...a: unknown[]) => unknown).apply(painter, args);
      throwIfAborted(opts?.signal, "chain");
      if (Buffer.isBuffer(result)) currentBuffer = result;
      else if (result && typeof result === "object" && "buffer" in result && Buffer.isBuffer((result as { buffer?: unknown }).buffer)) {
        currentBuffer = (result as { buffer: Buffer }).buffer;
      } else {
        throw new ApexifyInputError(`chain: operation "${op.method}" did not return a buffer.`);
      }
    } catch (error) {
      rethrowOperationError(error, `chain: operation ${index} failed.`, { index, method: op.method });
    }
  }
  if (!currentBuffer) throw new ApexifyInputError("chain: no buffer was produced from operations.");
  return currentBuffer;
}
