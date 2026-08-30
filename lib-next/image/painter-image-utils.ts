/** Raster / stitch / color helpers for ApexPainter.image. */
import sharp from "sharp";
import type { ResizeOptions as SharpResizeOptions, FormatEnum } from "sharp";
import type { PainterImageUtils, ResizeOptions } from "../types";
import type { ApexifyRuntime } from "../runtime/context";
import { defaultApexifyRuntime } from "../runtime/context";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { stitchImages, createCollage } from "../output/stitch";
import { compressImage, extractPalette } from "../output/compression";
import {
  applyColorFilters,
  applyImageEffects,
  detectColors,
  removeColor,
  removeBackgroundViaService,
} from "./raster-utilities";
import { blendImageLayers } from "./layer-blend";
import { cropRasterImage } from "./crop-raster";
import { applyRasterMask } from "./raster-masking";
import { blendGradientOverImage } from "./gradient-blend";
import { resolveImageInput } from "../media/source";
import { validHex as assertValidHex } from "../core/color";

function validateResizeOptions(options: ResizeOptions): void {
  const src = options?.imagePath;
  if (
    src === undefined ||
    src === null ||
    (typeof src === "string" && !src.trim()) ||
    (Buffer.isBuffer(src) && src.length === 0)
  ) {
    throw new ApexifyInputError("resize: imagePath is required.");
  }
  if (options.size) {
    if (options.size.width !== undefined && (!Number.isFinite(options.size.width) || options.size.width <= 0)) {
      throw new ApexifyInputError("resize: size.width must be a finite positive number.");
    }
    if (options.size.height !== undefined && (!Number.isFinite(options.size.height) || options.size.height <= 0)) {
      throw new ApexifyInputError("resize: size.height must be a finite positive number.");
    }
  }
  if (
    options.quality !== undefined &&
    (!Number.isFinite(options.quality) || options.quality < 0 || options.quality > 100)
  ) {
    throw new ApexifyInputError("resize: quality must be a number between 0 and 100.");
  }
}

function validateConverterInputs(source: string | Buffer, newExtension: string): void {
  if (
    source === undefined ||
    source === null ||
    (typeof source === "string" && !source.trim()) ||
    (Buffer.isBuffer(source) && source.length === 0)
  ) {
    throw new ApexifyInputError("imgConverter: source is required.");
  }
  if (!newExtension) throw new ApexifyInputError("imgConverter: newExtension is required.");
  const validExtensions = ["jpeg", "png", "webp", "tiff", "gif", "avif", "heif", "raw"];
  if (!validExtensions.includes(newExtension.toLowerCase())) {
    throw new ApexifyInputError(`imgConverter: invalid extension. Supported: ${validExtensions.join(", ")}`);
  }
}

async function resizeResolved(
  options: ResizeOptions,
  runtime: ApexifyRuntime
): Promise<Buffer> {
  const source = await resolveImageInput(options.imagePath, runtime);
  const resizeOptions: SharpResizeOptions = {
    width: options.size?.width ?? 500,
    height: options.size?.height ?? 500,
    fit: options.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: true,
  };

  return sharp(source)
    .resize(resizeOptions)
    .png({ quality: options.quality ?? 90 })
    .toBuffer();
}

async function convertResolved(
  source: string | Buffer,
  newExtension: string,
  runtime: ApexifyRuntime
): Promise<Buffer> {
  const resolved = await resolveImageInput(source, runtime);
  return sharp(resolved)
    .toFormat(newExtension.toLowerCase() as keyof FormatEnum)
    .toBuffer();
}

function operationError(operation: string, error: unknown): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyError(`${operation} failed.`, { cause: error, details: { operation } });
}

export type { PainterImageUtils } from "../types";

export function createPainterImageUtils(
  runtime: ApexifyRuntime = defaultApexifyRuntime
): PainterImageUtils {
  return {
    async stitchImages(images, options) {
      try {
        if (!images || images.length === 0) throw new ApexifyInputError("stitchImages: images array is required.");
        return await stitchImages(images, options);
      } catch (error) {
        return operationError("stitchImages", error);
      }
    },

    async createCollage(images, layout) {
      try {
        if (!images || images.length === 0) throw new ApexifyInputError("createCollage: images array is required.");
        if (!layout) throw new ApexifyInputError("createCollage: layout configuration is required.");
        return await createCollage(images, layout);
      } catch (error) {
        return operationError("createCollage", error);
      }
    },

    async compress(image, options) {
      try {
        return await compressImage(image, options, runtime);
      } catch (error) {
        return operationError("compress", error);
      }
    },

    async extractPalette(image, options) {
      try {
        return await extractPalette(image, options, runtime);
      } catch (error) {
        return operationError("extractPalette", error);
      }
    },

    async resize(resizeOptions) {
      try {
        validateResizeOptions(resizeOptions);
        return await resizeResolved(resizeOptions, runtime);
      } catch (error) {
        return operationError("resize", error);
      }
    },

    async imgConverter(source, newExtension) {
      try {
        validateConverterInputs(source, newExtension);
        return await convertResolved(source, newExtension, runtime);
      } catch (error) {
        return operationError("imgConverter", error);
      }
    },

    async effects(source, filters) {
      try {
        return await applyImageEffects(source, filters, runtime);
      } catch (error) {
        return operationError("effects", error);
      }
    },

    async colorsFilter(source, filterColor, opacity = 1) {
      try {
        return await applyColorFilters(source, filterColor, opacity, runtime);
      } catch (error) {
        return operationError("colorsFilter", error);
      }
    },

    async colorAnalysis(source) {
      try {
        return await detectColors(source, runtime);
      } catch (error) {
        return operationError("colorAnalysis", error);
      }
    },

    async colorsRemover(source, colorToRemove) {
      try {
        return await removeColor(source, colorToRemove, runtime);
      } catch (error) {
        return operationError("colorsRemover", error);
      }
    },

    async removeBackground(imageURL, apiKey) {
      try {
        return await removeBackgroundViaService(imageURL, apiKey, runtime);
      } catch (error) {
        return operationError("removeBackground", error);
      }
    },

    blend(layers, baseImageBuffer, defaultBlendMode = "source-over") {
      return blendImageLayers(layers, baseImageBuffer, defaultBlendMode);
    },

    cropImage(options) {
      return cropRasterImage(options);
    },

    masking(source, maskSource, options = { type: "alpha" }) {
      return applyRasterMask(source, maskSource, options);
    },

    gradientBlend(source, options) {
      return blendGradientOverImage(source, options);
    },

    validHex(hexColor) {
      return assertValidHex(hexColor);
    },
  };
}

/** Compatibility singleton for direct internal imports; ApexPainter uses a runtime-bound instance. */
export const painterImageUtils: PainterImageUtils = createPainterImageUtils(defaultApexifyRuntime);
