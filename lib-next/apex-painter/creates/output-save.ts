import type { SaveOptions, SaveResult } from "../../types/output";
import type { SaveCounterSession } from "../../output/save-buffer";
import { bufferToPainterOutput } from "../../output/buffer-output";
import { saveImageBuffer, saveImageBuffers } from "../../output/save-buffer";

/** `outPut`, `save`, `saveMultiple` — tied to painter output format + save counter session. */
export class OutputSaveCreate {
  constructor(
    private readonly getFormatType: () => string,
    private readonly session: SaveCounterSession
  ) {}

  outPut(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    const formatType = this.getFormatType();
    return Promise.resolve(bufferToPainterOutput(results, formatType));
  }

  save(buffer: Buffer, options?: SaveOptions): Promise<SaveResult> {
    return saveImageBuffer(buffer, options, this.session);
  }

  saveMultiple(buffers: Buffer[], options?: SaveOptions): Promise<SaveResult[]> {
    return saveImageBuffers(buffers, options, this.session);
  }
}
