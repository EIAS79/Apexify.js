import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";
import { paintChartCanvasBackground, type ChartAppearanceExtended } from "./chartBackground";
import {
  normalizeLegendPosition,
  applyLegendChartAreaInset,
  type LegendPlacement,
} from "./legendPlacement";
import { computeChartVerticalStack, resolveOuterPadding } from "./chartPadding";
import {
  calculateLegendDimensions,
  drawLegend,
  type LegendEntry,
  type EnhancedTextStyle,
  type LegendFitMode,
} from "./linechart";
import { layoutCartesianLegendBox } from "./cartesianLegendLayout";

function clampChartOpacity(raw?: number): number {
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return 1;
  return Math.min(1, Math.max(0, Number(raw)));
}

/** One segment of a polar area chart (equal angle per slice). */
export interface PolarAreaSlice {
  label: string;
  value: number;
  color?: string;
  gradient?: gradient;
  opacity?: number;
}

export interface PolarAreaChartOptions {
  dimensions?: {
    width?: number;
    height?: number;
    padding?: { top?: number; right?: number; bottom?: number; left?: number };
  };
  appearance?: ChartAppearanceExtended;
  /** Scale radius with `sqrt(value/max)` so slice **areas** feel proportional (default false = linear radius). */
  scale?: "radius" | "area";
  polar?: {
    /** Hole size like donut (0 = pie-like solid center). */
    innerRadiusRatio?: number;
    /** Padding outside slices for labels (ratio of radius, default 0.18). */
    labelBandRatio?: number;
    sliceStrokeWidth?: number;
    sliceStrokeColor?: string;
    /** Starting angle in degrees (default -90 = top). */
    startAngleDeg?: number;
    /** Multiplier (0–1) for all slice fills and strokes; multiplied with each slice’s {@link PolarAreaSlice.opacity}. */
    opacity?: number;
  };
  labels?: {
    title?: {
      text?: string;
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
    };
    /** Draw value label on slice (default false). */
    showValues?: boolean;
    valueFormat?: (value: number, fraction: number) => string;
    sliceLabelFontSize?: number;
    sliceLabelColor?: string;
  };
  legend?: {
    show?: boolean;
    entries?: LegendEntry[];
    position?: LegendPlacement | string;
    spacing?: number;
    fontSize?: number;
    backgroundColor?: string;
    backgroundGradient?: gradient;
    borderColor?: string;
    textColor?: string;
    textGradient?: gradient;
    textStyle?: EnhancedTextStyle;
    padding?: number;
    maxWidth?: number;
    wrapText?: boolean;
    fit?: LegendFitMode;
    minWidth?: number;
    width?: number;
  };
}

