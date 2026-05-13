import { dataURL, base64, blob, arrayBuffer } from "./buffer-encoding";
import { url as uploadPngToUrl } from "./upload-imgur";
import { getErrorMessage } from "../core/errors";

/**
 * Encode a PNG buffer according to ApexPainter output `type` (constructor / `outputFormat`).
 */
export async function bufferToPainterOutput(
  results: Buffer,
  formatType: string
): Promise<Buffer | string | Blob | ArrayBuffer> {
  try {
    if (!Buffer.isBuffer(results)) {
      throw new Error("outPut: results must be a Buffer.");
    }

    switch (formatType) {
      case "buffer":
        return results;
      case "url":
        return await uploadPngToUrl(results);
      case "dataURL":
        return dataURL(results);
      case "blob":
        return blob(results);
      case "base64":
        return base64(results);
      case "arraybuffer":
        return arrayBuffer(results);
      default:
        throw new Error(
          `outPut: Unsupported format '${formatType}'. Supported: buffer, url, dataURL, blob, base64, arraybuffer`
        );
    }
  } catch (error) {
    throw new Error(`outPut failed: ${getErrorMessage(error)}`);
  }
}
