import { Canvas, createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import type { BackgroundLayer, CanvasConfig, gradient, PatternOptions } from "../types";
import { createGradientFill } from "../image/imageProperties";
import { applyProfessionalImageFilters } from "../image/professionalImageFilters";
import { customBackground, drawBackgroundLayers, resolveMediaPath, applyNoise } from "../background/bg";
import { EnhancedPatternRenderer } from "../pattern/enhancedPatternRenderer";

function fillWithGradientOrColor(
  ctx: SKRSContext2D,
  grad?: gradient,
  color?: string,
  defaultColor: string = "#FFFFFF",
  rect?: { x: number; y: number; w: number; h: number }
): void {
  if (grad && rect) {
    ctx.fillStyle = createGradientFill(ctx, grad, rect) as CanvasGradient;
  } else {
    ctx.fillStyle = color || defaultColor;
  }
}

/**
 * Chart `appearance` background options aligned with {@link CanvasCreator.createCanvas}:
 * base fill (`customBg` | `backgroundImage` | gradient/color), then `bgLayers`, `patternBg`, `noiseBg`.
 */
export interface ChartAppearanceExtended {
  backgroundColor?: string;
  backgroundGradient?: gradient;
  /** Image path or URL; resolved with {@link resolveMediaPath}. */
  backgroundImage?: string;
  /** Same as `CanvasConfig.customBg` (fit, align, opacity, filters). */
  customBg?: CanvasConfig["customBg"];
  /** Stacked overlays after the base pass (same as `CanvasConfig.bgLayers`). */
  bgLayers?: BackgroundLayer[];
  patternBg?: PatternOptions;
  noiseBg?: { intensity?: number };
  /** Blur applied when painting `customBg` (same as `CanvasConfig.blur`). */
  blur?: number;
  axisColor?: string;
  axisWidth?: number;
  arrowSize?: number;
  /** Unused while line-chart Y-axis arrow is disabled. */
  yAxisArrowExtensionPastMaxTickPx?: number;
  /** Unused while line-chart Y-axis arrow is disabled. */
  yAxisArrowTipOffsetY?: number;
  /** Optional outer frame drawn on top of the chart (see line chart renderer). */
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

/**
 * Paints the full chart canvas background using the same building blocks as `CanvasCreator`
 * (custom image, gradient/color, layers, pattern overlay, noise).
 */
export async function paintChartCanvasBackground(
  ctx: SKRSContext2D,
  canvas: Canvas,
  width: number,
  height: number,
  appearance: ChartAppearanceExtended | undefined
): Promise<void> {
  const a = appearance ?? {};
  const rect = { x: 0, y: 0, w: width, h: height };

  if (a.customBg) {
    const cfg: CanvasConfig = {
      width,
      height,
      customBg: a.customBg,
      blur: a.blur,
    };
    await customBackground(ctx, cfg);

    if (a.customBg.filters && a.customBg.filters.length > 0) {
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext("2d") as SKRSContext2D;
      if (tempCtx) {
        tempCtx.drawImage(canvas, 0, 0);
        await applyProfessionalImageFilters(tempCtx, a.customBg.filters, width, height);
        ctx.clearRect(0, 0, width, height);
        ctx.globalAlpha = a.customBg.opacity ?? 1;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = 1;
      }
    } else if (a.customBg.opacity !== undefined && a.customBg.opacity !== 1) {
      ctx.globalAlpha = a.customBg.opacity;
      await customBackground(ctx, cfg);
      ctx.globalAlpha = 1;
    }
  } else if (a.backgroundImage) {
    try {
      const bgImage = await loadImage(resolveMediaPath(a.backgroundImage));
      ctx.drawImage(bgImage, 0, 0, width, height);
    } catch (error) {
      console.warn(`Failed to load chart background image: ${a.backgroundImage}`, error);
      fillWithGradientOrColor(ctx, a.backgroundGradient, a.backgroundColor ?? "#FFFFFF", "#FFFFFF", rect);
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    fillWithGradientOrColor(ctx, a.backgroundGradient, a.backgroundColor ?? "#FFFFFF", "#FFFFFF", rect);
    ctx.fillRect(0, 0, width, height);
  }

  if (a.bgLayers && a.bgLayers.length > 0) {
    await drawBackgroundLayers(ctx, {
      width,
      height,
      bgLayers: a.bgLayers,
    } as CanvasConfig);
  }

  if (a.patternBg) {
    await EnhancedPatternRenderer.renderPattern(ctx, { width, height }, a.patternBg);
  }

  if (a.noiseBg) {
    applyNoise(ctx, width, height, a.noiseBg.intensity ?? 0.05);
  }
}
