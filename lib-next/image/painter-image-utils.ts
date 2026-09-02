/**
 * Raster / stitch / color helpers for {@link ApexPainter#image} — one surface, no canvas instance state.
 */
import sharp from "sharp";
import type { ResizeOptions as SharpResizeOptions, FormatEnum } from "sharp";
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
import { loadImageCached } from "./image-properties";
import { inspectImageSource } from "./image-source-validation";
import { validHex as assertValidHex } from "../core/color";
import { getErrorMessage } from "../core/errors";
import { ApexifyDecodeError, ApexifyError, ApexifyExternalServiceError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { assertFiniteNumericLeaves, assertSource } from "../runtime/validation";
import {
  validateBackgroundRemovalInputs,
  validateBlendInputs,
  validateCollageInputs,
  validateColorFilterInputs,
  validateColorRemovalInputs,
  validateCompressionInputs,
  validateConverterInputs,
  validateCropInputs,
  validateEffectsInputs,
  validateGradientBlendInputs,
  validateMaskInputs,
  validatePaletteInputs,
  validateResizeInputs,
  validateStitchInputs,
} from "./image-utils-validation";

async function preflightImageSource(source: string | Buffer): Promise<void> {
  await inspectImageSource(source, { label: "image source" });
}

async function preflightCanvasSource(source: string | Buffer): Promise<void> {
  const image = await loadImageCached(source);
  assertCanvasResourceLimits(image.width, image.height);
}

async function resizeResolved(options: ResizeOptions): Promise<Buffer> {
  const inspected = await inspectImageSource(options.imagePath, { label: "resize source" });
  const resizeOptions: SharpResizeOptions = {
    width: options.size?.width ?? 500,
    height: options.size?.height ?? 500,
    fit: options.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
    kernel: sharp.kernel.lanczos3,
    withoutEnlargement: true,
  };
  const pipeline = sharp(inspected.resolved).resize(resizeOptions);
  const quality = options.quality ?? 90;
  return options.outputFormat === "jpeg"
    ? pipeline.jpeg({ quality }).toBuffer()
    : pipeline.png({ quality }).toBuffer();
}

async function convertResolved(source: string | Buffer, newExtension: string): Promise<Buffer> {
  const inspected = await inspectImageSource(source, { label: "convert source" });
  return sharp(inspected.resolved).toFormat(newExtension.toLowerCase() as keyof FormatEnum).toBuffer();
}

function rethrowDecode(error: unknown, label: string): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyDecodeError(`${label} failed: ${getErrorMessage(error)}`, { cause: error });
}

export type { PainterImageUtils } from "../types";

export const painterImageUtils: PainterImageUtils = {
  async stitchImages(images, options) {
    validateStitchInputs(images, options);
    try {
      for (const image of images) await preflightImageSource(image);
      return await stitchImages(images, options);
    } catch (error) {
      rethrowDecode(error, "stitchImages");
    }
  },

  async createCollage(images, layout) {
    validateCollageInputs(images, layout);
    try {
      for (const image of images) await preflightImageSource(image.source);
      return await createCollage(images, layout);
    } catch (error) {
      rethrowDecode(error, "createCollage");
    }
  },

  async compress(image, options) {
    validateCompressionInputs(image, options);
    try {
      return await compressImage(image, options);
    } catch (error) {
      rethrowDecode(error, "compress");
    }
  },

  async extractPalette(image, options) {
    validatePaletteInputs(image, options);
    try {
      return await extractPalette(image, options);
    } catch (error) {
      rethrowDecode(error, "extractPalette");
    }
  },

  async resize(resizeOptions) {
    validateResizeInputs(resizeOptions);
    try {
      return await resizeResolved(resizeOptions);
    } catch (error) {
      rethrowDecode(error, "resize");
    }
  },

  async imgConverter(source, newExtension) {
    validateConverterInputs(source, newExtension);
    try {
      return await convertResolved(source, newExtension);
    } catch (error) {
      rethrowDecode(error, "imgConverter");
    }
  },

  async effects(source, filters) {
    validateEffectsInputs(source, filters);
    try {
      await preflightCanvasSource(source);
      return await imgEffects(source, filters);
    } catch (error) {
      rethrowDecode(error, "effects");
    }
  },

  async colorsFilter(source, filterColor, opacity = 1) {
    validateColorFilterInputs(source, opacity);
    assertFiniteNumericLeaves(filterColor, "image.colorsFilter.filterColor");
    try {
      await preflightCanvasSource(source);
      return await applyColorFilters(source, filterColor, opacity);
    } catch (error) {
      rethrowDecode(error, "colorsFilter");
    }
  },

  async colorAnalysis(source) {
    assertSource(source, "image.colorAnalysis.source");
    try {
      await preflightCanvasSource(source);
      return await detectColors(source);
    } catch (error) {
      rethrowDecode(error, "colorAnalysis");
    }
  },

  async colorsRemover(source, colorToRemove) {
    validateColorRemovalInputs(source, colorToRemove);
    try {
      await preflightCanvasSource(source);
      return await removeColor(source, colorToRemove);
    } catch (error) {
      rethrowDecode(error, "colorsRemover");
    }
  },

  async removeBackground(imageURL, apiKey) {
    validateBackgroundRemovalInputs(imageURL, apiKey);
    try {
      return await bgRemoval(imageURL, apiKey);
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyExternalServiceError(`removeBackground failed: ${getErrorMessage(error)}`, { cause: error });
    }
  },

  blend(layers, baseImageBuffer, defaultBlendMode = "source-over") {
    validateBlendInputs(layers, baseImageBuffer);
    try {
      return blendImageLayers(layers, baseImageBuffer, defaultBlendMode);
    } catch (error) {
      rethrowDecode(error, "blend");
    }
  },

  cropImage(options) {
    validateCropInputs(options);
    return cropRasterImage(options);
  },

  masking(source, maskSource, options = { type: "alpha" }) {
    validateMaskInputs(source, maskSource, options);
    return applyRasterMask(source, maskSource, options);
  },

  async gradientBlend(source, options) {
    validateGradientBlendInputs(source, options);
    try {
      await preflightCanvasSource(source as string | Buffer);
      return await blendGradientOverImage(source, options);
    } catch (error) {
      rethrowDecode(error, "gradientBlend");
    }
  },

  validHex(hexColor) {
    return assertValidHex(hexColor);
  },
};
