import { loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext, getErrorMessage } from "../core/errors";
import type { CanvasConfig } from "../types/canvas";
import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderResult,
  SceneSurfacePlacement,
  SceneCreatorDeps,
} from "../types/scene";
import { customLines } from "../path/custom-lines";
import { validateSceneCustomLinesOptions } from "./scene-normalizer";

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
          const chartBuf = await this.deps.chartCreator.createChart(
            layer.chartType,
            layer.data,
            layer.options
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
