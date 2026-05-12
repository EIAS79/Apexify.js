import { loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext, getErrorMessage } from "../utils/foundation/errorUtils";
import type { GIFInputFrame } from "../utils/canvasUtils";
import type { ComparisonChartOptions } from "../utils/chart/comparisonchart";
import type { ComboChartOptions } from "../utils/chart/combochart";
import { customLines } from "../utils/drawing/customLines";
import type { CanvasConfig, CreateImageOptions, CustomOptions, ImageProperties, TextProperties } from "../utils/types";
import type { PathCommand } from "../utils/foundation/pathCmd";
import type { CanvasCreator } from "./CanvasCreator";
import type { ImageCreator } from "./ImageCreator";
import type { TextCreator } from "./TextCreator";
import type { Path2DCreator, Path2DDrawOptions } from "./Path2DCreator";
import type { ChartCreator } from "./ChartCreator";

/**
 * Final {@link SceneCreator.render} output is always a PNG raster.
 * Encode to GIF/video with {@link ApexPainter.renderSceneToGIF} / {@link ApexPainter.renderSceneToVideoFrames}.
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
  /** Degrees, about the placement box center (after translate to x,y). */
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

/**
 * Video frame slot for {@link expandSceneVideoFrames} when building `createFromFrames.frames`.
 */
export type SceneVideoFrameSlot = string | Buffer | { source: string | Buffer; repeat?: number };

export function expandSceneGifFrames(frames: SceneGifInputFrame[]): GIFInputFrame[] {
  const out: GIFInputFrame[] = [];
  for (const raw of frames) {
    const { repeat, ...rest } = raw;
    const n = Math.max(1, Math.floor(repeat ?? 1));
    const base = { ...rest } as GIFInputFrame;
    for (let i = 0; i < n; i++) {
      out.push({ ...base });
    }
  }
  return out;
}

/**
 * Validates {@link SceneLayer} `customLines` the same way as {@link ApexPainter.createCustom}.
 */
function validateSceneCustomLinesOptions(opts: CustomOptions[]): void {
  if (opts.length === 0) {
    throw new Error("Scene customLines: at least one custom option is required.");
  }
  for (const opt of opts) {
    if (!opt.startCoordinates || typeof opt.startCoordinates.x !== "number" || typeof opt.startCoordinates.y !== "number") {
      throw new Error("Scene customLines: startCoordinates with valid x and y are required.");
    }
    if (!opt.endCoordinates || typeof opt.endCoordinates.x !== "number" || typeof opt.endCoordinates.y !== "number") {
      throw new Error("Scene customLines: endCoordinates with valid x and y are required.");
    }
  }
}

/**
 * Expands video frame slots into a flat list for {@link VideoCreationOptions.createFromFrames.frames}.
 */
export function expandSceneVideoFrames(slots: SceneVideoFrameSlot[]): (string | Buffer)[] {
  const out: (string | Buffer)[] = [];
  for (const s of slots) {
    if (typeof s === "string" || Buffer.isBuffer(s)) {
      out.push(s);
      continue;
    }
    const n = Math.max(1, Math.floor(s.repeat ?? 1));
    for (let i = 0; i < n; i++) {
      out.push(s.source);
    }
  }
  return out;
}

/**
 * One drawable item in paint order (bottom → top) for {@link SceneCreator.render}.
 *
 * Paint path uses internal helpers ({@link ImageCreator.paintImageLayersOntoContext}, etc.), not buffer-chaining
 * `createImage`/`createText`/`drawPath`.
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
      /** Multiplies context alpha when drawing the chart bitmap (default 1). */
      opacity?: number;
    }
  | {
      type: "chartComparison";
      options: ComparisonChartOptions;
      x: number;
      y: number;
      width?: number;
      height?: number;
      opacity?: number;
    }
  | {
      type: "chartCombo";
      options: ComboChartOptions;
      x: number;
      y: number;
      width?: number;
      height?: number;
      opacity?: number;
    }
  | {
      type: "customLines";
      /** Same shape as {@link ApexPainter.createCustom} — connectors / arrows / markers on the current canvas. */
      lines: CustomOptions | CustomOptions[];
    }
  | {
      type: "surface";
      placement: SceneSurfacePlacement;
      /** Mini-canvas background; sizes default to `placement` width/height. */
      background?: Omit<CanvasConfig, "width" | "height"> & Partial<Pick<CanvasConfig, "width" | "height">>;
      layers: SceneLayer[];
    };

export interface SceneRenderInput {
  width: number;
  height: number;
  /**
   * Root canvas config (same as {@link CanvasCreator.createCanvas}) merged with width/height.
   * Omitted fields use canvas defaults (opaque `#000` unless `transparentBase` or other base is set).
   */
  background?: Omit<CanvasConfig, "width" | "height"> & Partial<Pick<CanvasConfig, "width" | "height">>;
  layers: SceneLayer[];
}

export interface SceneCreatorDeps {
  canvasCreator: CanvasCreator;
  imageCreator: ImageCreator;
  textCreator: TextCreator;
  path2DCreator: Path2DCreator;
  chartCreator: ChartCreator;
}

