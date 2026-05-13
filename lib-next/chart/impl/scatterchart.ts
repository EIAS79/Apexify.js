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
  applyLineStyle,
  calculateLegendDimensions,
  drawLegend,
  drawGrid,
  generateCorrelationPoints,
  type AxisConfig,
  type CorrelationType,
  type LegendEntry,
  type EnhancedTextStyle,
  type LegendFitMode,
  type LineStyle,
} from "./linechart";
import { reserveBelowLineChartPlotBottom } from "../helpers/axisTitleLayout";
import { layoutCartesianLegendBox } from "../helpers/cartesianLegendLayout";

function clampChartOpacity(raw?: number): number {
  if (raw === undefined || raw === null || Number.isNaN(Number(raw))) return 1;
  return Math.min(1, Math.max(0, Number(raw)));
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

export type ScatterMarkerType = "circle" | "square" | "diamond" | "cross" | "none";

export interface ScatterSeries {
  label: string;
  data: ScatterPoint[];
  color?: string;
  gradient?: gradient;
  markerSize?: number;
  markerType?: ScatterMarkerType;
  /** Opacity for this series’ markers (0–1). Overrides {@link ScatterChartOptions.points.opacity}. */
  opacity?: number;
  /**
   * Optional regression / trend line over this series’ points (drawn under markers).
   * With `type: 'auto'`, Pearson |r| below {@link ScatterCorrelationConfig.flatThreshold} yields a **flat**
   * horizontal line at mean(Y) (weak linear association); otherwise a **linear** least-squares fit.
   */
  correlation?: ScatterCorrelationConfig;
}

/** Trend line options for {@link ScatterSeries.correlation}. */
export interface ScatterCorrelationConfig {
  show?: boolean;
  /**
   * `auto`: weak linear correlation → horizontal line at mean(y); else linear fit.
   * Other values match {@link CorrelationType} (same regression engine as line charts).
   */
  type?: "auto" | CorrelationType;
  /**
   * When `type` is `auto`, if Pearson |r| is below this value the trend is drawn **flat** at mean(y).
   * Default `0.15`.
   */
  flatThreshold?: number;
  color?: string;
  lineWidth?: number;
  lineStyle?: LineStyle;
  /** Polynomial degree when `type` is `'polynomial'`. */
  degree?: number;
}

export interface ScatterChartOptions {
  dimensions?: {
    width?: number;
    height?: number;
    padding?: { top?: number; right?: number; bottom?: number; left?: number };
  };
  appearance?: ChartAppearanceExtended;
  axes?: {
    x?: AxisConfig;
    y?: AxisConfig;
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
  grid?: {
    show?: boolean;
    color?: string;
    width?: number;
  };
  /** Default marker opacity (0–1) for all series; overridden per {@link ScatterSeries.opacity}. */
  points?: {
    opacity?: number;
  };
  /** Extra ratio applied when auto-ranging axes (default 0.06). */
  axisPaddingRatio?: number;
}

function collectBounds(series: ScatterSeries[]): {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
} {
  let xMin = Infinity;
  let xMax = -Infinity;
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of series) {
    for (const p of s.data) {
      xMin = Math.min(xMin, p.x);
      xMax = Math.max(xMax, p.x);
      yMin = Math.min(yMin, p.y);
      yMax = Math.max(yMax, p.y);
    }
  }
  if (!Number.isFinite(xMin)) {
    return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  }
  return { xMin, xMax, yMin, yMax };
}

function padRange(min: number, max: number, ratio: number): { min: number; max: number } {
  const span = max - min || 1;
  const pad = span * ratio;
  return { min: min - pad, max: max + pad };
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Pearson correlation coefficient in [-1, 1]; 0 if undefined / degenerate. */
function pearsonCorrelation(points: ScatterPoint[]): number {
  const n = points.length;
  if (n < 2) return 0;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    const dy = ys[i]! - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  if (sx <= 0 || sy <= 0) return 0;
  return num / Math.sqrt(sx * sy);
}

function mapScatterDataToCanvas(
  x: number,
  y: number,
  originX: number,
  originY: number,
  axisEndX: number,
  axisEndY: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): { cx: number; cy: number } {
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const cx = originX + ((x - xMin) / xSpan) * (axisEndX - originX);
  const cy = originY - ((y - yMin) / ySpan) * (originY - axisEndY);
  return { cx, cy };
}

function strokeScatterCorrelationCurve(
  ctx: SKRSContext2D,
  dataPts: { x: number; y: number }[],
  originX: number,
  originY: number,
  axisEndX: number,
  axisEndY: number,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number
): void {
  if (dataPts.length < 2) return;
  ctx.beginPath();
  const p0 = mapScatterDataToCanvas(dataPts[0]!.x, dataPts[0]!.y, originX, originY, axisEndX, axisEndY, xMin, xMax, yMin, yMax);
  ctx.moveTo(p0.cx, p0.cy);
  for (let i = 1; i < dataPts.length; i++) {
    const p = mapScatterDataToCanvas(dataPts[i]!.x, dataPts[i]!.y, originX, originY, axisEndX, axisEndY, xMin, xMax, yMin, yMax);
    ctx.lineTo(p.cx, p.cy);
  }
  ctx.stroke();
}

function drawScatterMarker(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  size: number,
  type: ScatterMarkerType,
  fillStyle: CanvasGradient | string
): void {
  ctx.save();
  ctx.fillStyle = fillStyle as string;
  ctx.strokeStyle = typeof fillStyle === "string" ? fillStyle : "#4A90E2";
  const r = Math.max(2, size / 2);
  switch (type) {
    case "none":
      break;
    case "square":
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      break;
    case "diamond":
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case "cross": {
      ctx.lineWidth = Math.max(1, r * 0.35);
      ctx.strokeStyle = typeof fillStyle === "string" ? fillStyle : "#4A90E2";
      ctx.beginPath();
      ctx.moveTo(cx - r, cy - r);
      ctx.lineTo(cx + r, cy + r);
      ctx.moveTo(cx + r, cy - r);
      ctx.lineTo(cx - r, cy + r);
      ctx.stroke();
      break;
    }
    case "circle":
    default:
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  ctx.restore();
}

export async function createScatterChart(
  series: ScatterSeries[],
  options: ScatterChartOptions = {}
): Promise<Buffer> {
  const width = options.dimensions?.width ?? 800;
  const height = options.dimensions?.height ?? 600;
  const padding = resolveOuterPadding(options.dimensions?.padding, width, height);
  const paddingTop = padding.top;
  const paddingRight = padding.right;
  const paddingBottom = padding.bottom;
  const paddingLeft = padding.left;

  const axisColor =
    options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? "#000000";
  const axisWidth =
    options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;

  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const chartTitleColor = options.labels?.title?.color ?? "#000000";

  const showLegend = options.legend?.show ?? true;
  const legendSpacing = options.legend?.spacing ?? 20;
  const legendEntries = options.legend?.entries;
  const legendPlacement = normalizeLegendPosition(options.legend?.position);

  const gridShow = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? "#E0E0E0";
  const gridWidth = options.grid?.width ?? 1;

  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const xAxisLabel = options.axes?.x?.label;
  const yAxisLabel = options.axes?.y?.label;
  const axisLabelFontSize = Math.max(tickFontSize + 2, 14);
  const axisLabelColor =
    options.axes?.x?.labelColor ?? options.axes?.y?.labelColor ?? axisColor;

  const padRatio = options.axisPaddingRatio ?? 0.06;
  const globalMarkerOpacity = options.points?.opacity;
  const bounds = collectBounds(series);
  let xMin = options.axes?.x?.range?.min ?? bounds.xMin;
  let xMax = options.axes?.x?.range?.max ?? bounds.xMax;
  let yMin = options.axes?.y?.range?.min ?? bounds.yMin;
  let yMax = options.axes?.y?.range?.max ?? bounds.yMax;

  if (options.axes?.x?.range?.min === undefined || options.axes?.x?.range?.max === undefined) {
    const px = padRange(bounds.xMin, bounds.xMax, padRatio);
    if (options.axes?.x?.range?.min === undefined) xMin = px.min;
    if (options.axes?.x?.range?.max === undefined) xMax = px.max;
  }
  if (options.axes?.y?.range?.min === undefined || options.axes?.y?.range?.max === undefined) {
    const py = padRange(bounds.yMin, bounds.yMax, padRatio);
    if (options.axes?.y?.range?.min === undefined) yMin = py.min;
    if (options.axes?.y?.range?.max === undefined) yMax = py.max;
  }

  const xStep =
    options.axes?.x?.range?.step ??
    (Math.ceil((xMax - xMin) / Math.max(8, Math.floor(width / 90))) || 1);
  const yStep =
    options.axes?.y?.range?.step ??
    (Math.ceil((yMax - yMin) / Math.max(6, Math.floor(height / 70))) || 1);

  const minLegendSpacing = 10;
  let legendWidth = 0;
  let legendHeight = 0;

  if (showLegend && series.length > 0) {
    const entries =
      legendEntries ||
      series.map((s) => ({
        color: s.color || "#4A90E2",
        gradient: s.gradient,
        label: s.label,
      }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendFit = options.legend?.fit ?? "content";
    const legendExplicitW = options.legend?.width;
    const legendMinW = options.legend?.minWidth ?? 48;
    const legendDims = calculateLegendDimensions(
      entries,
      legendSpacing,
      legendFontSize,
      legendMaxWidth,
      legendWrapText,
      legendPadding,
      legendFit,
      legendExplicitW,
      legendMinW
    );
    legendWidth = legendDims.width;
    legendHeight = legendDims.height;
  }

  const vstack = computeChartVerticalStack({
    paddingTop,
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

  const axisLabelHeight = reserveBelowLineChartPlotBottom(ctx, xAxisLabel, tickFontSize);

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = width - paddingRight;
  let chartAreaTop = vstack.chartAreaTopStart;
  let chartAreaBottom = height - paddingBottom;

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

  let maxYTickW = 40;
  ctx.font = `${tickFontSize}px Arial`;
  for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
    const w = ctx.measureText(String(Number(v.toFixed(4)))).width;
    maxYTickW = Math.max(maxYTickW, w);
  }

  const TICK_GAP = 10;
  const originX = chartAreaLeft + maxYTickW + TICK_GAP + (yAxisLabel ? axisLabelFontSize + 8 : 0);
  const originY = chartAreaBottom - axisLabelHeight;
  const yPlotTopInsetPx = Math.ceil(tickFontSize * 0.45 + 6);
  const axisEndY = chartAreaTop + yPlotTopInsetPx;
  const xTickTailroom = Math.ceil(tickFontSize * 0.65 + 8);
  const minPlotWidth = 80;
  const axisEndX = Math.max(originX + minPlotWidth, chartAreaRight - xTickTailroom);

  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${chartTitleFontSize}px Arial`;
    ctx.fillStyle = chartTitleColor;
    ctx.fillText(chartTitle, width / 2, paddingTop + 10);
    ctx.restore();
  }

  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;

  if (gridShow) {
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, xMin, xMax, xStep, gridColor, gridWidth, true);
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, yMin, yMax, yStep, gridColor, gridWidth, false);
  }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();
  ctx.restore();

  ctx.font = `${tickFontSize}px Arial`;
  ctx.fillStyle = axisColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let xv = xMin; xv <= xMax + 1e-9; xv += xStep) {
    const px = originX + ((xv - xMin) / xSpan) * (axisEndX - originX);
    ctx.fillText(String(Number(xv.toPrecision(6))), px, originY + 10);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let yv = yMin; yv <= yMax + 1e-9; yv += yStep) {
    const py = originY - ((yv - yMin) / ySpan) * (originY - axisEndY);
    ctx.fillText(String(Number(yv.toPrecision(6))), originX - 6, py);
  }

  if (xAxisLabel) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.fillStyle = axisLabelColor;
    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, originY + 10 + tickFontSize + 14);
    ctx.restore();
  }

  if (yAxisLabel) {
    ctx.save();
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.fillStyle = axisLabelColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.translate(chartAreaLeft + maxYTickW / 2 + (yAxisLabel ? 4 : 0), (originY + axisEndY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
  }

  const defaultColors = ["#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24", "#fb7185"];

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    const corr = s.correlation;
    if (!corr || corr.show === false) continue;
    const pts = s.data;
    if (pts.length < 2) continue;

    const col = s.color || defaultColors[si % defaultColors.length];
    const lineColor = corr.color ?? col;
    const lineWidth = corr.lineWidth ?? 2;
    const lineStyle = corr.lineStyle ?? "dashed";
    const threshold = corr.flatThreshold ?? 0.15;
    const typeRaw = corr.type ?? "auto";
    const serOp = clampChartOpacity(s.opacity ?? globalMarkerOpacity ?? 1);

    const dataXValues = pts.map((p) => p.x);
    const dataXMin = Math.min(...dataXValues);
    const dataXMax = Math.max(...dataXValues);
    const xRange = dataXMax - dataXMin || 1;
    const corrXMin = Math.max(xMin, dataXMin - xRange * 0.05);
    const corrXMax = Math.min(xMax, dataXMax + xRange * 0.05);

    ctx.save();
    ctx.globalAlpha = serOp;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    applyLineStyle(ctx, lineStyle);

    if (typeRaw === "none") {
      ctx.restore();
      continue;
    }

    if (typeRaw === "auto") {
      const r = pearsonCorrelation(pts);
      if (Math.abs(r) < threshold) {
        const meanY = mean(pts.map((p) => p.y));
        strokeScatterCorrelationCurve(
          ctx,
          [
            { x: corrXMin, y: meanY },
            { x: corrXMax, y: meanY },
          ],
          originX,
          originY,
          axisEndX,
          axisEndY,
          xMin,
          xMax,
          yMin,
          yMax
        );
      } else {
        const reg = generateCorrelationPoints(pts, "linear", corrXMin, corrXMax, corr.degree);
        strokeScatterCorrelationCurve(
          ctx,
          reg,
          originX,
          originY,
          axisEndX,
          axisEndY,
          xMin,
          xMax,
          yMin,
          yMax
        );
      }
    } else {
      const reg = generateCorrelationPoints(pts, typeRaw, corrXMin, corrXMax, corr.degree);
      strokeScatterCorrelationCurve(ctx, reg, originX, originY, axisEndX, axisEndY, xMin, xMax, yMin, yMax);
    }

    ctx.restore();
  }

  for (let si = 0; si < series.length; si++) {
    const s = series[si];
    const col = s.color || defaultColors[si % defaultColors.length];
    const msize = s.markerSize ?? 10;
    const mtype = s.markerType ?? "circle";
    const serOp = clampChartOpacity(s.opacity ?? globalMarkerOpacity ?? 1);

    for (const p of s.data) {
      const cx = originX + ((p.x - xMin) / xSpan) * (axisEndX - originX);
      const cy = originY - ((p.y - yMin) / ySpan) * (originY - axisEndY);
      ctx.save();
      ctx.globalAlpha = serOp;
      drawScatterMarker(ctx, cx, cy, msize, mtype, col);
      ctx.restore();
    }
  }

  if (showLegend && legendWidth > 0 && legendHeight > 0) {
    const entries =
      legendEntries ||
      series.map((s) => ({
        color: s.color || "#4A90E2",
        gradient: s.gradient,
        label: s.label,
      }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendDims2 = calculateLegendDimensions(
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
    const lw = legendDims2.width;
    const lh = legendDims2.height;

    const { legendX, legendY } = layoutCartesianLegendBox({
      legendPlacement,
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingBottom,
      legendWidth: lw,
      legendHeight: lh,
      minLegendSpacing,
      chartAreaTopStart: vstack.chartAreaTopStart,
      legendCornerTopY: vstack.legendCornerTopY,
      originX,
      axisEndX,
      originY,
      axisEndY,
      xAxisLabel,
      tickFontSize,
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
      lw,
      lh
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
