import type { BatchOperation, ChainOperation } from "../../types/batch";
import { batchOperations, chainOperations, type BatchChainAssetOpts } from "../../batch/batch-operations";
import type { BatchChainPainter } from "../../batch/batch-operations";
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

export type { BatchChainAssetOpts } from "../../batch/batch-operations";