function drawSurfaceOntoParent(
  ctx: SKRSContext2D,
  surfaceImage: Image,
  p: SceneSurfacePlacement
): void {
  const w = p.width;
  const h = p.height;
  ctx.save();
  ctx.globalAlpha = p.opacity ?? 1;
  if (p.globalCompositeOperation) {
    ctx.globalCompositeOperation = p.globalCompositeOperation;
  }
  ctx.translate(p.x + w / 2, p.y + h / 2);
  if (p.rotation) {
    ctx.rotate((p.rotation * Math.PI) / 180);
  }
  const sx = p.scaleX ?? 1;
  const sy = p.scaleY ?? 1;
  if (sx !== 1 || sy !== 1) {
    ctx.scale(sx, sy);
  }
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(surfaceImage, 0, 0, w, h);
  ctx.restore();
}

/**
 * Composes root and nested surfaces to one PNG using paint-onto-context (no buffer chain per layer).
 */
export class SceneCreator {
  constructor(private readonly deps: SceneCreatorDeps) {}

  /**
   * Paints an ordered list of layers onto an existing context for a surface of `size` pixels.
   */
  async paintLayersOntoContext(
    ctx: SKRSContext2D,
    layers: SceneLayer[],
    size: { width: number; height: number }
  ): Promise<void> {
    for (const layer of layers) {
      switch (layer.type) {
        case "image":
          await this.deps.imageCreator.paintImageLayersOntoContext(
            ctx,
            layer.images,
            size,
            layer.options
          );
          break;
        case "text":
          await this.deps.textCreator.renderTextsOntoContext(ctx, layer.texts);
          break;
        case "path":
          this.deps.path2DCreator.drawPathOntoContext(ctx, layer.path, size, layer.options);
          break;
        case "imageBuffer": {
          const img = await loadImage(layer.buffer);
          const dw = layer.width ?? img.width;
          const dh = layer.height ?? img.height;
          ctx.save();
          if (layer.globalCompositeOperation) {
            ctx.globalCompositeOperation = layer.globalCompositeOperation;
          }
          if (layer.globalAlpha !== undefined) {
            ctx.globalAlpha = layer.globalAlpha;
          }
          ctx.drawImage(img, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chart": {
          /** Chart renderers still emit PNG buffers internally; one decode to composite. */
          const chartBuf = await this.deps.chartCreator.createChart(
            layer.chartType as never,
            layer.data as never,
            layer.options as never
          );
          const chartImg = await loadImage(chartBuf);
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) {
            ctx.globalAlpha = layer.opacity;
          }
          ctx.drawImage(chartImg, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chartComparison": {
          const chartBuf = await this.deps.chartCreator.createComparisonChart(layer.options);
          const chartImg = await loadImage(chartBuf);
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) {
            ctx.globalAlpha = layer.opacity;
          }
          ctx.drawImage(chartImg, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chartCombo": {
          const chartBuf = await this.deps.chartCreator.createComboChart(layer.options);
          const chartImg = await loadImage(chartBuf);
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) {
            ctx.globalAlpha = layer.opacity;
          }
          ctx.drawImage(chartImg, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "customLines": {
          const list = Array.isArray(layer.lines) ? layer.lines : [layer.lines];
          validateSceneCustomLinesOptions(list);
          await customLines(ctx, list);
          break;
        }
        case "surface": {
          const buf = await this.renderSurface(layer);
          const surfImg = await loadImage(buf);
          drawSurfaceOntoParent(ctx, surfImg, layer.placement);
          break;
        }
        default: {
          const _exhaust: never = layer;
          void _exhaust;
        }
      }
    }
  }

  private async renderSurface(layer: Extract<SceneLayer, { type: "surface" }>): Promise<Buffer> {
    const { placement, background, layers: childLayers } = layer;
    const w = placement.width;
    const h = placement.height;
    const work: CanvasConfig = {
      width: w,
      height: h,
      ...(background ?? {}),
    };
    const { cv, width: rw, height: rh } = await this.deps.canvasCreator.composeCanvasForScene(work);
    const ctx = getCanvasContext(cv);
    await this.paintLayersOntoContext(ctx, childLayers, { width: rw, height: rh });
    return cv.toBuffer("image/png");
  }

  /**
   * Root scene → single PNG. Background uses {@link CanvasCreator.composeCanvasForScene} (no PNG encode/decode hop).
   */
  async render(input: SceneRenderInput): Promise<SceneRenderResult> {
    try {
      const { width, height, background, layers } = input;

      const rootWork: CanvasConfig = {
        width,
        height,
        ...(background ?? {}),
      };

      const { cv, width: w, height: h } = await this.deps.canvasCreator.composeCanvasForScene(rootWork);
      const ctx = getCanvasContext(cv);
      await this.paintLayersOntoContext(ctx, layers, { width: w, height: h });
      return cv.toBuffer("image/png");
    } catch (error) {
      throw new Error(`SceneCreator.render failed: ${getErrorMessage(error)}`);
    }
  }
}

/**
 * Mutable builder for incremental scene setup; call {@link SceneBuilder.render} once.
 */
export class SceneBuilder {
  private background?: SceneRenderInput["background"];
  private layers: SceneLayer[];

  constructor(
    private readonly sceneCreator: SceneCreator,
    readonly width: number,
    readonly height: number,
    initialLayers?: SceneLayer[]
  ) {
    this.layers = initialLayers ? [...initialLayers] : [];
  }

  setBackground(bg: NonNullable<SceneRenderInput["background"]>): this {
    this.background = bg;
    return this;
  }

  addLayer(layer: SceneLayer): this {
    this.layers.push(layer);
    return this;
  }

  async render(): Promise<SceneRenderResult> {
    return this.sceneCreator.render({
      width: this.width,
      height: this.height,
      background: this.background,
      layers: this.layers,
    });
  }
}
