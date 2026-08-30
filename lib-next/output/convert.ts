import sharp from "sharp";
import type { ResizeOptions as SharpResizeOptions } from "sharp";
import type { ResizeOptions } from "../types";
import { resolveMediaInput } from "../media/source";
import { ApexifyDecodeError, ApexifyInputError } from "../runtime/errors";

export async function resizingImg(options: ResizeOptions): Promise<Buffer> {
  const source = options?.imagePath;
  if (source === undefined || source === null || (typeof source === "string" && !source.trim())) {
    throw new ApexifyInputError("resizingImg: imagePath is required.");
  }
  if (Buffer.isBuffer(source) && source.length === 0) {
    throw new ApexifyInputError("resizingImg: image buffer is empty.");
  }

  try {
    const input = await resolveMediaInput(source, { kind: "image" });
    const resize: SharpResizeOptions = {
      width: options.size?.width ?? 500,
      height: options.size?.height ?? 500,
      fit: options.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    };
    return sharp(input).resize(resize).png({ quality: options.quality ?? 90 }).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError) throw cause;
    throw new ApexifyDecodeError("resizingImg: image could not be resized.", { cause });
  }
}

export async function converter(imageSource: string | Buffer, newExtension: string): Promise<Buffer> {
  type SharpOutputFormat = "jpeg" | "png" | "webp" | "tiff" | "gif" | "avif" | "heif" | "raw";
  const valid: readonly SharpOutputFormat[] = ["jpeg", "png", "webp", "tiff", "gif", "avif", "heif", "raw"];
  const format = newExtension?.toLowerCase() as SharpOutputFormat;
  if (!valid.includes(format)) {
    throw new ApexifyInputError(`converter: unsupported image format ${String(newExtension)}.`);
  }

  try {
    const input = await resolveMediaInput(imageSource, { kind: "image" });
    return sharp(input).toFormat(format).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError) throw cause;
    throw new ApexifyDecodeError("converter: image could not be converted.", { cause });
  }
}
