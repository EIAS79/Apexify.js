import sharp from "sharp";
import type { ResizeOptions as SharpResizeOptions, FormatEnum } from "sharp";
import type { ResizeOptions } from "../types";
import { inspectImageSource } from "../image/image-source-validation";
import { validateConverterInputs, validateResizeInputs } from "../image/image-utils-validation";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";

/**
 * Authoritative image resize helper shared by painter and video tooling.
 * Source resolution/decompression preflight is always performed before Sharp decode.
 */
export async function resizingImg(options: ResizeOptions): Promise<Buffer> {
  validateResizeInputs(options);
  try {
    const inspected = await inspectImageSource(options.imagePath, { label: "resize source" });
    const resize: SharpResizeOptions = {
      width: options.size?.width ?? 500,
      height: options.size?.height ?? 500,
      fit: options.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
      kernel: sharp.kernel.lanczos3,
    };
    const pipeline = sharp(inspected.resolved).rotate().resize(resize);
    const quality = options.quality ?? 90;
    return options.outputFormat === "jpeg"
      ? pipeline.jpeg({ quality }).toBuffer()
      : pipeline.png({ quality }).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("resizingImg: image could not be resized.", { cause });
  }
}

/** Authoritative still-image format conversion helper with image preflight. */
export async function converter(imageSource: string | Buffer, newExtension: string): Promise<Buffer> {
  validateConverterInputs(imageSource, newExtension);
  try {
    const inspected = await inspectImageSource(imageSource, { label: "convert source" });
    const normalized = newExtension.toLowerCase() === "jpg" ? "jpeg" : newExtension.toLowerCase();
    return sharp(inspected.resolved).rotate().toFormat(normalized as keyof FormatEnum).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("converter: image could not be converted.", { cause });
  }
}
