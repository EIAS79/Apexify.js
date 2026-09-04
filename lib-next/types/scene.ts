import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";
import type { CanvasConfig } from "./canvas";
import type { CreateImageOptions, ImageProperties } from "./image";
import type { TextProperties } from "./text";
import type { CustomOptions } from "./path";
import type { GIFInputFrame } from "./gif";
import type { PathCommand } from "./pathCommands";
import type { Path2DDrawOptions } from "./path2d-draw";

export type SceneRenderResult = Buffer;
export type SceneBackground = Omit<CanvasConfig, "width" | "height">;

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

export type SceneGifInputFrame = GIFInputFrame & { repeat?: number };
export type SceneVideoFrameSlot = string | Buffer | { source: string | Buffer; repeat?: number };

/** One drawable item in deterministic paint order (array index 0 is bottom, final index is top). */
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
  | { type: "customLines"; lines: CustomOptions | CustomOptions[] }
  | {
      type: "surface";
      placement: SceneSurfacePlacement;
      /** Child background paint only; dimensions are always taken from `placement`. */
      background?: SceneBackground;
      /** Child layers are clipped to the child surface canvas before parent transforms/opacity are applied. */
      layers: SceneLayer[];
    };

export interface SceneRenderInput {
  width: number;
  height: number;
  /** Root paint configuration only; root dimensions are always `width`/`height`. */
  background?: SceneBackground;
  layers: SceneLayer[];
}

export interface SceneRenderOptions {
  /**
   * @deprecated Safety validation is mandatory and this option is ignored. It remains only for source compatibility.
   */
  validate?: boolean;
  /** Optional stricter surface depth cap. It may not exceed the configured runtime `maxSceneDepth`. */
  maxSurfaceDepth?: number;
  /** Resolve `$name`/`$value.path` asset tokens before painting. */
  resolveAssetRefs?: boolean;
}

export interface SceneCreatorDeps {
  canvasCreator: {
    composeCanvasForScene(canvas: CanvasConfig): Promise<{ cv: Canvas; width: number; height: number }>;
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
