import type {
  CanvasConfig,
  ImageProperties,
  TextProperties,
  BatchOperation,
  ChainOperation,
  BatchChainAssetOpts,
  BatchChainPainter,
} from "../types";
import { resolveAssetRefsDeep } from "../assets/asset-strings";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCollection } from "../runtime/validation";

export type { BatchChainAssetOpts, BatchChainPainter } from "../types";

function resolveChainMethod(painter: object, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = painter;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(items.length, Math.max(1, concurrency));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        results[index] = await worker(items[index], index);
      }
    })
  );
  return results;
}

function rethrowOperationError(error: unknown, message: string, details: Record<string, unknown>): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyInputError(message, { cause: error, details });
}

/**
 * Processes multiple operations with central bounded concurrency.
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

  const concurrency = getDefaultApexifyRuntimeConfig().limits.maxBatchConcurrency;
  return mapWithConcurrency(operations, concurrency, async (op, index) => {
    try {
      switch (op.type) {
        case "canvas": {
          const canvasResult = await painter.createCanvas(op.config as CanvasConfig, {
            resolveAssetRefs: opts?.resolveAssetRefs,
          });
          return canvasResult.buffer;
        }
        case "image": {
          const baseCanvas = await painter.createCanvas({ width: 800, height: 600 }, {
            resolveAssetRefs: opts?.resolveAssetRefs,
          });
          return painter.createImage(
            op.config as ImageProperties | ImageProperties[],
            baseCanvas,
            undefined,
            { resolveAssetRefs: opts?.resolveAssetRefs }
          );
        }
        case "text": {
          const textBaseCanvas = await painter.createCanvas({ width: 800, height: 600 }, {
            resolveAssetRefs: opts?.resolveAssetRefs,
          });
          return painter.createText(
            op.config as TextProperties | TextProperties[],
            textBaseCanvas,
            { resolveAssetRefs: opts?.resolveAssetRefs }
          );
        }
        default:
          throw new ApexifyInputError(`batch: unknown operation type: ${String((op as BatchOperation).type)}.`);
      }
    } catch (error) {
      rethrowOperationError(error, `batch: operation ${index} failed.`, { index, type: op.type });
    }
  });
}

/**
 * Chains multiple operations sequentially with a bounded operation count.
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

  let currentBuffer: Buffer | undefined;

  for (let index = 0; index < operations.length; index++) {
    const op = operations[index];
    try {
      const method =
        typeof op.method === "string" && op.method.includes(".")
          ? resolveChainMethod(painter as object, op.method)
          : (painter as unknown as Record<string, unknown>)[op.method];
      if (typeof method !== "function") {
        throw new ApexifyInputError(`chain: method "${op.method}" does not exist on painter.`);
      }

      const resolve = opts?.resolveAssetRefs ? opts.resolve : undefined;
      const args = op.args.map((arg) => {
        if (
          arg === "current" ||
          (typeof arg === "object" && arg !== null && (arg as { __isCurrentBuffer?: boolean }).__isCurrentBuffer)
        ) {
          return currentBuffer;
        }
        return resolve ? resolveAssetRefsDeep(arg, resolve) : arg;
      });

      const result = await (method as (...a: unknown[]) => unknown).apply(painter, args);
      if (Buffer.isBuffer(result)) {
        currentBuffer = result;
      } else if (result && typeof result === "object" && "buffer" in result && Buffer.isBuffer((result as { buffer?: unknown }).buffer)) {
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
