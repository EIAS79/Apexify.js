import type { cropOptions } from "../types/common";
import { cropInner, cropOuter } from "../core/general-functions";
import { getErrorMessage } from "../core/errors";

function validateCropOptions(options: cropOptions): void {
  if (!options) {
    throw new Error("cropImage: options object is required.");
  }
  if (!options.imageSource) {
    throw new Error("cropImage: imageSource is required.");
  }
  if (!options.coordinates || !Array.isArray(options.coordinates) || options.coordinates.length < 3) {
    throw new Error("cropImage: coordinates array with at least 3 points is required.");
  }
  if (options.crop !== "outer" && options.crop !== "inner") {
    throw new Error("cropImage: crop must be either 'inner' or 'outer'.");
  }
}

/** Polygon inner/outer crop (same behavior as legacy `ApexPainter.cropImage`). */
export async function cropRasterImage(options: cropOptions): Promise<Buffer> {
  try {
    validateCropOptions(options);
    if (options.crop === "outer") {
      return await cropOuter(options);
    }
    return await cropInner(options);
  } catch (error) {
    throw new Error(`cropImage failed: ${getErrorMessage(error)}`);
  }
}
