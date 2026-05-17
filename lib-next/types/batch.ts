import type { CanvasConfig } from "./canvas";
import type { ImageProperties } from "./image";
import type { TextProperties } from "./text";
import type { PainterAssetRefsOptions } from "./painter-resolve";
import type { AssetResolveFn } from "./assets";

export interface BatchOperation {
  type: "canvas" | "image" | "text";
  config: unknown;
}

export interface ChainOperation {
  method: string;
  args: unknown[];
}

export interface StitchOptions {
  direction?: "horizontal" | "vertical" | "grid";
  overlap?: number;
  blend?: boolean;
  spacing?: number;
}

export interface CollageLayout {
  type: "grid" | "masonry" | "carousel" | "custom";
  columns?: number;
  rows?: number;
  spacing?: number;
  background?: string;
  borderRadius?: number;
}

export interface CompressionOptions {
  quality?: number;
  format?: "jpeg" | "webp" | "avif";
  maxWidth?: number;
  maxHeight?: number;
  progressive?: boolean;
}

export interface PaletteOptions {
  count?: number;
  method?: "kmeans" | "median-cut" | "octree";
  format?: "hex" | "rgb" | "hsl";
}

export interface BatchChainAssetOpts {
  resolveAssetRefs?: boolean;
  resolve?: AssetResolveFn;
}

/** Minimal painter surface for batch / chain helpers. */
export interface BatchChainPainter {
  createCanvas(config: CanvasConfig, painterOpts?: PainterAssetRefsOptions): Promise<{ buffer: Buffer }>;
  createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: unknown,
    options?: unknown,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer>;
  createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: unknown,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer>;
}
