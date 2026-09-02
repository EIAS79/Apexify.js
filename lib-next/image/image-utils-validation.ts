import type {
  BlendOptions,
  CollageLayout,
  CompressionOptions,
  ImageBlendLayer,
  ImageFilter,
  MaskOptions,
  PaletteOptions,
  ResizeOptions,
  StitchOptions,
  cropOptions,
} from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection,
  assertEnum,
  assertFiniteNumber,
  assertFiniteNumericLeaves,
  assertNonEmptyString,
  assertOpacity,
  assertOptionalEnum,
  assertOptionalFiniteNumber,
  assertRecord,
  assertSource,
} from "../runtime/validation";

export function validateStitchInputs(images: Array<string | Buffer>, options: StitchOptions = {}): void {
  assertCollection(images, "image.stitchImages.images", { min: 1, limit: "maxCollectionItems" });
  images.forEach((source, i) => assertSource(source, `image.stitchImages.images[${i}]`));
  assertRecord(options, "image.stitchImages.options");
  assertOptionalEnum(options.direction, "image.stitchImages.options.direction", ["horizontal", "vertical", "grid"] as const);
  assertOptionalFiniteNumber(options.overlap, "image.stitchImages.options.overlap", { min: 0 });
  assertOptionalFiniteNumber(options.spacing, "image.stitchImages.options.spacing", { min: 0 });
  if (options.blend !== undefined && typeof options.blend !== "boolean") {
    throw new ApexifyInputError("image.stitchImages.options.blend must be boolean.");
  }
}

