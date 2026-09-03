import { emitDiagnostic } from "../../runtime/diagnostics";
import { Canvas, createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { loadImageCached } from "../../image/image-properties";
import type { CanvasConfig, gradient } from "../../types";
import type { ChartAppearanceExtended } from "../../types";
import { createGradientFill } from "../../render/gradient-fill";
import { applyContextImageFilters } from "../../render/context-image-filters";
import { ApexifyError } from "../../runtime/errors";
import {
  customBackground,
  drawBackgroundLayers,
  applyNoise,
} from "../../canvas/background-renderer";
import { EnhancedPatternRenderer } from "../../canvas/pattern-renderer";

export type { ChartAppearanceExtended };

function fillWithGradientOrColor(
  ctx: SKRSContext2D,
  grad?: gradient,
  color?: string,
  defaultColor: string = "#FFFFFF",
  rect?: { x: number; y: number; w: number; h: number }
): void {
  if (grad && rect) {
    ctx.fillStyle = createGradientFill(ctx, grad, rect);
  } else {
    ctx.fillStyle = color ?? defaultColor;
  }
}

/** Paint a chart background without ever filtering or re-rendering target content. */
export async function paintChartCanvasBackground(
  ctx: SKRSContext2D,
  _canvas: Canvas,
  width: number,
  height: number,
  appearance: ChartAppearanceExtended | undefined
): Promise<void> {
  const a = appearance ?? {};
  const rect = { x: 0, y: 0, w: width, h: height };

  if (a.customBg) {
    const cfg: CanvasConfig = { width, height, customBg: a.customBg, blur: a.blur };
    const needsIsolatedPass = Boolean(a.customBg.filters?.length) || (a.customBg.opacity ?? 1) !== 1;
    if (needsIsolatedPass) {
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext("2d") as SKRSContext2D;
      await customBackground(tempCtx, cfg);
      if (a.customBg.filters?.length) {
        await applyContextImageFilters(tempCtx, a.customBg.filters, width, height);
      }
      ctx.save();
      ctx.globalAlpha = a.customBg.opacity ?? 1;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.restore();
    } else {
      await customBackground(ctx, cfg);
    }
  } else if (a.backgroundImage) {
    try {
      const bgImage = await loadImageCached(a.backgroundImage);
      ctx.drawImage(bgImage, 0, 0, width, height);
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      emitDiagnostic({ level: "warn", code: "APEXIFY_CHARTBACKGROUND_WARN", message: "Chart background image failed; using configured color/gradient fallback." });
      fillWithGradientOrColor(ctx, a.backgroundGradient, a.backgroundColor ?? "#FFFFFF", "#FFFFFF", rect);
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    fillWithGradientOrColor(ctx, a.backgroundGradient, a.backgroundColor ?? "#FFFFFF", "#FFFFFF", rect);
    ctx.fillRect(0, 0, width, height);
  }

  if (a.bgLayers?.length) {
    await drawBackgroundLayers(ctx, { width, height, bgLayers: a.bgLayers } as CanvasConfig);
  }
  if (a.patternBg) await EnhancedPatternRenderer.renderPattern(ctx, { width, height }, a.patternBg);
  if (a.noiseBg) applyNoise(ctx, width, height, a.noiseBg.intensity ?? 0.05);
}
