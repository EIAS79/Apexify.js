/**
 * Raster / stitch / color helpers for {@link ApexPainter#image} — one surface, no canvas instance state.
 */
import type { PathLike } from "fs";
import type { cropOptions, GradientConfig } from "../types/common";
import type { ImageFilter, MaskOptions, BlendOptions, ImageBlendLayer } from "../types/image";
import type { ResizeOptions } from "../types/video";
import type { StitchOptions, CollageLayout, CompressionOptions, PaletteOptions } from "../types/batch";
import { stitchImages, createCollage } from "../output/stitch";
import { compressImage, extractPalette } from "../output/compression";
import {
  resizingImg,
  converter,
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
import { validHex as assertValidHex } from "../core/color";
import { getErrorMessage } from "../core/errors";

function validateResizeOptions(options: ResizeOptions): void {
  if (!options || !options.imagePath) {
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

function validateConverterInputs(source: string, newExtension: string): void {
  if (!source) {
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

function validateEffectsInputs(source: string, filters: unknown[]): void {
  if (!source) {
    throw new Error("effects: source is required.");
  }
  if (!filters || !Array.isArray(filters) || filters.length === 0) {
    throw new Error("effects: filters array with at least one filter is required.");
  }
}

/** Grouped image / stitch / palette API: `await painter.image.stitchImages(…)`, `.resize`, … */
export interface PainterImageUtils {
  stitchImages(images: Array<string | Buffer>, options?: StitchOptions): Promise<Buffer>;
  createCollage(
    images: Array<{ source: string | Buffer; width?: number; height?: number }>,
    layout: CollageLayout
  ): Promise<Buffer>;
  compress(image: string | Buffer, options?: CompressionOptions): Promise<Buffer>;
  extractPalette(
    image: string | Buffer,
    options?: PaletteOptions
  ): Promise<Array<{ color: string; percentage: number }>>;
  resize(resizeOptions: ResizeOptions): Promise<Buffer>;
  imgConverter(source: string, newExtension: string): Promise<Buffer>;
  effects(source: string, filters: ImageFilter[]): Promise<Buffer>;
  colorsFilter(source: string, filterColor: string | GradientConfig, opacity?: number): Promise<Buffer>;
  colorAnalysis(source: string): Promise<{ color: string; frequency: string }[]>;
  colorsRemover(
    source: string,
    colorToRemove: { red: number; green: number; blue: number }
  ): Promise<Buffer | undefined>;
  removeBackground(imageURL: string, apiKey: string): Promise<Buffer | undefined>;
  blend(
    layers: ImageBlendLayer[],
    baseImageBuffer: Buffer,
    defaultBlendMode?: GlobalCompositeOperation
  ): Promise<Buffer>;
  cropImage(options: cropOptions): Promise<Buffer>;
  masking(
    source: string | Buffer | PathLike | Uint8Array,
    maskSource: string | Buffer | PathLike | Uint8Array,
    options?: MaskOptions
  ): Promise<Buffer>;
  gradientBlend(
    source: string | Buffer | PathLike | Uint8Array,
    options: BlendOptions
  ): Promise<Buffer>;
  validHex(hexColor: string): boolean;
}

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
      return await resizingImg(resizeOptions);
    } catch (error) {
      throw new Error(`resize failed: ${getErrorMessage(error)}`);
    }
  },

  async imgConverter(source, newExtension) {
    try {
      validateConverterInputs(source, newExtension);
      return await converter(source, newExtension);
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