export function validateCollageInputs(
  images: Array<{ source: string | Buffer; width?: number; height?: number }>,
  layout: CollageLayout
): void {
  assertCollection(images, "image.createCollage.images", { min: 1, limit: "maxCollectionItems" });
  images.forEach((item, i) => {
    assertRecord(item, `image.createCollage.images[${i}]`);
    assertSource(item.source, `image.createCollage.images[${i}].source`);
    assertOptionalFiniteNumber(item.width, `image.createCollage.images[${i}].width`, { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(item.height, `image.createCollage.images[${i}].height`, { min: 0, exclusiveMin: true, integer: true });
    if (item.width !== undefined) assertWithinLimit("maxCanvasDimension", item.width);
    if (item.height !== undefined) assertWithinLimit("maxCanvasDimension", item.height);
    if (item.width !== undefined && item.height !== undefined) assertCanvasResourceLimits(item.width, item.height);
  });
  assertRecord(layout, "image.createCollage.layout");
  assertEnum(layout.type, "image.createCollage.layout.type", ["grid", "masonry", "carousel", "custom"] as const);
  assertOptionalFiniteNumber(layout.columns, "image.createCollage.layout.columns", { min: 1, integer: true });
  assertOptionalFiniteNumber(layout.rows, "image.createCollage.layout.rows", { min: 1, integer: true });
  assertOptionalFiniteNumber(layout.spacing, "image.createCollage.layout.spacing", { min: 0 });
  assertOptionalFiniteNumber(layout.borderRadius, "image.createCollage.layout.borderRadius", { min: 0 });
  if (layout.background !== undefined) assertNonEmptyString(layout.background, "image.createCollage.layout.background", 512);
  if (layout.columns !== undefined && layout.rows !== undefined) {
    assertWithinLimit("maxCollectionItems", layout.columns * layout.rows);
  }
}

export function validateCompressionInputs(image: string | Buffer, options: CompressionOptions = {}): void {
  assertSource(image, "image.compress.source");
  assertRecord(options, "image.compress.options");
  assertOptionalFiniteNumber(options.quality, "image.compress.options.quality", { min: 1, max: 100, integer: true });
  assertOptionalEnum(options.format, "image.compress.options.format", ["jpeg", "webp", "avif"] as const);
  assertOptionalFiniteNumber(options.maxWidth, "image.compress.options.maxWidth", { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(options.maxHeight, "image.compress.options.maxHeight", { min: 0, exclusiveMin: true, integer: true });
  if (options.maxWidth !== undefined) assertWithinLimit("maxCanvasDimension", options.maxWidth);
  if (options.maxHeight !== undefined) assertWithinLimit("maxCanvasDimension", options.maxHeight);
  if (options.maxWidth !== undefined && options.maxHeight !== undefined) assertCanvasResourceLimits(options.maxWidth, options.maxHeight);
  if (options.progressive !== undefined && typeof options.progressive !== "boolean") {
    throw new ApexifyInputError("image.compress.options.progressive must be boolean.");
  }
}

export function validatePaletteInputs(image: string | Buffer, options: PaletteOptions = {}): void {
  assertSource(image, "image.extractPalette.source");
  assertRecord(options, "image.extractPalette.options");
  const count = options.count ?? 10;
  assertFiniteNumber(count, "image.extractPalette.options.count", { min: 1, integer: true });
  assertWithinLimit("maxCollectionItems", count);
  assertOptionalEnum(options.method, "image.extractPalette.options.method", ["kmeans", "median-cut", "octree"] as const);
  assertOptionalEnum(options.format, "image.extractPalette.options.format", ["hex", "rgb", "hsl"] as const);
}

export function validateResizeInputs(options: ResizeOptions): void {
  assertRecord(options, "image.resize.options");
  assertSource(options.imagePath, "image.resize.options.imagePath");
  if (options.size !== undefined) {
    assertRecord(options.size, "image.resize.options.size");
    assertOptionalFiniteNumber(options.size.width, "image.resize.options.size.width", { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(options.size.height, "image.resize.options.size.height", { min: 0, exclusiveMin: true, integer: true });
    const width = options.size.width ?? 500;
    const height = options.size.height ?? 500;
    assertCanvasResourceLimits(width, height);
  } else {
    assertCanvasResourceLimits(500, 500);
  }
  assertOptionalFiniteNumber(options.quality, "image.resize.options.quality", { min: 0, max: 100 });
  if (options.maintainAspectRatio !== undefined && typeof options.maintainAspectRatio !== "boolean") {
    throw new ApexifyInputError("image.resize.options.maintainAspectRatio must be boolean.");
  }
}

export function validateConverterInputs(source: string | Buffer, newExtension: string): void {
  assertSource(source, "image.imgConverter.source");
  assertNonEmptyString(newExtension, "image.imgConverter.newExtension", 16);
  const extension = newExtension.toLowerCase();
  if (!["jpeg", "png", "webp", "tiff", "gif", "avif", "heif", "raw", "pdf", "svg"].includes(extension)) {
    throw new ApexifyInputError("image.imgConverter.newExtension is unsupported.");
  }
}

export function validateEffectsInputs(source: string, filters: ImageFilter[]): void {
  assertSource(source, "image.effects.source");
  assertCollection(filters, "image.effects.filters", { min: 1, limit: "maxFiltersPerOperation" });
  filters.forEach((filter, i) => {
    assertRecord(filter, `image.effects.filters[${i}]`);
    assertFiniteNumericLeaves(filter, `image.effects.filters[${i}]`);
  });
}

export function validateColorFilterInputs(source: string, opacity: number): void {
  assertSource(source, "image.colorsFilter.source");
  assertOpacity(opacity, "image.colorsFilter.opacity");
}

export function validateColorRemovalInputs(source: string, color: { red: number; green: number; blue: number }): void {
  assertSource(source, "image.colorsRemover.source");
  assertRecord(color, "image.colorsRemover.colorToRemove");
  assertFiniteNumber(color.red, "image.colorsRemover.colorToRemove.red", { min: 0, max: 255 });
  assertFiniteNumber(color.green, "image.colorsRemover.colorToRemove.green", { min: 0, max: 255 });
  assertFiniteNumber(color.blue, "image.colorsRemover.colorToRemove.blue", { min: 0, max: 255 });
}

export function validateBackgroundRemovalInputs(imageURL: string, apiKey: string): void {
  assertNonEmptyString(imageURL, "image.removeBackground.imageURL", 16_384);
  assertNonEmptyString(apiKey, "image.removeBackground.apiKey", 16_384);
}

export function validateBlendInputs(layers: ImageBlendLayer[], baseImageBuffer: Buffer): void {
  assertCollection(layers, "image.blend.layers", { min: 1, limit: "maxCollectionItems" });
  if (!Buffer.isBuffer(baseImageBuffer) || baseImageBuffer.length === 0) {
    throw new ApexifyInputError("image.blend.baseImageBuffer must be a non-empty Buffer.");
  }
  layers.forEach((layer, i) => {
    assertRecord(layer, `image.blend.layers[${i}]`);
    assertFiniteNumericLeaves(layer, `image.blend.layers[${i}]`);
  });
}

export function validateCropInputs(options: cropOptions): void {
  assertRecord(options, "image.cropImage.options");
  assertSource(options.imageSource, "image.cropImage.options.imageSource");
  assertCollection(options.coordinates, "image.cropImage.options.coordinates", { min: 3, limit: "maxCollectionItems" });
  options.coordinates.forEach((coordinate, i) => {
    assertRecord(coordinate, `image.cropImage.options.coordinates[${i}]`);
    assertRecord(coordinate.from, `image.cropImage.options.coordinates[${i}].from`);
    assertRecord(coordinate.to, `image.cropImage.options.coordinates[${i}].to`);
    assertFiniteNumber(coordinate.from.x, `image.cropImage.options.coordinates[${i}].from.x`);
    assertFiniteNumber(coordinate.from.y, `image.cropImage.options.coordinates[${i}].from.y`);
    assertFiniteNumber(coordinate.to.x, `image.cropImage.options.coordinates[${i}].to.x`);
    assertFiniteNumber(coordinate.to.y, `image.cropImage.options.coordinates[${i}].to.y`);
    assertOptionalFiniteNumber(coordinate.tension, `image.cropImage.options.coordinates[${i}].tension`);
  });
  assertEnum(options.crop, "image.cropImage.options.crop", ["inner", "outer"] as const);
  if (options.radius !== undefined && options.radius !== "circular") {
    assertFiniteNumber(options.radius, "image.cropImage.options.radius", { min: 0 });
  }
}

export function validateMaskInputs(source: unknown, maskSource: unknown, options: MaskOptions): void {
  assertSource(source, "image.masking.source");
  assertSource(maskSource, "image.masking.maskSource");
  assertRecord(options, "image.masking.options");
  assertOptionalEnum(options.type, "image.masking.options.type", ["alpha", "grayscale", "color"] as const);
  if (options.type === "color") assertNonEmptyString(options.colorKey, "image.masking.options.colorKey", 16);
  assertOptionalFiniteNumber(options.threshold, "image.masking.options.threshold", { min: 0, max: 255 });
  if (options.invert !== undefined && typeof options.invert !== "boolean") throw new ApexifyInputError("image.masking.options.invert must be boolean.");
}

export function validateGradientBlendInputs(source: unknown, options: BlendOptions): void {
  assertSource(source, "image.gradientBlend.source");
  assertRecord(options, "image.gradientBlend.options");
  assertFiniteNumericLeaves(options, "image.gradientBlend.options");
}
