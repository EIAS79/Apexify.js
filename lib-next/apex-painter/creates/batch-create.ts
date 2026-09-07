import type { BatchOperation, ChainOperation, BatchChainAssetOpts, BatchChainPainter } from "../../types";
import { batchOperations, chainOperations } from "../../batch/batch-operations";
import { ApexifyError, ApexifyInputError } from "../../runtime/errors";

export async function runBatch(
  painter: BatchChainPainter,
  operations: BatchOperation[],
  opts?: BatchChainAssetOpts
): Promise<Buffer[]> {
  try {
    return await batchOperations(painter, operations, opts);
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyInputError("batch failed.", { cause: error, details: { operation: "batch" } });
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
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyInputError("chain failed.", { cause: error, details: { operation: "chain" } });
  }
}

export type { BatchChainAssetOpts } from "../../types";
