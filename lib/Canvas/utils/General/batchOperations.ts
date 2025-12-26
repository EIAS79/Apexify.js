import { ApexPainter } from '../../ApexPainter';
import { BatchOperation, ChainOperation, CanvasConfig, ImageProperties, TextProperties } from '../types';
import { getErrorMessage } from '../errorUtils';

/**
 * Processes multiple operations in parallel
 * @param painter - ApexPainter instance
 * @param operations - Array of operations to process
 * @returns Array of result buffers
 */
export async function batchOperations(
  painter: ApexPainter,
  operations: BatchOperation[]
): Promise<Buffer[]> {
  if (!operations || operations.length === 0) {
    throw new Error('batch: operations array is required');
  }

  const promises = operations.map(async (op) => {
    try {
      switch (op.type) {
        case 'canvas':
          const canvasResult = await painter.createCanvas(op.config as CanvasConfig);
          return canvasResult.buffer;
          
        case 'image':
          // For image operations, we need a base canvas
          const baseCanvas = await painter.createCanvas({ width: 800, height: 600 });
          return await painter.createImage(op.config as ImageProperties | ImageProperties[], baseCanvas);
          
        case 'text':
          // For text operations, we need a base canvas
          const textBaseCanvas = await painter.createCanvas({ width: 800, height: 600 });
          return await painter.createText(op.config as TextProperties | TextProperties[], textBaseCanvas);
          
        default:
          throw new Error(`batch: Unknown operation type: ${op.type}`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(`batch: Failed to process ${op.type} operation: ${errorMessage}`);
    }
  });

  return Promise.all(promises);
}

/**
 * Chains multiple operations sequentially
 * @param painter - ApexPainter instance
 * @param operations - Array of operations to chain
 * @returns Final result buffer
 */
export async function chainOperations(
  painter: ApexPainter,
  operations: ChainOperation[]
): Promise<Buffer> {
  if (!operations || operations.length === 0) {
    throw new Error('chain: operations array is required');
  }

  let currentBuffer: Buffer | undefined;

  for (const op of operations) {
    try {
      const method = (painter as any)[op.method];
      if (typeof method !== 'function') {
        throw new Error(`chain: Method "${op.method}" does not exist on ApexPainter`);
      }

      // Prepare arguments - replace 'current' with current buffer
      const args = op.args.map(arg => {
        if (arg === 'current' || (typeof arg === 'object' && arg !== null && (arg as any).__isCurrentBuffer)) {
          return currentBuffer;
        }
        return arg;
      });

      const result = await method.apply(painter, args);

      // Update current buffer
      if (Buffer.isBuffer(result)) {
        currentBuffer = result;
      } else if (result && typeof result === 'object' && 'buffer' in result) {
        currentBuffer = (result as any).buffer;
      } else {
        throw new Error(`chain: Operation "${op.method}" did not return a buffer`);
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      throw new Error(`chain: Failed to execute "${op.method}": ${errorMessage}`);
    }
  }

  if (!currentBuffer) {
    throw new Error('chain: No buffer was produced from operations');
  }

  return currentBuffer;
}

