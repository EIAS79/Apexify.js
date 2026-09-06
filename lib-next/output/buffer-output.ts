import { dataURL, base64, blob, arrayBuffer } from "./buffer-encoding";
import { url as uploadPngToUrl } from "./upload-imgur";
import { ApexifyError, ApexifyInputError, ApexifyExternalServiceError } from "../runtime/errors";

export type PainterOutputType = "buffer" | "url" | "dataURL" | "blob" | "base64" | "arraybuffer";

/** Encode PNG bytes according to ApexPainter output type. base64 is raw; dataURL includes the MIME prefix. */
export async function bufferToPainterOutput(
  results: Buffer,
  formatType: string
): Promise<Buffer | string | Blob | ArrayBuffer> {
  if (!Buffer.isBuffer(results) || results.length === 0) {
    throw new ApexifyInputError("output.results must be a non-empty Buffer.");
  }
  if (!["buffer", "url", "dataURL", "blob", "base64", "arraybuffer"].includes(formatType)) {
    throw new ApexifyInputError(
      `output.type is unsupported: ${String(formatType)}. Supported: buffer, url, dataURL, blob, base64, arraybuffer.`
    );
  }

  try {
    switch (formatType as PainterOutputType) {
      case "buffer": return results;
      case "url": return await uploadPngToUrl(results);
      case "dataURL": return dataURL(results, "image/png");
      case "blob": return blob(results, "image/png");
      case "base64": return base64(results);
      case "arraybuffer": return arrayBuffer(results);
    }
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyExternalServiceError("output conversion failed.", { cause, details: { formatType } });
  }
}
