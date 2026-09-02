import sharp from "sharp";
import type { MediaSource } from "../media/source";
import { resolveMediaInput } from "../media/source";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import {
  ApexifyDecodeError,
  ApexifyError,
  ApexifyInputError,
  ApexifyResourceLimitError,
} from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";

export interface DecodedImageDimensions {
  width: number;
  height: number;
}

/**
 * Resolve only far enough to inspect raster metadata and enforce decoded-image limits.
 * Direct byte sources are not mislabeled as remote-byte traffic; URL/path sources still
 * pass through the central media boundary. This runs before native canvas allocation or
 * a full @napi-rs/canvas decode.
 */
export async function inspectDecodedImageSource(
  source: MediaSource,
  options: { label?: string; requireCanvasBudget?: boolean } = {}
): Promise<DecodedImageDimensions> {
  const label = options.label ?? "image source";
  try {
    let resolved: string | Buffer;
    if (Buffer.isBuffer(source)) {
      if (source.length === 0) throw new ApexifyInputError(`${label} must not be empty.`);
      resolved = source;
    } else if (source instanceof Uint8Array) {
      if (source.byteLength === 0) throw new ApexifyInputError(`${label} must not be empty.`);
      resolved = Buffer.from(source);
    } else {
      resolved = await resolveMediaInput(source, { kind: "image" });
    }

    const metadata = await sharp(resolved).metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new ApexifyDecodeError(`${label} dimensions could not be determined.`);
    }

    const pixels = width * height;
    const maximum = getDefaultApexifyRuntimeConfig().limits.maxDecodedImagePixels;
    if (pixels > maximum) {
      throw new ApexifyResourceLimitError("maxDecodedImagePixels", maximum, pixels);
    }
    if (options.requireCanvasBudget) assertCanvasResourceLimits(width, height);
    return { width, height };
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError(`${label} could not be inspected safely.`, { cause: error });
  }
}
