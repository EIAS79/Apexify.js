import type { BatchOperation, ChainOperation, BatchChainAssetOpts, BatchChainPainter } from "../../types";
import { batchOperations, chainOperations } from "../../batch/batch-operations";
import { getErrorMessage } from "../../core/errors";

export async function runBatch(
  painter: BatchChainPainter,
  operations: BatchOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer[]> {
  try {
    return await batchOperations(painter, operations, opts);
  } catch (error) {
    throw new Error(`batch failed: ${getErrorMessage(error)}`);
  }
}

export async function runChain(
  painter: BatchChainPainter,
  operations: ChainOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer> {
  try {
    return await chainOperations(painter, operations, opts);
  } catch (error) {
    throw new Error(`chain failed: ${getErrorMessage(error)}`);
  }
}

export type { BatchChainAssetOpts } from "../../types";
