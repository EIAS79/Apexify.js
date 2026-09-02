import { type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderResult,
  SceneSurfacePlacement,
  SceneCreatorDeps,
  SceneRenderOptions,
  CanvasConfig
} from "../types";
import { customLines } from "../path/custom-lines";
import { validateSceneCustomLinesOptions } from "./scene-normalizer";
import { validateSceneRenderInput } from "./scene-validation";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";
import { decodeImageSource } from "../image/image-source-validation";

function drawSurfaceOntoParent(
  ctx: SKRSContext2D,
  surfaceImage: Image,
  p: SceneSurfacePlacement
): void {
  const w = p.width;
  const h = p.height;
  ctx.save();
  ctx.globalAlpha = p.opacity ?? 1;
  if (p.globalCompositeOperation) ctx.globalCompositeOperation = p.globalCompositeOperation;
  ctx.translate(p.x + w / 2, p.y + h / 2);
  if (p.rotation) ctx.rotate((p.rotation * Math.PI) / 180);
  const sx = p.scaleX ?? 1;
  const sy = p.scaleY ?? 1;
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-w / 2, -h / 2);
  ctx.drawImage(surfaceImage, 0, 0, w, h);
  ctx.restore();
}

async function decodeSceneBuffer(buffer: Buffer, label: string): Promise<Image> {
  return decodeImageSource(buffer, { label, requireCanvasBudget: true });
}

/** Composes root and nested surfaces to one PNG using paint-onto-context. */
export class SceneCreator {
  constructor(private readonly deps: SceneCreatorDeps) {}

  async paintLayersOntoContext(
    ctx: SKRSContext2D,
    layers: SceneLayer[],
    size: { width: number; height: number }
  ): Promise<void> {
    for (const layer of layers) {
      switch (layer.type) {
        case "image":
          await this.deps.imageCreator.paintImageLayersOntoContext(ctx, layer.images, size, layer.options);
          break;
        case "text":
          await this.deps.textCreator.renderTextsOntoContext(ctx, layer.texts);
          break;
        case "path":
          this.deps.path2DCreator.drawPathOntoContext(ctx, layer.path, size, layer.options);
          break;
        case "imageBuffer": {
          const img = await decodeSceneBuffer(layer.buffer, "scene imageBuffer layer");
          const dw = layer.width ?? img.width;
          const dh = layer.height ?? img.height;
          ctx.save();
          if (layer.globalCompositeOperation) ctx.globalCompositeOperation = layer.globalCompositeOperation;
          if (layer.globalAlpha !== undefined) ctx.globalAlpha = layer.globalAlpha;
          ctx.drawImage(img, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chart": {
          const chartBuf = await this.deps.chartCreator.createChart(layer.chartType, layer.data, layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene chart layer");
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
          ctx.drawImage(chartImg, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chartComparison": {
          const chartBuf = await this.deps.chartCreator.createComparisonChart(layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene comparison chart layer");
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
          ctx.drawImage(chartImg, layer.x, layer.y, dw, dh);
          ctx.restore();
          break;
        }
        case "chartCombo": {
          const chartBuf = await this.deps.chartCreator.createComboChart(layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene combo chart layer");
          const dw = layer.width ?? chartImg.width;
          const dh = layer.height ?? chartImg.height;
          ctx.save();
          if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
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
          const surfImg = await decodeSceneBuffer(buf, "scene nested surface");
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
    const work: CanvasConfig = {
      width: placement.width,
      height: placement.height,
      ...(background ?? {}),
    };
    const { cv, width, height } = await this.deps.canvasCreator.composeCanvasForScene(work);
    const ctx = getCanvasContext(cv);
    await this.paintLayersOntoContext(ctx, childLayers, { width, height });
    return cv.toBuffer("image/png");
  }

  /**
   * Root scene → single PNG. Safety/resource validation is mandatory.
   * `options.validate` remains accepted for source compatibility but cannot disable safety limits.
   */
  async render(input: SceneRenderInput, options?: SceneRenderOptions): Promise<SceneRenderResult> {
    try {
      validateSceneRenderInput(input, { maxSurfaceDepth: options?.maxSurfaceDepth });
      const { width, height, background, layers } = input;
      const rootWork: CanvasConfig = { width, height, ...(background ?? {}) };
      const { cv, width: w, height: h } = await this.deps.canvasCreator.composeCanvasForScene(rootWork);
      const ctx = getCanvasContext(cv);
      await this.paintLayersOntoContext(ctx, layers, { width: w, height: h });
      return cv.toBuffer("image/png");
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("Scene rendering failed.", { cause: error });
    }
  }
}
