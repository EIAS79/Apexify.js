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
import { getErrorMessage } from "../core/errors";

export type { BatchChainAssetOpts, BatchChainPainter } from "../types";

function resolveChainMethod(painter: object, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = painter;
  for (const seg of segments) {
    if (cur == null || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Processes multiple operations in parallel.
 */
export async function batchOperations(
  painter: BatchChainPainter,
  operations: BatchOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer[]> {
  if (!operations || operations.length === 0) {
    throw new Error("batch: operations array is required");
  }
  if (opts?.resolveAssetRefs && !opts.resolve) {
    throw new Error("batch: resolveAssetRefs requires opts.resolve (use ApexPainter.batch).");
  }

  const promises = operations.map(async (op) => {
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
          return await painter.createImage(
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
          return await painter.createText(
            op.config as TextProperties | TextProperties[],
            textBaseCanvas,
            { resolveAssetRefs: opts?.resolveAssetRefs }
          );
        }
        default:
          throw new Error(`batch: Unknown operation type: ${(op as BatchOperation).type}`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(`batch: Failed to process ${op.type} operation: ${errorMessage}`);
    }
  });

  return Promise.all(promises);
}

/**
 * Chains multiple operations sequentially.
 */
export async function chainOperations(
  painter: BatchChainPainter,
  operations: ChainOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer> {
  if (!operations || operations.length === 0) {
    throw new Error("chain: operations array is required");
  }
  if (opts?.resolveAssetRefs && !opts.resolve) {
    throw new Error("chain: resolveAssetRefs requires opts.resolve (use ApexPainter.chain).");
  }

  let currentBuffer: Buffer | undefined;

  for (const op of operations) {
    try {
      const method =
        typeof op.method === "string" && op.method.includes(".")
          ? resolveChainMethod(painter as object, op.method)
          : (painter as unknown as Record<string, unknown>)[op.method];
      if (typeof method !== "function") {
        throw new Error(`chain: Method "${op.method}" does not exist on painter`);
      }

      const resolve = opts?.resolveAssetRefs ? opts.resolve : undefined;
      const args = op.args.map((arg) => {
        if (
          arg === "current" ||
          (typeof arg === "object" &&
            arg !== null &&
            (arg as { __isCurrentBuffer?: boolean }).__isCurrentBuffer)
        ) {
          return currentBuffer;
        }
        if (resolve) {
          return resolveAssetRefsDeep(arg, resolve);
        }
        return arg;
      });

      const result = await (method as (...a: unknown[]) => unknown).apply(painter, args);

      if (Buffer.isBuffer(result)) {
        currentBuffer = result;
      } else if (result && typeof result === "object" && "buffer" in result) {
        currentBuffer = (result as { buffer: Buffer }).buffer;
      } else {
        throw new Error(`chain: Operation "${op.method}" did not return a buffer`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(`chain: Failed to execute "${op.method}": ${errorMessage}`);
    }
  }

  if (!currentBuffer) {
    throw new Error("chain: No buffer was produced from operations");
  }

  return currentBuffer;
}
