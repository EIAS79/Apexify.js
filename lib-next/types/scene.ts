import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";
import type { CanvasConfig } from "./canvas";
import type { CreateImageOptions, ImageProperties } from "./image";
import type { TextProperties } from "./text";
import type { CustomOptions } from "./path";
import type { GIFInputFrame } from "./gif";
import type { PathCommand } from "./pathCommands";
import type { Path2DDrawOptions } from "./path2d-draw";
/**
 * Final scene render output is always a PNG raster.
 */
export type SceneRenderResult = Buffer;

/**
 * Where and how a nested {@link SceneLayer} of type `"surface"` is composited onto its parent.
 */
export interface SceneSurfacePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  globalCompositeOperation?: GlobalCompositeOperation;
}

export type SceneChartType =
  | "pie"
  | "bar"
  | "horizontalBar"
  | "line"
  | "scatter"
  | "radar"
  | "polarArea";

/** GIF frame with optional repeat expansion for scene helpers. */
export type SceneGifInputFrame = GIFInputFrame & { repeat?: number };

export type SceneVideoFrameSlot = string | Buffer | { source: string | Buffer; repeat?: number };

/**
 * One drawable item in paint order (bottom → top) for scene rendering.
 * Comparison / combo chart `options` are validated at runtime by chart creators.
 */
export type SceneLayer =
  | { type: "image"; images: ImageProperties | ImageProperties[]; options?: CreateImageOptions }
  | { type: "text"; texts: TextProperties | TextProperties[] }
  | { type: "path"; path: PathCommand[] | unknown; options?: Path2DDrawOptions }
  | {
      type: "imageBuffer";
      buffer: Buffer;
      x: number;
      y: number;
      width?: number;
      height?: number;
      globalAlpha?: number;
      globalCompositeOperation?: GlobalCompositeOperation;
    }
  | {
      type: "chart";
      chartType: SceneChartType;
      data: unknown;
      options?: unknown;
      x: number;
      y: number;
      width?: number;
      height?: number;
      opacity?: number;
    }
  | {
      type: "chartComparison";
      options: unknown;
      x: number;
      y: number;
      width?: number;
      height?: number;
      opacity?: number;
    }
  | {
      type: "chartCombo";
      options: unknown;
      x: number;
      y: number;
      width?: number;
      height?: number;
      opacity?: number;
    }
  | {
      type: "customLines";
      lines: CustomOptions | CustomOptions[];
    }
  | {
      type: "surface";
      placement: SceneSurfacePlacement;
      background?: Omit<CanvasConfig, "width" | "height"> & Partial<Pick<CanvasConfig, "width" | "height">>;
      layers: SceneLayer[];
    };

export interface SceneRenderInput {
  width: number;
  height: number;
  background?: Omit<CanvasConfig, "width" | "height"> & Partial<Pick<CanvasConfig, "width" | "height">>;
  layers: SceneLayer[];
}

/**
 * Optional flags for {@link SceneCreator.render}, {@link SceneBuilder.render}, and `SceneCreate.renderScene`.
 */
export interface SceneRenderOptions {
  /**
   * When true (default), validates dimensions and nested `surface` depth before allocating the root canvas.
   * Set `false` only for trusted hot paths.
   */
  validate?: boolean;
  /** Max nesting depth for `surface` layers during validation (default from validation util). */
  maxSurfaceDepth?: number;
  /**
   * When true, resolves **`$name`** / **`$palette.key`** in string leaves via {@link AssetManager} before painting.
   * {@link ApexPainter.renderScene} defaults this to **true**; {@link SceneBuilder.render} defaults to **false** (opt-in).
   */
  resolveAssetRefs?: boolean;
}

/**
 * Injectable services for {@link SceneCreator} / {@link SceneBuilder}.
 * Shapes match the ApexPainter service implementations; chart options stay `unknown` at the type level.
 */
export interface SceneCreatorDeps {
  canvasCreator: {
    composeCanvasForScene(canvas: CanvasConfig): Promise<{
      cv: Canvas;
      width: number;
      height: number;
    }>;
  };
  imageCreator: {
    paintImageLayersOntoContext(
      ctx: SKRSContext2D,
      images: ImageProperties | ImageProperties[],
      size: { width: number; height: number },
      options?: CreateImageOptions
    ): Promise<void>;
  };
  textCreator: {
    renderTextsOntoContext(ctx: SKRSContext2D, texts: TextProperties | TextProperties[]): Promise<void>;
  };
  path2DCreator: {
    drawPathOntoContext(
      ctx: SKRSContext2D,
      path: PathCommand[] | unknown,
      size: { width: number; height: number },
      options?: Path2DDrawOptions
    ): void;
  };
  chartCreator: {
    createChart(chartType: SceneChartType, data: unknown, options?: unknown): Promise<Buffer>;
    createComparisonChart(options: unknown): Promise<Buffer>;
    createComboChart(options: unknown): Promise<Buffer>;
  };
}

