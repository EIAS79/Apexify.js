import type { SaveOptions, SaveResult } from "../../types";
import type { SaveCounterSession } from "../../output/save-buffer";
import { bufferToPainterOutput } from "../../output/buffer-output";
import { saveImageBuffer, saveImageBuffers } from "../../output/save-buffer";
import {
  validateOutputBuffer,
  validateSaveMultipleRequest,
  validateSaveRequest,
} from "../../output/output-validation";

/** `outPut`, `save`, `saveMultiple` — tied to painter output format + save counter session. */
export class OutputSaveCreate {
  constructor(
    private readonly getFormatType: () => string,
    private readonly session: SaveCounterSession
  ) {}

  outPut(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    validateOutputBuffer(results, "outPut.results");
    const formatType = this.getFormatType();
    return Promise.resolve(bufferToPainterOutput(results, formatType));
  }

  async save(buffer: Buffer, options?: SaveOptions): Promise<SaveResult> {
    await validateSaveRequest(buffer, options);
    return saveImageBuffer(buffer, options, this.session);
  }

  async saveMultiple(buffers: Buffer[], options?: SaveOptions): Promise<SaveResult[]> {
    await validateSaveMultipleRequest(buffers, options);
    return saveImageBuffers(buffers, options, this.session);
  }
}
