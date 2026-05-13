export function dataURL(buffer: Buffer | Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
}

export function blob(buffer: Buffer | Uint8Array): Blob {
  return new Blob([new Uint8Array(buffer)]);
}

export function base64(buffer: Buffer | Uint8Array): string {
  return Buffer.from(buffer).toString("base64");
}

export function arrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.from(buffer).buffer;
}
