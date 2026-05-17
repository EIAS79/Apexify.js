import type { PathLike } from "fs";
import type { cropOptions, GradientConfig } from "./common";
import type { ImageFilter, MaskOptions, BlendOptions, ImageBlendLayer } from "./image";
import type { ResizeOptions } from "./video";
import type { StitchOptions, CollageLayout, CompressionOptions, PaletteOptions } from "./batch";

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
  imgConverter(source: string | Buffer, newExtension: string): Promise<Buffer>;
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
