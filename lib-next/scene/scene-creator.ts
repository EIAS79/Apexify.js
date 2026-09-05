import { type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderResult,
  SceneSurfacePlacement,
  SceneCreatorDeps,
  SceneRenderOptions,
  CanvasConfig,
} from "../types";
import { customLines } from "../path/custom-lines";
import { validateSceneCustomLinesOptions } from "./scene-normalizer";
import { validateSceneRenderInput } from "./scene-validation";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";
import { decodeImageSource } from "../image/image-source-validation";

function drawSurfaceOntoParent(
  ctx: SKRSContext2D,
  surface: Canvas | Image,
  placement: SceneSurfacePlacement
): void {
  const { width, height } = placement;
  ctx.save();
  try {
    ctx.globalAlpha = placement.opacity ?? 1;
    if (placement.globalCompositeOperation) ctx.globalCompositeOperation = placement.globalCompositeOperation;
    ctx.translate(placement.x + width / 2, placement.y + height / 2);
    if (placement.rotation) ctx.rotate((placement.rotation * Math.PI) / 180);
    const sx = placement.scaleX ?? 1;
    const sy = placement.scaleY ?? 1;
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.translate(-width / 2, -height / 2);
    ctx.drawImage(surface, 0, 0, width, height);
  } finally {
    ctx.restore();
  }
}

async function decodeSceneBuffer(buffer: Buffer, label: string): Promise<Image> {
  return decodeImageSource(buffer, { label, requireCanvasBudget: true });
}

/** Composes root and nested surfaces deterministically in array paint order. */
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
          try {
            if (layer.globalCompositeOperation) ctx.globalCompositeOperation = layer.globalCompositeOperation;
            if (layer.globalAlpha !== undefined) ctx.globalAlpha = layer.globalAlpha;
            ctx.drawImage(img, layer.x, layer.y, dw, dh);
          } finally {
            ctx.restore();
          }
          break;
        }
        case "chart": {
          const chartBuf = await this.deps.chartCreator.createChart(layer.chartType, layer.data, layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene chart layer");
          ctx.save();
          try {
            if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
            ctx.drawImage(chartImg, layer.x, layer.y, layer.width ?? chartImg.width, layer.height ?? chartImg.height);
          } finally {
            ctx.restore();
          }
          break;
        }
        case "chartComparison": {
          const chartBuf = await this.deps.chartCreator.createComparisonChart(layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene comparison chart layer");
          ctx.save();
          try {
            if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
            ctx.drawImage(chartImg, layer.x, layer.y, layer.width ?? chartImg.width, layer.height ?? chartImg.height);
          } finally {
            ctx.restore();
          }
          break;
        }
        case "chartCombo": {
          const chartBuf = await this.deps.chartCreator.createComboChart(layer.options);
          const chartImg = await decodeSceneBuffer(chartBuf, "scene combo chart layer");
          ctx.save();
          try {
            if (layer.opacity !== undefined) ctx.globalAlpha = layer.opacity;
            ctx.drawImage(chartImg, layer.x, layer.y, layer.width ?? chartImg.width, layer.height ?? chartImg.height);
          } finally {
            ctx.restore();
          }
          break;
        }
        case "customLines": {
          const list = Array.isArray(layer.lines) ? layer.lines : [layer.lines];
          validateSceneCustomLinesOptions(list);
          await customLines(ctx, list);
          break;
        }
        case "surface": {
          const surface = await this.renderSurface(layer);
          drawSurfaceOntoParent(ctx, surface, layer.placement);
          break;
        }
        default: {
          const exhaustive: never = layer;
          void exhaustive;
        }
      }
    }
  }

  /** Child surfaces remain canvases until direct parent compositing; no PNG encode/decode roundtrip. */
  private async renderSurface(layer: Extract<SceneLayer, { type: "surface" }>): Promise<Canvas> {
    const { placement, background, layers } = layer;
    const work: CanvasConfig = {
      ...(background ?? {}),
      width: placement.width,
      height: placement.height,
    };
    const { cv, width, height } = await this.deps.canvasCreator.composeCanvasForScene(work);
    const ctx = getCanvasContext(cv);
    await this.paintLayersOntoContext(ctx, layers, { width, height });
    return cv;
  }

  async render(input: SceneRenderInput, options?: SceneRenderOptions): Promise<SceneRenderResult> {
    try {
      validateSceneRenderInput(input, { maxSurfaceDepth: options?.maxSurfaceDepth });
      const { width, height, background, layers } = input;
      const rootWork: CanvasConfig = { ...(background ?? {}), width, height };
      const { cv, width: actualWidth, height: actualHeight } = await this.deps.canvasCreator.composeCanvasForScene(rootWork);
      const ctx = getCanvasContext(cv);
      await this.paintLayersOntoContext(ctx, layers, { width: actualWidth, height: actualHeight });
      return cv.toBuffer("image/png");
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("Scene rendering failed.", { cause: error });
    }
  }
}