export async function createPolarAreaChart(
  slices: PolarAreaSlice[],
  options: PolarAreaChartOptions = {}
): Promise<Buffer> {
  if (!slices || slices.length === 0) {
    throw new Error("polar area chart requires at least one slice");
  }

  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  if (total <= 0) {
    throw new Error("polar area chart requires positive total value");
  }

  const width = options.dimensions?.width ?? 800;
  const height = options.dimensions?.height ?? 600;
  const padding = resolveOuterPadding(options.dimensions?.padding, width, height);

  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const chartTitleColor = options.labels?.title?.color ?? "#000000";

  const showLegend = options.legend?.show ?? true;
  const legendSpacing = options.legend?.spacing ?? 20;
  const legendEntries = options.legend?.entries;
  const legendPlacement = normalizeLegendPosition(options.legend?.position);

  const scaleMode = options.scale ?? "radius";
  const innerR = options.polar?.innerRadiusRatio ?? 0;
  const labelBand = options.polar?.labelBandRatio ?? 0.18;
  const sliceStrokeW = options.polar?.sliceStrokeWidth ?? 1;
  const sliceStrokeCol = options.polar?.sliceStrokeColor ?? "rgba(15, 23, 42, 0.35)";
  const startDeg = options.polar?.startAngleDeg ?? -90;
  const polarOpacityMul = clampChartOpacity(options.polar?.opacity ?? 1);

  const maxVal = Math.max(...slices.map((s) => s.value), 1e-9);

  const minLegendSpacing = 10;
  let legendWidth = 0;
  let legendHeight = 0;

  if (showLegend) {
    const entries =
      legendEntries ||
      slices.map((s) => ({
        color: s.color || "#4A90E2",
        gradient: s.gradient,
        label: s.label,
      }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const ld = calculateLegendDimensions(
      entries,
      legendSpacing,
      legendFontSize,
      options.legend?.maxWidth,
      options.legend?.wrapText !== false,
      options.legend?.padding,
      options.legend?.fit ?? "content",
      options.legend?.width,
      options.legend?.minWidth ?? 48
    );
    legendWidth = ld.width;
    legendHeight = ld.height;
  }

  const vstack = computeChartVerticalStack({
    paddingTop: padding.top,
    width,
    height,
    chartTitle,
    chartTitleFontSize,
    legendSpacing,
    showLegend: !!(showLegend && legendWidth > 0 && legendHeight > 0),
    legendPlacement,
    legendWidth,
    legendHeight,
    minLegendInsetFloor: minLegendSpacing,
  });

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as SKRSContext2D;

  await paintChartCanvasBackground(ctx, canvas, width, height, options.appearance);

  let chartAreaLeft = padding.left;
  let chartAreaRight = width - padding.right;
  let chartAreaTop = vstack.chartAreaTopStart;
  let chartAreaBottom = height - padding.bottom;

  if (showLegend && legendWidth > 0 && legendHeight > 0) {
    const inset = applyLegendChartAreaInset(
      legendPlacement,
      {
        chartAreaLeft,
        chartAreaRight,
        chartAreaTop,
        chartAreaBottom,
      },
      legendWidth,
      legendHeight,
      vstack.legendInsetGap,
      0
    );
    chartAreaLeft = inset.chartAreaLeft;
    chartAreaRight = inset.chartAreaRight;
    chartAreaTop = inset.chartAreaTop;
    chartAreaBottom = inset.chartAreaBottom;
  }

  const cw = chartAreaRight - chartAreaLeft;
  const ch = chartAreaBottom - chartAreaTop;
  const cx = chartAreaLeft + cw / 2;
  const cy = chartAreaTop + ch / 2;
  const R = (Math.min(cw, ch) / 2) * (1 - labelBand);
  const rInner = R * Math.min(0.85, Math.max(0, innerR));

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${chartTitleFontSize}px Arial`;
    ctx.fillStyle = chartTitleColor;
    ctx.fillText(chartTitle, width / 2, padding.top + 10);
    ctx.restore();
  }

  const defaultColors = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185"];

  let angle = (startDeg * Math.PI) / 180;
  const sliceAngle = (2 * Math.PI) / slices.length;

  for (let i = 0; i < slices.length; i++) {
    const sl = slices[i];
    const frac = sl.value / maxVal;
    let r = R * frac;
    if (scaleMode === "area") {
      r = R * Math.sqrt(frac);
    }
    r = Math.max(r, 2);

    const c = sl.color || defaultColors[i % defaultColors.length];

    const a0 = angle;
    const a1 = angle + sliceAngle;
    ctx.beginPath();
    if (rInner <= 0.5) {
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
    } else {
      ctx.moveTo(cx + Math.cos(a0) * rInner, cy + Math.sin(a0) * rInner);
      ctx.lineTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.lineTo(cx + Math.cos(a1) * rInner, cy + Math.sin(a1) * rInner);
      ctx.arc(cx, cy, rInner, a1, a0, true);
      ctx.closePath();
    }

    ctx.save();
    if (sl.gradient) {
      ctx.fillStyle = createGradientFill(ctx, sl.gradient, {
        x: cx - r,
        y: cy - r,
        w: r * 2,
        h: r * 2,
      }) as CanvasGradient;
    } else {
      ctx.fillStyle = c;
    }
    const sliceOp = polarOpacityMul * clampChartOpacity(sl.opacity ?? 1);
    ctx.globalAlpha = sliceOp;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sliceStrokeW > 0) {
      ctx.globalAlpha = sliceOp;
      ctx.strokeStyle = sliceStrokeCol;
      ctx.lineWidth = sliceStrokeW;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (options.labels?.showValues) {
      const mid = angle + sliceAngle / 2;
      const tr = (r + rInner) / 2;
      const tx = cx + tr * 0.65 * Math.cos(mid);
      const ty = cy + tr * 0.65 * Math.sin(mid);
      const fmt = options.labels?.valueFormat ?? ((v) => String(Math.round(v * 100) / 100));
      const txt = fmt(sl.value, sl.value / total);
      ctx.save();
      ctx.font = `${options.labels?.sliceLabelFontSize ?? 12}px Arial`;
      ctx.fillStyle = options.labels?.sliceLabelColor ?? "#f8fafc";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(txt, tx, ty);
      ctx.restore();
    }

    angle += sliceAngle;
  }

  if (showLegend && legendWidth > 0 && legendHeight > 0) {
    const entries =
      legendEntries ||
      slices.map((s) => ({
        color: s.color || "#4A90E2",
        gradient: s.gradient,
        label: s.label,
      }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const ld = calculateLegendDimensions(
      entries,
      legendSpacing,
      legendFontSize,
      options.legend?.maxWidth,
      options.legend?.wrapText !== false,
      options.legend?.padding,
      options.legend?.fit ?? "content",
      options.legend?.width,
      options.legend?.minWidth ?? 48
    );

    const originY = chartAreaBottom;
    const axisEndY = chartAreaTop + 20;
    const originX = chartAreaLeft + 80;
    const axisEndX = chartAreaRight - 24;

    const { legendX, legendY } = layoutCartesianLegendBox({
      legendPlacement,
      width,
      height,
      paddingLeft: padding.left,
      paddingRight: padding.right,
      paddingBottom: padding.bottom,
      legendWidth: ld.width,
      legendHeight: ld.height,
      minLegendSpacing,
      chartAreaTopStart: vstack.chartAreaTopStart,
      legendCornerTopY: vstack.legendCornerTopY,
      originX,
      axisEndX,
      originY,
      axisEndY,
      xAxisLabel: undefined,
      tickFontSize: 12,
    });

    await drawLegend(
      ctx,
      legendX,
      legendY,
      entries,
      legendSpacing,
      legendFontSize,
      options.legend?.backgroundColor,
      options.legend?.borderColor,
      options.legend?.textColor,
      options.legend?.padding,
      options.legend?.maxWidth,
      options.legend?.wrapText !== false,
      options.legend?.backgroundGradient,
      options.legend?.textGradient,
      options.legend?.textStyle,
      ld.width,
      ld.height
    );
  }

  const frameAppearance = options.appearance;
  const frameW = frameAppearance?.borderWidth;
  const frameColor = frameAppearance?.borderColor;
  const frameR = frameAppearance?.borderRadius;
  if (frameW != null && frameW > 0 && frameColor) {
    ctx.save();
    ctx.strokeStyle = frameColor;
    ctx.lineWidth = frameW;
    const inset = frameW / 2;
    const fw = width - frameW;
    const fh = height - frameW;
    ctx.beginPath();
    if (frameR != null && frameR > 0) {
      const r = Math.min(frameR, fw / 2, fh / 2);
      ctx.roundRect(inset, inset, fw, fh, r);
    } else {
      ctx.rect(inset, inset, fw, fh);
    }
    ctx.stroke();
    ctx.restore();
  }

  return canvas.toBuffer("image/png");
}
