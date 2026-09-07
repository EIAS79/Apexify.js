import sharp from "sharp";
import type { Canvas } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import { emitDiagnostic } from "../runtime/diagnostics";

/**
 * Upper bound for the extra unpremultiplied RGBA snapshot used by the text PNG fast path.
 * Larger canvases retain the native Skia/libuv encoder so the optimization cannot create
 * an unbounded transient allocation on otherwise-valid large render surfaces.
 */
export const TEXT_FAST_PNG_MAX_RAW_BYTES = 16 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_SIGNATURE_BYTES = PNG_SIGNATURE.length;
const SKIA_SBIT = Buffer.from([8, 8, 8, 8]);
const SKIA_SRGB = Buffer.from([0]);

interface PngChunkView {
  type: string;
  data: Buffer;
  start: number;
  end: number;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function parsePngChunks(png: Buffer): PngChunkView[] {
  if (png.length < PNG_SIGNATURE_BYTES || !png.subarray(0, PNG_SIGNATURE_BYTES).equals(PNG_SIGNATURE)) {
    throw new Error("Fast text PNG encoder returned a non-PNG buffer.");
  }

  const chunks: PngChunkView[] = [];
  let offset = PNG_SIGNATURE_BYTES;
  let foundIend = false;
  while (offset + 12 <= png.length) {
    const start = offset;
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    if (end > png.length) throw new Error(`Malformed PNG chunk ${type}.`);
    chunks.push({ type, data: png.subarray(dataStart, dataStart + length), start, end });
    offset = end;
    if (type === "IEND") {
      foundIend = true;
      break;
    }
  }
  if (!foundIend) throw new Error("Fast text PNG output is missing IEND.");
  return chunks;
}

/**
 * Sharp/libvips and Skia encode the same RGBA pixels with different ancillary metadata.
 * Phase 14-P probes established that Apexify's existing Skia PNGs carry 8-bit sBIT and
 * perceptual sRGB chunks, with no pHYs/ICC/gAMA/cHRM metadata. Sharp may add pHYs for raw
 * input; remove that physical-density hint, normalize sBIT/sRGB to the Skia contract, and
 * otherwise preserve Sharp's encoded chunks byte-for-byte. IDAT payloads are never changed.
 */
function withSkiaPngSemantics(png: Buffer, width: number, height: number): Buffer {
  const chunks = parsePngChunks(png);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== "IHDR" || ihdr.data.length !== 13) throw new Error("Fast text PNG output is missing a valid IHDR chunk.");
  if (ihdr.data.readUInt32BE(0) !== width || ihdr.data.readUInt32BE(4) !== height) throw new Error("Fast text PNG dimensions changed during encoding.");
  if (ihdr.data[8] !== 8 || ihdr.data[9] !== 6) throw new Error("Fast text PNG output is not 8-bit RGBA.");

  const forbiddenColorMetadata = chunks.find((chunk) =>
    chunk.type === "iCCP" || chunk.type === "gAMA" || chunk.type === "cHRM"
  );
  if (forbiddenColorMetadata) {
    throw new Error(`Fast text PNG encoder emitted unexpected ${forbiddenColorMetadata.type} color metadata.`);
  }

  const sbit = makePngChunk("sBIT", SKIA_SBIT);
  const srgb = makePngChunk("sRGB", SKIA_SRGB);
  const remainder = chunks
    .slice(1)
    .filter((chunk) => chunk.type !== "pHYs" && chunk.type !== "sBIT" && chunk.type !== "sRGB")
    .map((chunk) => png.subarray(chunk.start, chunk.end));

  return Buffer.concat([png.subarray(0, ihdr.end), sbit, srgb, ...remainder]);
}

function rawView(typed: Uint8ClampedArray): Buffer {
  return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
}

/**
 * Encode a rendered text canvas losslessly. Normal-sized canvases use an unpremultiplied
 * ImageData snapshot plus Sharp compression level 8; larger or unsupported cases fall
 * back to the existing native Skia async encoder. The fast-path allocation is strictly
 * bounded and any semantic/backend surprise degrades to the established encoder.
 */
export async function encodeTextCanvasPng(canvas: Canvas): Promise<Buffer> {
  const rawBytes = canvas.width * canvas.height * 4;
  if (!Number.isSafeInteger(rawBytes) || rawBytes <= 0 || rawBytes > TEXT_FAST_PNG_MAX_RAW_BYTES) {
    return canvas.encode("png");
  }

  try {
    const ctx = getCanvasContext(canvas);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const encoded = await sharp(rawView(imageData.data), {
      raw: { width: canvas.width, height: canvas.height, channels: 4 },
    })
      .png({ compressionLevel: 8, adaptiveFiltering: false, palette: false })
      .toBuffer();
    return withSkiaPngSemantics(encoded, canvas.width, canvas.height);
  } catch (error) {
    emitDiagnostic({
      level: "debug",
      code: "TEXT_PNG_FAST_PATH_FALLBACK",
      message: "Text PNG fast path fell back to the native Skia encoder.",
      details: { reason: error instanceof Error ? error.message : String(error) },
    });
    return canvas.encode("png");
  }
}
