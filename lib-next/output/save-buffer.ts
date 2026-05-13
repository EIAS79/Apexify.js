import fs from "fs";
import path from "path";
import type { SaveOptions, SaveResult } from "../types/output";
import { getErrorMessage } from "../core/errors";

/** Mutable counter for `naming: "counter"` (matches legacy `ApexPainter.saveCounter`). */
export interface SaveCounterSession {
  saveCounter: number;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- optional sharp like legacy ApexPainter
function requireSharp(): typeof import("sharp") {
  return require("sharp");
}

/**
 * Save a single image buffer to disk (timestamp / counter / custom naming, optional format conversion via sharp).
 */
export async function saveImageBuffer(
  buffer: Buffer,
  options: SaveOptions | undefined,
  session: SaveCounterSession
): Promise<SaveResult> {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error("save: buffer must be a Buffer.");
    }

    const opts: Required<Omit<SaveOptions, "filename" | "counterStart">> & {
      filename?: string;
      counterStart?: number;
    } = {
      directory: options?.directory ?? "./ApexPainter_output",
      filename: options?.filename,
      format: options?.format ?? "png",
      quality: options?.quality ?? 90,
      createDirectory: options?.createDirectory ?? true,
      naming: options?.naming ?? "timestamp",
      counterStart: options?.counterStart ?? 1,
      prefix: options?.prefix ?? "",
      suffix: options?.suffix ?? "",
      overwrite: options?.overwrite ?? false,
    };

    if (opts.createDirectory && !fs.existsSync(opts.directory)) {
      fs.mkdirSync(opts.directory, { recursive: true });
    }

    let filename: string;
    if (opts.filename) {
      filename = opts.filename;
      if (!filename.includes(".")) {
        filename += `.${opts.format}`;
      }
    } else {
      switch (opts.naming) {
        case "timestamp": {
          const now = new Date();
          const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
            now.getDate()
          ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
            2,
            "0"
          )}${String(now.getSeconds()).padStart(2, "0")}_${String(now.getMilliseconds()).padStart(3, "0")}`;
          filename = `${opts.prefix}${timestamp}${opts.suffix}.${opts.format}`;
          break;
        }
        case "counter":
          filename = `${opts.prefix}${session.saveCounter}${opts.suffix}.${opts.format}`;
          session.saveCounter++;
          break;
        case "custom":
          filename = `${opts.prefix}${opts.suffix}.${opts.format}`;
          break;
        default:
          filename = `${opts.prefix}${Date.now()}${opts.suffix}.${opts.format}`;
      }
    }

    let filePath = path.join(opts.directory, filename);
    if (!opts.overwrite && fs.existsSync(filePath)) {
      let counter = 1;
      let newPath = filePath;
      const ext = path.extname(filePath);
      const baseName = path.basename(filePath, ext);
      const dir = path.dirname(filePath);

      while (fs.existsSync(newPath)) {
        newPath = path.join(dir, `${baseName}_${counter}${ext}`);
        counter++;
      }
      filename = path.basename(newPath);
      filePath = newPath;
    }

    let finalBuffer = buffer;
    if (opts.format !== "png") {
      const sharp = requireSharp();
      let sharpImage = sharp(buffer);

      switch (opts.format) {
        case "jpg":
        case "jpeg":
          finalBuffer = await sharpImage.jpeg({ quality: opts.quality, progressive: false }).toBuffer();
          break;
        case "webp":
          finalBuffer = await sharpImage.webp({ quality: opts.quality }).toBuffer();
          break;
        case "avif":
          finalBuffer = await sharpImage.avif({ quality: opts.quality }).toBuffer();
          break;
        case "gif":
          if (!buffer.toString("ascii", 0, 3).includes("GIF")) {
            console.warn("save: Converting to GIF may not preserve quality. Consider using PNG.");
            finalBuffer = buffer;
          }
          break;
        default:
          break;
      }
    }

    const finalPath = path.join(opts.directory, filename);
    fs.writeFileSync(finalPath, finalBuffer);

    return {
      path: finalPath,
      filename,
      size: finalBuffer.length,
      format: opts.format,
    };
  } catch (error) {
    throw new Error(`save failed: ${getErrorMessage(error)}`);
  }
}

/**
 * Save many buffers with the same options; counter naming advances `session.saveCounter` each file.
 */
export async function saveImageBuffers(
  buffers: Buffer[],
  options: SaveOptions | undefined,
  session: SaveCounterSession
): Promise<SaveResult[]> {
  try {
    if (!Array.isArray(buffers) || buffers.length === 0) {
      throw new Error("saveMultiple: buffers must be a non-empty array.");
    }

    const results: SaveResult[] = [];
    const baseCounter = options?.counterStart ?? session.saveCounter;

    for (let i = 0; i < buffers.length; i++) {
      const bufferOptions: SaveOptions = {
        ...options,
        counterStart: baseCounter + i,
        naming: options?.naming === "counter" ? "counter" : options?.naming,
      };

      const result = await saveImageBuffer(buffers[i], bufferOptions, session);
      results.push(result);
    }

    return results;
  } catch (error) {
    throw new Error(`saveMultiple failed: ${getErrorMessage(error)}`);
  }
}
