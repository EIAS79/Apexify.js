import type { BatchOperation, ChainOperation } from "../../types/batch";
import { batchOperations, chainOperations } from "../../batch/batch-operations";
import type { BatchChainPainter } from "../../batch/batch-operations";
import { getErrorMessage } from "../../core/errors";

export async function runBatch(painter: BatchChainPainter, operations: BatchOperation[]): Promise<Buffer[]> {
  try {
    return await batchOperations(painter, operations);
  } catch (error) {
    throw new Error(`batch failed: ${getErrorMessage(error)}`);
  }
}

export async function runChain(painter: BatchChainPainter, operations: ChainOperation[]): Promise<Buffer> {
  try {
    return await chainOperations(painter, operations);
  } catch (error) {
    throw new Error(`chain failed: ${getErrorMessage(error)}`);
  }
}
