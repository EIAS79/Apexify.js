import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { SaveOptions, SaveResult } from "../types";
import { ApexifyError, ApexifyInputError, ApexifyDecodeError } from "../runtime/errors";
import { assertFiniteNumber } from "../runtime/validation";

/** Mutable counter for `naming: "counter"` (matches legacy ApexPainter.saveCounter). */
export interface SaveCounterSession {
  saveCounter: number;
}

type NormalizedSaveOptions = Required<Omit<SaveOptions, "filename" | "counterStart">> & {
  filename?: string;
  counterStart?: number;
};

function normalizeSaveOptions(options?: SaveOptions): NormalizedSaveOptions {
  const format = options?.format ?? "png";
  if (!["png", "jpg", "jpeg", "webp", "avif", "gif"].includes(format)) {
    throw new ApexifyInputError(`save.format is unsupported: ${String(format)}.`);
  }
  const quality = options?.quality ?? 90;
  assertFiniteNumber(quality, "save.quality", { min: 1, max: 100, integer: true });
  const naming = options?.naming ?? "timestamp";
  if (!["timestamp", "counter", "custom"].includes(naming)) {
    throw new ApexifyInputError(`save.naming is unsupported: ${String(naming)}.`);
  }
  if (options?.counterStart !== undefined) assertFiniteNumber(options.counterStart, "save.counterStart", { min: 0, integer: true });
  return {
    directory: options?.directory ?? "./ApexPainter_output",
    filename: options?.filename,
    format,
    quality,
    createDirectory: options?.createDirectory ?? true,
    naming,
    counterStart: options?.counterStart,
    prefix: options?.prefix ?? "",
    suffix: options?.suffix ?? "",
    overwrite: options?.overwrite ?? false,
  };
}

function timestampName(now: Date): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}_${String(now.getMilliseconds()).padStart(3, "0")}`;
}

function initialFilename(opts: NormalizedSaveOptions, session: SaveCounterSession): string {
  if (opts.filename) return path.extname(opts.filename) ? opts.filename : `${opts.filename}.${opts.format}`;
  switch (opts.naming) {
    case "counter": {
      const value = session.saveCounter;
      session.saveCounter += 1;
      return `${opts.prefix}${value}${opts.suffix}.${opts.format}`;
    }
    case "custom":
      return `${opts.prefix}${opts.suffix}.${opts.format}`;
    case "timestamp":
    default:
      return `${opts.prefix}${timestampName(new Date())}${opts.suffix}.${opts.format}`;
  }
}

async function encodeForFormat(buffer: Buffer, opts: NormalizedSaveOptions): Promise<Buffer> {
  switch (opts.format) {
    case "png": return buffer;
    case "jpg":
    case "jpeg": return sharp(buffer).jpeg({ quality: opts.quality, progressive: false }).toBuffer();
    case "webp": return sharp(buffer).webp({ quality: opts.quality }).toBuffer();
    case "avif": return sharp(buffer).avif({ quality: opts.quality }).toBuffer();
    case "gif": {
      if (buffer.subarray(0, 3).toString("ascii") !== "GIF") {
        throw new ApexifyInputError("save.format=gif requires GIF input bytes; PNG/JPEG-to-GIF conversion is not supported by save().");
      }
      return buffer;
    }
  }
}

async function writeRaceSafe(directory: string, filename: string, bytes: Buffer, overwrite: boolean): Promise<{ filename: string; path: string }> {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  for (let suffix = 0; ; suffix++) {
    const candidate = suffix === 0 ? filename : `${stem}_${suffix}${ext}`;
    const target = path.join(directory, candidate);
    try {
      await writeFile(target, bytes, { flag: overwrite ? "w" : "wx" });
      return { filename: candidate, path: target };
    } catch (cause) {
      const code = (cause as NodeJS.ErrnoException).code;
      if (!overwrite && code === "EEXIST") continue;
      throw cause;
    }
  }
}

/** Save a single image buffer using asynchronous, non-blocking filesystem I/O. */
export async function saveImageBuffer(buffer: Buffer, options: SaveOptions | undefined, session: SaveCounterSession): Promise<SaveResult> {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new ApexifyInputError("save.buffer must be a non-empty Buffer.");
  const opts = normalizeSaveOptions(options);
  try {
    if (opts.createDirectory) await mkdir(opts.directory, { recursive: true });
    const finalBuffer = await encodeForFormat(buffer, opts);
    const requested = initialFilename(opts, session);
    const written = await writeRaceSafe(opts.directory, requested, finalBuffer, opts.overwrite);
    return { path: written.path, filename: written.filename, size: finalBuffer.length, format: opts.format };
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("save failed.", { cause, details: { directory: opts.directory, format: opts.format } });
  }
}

/** Save many buffers sequentially so counter naming and overwrite behavior remain deterministic. */
export async function saveImageBuffers(buffers: Buffer[], options: SaveOptions | undefined, session: SaveCounterSession): Promise<SaveResult[]> {
  if (!Array.isArray(buffers) || buffers.length === 0) throw new ApexifyInputError("saveMultiple.buffers must be a non-empty array.");
  const originalCounter = session.saveCounter;
  if (options?.counterStart !== undefined) session.saveCounter = options.counterStart;
  try {
    const results: SaveResult[] = [];
    for (const buffer of buffers) results.push(await saveImageBuffer(buffer, options, session));
    return results;
  } catch (cause) {
    if (options?.counterStart !== undefined && session.saveCounter === options.counterStart) session.saveCounter = originalCounter;
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("saveMultiple failed.", { cause });
  }
}
