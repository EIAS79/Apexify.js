/**
 * Raster / stitch / color helpers for {@link ApexPainter#image} — one surface, no canvas instance state.
 */
import sharp from "sharp";
import type { PainterImageUtils, ResizeOptions } from "../types";
import { stitchImages, createCollage } from "../output/stitch";
import { compressImage, extractPalette } from "../output/compression";
import {
  applyColorFilters,
  imgEffects,
  detectColors,
  removeColor,
  bgRemoval,
} from "../core/general-functions";
import { blendImageLayers } from "./layer-blend";
import { cropRasterImage } from "./crop-raster";
import { applyRasterMask } from "./raster-masking";
import { blendGradientOverImage } from "./gradient-blend";
import { resolveRasterInput } from "./resolvable-image-source";
import { validHex as assertValidHex } from "../core/color";
import { getErrorMessage } from "../core/errors";

function validateResizeOptions(options: ResizeOptions): void {
  const src = options?.imagePath;
  if (
    src === undefined ||
    src === null ||
    (typeof src === "string" && !src.trim()) ||
    (Buffer.isBuffer(src) && src.length === 0)
  ) {
    throw new Error("resize: imagePath is required.");
  }
  if (options.size) {
    if (options.size.width !== undefined && (typeof options.size.width !== "number" || options.size.width <= 0)) {
      throw new Error("resize: size.width must be a positive number.");
    }
    if (options.size.height !== undefined && (typeof options.size.height !== "number" || options.size.height <= 0)) {
      throw new Error("resize: size.height must be a positive number.");
    }
  }
  if (
    options.quality !== undefined &&
    (typeof options.quality !== "number" || options.quality < 0 || options.quality > 100)
  ) {
    throw new Error("resize: quality must be a number between 0 and 100.");
  }
}

function validateConverterInputs(source: string | Buffer, newExtension: string): void {
  if (
    source === undefined ||
    source === null ||
    (typeof source === "string" && !source.trim()) ||
    (Buffer.isBuffer(source) && source.length === 0)
  ) {
    throw new Error("imgConverter: source is required.");
  }
  if (!newExtension) {
    throw new Error("imgConverter: newExtension is required.");
  }
  const validExtensions = ["jpeg", "png", "webp", "tiff", "gif", "avif", "heif", "raw", "pdf", "svg"];
  if (!validExtensions.includes(newExtension.toLowerCase())) {
    throw new Error(`imgConverter: Invalid extension. Supported: ${validExtensions.join(", ")}`);
  }
}

async function resizeResolved(options: ResizeOptions): Promise<Buffer> {
  const source = await resolveRasterInput(options.imagePath);
  const resizeOptions: sharp.ResizeOptions = {
    width: options.size?.width || 500,
    height: options.size?.height || 500,
    fit: options.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: true,
  };

  return sharp(source)
    .resize(resizeOptions)
    .png({ quality: options.quality ?? 90 })
    .toBuffer();
}

async function convertResolved(source: string | Buffer, newExtension: string): Promise<Buffer> {
  const resolved = await resolveRasterInput(source);
  return sharp(resolved)
    .toFormat(newExtension.toLowerCase() as keyof sharp.FormatEnum)
    .toBuffer();
}

function validateEffectsInputs(source: string, filters: unknown[]): void {
  if (!source) {
    throw new Error("effects: source is required.");
  }
  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    throw new Error("effects: filters array with at least one filter is required.");
  }
}

export type { PainterImageUtils } from "../types";

export const painterImageUtils: PainterImageUtils = {
  async stitchImages(images, options) {
    try {
      if (!images || images.length === 0) {
        throw new Error("stitchImages: images array is required");
      }
      return await stitchImages(images, options);
    } catch (error) {
      throw new Error(`stitchImages failed: ${getErrorMessage(error)}`);
    }
  },

  async createCollage(images, layout) {
    try {
      if (!images || images.length === 0) {
        throw new Error("createCollage: images array is required");
      }
      if (!layout) {
        throw new Error("createCollage: layout configuration is required");
      }
      return await createCollage(images, layout);
    } catch (error) {
      throw new Error(`createCollage failed: ${getErrorMessage(error)}`);
    }
  },

  async compress(image, options) {
    try {
      return await compressImage(image, options);
    } catch (error) {
      throw new Error(`compress failed: ${getErrorMessage(error)}`);
    }
  },

  async extractPalette(image, options) {
    try {
      return await extractPalette(image, options);
    } catch (error) {
      throw new Error(`extractPalette failed: ${getErrorMessage(error)}`);
    }
  },

  async resize(resizeOptions) {
    try {
      validateResizeOptions(resizeOptions);
      return await resizeResolved(resizeOptions);
    } catch (error) {
      throw new Error(`resize failed: ${getErrorMessage(error)}`);
    }
  },

  async imgConverter(source, newExtension) {
    try {
      validateConverterInputs(source, newExtension);
      return await convertResolved(source, newExtension);
    } catch (error) {
      throw new Error(`imgConverter failed: ${getErrorMessage(error)}`);
    }
  },

  async effects(source, filters) {
    try {
      validateEffectsInputs(source, filters);
      return await imgEffects(source, filters);
    } catch (error) {
      throw new Error(`effects failed: ${getErrorMessage(error)}`);
    }
  },

  async colorsFilter(source, filterColor, opacity = 1) {
    try {
      return await applyColorFilters(source, filterColor, opacity);
    } catch (error) {
      throw new Error(`colorsFilter failed: ${getErrorMessage(error)}`);
    }
  },

  async colorAnalysis(source) {
    try {
      return await detectColors(source);
    } catch (error) {
      throw new Error(`colorAnalysis failed: ${getErrorMessage(error)}`);
    }
  },

  async colorsRemover(source, colorToRemove) {
    try {
      return await removeColor(source, colorToRemove);
    } catch (error) {
      throw new Error(`colorsRemover failed: ${getErrorMessage(error)}`);
    }
  },

  async removeBackground(imageURL, apiKey) {
    try {
      return await bgRemoval(imageURL, apiKey);
    } catch (error) {
      throw new Error(`removeBackground failed: ${getErrorMessage(error)}`);
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
