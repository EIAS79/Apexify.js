import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import type { gradient } from "../../types";
import { paintChartCanvasBackground, type ChartAppearanceExtended } from "../helpers/chartBackground";
import {
  normalizeLegendPosition,
  applyLegendChartAreaInset,
  type LegendPlacement,
} from "../helpers/legendPlacement";
import { computeChartVerticalStack, resolveOuterPadding } from "../helpers/chartPadding";
import {
  calculateLegendDimensions,
  drawLegend,
  fillWithGradientOrColor,
  type LegendEntry,
  type EnhancedTextStyle,
  type LegendFitMode,
} from "./linechart";
import { layoutCartesianLegendBox } from "../helpers/cartesianLegendLayout";

function clampChartOpacity(raw?: number): number {
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return 1;
  return Math.min(1, Math.max(0, Number(raw)));
}

/** Distinct colors for any number of radar series (preset palette, then golden-angle HSL). */
function radarSeriesColor(index: number): string {
  const preset = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185", "#22d3ee", "#f97316", "#a3e635"];
  if (index < preset.length) return preset[index]!;
  const hue = Math.round((index * 137.508) % 360);
  const sat = 58 + (index % 5) * 3;
  const light = 52 + (index % 4);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/** One polygon series on the radar; pass **any number** of series — each is drawn on top with a distinct color. */
export interface RadarSeries {
  label: string;
  /** One value per axis/category (same length as `radar.categories`). */
  values: number[];
  color?: string;
  stroke?: string;
  gradient?: gradient;
  fillOpacity?: number;
  lineWidth?: number;
  /** Multiplier (0–1) for this series’ fill, stroke, and vertex dots. Overrides chart default when set. */
  opacity?: number;
}

export interface RadarChartOptions {
  dimensions?: {
    width?: number;
    height?: number;
    padding?: { top?: number; right?: number; bottom?: number; left?: number };
  };
  appearance?: ChartAppearanceExtended;
  radar?: {
    categories: string[];
    /** Domain ceiling (defaults to max value across series × 1.05). */
    maxValue?: number;
    /** Concentric grid rings (default from nice steps). */
    gridLevels?: number;
    /** Padding ratio outside outer labels (default 0.12). */
    labelMarginRatio?: number;
    /** Fill under polygon (default true). */
    fill?: boolean;
    /** Dot at each vertex (default false). */
    showPoints?: boolean;
    pointRadius?: number;
    gridColor?: string;
    gridWidth?: number;
    axisLabelFontSize?: number;
    axisLabelColor?: string;
    /** Default opacity (0–1) for all series’ polygons and dots; overridden per {@link RadarSeries.opacity}. */
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

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const frac = v / Math.pow(10, exp);
  let niceFrac = 10;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 5) niceFrac = 5;
  else niceFrac = 10;
  return niceFrac * Math.pow(10, exp);
}

export async function createRadarChart(
  seriesList: RadarSeries[],
  options: RadarChartOptions = {}
): Promise<Buffer> {
  const cats = options.radar?.categories;
  if (!cats || cats.length < 3) {
    throw new Error("radar.categories must have at least 3 entries");
  }
  const N = cats.length;
  for (const s of seriesList) {
    if (!s.values || s.values.length !== N) {
      throw new Error(`Radar series "${s.label}" must have ${N} values`);
    }
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

  let dataMax = 0;
  for (const s of seriesList) {
    for (const v of s.values) dataMax = Math.max(dataMax, v);
  }
  let maxV = options.radar?.maxValue ?? niceMax(dataMax * 1.05 || 1);
  if (maxV <= 0) maxV = 1;

  const gridLevels = Math.max(3, options.radar?.gridLevels ?? 5);
  const labelMarginRatio = options.radar?.labelMarginRatio ?? 0.12;
  const fillUnder = options.radar?.fill !== false;
  const showPoints = options.radar?.showPoints ?? false;
  const pointR = options.radar?.pointRadius ?? 4;
  const gridColor = options.radar?.gridColor ?? "rgba(148, 163, 184, 0.45)";
  const gridW = options.radar?.gridWidth ?? 1;
  const axisLabFs = options.radar?.axisLabelFontSize ?? 12;
  const axisLabCol = options.radar?.axisLabelColor ?? "#cbd5e1";

  const minLegendSpacing = 10;
  let legendWidth = 0;
  let legendHeight = 0;

  if (showLegend && seriesList.length > 0) {
    const entries =
      legendEntries ||
      seriesList.map((s, idx) => ({
        color: s.color || radarSeriesColor(idx),
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
  const R = (Math.min(cw, ch) / 2) * (1 - labelMarginRatio);

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${chartTitleFontSize}px Arial`;
    ctx.fillStyle = chartTitleColor;
    ctx.fillText(chartTitle, width / 2, padding.top + 10);
    ctx.restore();
  }

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = gridW;
  ctx.setLineDash([4, 4]);

  for (let g = 1; g <= gridLevels; g++) {
    const rr = (R * g) / gridLevels;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(ang), cy + R * Math.sin(ang));
    ctx.stroke();
  }

  ctx.font = `${axisLabFs}px Arial`;
  ctx.fillStyle = axisLabCol;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const labelR = R * (1 + labelMarginRatio * 0.85);
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
    const lx = cx + labelR * Math.cos(ang);
    const ly = cy + labelR * Math.sin(ang);
    ctx.fillText(cats[i], lx, ly);
  }

  const defaultSeriesOpacity = clampChartOpacity(options.radar?.opacity ?? 1);

  for (let si = 0; si < seriesList.length; si++) {
    const s = seriesList[si];
    const strokeCol = s.stroke || s.color || radarSeriesColor(si);
    const lw = s.lineWidth ?? 2;
    const fo = s.fillOpacity ?? 0.22;
    const serOp = clampChartOpacity(s.opacity ?? defaultSeriesOpacity);

    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const ii = i % N;
      const v = Math.max(0, s.values[ii] ?? 0);
      const t = Math.min(1, v / maxV);
      const ang = -Math.PI / 2 + (ii * 2 * Math.PI) / N;
      const rr = R * t;
      const px = cx + rr * Math.cos(ang);
      const py = cy + rr * Math.sin(ang);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();

    if (fillUnder) {
      ctx.save();
      if (s.gradient) {
        const bbox = { x: cx - R, y: cy - R, w: R * 2, h: R * 2 };
        fillWithGradientOrColor(ctx, s.gradient, strokeCol, strokeCol, bbox);
      } else {
        ctx.fillStyle = strokeCol;
      }
      ctx.globalAlpha = fo * serOp;
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = serOp;
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = lw;
    ctx.stroke();
    ctx.restore();

    if (showPoints) {
      ctx.save();
      ctx.globalAlpha = serOp;
      ctx.fillStyle = strokeCol;
      for (let i = 0; i < N; i++) {
        const v = Math.max(0, s.values[i] ?? 0);
        const t = Math.min(1, v / maxV);
        const ang = -Math.PI / 2 + (i * 2 * Math.PI) / N;
        const rr = R * t;
        const px = cx + rr * Math.cos(ang);
        const py = cy + rr * Math.sin(ang);
        ctx.beginPath();
        ctx.arc(px, py, pointR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  if (showLegend && legendWidth > 0 && legendHeight > 0) {
    const entries =
      legendEntries ||
      seriesList.map((s, idx) => ({
        color: s.color || radarSeriesColor(idx),
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

    const axisLabelHeight = 0;
    const originY = chartAreaBottom - axisLabelHeight;
    const yPlotTopInsetPx = Math.ceil(12 * 0.45 + 6);
    const axisEndY = chartAreaTop + yPlotTopInsetPx;
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
