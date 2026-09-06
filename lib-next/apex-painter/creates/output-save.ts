import type { SaveOptions, SaveResult } from "../../types";
import type { SaveCounterSession } from "../../output/save-buffer";
import { bufferToPainterOutput } from "../../output/buffer-output";
import { saveImageBuffer, saveImageBuffers } from "../../output/save-buffer";
import {
  validateOutputBuffer,
  validateSaveMultipleRequest,
  validateSaveRequest,
} from "../../output/output-validation";

/** Output conversion and persistence tied to painter output format + save counter session. */
export class OutputSaveCreate {
  constructor(
    private readonly getFormatType: () => string,
    private readonly session: SaveCounterSession
  ) {}

  toOutput(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    validateOutputBuffer(results, "toOutput.results");
    const formatType = this.getFormatType();
    return Promise.resolve(bufferToPainterOutput(results, formatType));
  }

  /** @deprecated Use {@link toOutput} instead. Retained for Apexify.js 5.x/6.x compatibility. */
  outPut(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    return this.toOutput(results);
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
