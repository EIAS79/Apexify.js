import type { CanvasConfig } from "./canvas";
import type { ImageProperties } from "./image";
import type { TextProperties } from "./text";
import type { PainterAssetRefsOptions } from "./painter-resolve";
import type { AssetResolveFn } from "./assets";

export type BatchOperation =
  | { type: "canvas"; config: CanvasConfig }
  | { type: "image"; config: ImageProperties | ImageProperties[] }
  | { type: "text"; config: TextProperties | TextProperties[] };

export interface ChainOperation {
  method: string;
  args: unknown[];
}

export interface StitchOptions {
  direction?: "horizontal" | "vertical" | "grid";
  /** Pixels shared by adjacent horizontal/vertical images. Grid mode rejects overlap. */
  overlap?: number;
  /** Draw the overlapping source once more with multiply/0.5 alpha. */
  blend?: boolean;
  spacing?: number;
}

export interface CollageLayout {
  /** `custom` was removed in Phase 10 because it had no positioning contract and rendered no images. */
  type: "grid" | "masonry" | "carousel";
  columns?: number;
  /** Minimum grid row count; extra rows are added when needed to avoid dropping inputs. */
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

/** Batch/chain execution policy. Results preserve input order; failures are fail-fast. */
export interface BatchChainAssetOpts {
  resolveAssetRefs?: boolean;
  resolve?: AssetResolveFn;
  /** Per-call concurrency, capped by runtime `limits.maxBatchConcurrency`. */
  concurrency?: number;
  /** Abort stops scheduling new batch work and prevents later chain steps. */
  signal?: AbortSignal;
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
