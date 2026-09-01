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
import { resolveMediaInput } from "../media/source";
import { validHex as assertValidHex } from "../core/color";
import { getErrorMessage } from "../core/errors";
import { ApexifyDecodeError, ApexifyError, ApexifyExternalServiceError } from "../runtime/errors";
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

async function resizeResolved(options: ResizeOptions): Promise<Buffer> {
  const source = await resolveMediaInput(options.imagePath, { kind: "image" });
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

async function convertResolved(source: string | Buffer, newExtension: string): Promise<Buffer> {
  const resolved = await resolveMediaInput(source, { kind: "image" });
  return sharp(resolved)
    .toFormat(newExtension.toLowerCase() as keyof FormatEnum)
    .toBuffer();
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
      return await stitchImages(images, options);
    } catch (error) {
      rethrowDecode(error, "stitchImages");
    }
  },

  async createCollage(images, layout) {
    validateCollageInputs(images, layout);
    try {
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
      return await imgEffects(source, filters);
    } catch (error) {
      rethrowDecode(error, "effects");
    }
  },

  async colorsFilter(source, filterColor, opacity = 1) {
    validateColorFilterInputs(source, opacity);
    assertFiniteNumericLeaves(filterColor, "image.colorsFilter.filterColor");
    try {
      return await applyColorFilters(source, filterColor, opacity);
    } catch (error) {
      rethrowDecode(error, "colorsFilter");
    }
  },

  async colorAnalysis(source) {
    assertSource(source, "image.colorAnalysis.source");
    try {
      return await detectColors(source);
    } catch (error) {
      rethrowDecode(error, "colorAnalysis");
    }
  },

  async colorsRemover(source, colorToRemove) {
    validateColorRemovalInputs(source, colorToRemove);
    try {
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

  gradientBlend(source, options) {
    validateGradientBlendInputs(source, options);
    return blendGradientOverImage(source, options);
  },

  validHex(hexColor) {
    return assertValidHex(hexColor);
  },
};
