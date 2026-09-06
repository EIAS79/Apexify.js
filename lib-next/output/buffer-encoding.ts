import { ApexifyInputError } from "../runtime/errors";

function bytes(input: Buffer | Uint8Array): Buffer {
  if (!(Buffer.isBuffer(input) || input instanceof Uint8Array) || input.byteLength === 0) {
    throw new ApexifyInputError("output encoding requires non-empty bytes.");
  }
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

export function dataURL(buffer: Buffer | Uint8Array, mime = "image/png"): string {
  return `data:${mime};base64,${bytes(buffer).toString("base64")}`;
}

export function blob(buffer: Buffer | Uint8Array, mime = "image/png"): Blob {
  const source = bytes(buffer);
  return new Blob([new Uint8Array(source.buffer, source.byteOffset, source.byteLength)], { type: mime });
}

/** Raw base64 only; unlike dataURL(), this function never prepends a data: URL. */
export function base64(buffer: Buffer | Uint8Array): string {
  return bytes(buffer).toString("base64");
}

/** Return an exact byte slice rather than a Buffer's potentially larger backing ArrayBuffer. */
export function arrayBuffer(buffer: Buffer | Uint8Array): ArrayBuffer {
  const source = bytes(buffer);
  return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) as ArrayBuffer;
}
