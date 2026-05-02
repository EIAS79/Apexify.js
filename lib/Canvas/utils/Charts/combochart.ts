import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { paintChartCanvasBackground, type ChartAppearanceExtended } from "./chartBackground";
import {
  normalizeLegendPosition,
  applyLegendChartAreaInset,
  type LegendPlacement,
} from "./legendPlacement";
import { computeChartVerticalStack, resolveOuterPadding } from "./chartPadding";
import { drawBar } from "./barchart";
import type { BarChartData } from "./barchart";
import { segmentValueDisplayText } from "./segmentValueLabel";

/** Bar layer layout for {@link ComboChartOptions}. */
export type ComboBarsType = "standard" | "grouped" | "stacked";

function collectComboBarScaleValues(bars: BarChartData[], barsType: ComboBarsType): number[] {
  const vals: number[] = [];
  for (const b of bars) {
    const multi =
      (barsType === "grouped" || barsType === "stacked") &&
      b.values &&
      b.values.length > 0;
    if (multi) {
      const vlist = b.values!;
      if (barsType === "stacked") {
        vals.push(vlist.reduce((s, seg) => s + seg.value, 0));
      } else {
        for (const seg of vlist) vals.push(seg.value);
      }
    } else {
      vals.push(b.value ?? 0);
    }
  }
  return vals;
}
import type { AxisConfig, EnhancedTextStyle, LegendEntry, LineSeries } from "./linechart";
import {
  applyCurveStrokeJoinStyle,
  applyLineStyle,
  calculateLegendDimensions,
  computeMaxYTickLabelWidth,
  drawErrorBar,
  drawGrid,
  drawLegend,
  drawMarker,
  drawRightYAxisTicks,
  drawXAxisTicks,
  drawYAxisTicks,
  generateCorrelationPoints,
  lineChartExtendPathAlongSeries,
  logScale,
  renderEnhancedText,
  reserveHorizontalForRotatedYAxisTitle,
} from "./linechart";

/** Solid RGB for tick strokes from bar/line CSS colors (drops alpha). */
function solidRgbFromCssColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `rgb(${m[1]},${m[2]},${m[3]})`;
  return color;
}

/** Line series with axis assignment and optional series-level opacity (multiplies layer opacity). */
export interface ComboLineSeries extends LineSeries {
  /** Bars always use the primary (left) Y scale. Default for lines: `secondary` (right). */
  yAxis?: "primary" | "secondary";
  /** Multiplies {@link ComboChartOptions.opacity}.lines. */
  opacity?: number;
}

export interface ComboChartOpacity {
  bars?: number;
  lines?: number;
  grid?: number;
  /** Left Y spine + primary tick labels. */
  primaryAxis?: number;
  /** Right Y spine + secondary tick labels (when shown). */
  secondaryAxis?: number;
  /** Bottom X spine + tick labels. */
  xAxis?: number;
  chartTitle?: number;
  legend?: number;
  barLabels?: number;
  valueLabels?: number;
  pointLabels?: number;
}

export interface ComboChartOptions {
  /** Bar series (primary Y). Use {@link BarChartData.value} for standard columns, or `values` + {@link ComboBarsType} for grouped/stacked colors. */
  bars: BarChartData[];
  lines: ComboLineSeries[];

  /**
   * Bar geometry: `standard` (default), `grouped` (side‑by‑side segments per category),
   * or `stacked` (segments summed vertically). Ignored unless bars define `values`.
   */
  barsType?: ComboBarsType;

  dimensions?: {
    /** Defaults from X span if omitted; set explicitly to avoid a narrow plot on a large layout. */
    width?: number;
    height?: number;
    padding?: { top?: number; right?: number; bottom?: number; left?: number };
  };

  appearance?: ChartAppearanceExtended;

  axes?: {
    x?: AxisConfig;
    /** Primary Y (left) — bar scale. Axis {@link AxisConfig.color} (ticks/spine) defaults from the first bar color when omitted. */
    y?: AxisConfig;
    /** Secondary Y (right). Axis color defaults from the first line with `yAxis: 'secondary'` when omitted. */
    ySecondary?: AxisConfig;
  };

  /** Opacity multipliers per layer (0–1). Applied with `ctx.globalAlpha` while drawing. */
  opacity?: ComboChartOpacity;

  labels?: {
    title?: {
      text?: string;
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
    };
    barLabelDefaults?: {
      show?: boolean;
      fontSize?: number;
      defaultPosition?: "top" | "left" | "right" | "inside" | "bottom";
    };
    valueLabelDefaults?: {
      show?: boolean;
      fontSize?: number;
      defaultColor?: string;
    };
    pointLabelDefaults?: {
      show?: boolean;
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
      position?: "top" | "bottom" | "left" | "right";
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
    /**
     * `content` (default): outer width hugs entries, capped by `maxWidth`.
     * `stretch`: when `maxWidth` is set, the legend box uses that full width (e.g. bottom strip).
     */
    fit?: "content" | "stretch";
    /** Minimum outer width when using `fit: 'content'` (default 48). */
    minWidth?: number;
    /** Fixed outer width (overrides auto layout). */
    width?: number;
  };

  grid?: { show?: boolean; color?: string; width?: number };

  /** Global styling defaults for all bars (per-bar props still override). */
  barStyle?: {
    minWidth?: number;
    /** Gap between grouped segments (default 10). */
    groupSpacing?: number;
    opacity?: number;
    shadow?: BarChartData["shadow"];
    stroke?: BarChartData["stroke"];
  };

  /** Right-hand axis visibility; default on when any line uses `yAxis: 'secondary'`. */
  secondaryYAxis?: { show?: boolean };
}

function comboResponsiveWidth(
  xAxisRange: { min: number; max: number },
  paddingLeft: number,
  paddingRight: number,
  customValues?: number[]
): number {
  if (customValues && customValues.length > 0) {
    const minChartAreaWidth = Math.max(400, customValues.length * 20);
    return paddingLeft + minChartAreaWidth + paddingRight;
  }
  const xRange = xAxisRange.max - xAxisRange.min;
  const minChartAreaWidth = Math.max(400, Math.abs(xRange) * 10 || 400);
  return paddingLeft + minChartAreaWidth + paddingRight;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Auto-build legend from bars + lines when `legend.entries` omitted. */
function defaultLegendEntries(
  bars: BarChartData[],
  lines: ComboLineSeries[],
  barsType: ComboBarsType
): LegendEntry[] {
  const entries: LegendEntry[] = [];
  bars.forEach((b) => {
    if (
      (barsType === "grouped" || barsType === "stacked") &&
      b.values &&
      b.values.length > 0
    ) {
      b.values.forEach((seg, idx) => {
        entries.push({
          label: seg.label ?? `${b.label} (${idx + 1})`,
          color: seg.color || b.color || "#4A90E2",
          gradient: seg.gradient ?? b.gradient,
        });
      });
    } else {
      entries.push({
        label: b.label,
        color: b.color || "#4A90E2",
        gradient: b.gradient,
      });
    }
  });
  lines.forEach((s) => {
    entries.push({
      label: s.label,
      color: s.color || "#E67E22",
      gradient: s.gradient,
    });
  });
  return entries;
}

interface YScalePack {
  yScaleMin: number;
  yScaleMax: number;
  ySpan: number;
  yStep: number;
  yAxisScale: "linear" | "log";
  yAxisCustomValues?: number[];
  yAxisValueSpacing?: number;
  yAxisDateFormat?: string;
  yAxisDateTime: boolean;
}

async function renderComboLineSeries(
  ctx: SKRSContext2D,
  lines: ComboLineSeries[],
  primary: YScalePack,
  secondary: YScalePack | null,
  layout: {
    xMin: number;
    xMax: number;
    xAxisScale: "linear" | "log";
    originX: number;
    originY: number;
    axisEndX: number;
    axisEndY: number;
    baselineY: number;
  },
  layerOpacity: number,
  pointLabelsOpacity: number,
  showPointLabels: boolean,
  pointLabelFontSize: number,
  pointLabelColor: string,
  pointLabelGradient: gradient | undefined,
  pointLabelStyle: EnhancedTextStyle | undefined,
  pointLabelPosition: "top" | "bottom" | "left" | "right"
): Promise<void> {
  const { xMin, xMax, xAxisScale, originX, originY, axisEndX, axisEndY, baselineY } = layout;

  const chartAreaWidth = axisEndX - originX;
  const chartAreaHeightForPoints = originY - axisEndY;

  const pickY = (serie: ComboLineSeries): YScalePack => {
    const axis = serie.yAxis ?? "secondary";
    if (axis === "primary") return primary;
    return secondary ?? primary;
  };

  for (const serie of lines) {
    const pack = pickY(serie);
    const yScaleMin = pack.yScaleMin;
    const yScaleMax = pack.yScaleMax;
    const ySpan = pack.ySpan || 1;
    const yAxisScale = pack.yAxisScale;

    const lineColor = serie.color || "#E67E22";
    const lineWidth = serie.lineWidth ?? 2;
    const lineStyle = serie.lineStyle || "solid";
    const smoothness = serie.smoothness ?? "bezier";
    const smoothTension = serie.smoothnessTension;

    const serieOpacity = (serie.opacity ?? 1) * layerOpacity;
    const hasCorrelation =
      serie.correlation &&
      serie.correlation.type &&
      serie.correlation.type !== "none" &&
      serie.correlation.show !== false;
    const showLine = serie.showLine !== false && (serie.showLine === true || !hasCorrelation);

    const markerType = serie.marker?.type ?? "circle";
    const markerSize = serie.marker?.size ?? (hasCorrelation ? 8 : 6);
    const markerColor = serie.marker?.color || lineColor;
    const markerFilled = serie.marker?.filled !== false && markerType !== "cross";
    const showMarkers = serie.marker?.show !== false || hasCorrelation;
    const showErrorBars = serie.errorBar?.show ?? false;
    const errorBarColor = serie.errorBar?.color || lineColor;
    const errorBarWidth = serie.errorBar?.width ?? 1;
    const errorBarCapSize = serie.errorBar?.capSize ?? 5;
    const areaConfig = serie.area;

    const canvasPoints = serie.data.map((point) => {
      let x: number;
      if (xAxisScale === "log" && xMin > 0 && xMax > 0) {
        x = originX + logScale(point.x, xMin, xMax) * chartAreaWidth;
      } else {
        x = originX + ((point.x - xMin) / (xMax - xMin || 1)) * chartAreaWidth;
      }

      let y: number;
      if (yAxisScale === "log" && yScaleMin > 0 && yScaleMax > 0) {
        y = originY - logScale(point.y, yScaleMin, yScaleMax) * chartAreaHeightForPoints;
      } else {
        y = originY - ((point.y - yScaleMin) / ySpan) * chartAreaHeightForPoints;
      }

      x = Math.max(originX, Math.min(axisEndX, x));
      y = Math.max(axisEndY, Math.min(originY, y));

      return { x, y, originalPoint: point };
    });

    if (areaConfig && areaConfig.type && areaConfig.type !== "none" && areaConfig.show !== false) {
      ctx.save();
      ctx.globalAlpha = serieOpacity;
      ctx.beginPath();
      ctx.rect(originX, axisEndY, axisEndX - originX, originY - axisEndY);
      ctx.clip();

      const areaColor = areaConfig.color || lineColor;
      const areaOpacity = areaConfig.opacity ?? 0.3;
      let fillColor = areaColor;
      if (areaColor.startsWith("#")) {
        fillColor = hexToRgba(areaColor, areaOpacity);
      } else if (!areaColor.startsWith("rgba")) {
        fillColor = `rgba(74, 144, 226, ${areaOpacity})`;
      }

      if (areaConfig.type === "below") {
        let localShadeToYCanvas: number;
        if (areaConfig.toValue !== undefined) {
          if (yAxisScale === "log" && yScaleMin > 0 && yScaleMax > 0) {
            localShadeToYCanvas =
              originY - logScale(areaConfig.toValue, yScaleMin, yScaleMax) * chartAreaHeightForPoints;
          } else {
            localShadeToYCanvas =
              originY - ((areaConfig.toValue - yScaleMin) / ySpan) * chartAreaHeightForPoints;
          }
        } else {
          localShadeToYCanvas = baselineY;
        }
        const shadeToYCanvas = Math.min(originY, Math.max(axisEndY, localShadeToYCanvas));

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        if (canvasPoints.length > 1) {
          lineChartExtendPathAlongSeries(
            ctx,
            canvasPoints,
            smoothness as import("./linechart").SmoothnessType,
            lineStyle as import("./linechart").LineStyle,
            smoothTension
          );
        }
        ctx.lineTo(canvasPoints[canvasPoints.length - 1].x, shadeToYCanvas);
        ctx.lineTo(canvasPoints[0].x, shadeToYCanvas);
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }

    if (showLine && canvasPoints.length >= 1) {
      ctx.save();
      ctx.globalAlpha = serieOpacity;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      const isStepLine = lineStyle === "step" || lineStyle === "stepline";
      if (!isStepLine) applyLineStyle(ctx, lineStyle as import("./linechart").LineStyle);
      applyCurveStrokeJoinStyle(
        ctx,
        smoothness as import("./linechart").SmoothnessType,
        lineStyle as import("./linechart").LineStyle
      );

      ctx.beginPath();
      ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
      if (canvasPoints.length > 1) {
        lineChartExtendPathAlongSeries(
          ctx,
          canvasPoints,
          smoothness as import("./linechart").SmoothnessType,
          lineStyle as import("./linechart").LineStyle,
          smoothTension
        );
      }
      ctx.stroke();
      ctx.restore();
    }

    if (serie.correlation && serie.correlation.type && serie.correlation.type !== "none") {
      const correlationType = serie.correlation.type;
      const correlationColor = serie.correlation.color || lineColor;
      const correlationLineWidth = serie.correlation.lineWidth ?? 2;
      const correlationLineStyle = serie.correlation.lineStyle || "dashed";
      const correlationDegree = serie.correlation.degree ?? 2;
      const showCorrelation = serie.correlation.show !== false;

      if (showCorrelation && serie.data.length >= 2) {
        const dataXValues = serie.data.map((p) => p.x);
        const dataXMin = Math.min(...dataXValues);
        const dataXMax = Math.max(...dataXValues);
        const xRangeForCorrelation = dataXMax - dataXMin;
        const correlationXMin = Math.max(xMin, dataXMin - xRangeForCorrelation * 0.1);
        const correlationXMax = Math.min(xMax, dataXMax + xRangeForCorrelation * 0.1);

        const correlationPoints = generateCorrelationPoints(
          serie.data.map((p) => ({ x: p.x, y: p.y })),
          correlationType,
          correlationXMin,
          correlationXMax,
          correlationDegree
        );

        if (correlationPoints.length > 0) {
          const canvasCorrelationPoints = correlationPoints
            .map((point) => {
              let px: number;
              if (xAxisScale === "log" && xMin > 0 && xMax > 0) {
                px = originX + logScale(point.x, xMin, xMax) * chartAreaWidth;
              } else {
                px = originX + ((point.x - xMin) / (xMax - xMin || 1)) * chartAreaWidth;
              }

              let py: number;
              if (yAxisScale === "log" && yScaleMin > 0 && yScaleMax > 0) {
                py = originY - logScale(point.y, yScaleMin, yScaleMax) * chartAreaHeightForPoints;
              } else {
                py = originY - ((point.y - yScaleMin) / ySpan) * chartAreaHeightForPoints;
              }

              return { x: px, y: py };
            })
            .filter(
              (point) =>
                point.x >= originX &&
                point.x <= axisEndX &&
                point.y >= axisEndY &&
                point.y <= originY
            );

          if (canvasCorrelationPoints.length > 0) {
            ctx.save();
            ctx.globalAlpha = serieOpacity;
            ctx.strokeStyle = correlationColor;
            ctx.lineWidth = correlationLineWidth;
            applyLineStyle(ctx, correlationLineStyle as import("./linechart").LineStyle);
            ctx.beginPath();
            ctx.moveTo(canvasCorrelationPoints[0].x, canvasCorrelationPoints[0].y);
            for (let i = 1; i < canvasCorrelationPoints.length; i++) {
              ctx.lineTo(canvasCorrelationPoints[i].x, canvasCorrelationPoints[i].y);
            }
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    }

    if (showMarkers) {
      ctx.save();
      ctx.globalAlpha = serieOpacity;
      canvasPoints.forEach((canvasPoint) => {
        const point = canvasPoint.originalPoint;
        const shouldShowMarker = point.showMarker !== false;
        const markerColorForPoint = point.markerColor || markerColor;
        if (shouldShowMarker && markerType !== "none") {
          drawMarker(
            ctx,
            canvasPoint.x,
            canvasPoint.y,
            markerType as import("./linechart").MarkerType,
            markerSize,
            markerColorForPoint,
            markerFilled
          );
        }
      });
      ctx.restore();
    }

    if (showErrorBars) {
      ctx.save();
      ctx.globalAlpha = serieOpacity;
      canvasPoints.forEach((canvasPoint) => {
        const errorBar = canvasPoint.originalPoint.errorBar;
        if (errorBar && errorBar.show !== false) {
          const positive = errorBar.positive ?? 0;
          const negative = errorBar.negative ?? 0;
          if (positive > 0 || negative > 0) {
            drawErrorBar(
              ctx,
              canvasPoint.x,
              canvasPoint.y,
              positive,
              negative,
              errorBar.color || errorBarColor,
              errorBar.width ?? errorBarWidth,
              errorBar.capSize ?? errorBarCapSize,
              chartAreaHeightForPoints,
              yScaleMin,
              yScaleMax
            );
          }
        }
      });
      ctx.restore();
    }

    if (showPointLabels) {
      ctx.save();
      ctx.globalAlpha = pointLabelsOpacity * layerOpacity * (serie.opacity ?? 1);
      ctx.font = `${pointLabelFontSize}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (const canvasPoint of canvasPoints) {
        const point = canvasPoint.originalPoint;
        if (!point.label) continue;

        let labelX = canvasPoint.x;
        let labelY = canvasPoint.y;
        switch (pointLabelPosition) {
          case "top":
            labelY = canvasPoint.y - markerSize / 2 - 5;
            ctx.textBaseline = "bottom";
            break;
          case "bottom":
            labelY = canvasPoint.y + markerSize / 2 + 5;
            ctx.textBaseline = "top";
            break;
          case "left":
            labelX = canvasPoint.x - markerSize / 2 - 5;
            ctx.textAlign = "right";
            break;
          case "right":
            labelX = canvasPoint.x + markerSize / 2 + 5;
            ctx.textAlign = "left";
            break;
        }

        await renderEnhancedText(
          ctx,
          point.label,
          labelX,
          labelY,
          pointLabelStyle,
          pointLabelFontSize,
          pointLabelColor,
          pointLabelGradient
        );
      }

      ctx.restore();
    }
  }
}

/**
 * Bar + line combo chart with optional **secondary Y-axis** on the right.
 * Bars support `barsType`: standard (`value`), **grouped** or **stacked** (`values` + segment colors).
 * Lines default to the secondary axis; set `yAxis: 'primary'` to plot on the bar scale.
 *
 * **X-axis coordinates:** each bar uses `xStart`/`xEnd` (and line points use `x`) on a **continuous**
 * scale so bars and lines align; that domain is not optional. Use {@link AxisConfig.showTickLabels}
 * / `showTickMarks` to hide numeric ticks when categories are shown only via bar labels.
 */
export async function createComboChart(
  options: ComboChartOptions
): Promise<Buffer> {
  const bars = options.bars ?? [];
  const lines = options.lines ?? [];

  if (bars.length === 0 && lines.length === 0) {
    throw new Error("Combo chart requires at least one bar or one line series.");
  }

  const height = options.dimensions?.height ?? 600;
  const provisionalCanvasW = options.dimensions?.width ?? 800;
  const paddingResolved = resolveOuterPadding(options.dimensions?.padding, provisionalCanvasW, height);
  const paddingTop = paddingResolved.top;
  const paddingRight = paddingResolved.right;
  const paddingBottom = paddingResolved.bottom;
  const paddingLeft = paddingResolved.left;

  const op = options.opacity ?? {};

  const axisColor =
    options.appearance?.axisColor ??
    options.axes?.x?.color ??
    options.axes?.y?.color ??
    "#000000";
  const axisWidth =
    options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;

  const xAxisConfig = options.axes?.x || {};
  const xShowTickMarks = xAxisConfig.showTickMarks !== false;
  const xShowTickLabels = xAxisConfig.showTickLabels !== false;
  const yAxisPrimaryConfig = options.axes?.y || {};
  const yAxisSecondaryConfig = options.axes?.ySecondary || {};

  const primaryTintSource =
    bars.flatMap((b) => b.values ?? []).find((s) => s.color)?.color ??
    bars.find((b) => b.color)?.color;
  const primarySeriesTint = solidRgbFromCssColor(primaryTintSource, "#3b82f6");
  const firstSecondaryLine = lines.find((s) => (s.yAxis ?? "secondary") === "secondary");
  const secondarySeriesTint = solidRgbFromCssColor(firstSecondaryLine?.color, "#f59e0b");

  const xAxisLabel = xAxisConfig.label;
  const yPrimaryLabel = yAxisPrimaryConfig.label;
  const ySecondaryLabel = yAxisSecondaryConfig.label;

  const xAxisLabelColor = xAxisConfig.labelColor ?? "#000000";
  const yPrimaryTickBase =
    yAxisPrimaryConfig.color ?? primarySeriesTint ?? axisColor;
  const ySecondaryTickBase =
    yAxisSecondaryConfig.color ?? secondarySeriesTint ?? axisColor;
  const yPrimaryLabelColor =
    yAxisPrimaryConfig.labelColor ?? yPrimaryTickBase;
  const ySecondaryLabelColor =
    yAxisSecondaryConfig.labelColor ?? ySecondaryTickBase;

  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const chartTitleColor = options.labels?.title?.color ?? "#000000";

  const tickFontSize =
    xAxisConfig.tickFontSize ?? yAxisPrimaryConfig.tickFontSize ?? yAxisSecondaryConfig.tickFontSize ?? 12;

  const baselinePrimary = yAxisPrimaryConfig.baseline ?? 0;

  const showBarLabels = options.labels?.barLabelDefaults?.show ?? true;
  const barLabelPosition =
    options.labels?.barLabelDefaults?.defaultPosition ?? "bottom";
  const axisLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
  const showValues = options.labels?.valueLabelDefaults?.show ?? true;
  const valueFontSize = options.labels?.valueLabelDefaults?.fontSize ?? 12;
  const valueColor = options.labels?.valueLabelDefaults?.defaultColor ?? "#000000";

  const showPointLabels = options.labels?.pointLabelDefaults?.show ?? false;
  const pointLabelFontSize = options.labels?.pointLabelDefaults?.fontSize ?? 12;
  const pointLabelColor = options.labels?.pointLabelDefaults?.color ?? "#000000";
  const pointLabelGradient = options.labels?.pointLabelDefaults?.gradient;
  const pointLabelStyle = options.labels?.pointLabelDefaults?.textStyle;
  const pointLabelPosition = options.labels?.pointLabelDefaults?.position ?? "top";

  const showLegend = options.legend?.show ?? true;
  const legendPlacement = normalizeLegendPosition(options.legend?.position);
  const legendSpacing = options.legend?.spacing ?? 20;
  const legendEntriesOpt = options.legend?.entries;

  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? "#E0E0E0";
  const gridWidth = options.grid?.width ?? 1;

  const minBarWidth = options.barStyle?.minWidth ?? 20;
  const globalBarOpacity = options.barStyle?.opacity;
  const globalBarShadow = options.barStyle?.shadow;
  const globalBarStroke = options.barStyle?.stroke;

  const barsType: ComboBarsType = options.barsType ?? "standard";
  const groupSpacing = options.barStyle?.groupSpacing ?? 10;

  const linesOnSecondary = lines.filter((s) => (s.yAxis ?? "secondary") === "secondary");
  const hasSecondaryScale = linesOnSecondary.length > 0;
  const showSecondaryAxis =
    hasSecondaryScale && options.secondaryYAxis?.show !== false;

  let xMin: number;
  let xMax: number;
  let xStep: number;
  const xAxisCustomValues = xAxisConfig.values;
  const xAxisRange = xAxisConfig.range;
  const xAxisValueSpacing = xAxisConfig.valueSpacing;
  const xAxisScale = xAxisConfig.scale ?? "linear";
  const xAxisDateFormat = xAxisConfig.dateFormat;
  const xAxisDateTime = xAxisConfig.dateTime ?? false;

  const allXFromLines = lines.flatMap((s) => s.data.map((p) => p.x));
  const allXFromBars = bars.flatMap((b) => [b.xStart, b.xEnd]);

  if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
    xStep = 1;
  } else if (xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined) {
    xMin = xAxisRange.min;
    xMax = xAxisRange.max;
    xStep = xAxisRange.step ?? Math.ceil((xMax - xMin) / 10);
  } else {
    const xs = [...allXFromBars, ...allXFromLines];
    if (xs.length > 0) {
      xMin = Math.min(...xs);
      xMax = Math.max(...xs);
      const range = xMax - xMin || 1;
      const pad = range * 0.08;
      xMin -= pad;
      xMax += pad;
    } else {
      xMin = 0;
      xMax = 100;
    }
    xStep = Math.ceil((xMax - xMin) / 10);
  }

  const baseWidth =
    options.dimensions?.width ??
    comboResponsiveWidth(
      { min: xMin, max: xMax },
      paddingLeft,
      paddingRight,
      xAxisCustomValues
    );

  const barValues = collectComboBarScaleValues(bars, barsType);
  const primaryLineYs = lines
    .filter((s) => (s.yAxis ?? "secondary") === "primary")
    .flatMap((s) => s.data.map((p) => p.y));
  const secondaryLineYs = linesOnSecondary.flatMap((s) => s.data.map((p) => p.y));

  function buildYScale(
    config: AxisConfig,
    dataVals: number[],
    fallbackWhenEmpty: [number, number]
  ): YScalePack {
    const range = config.range;
    const custom = config.values;
    const scale = config.scale ?? "linear";
    const baseline = config.baseline ?? baselinePrimary;

    let yScaleMin: number;
    let yScaleMax: number;
    let yStep: number;

    if (custom && custom.length > 0) {
      yScaleMin = Math.min(...custom);
      yScaleMax = Math.max(...custom);
      yStep = 1;
    } else if (range && range.min !== undefined && range.max !== undefined) {
      yScaleMin = range.min;
      yScaleMax = range.max;
      yStep = range.step ?? Math.ceil((yScaleMax - yScaleMin) / 10);
      yScaleMin = Math.min(yScaleMin, baseline);
      yScaleMax = Math.max(yScaleMax, baseline);
    } else if (dataVals.length > 0) {
      const rawMin = Math.min(...dataVals);
      const rawMax = Math.max(...dataVals);
      yScaleMin = Math.min(rawMin, baseline);
      yScaleMax = Math.max(rawMax, baseline);
      const pad = (yScaleMax - yScaleMin || 1) * 0.1;
      yScaleMin -= pad;
      yScaleMax += pad;
      // Avoid wasted negative domain when every sample is on or above baseline (typical positive-only bars).
      if (scale !== "log" && rawMin >= baseline) {
        yScaleMin = Math.max(baseline, yScaleMin);
      }
      yStep = Math.ceil((yScaleMax - yScaleMin) / 10);
    } else {
      yScaleMin = fallbackWhenEmpty[0];
      yScaleMax = fallbackWhenEmpty[1];
      yStep = Math.ceil((yScaleMax - yScaleMin) / 10);
    }

    let ySpan = yScaleMax - yScaleMin || 1;
    return {
      yScaleMin,
      yScaleMax,
      ySpan,
      yStep,
      yAxisScale: scale,
      yAxisCustomValues: custom,
      yAxisValueSpacing: config.valueSpacing,
      yAxisDateFormat: config.dateFormat,
      yAxisDateTime: config.dateTime ?? false,
    };
  }

  const primaryDataVals = [...barValues, ...primaryLineYs];
  let primaryPack = buildYScale(yAxisPrimaryConfig, primaryDataVals, [0, 100]);

  let secondaryPack: YScalePack | null = null;
  if (hasSecondaryScale) {
    secondaryPack = buildYScale(yAxisSecondaryConfig, secondaryLineYs, [0, 100]);
  }

  const minLegendSpacing = 10;

  const mergedLegendEntries =
    legendEntriesOpt && legendEntriesOpt.length > 0
      ? legendEntriesOpt
      : defaultLegendEntries(bars, lines, barsType);

  let legendWidth = 0;
  let legendHeight = 0;

  if (showLegend && mergedLegendEntries.length > 0) {
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendFit = options.legend?.fit ?? "content";
    const legendExplicitW = options.legend?.width;
    const legendMinW = options.legend?.minWidth ?? 48;
    const legendDims = calculateLegendDimensions(
      mergedLegendEntries,
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

  const legendActive =
    !!(showLegend && mergedLegendEntries.length > 0 && legendWidth > 0 && legendHeight > 0);

  const X_AXIS_TICK_TOP_OFFSET = 10;
  const X_AXIS_TICK_DESCENDER_PAD = 8;
  const X_AXIS_TITLE_GAP_BELOW_TICKS = 14;
  const X_AXIS_TITLE_BOTTOM_PAD = 12;

  let axisLabelHeight =
    X_AXIS_TICK_TOP_OFFSET + tickFontSize + X_AXIS_TICK_DESCENDER_PAD;
  if (xAxisLabel) {
    axisLabelHeight +=
      X_AXIS_TITLE_GAP_BELOW_TICKS + tickFontSize + X_AXIS_TITLE_BOTTOM_PAD;
  }

  const axisBottomReserve =
    X_AXIS_TICK_TOP_OFFSET +
    tickFontSize +
    X_AXIS_TICK_DESCENDER_PAD +
    (xAxisLabel
      ? X_AXIS_TITLE_GAP_BELOW_TICKS + tickFontSize + X_AXIS_TITLE_BOTTOM_PAD
      : 0) +
    (showBarLabels && barLabelPosition === "bottom" ? axisLabelFontSize + 10 : 0);

  const vstack = computeChartVerticalStack({
    paddingTop,
    width: baseWidth,
    height,
    chartTitle,
    chartTitleFontSize,
    legendSpacing,
    showLegend: legendActive,
    legendPlacement,
    legendWidth,
    legendHeight,
    minLegendInsetFloor: minLegendSpacing,
  });

  let chartAreaTopPre = vstack.chartAreaTopStart;
  if (vstack.legendAtTop && legendHeight > 0) {
    chartAreaTopPre += legendHeight + vstack.legendInsetGap;
  }
  const axisEndYPreview =
    chartAreaTopPre + Math.ceil(tickFontSize * 0.45 + 6);

  const preliminaryChartAreaHeight = Math.max(
    60,
    height - paddingBottom - axisBottomReserve - axisEndYPreview
  );

  const baselineSpanPre = primaryPack.yScaleMax - primaryPack.yScaleMin || 1;
  if (baselinePrimary > primaryPack.yScaleMin && preliminaryChartAreaHeight > 1e-6) {
    const belowBaselinePx =
      ((baselinePrimary - primaryPack.yScaleMin) / baselineSpanPre) * preliminaryChartAreaHeight;
    const reserveBelowBaselinePx =
      10 +
      tickFontSize +
      8 +
      (xAxisLabel ? 14 + tickFontSize + 12 : 0) +
      (showBarLabels && barLabelPosition === "bottom" ? axisLabelFontSize + 10 : 0);
    if (belowBaselinePx < reserveBelowBaselinePx) {
      const gapPx = reserveBelowBaselinePx - belowBaselinePx;
      primaryPack.yScaleMin -= (gapPx / preliminaryChartAreaHeight) * baselineSpanPre;
      primaryPack.ySpan = primaryPack.yScaleMax - primaryPack.yScaleMin || 1;
    }
  }

  const canvas = createCanvas(baseWidth, height);
  const ctx = canvas.getContext("2d");

  await paintChartCanvasBackground(ctx, canvas, baseWidth, height, options.appearance);

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = baseWidth - paddingRight;
  let chartAreaTop = vstack.chartAreaTopStart;
  let chartAreaBottom = height - paddingBottom;

  if (legendActive) {
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

  const originY = chartAreaBottom - axisLabelHeight;
  const yPlotTopInsetPx = Math.ceil(tickFontSize * 0.45 + 6);
  const axisEndY = chartAreaTop + yPlotTopInsetPx;

  const maxPrimaryTickW = computeMaxYTickLabelWidth(
    ctx,
    primaryPack.yScaleMin,
    primaryPack.yScaleMax,
    primaryPack.yStep,
    tickFontSize,
    primaryPack.yAxisCustomValues,
    primaryPack.yAxisScale,
    primaryPack.yAxisDateFormat,
    primaryPack.yAxisDateTime
  );

  let secondaryReserve = 0;
  let maxSecondaryTickW = 0;
  if (showSecondaryAxis && secondaryPack !== null) {
    maxSecondaryTickW = computeMaxYTickLabelWidth(
      ctx,
      secondaryPack.yScaleMin,
      secondaryPack.yScaleMax,
      secondaryPack.yStep,
      tickFontSize,
      secondaryPack.yAxisCustomValues,
      secondaryPack.yAxisScale,
      secondaryPack.yAxisDateFormat,
      secondaryPack.yAxisDateTime
    );
    let secTitleReserve = 0;
    if (ySecondaryLabel) {
      secTitleReserve = reserveHorizontalForRotatedYAxisTitle(ctx, ySecondaryLabel, tickFontSize);
    }
    const TICK_LABEL_TO_AXIS_GAP = 10;
    const Y_AXIS_TITLE_TO_TICK_LABEL_GAP = 12;
    secondaryReserve =
      TICK_LABEL_TO_AXIS_GAP +
      maxSecondaryTickW +
      (ySecondaryLabel ? Y_AXIS_TITLE_TO_TICK_LABEL_GAP + secTitleReserve : 0);
  }

  let yPrimaryTitleReservePx = 0;
  if (yPrimaryLabel) {
    yPrimaryTitleReservePx = reserveHorizontalForRotatedYAxisTitle(ctx, yPrimaryLabel, tickFontSize);
  }

  const TICK_LABEL_TO_AXIS_GAP = 10;
  const Y_AXIS_TITLE_TO_TICK_LABEL_GAP = 12;

  const originX =
    chartAreaLeft +
    yPrimaryTitleReservePx +
    (yPrimaryLabel ? Y_AXIS_TITLE_TO_TICK_LABEL_GAP : 0) +
    maxPrimaryTickW +
    TICK_LABEL_TO_AXIS_GAP;

  const xTickTailroom = Math.ceil(tickFontSize * 0.65 + 8);
  const minPlotWidth = 80;
  const axisEndX = Math.max(
    originX + minPlotWidth,
    chartAreaRight - secondaryReserve - xTickTailroom
  );

  if (chartTitle) {
    ctx.save();
    ctx.globalAlpha = op.chartTitle ?? 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    await renderEnhancedText(
      ctx,
      chartTitle,
      baseWidth / 2,
      paddingTop + vstack.titleTopInset,
      options.labels?.title?.textStyle,
      chartTitleFontSize,
      chartTitleColor,
      options.labels?.title?.gradient
    );
    ctx.restore();
  }

  const chartAreaHeight = originY - axisEndY;
  const baselineY = Math.min(
    originY,
    Math.max(
      axisEndY,
      originY -
        ((baselinePrimary - primaryPack.yScaleMin) / primaryPack.ySpan) * chartAreaHeight
    )
  );

  ctx.save();
  ctx.globalAlpha = op.primaryAxis ?? 1;
  ctx.strokeStyle = yPrimaryTickBase;
  ctx.fillStyle = yPrimaryTickBase;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = op.xAxis ?? 1;
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(originX, baselineY);
  ctx.lineTo(axisEndX, baselineY);
  ctx.stroke();
  ctx.restore();

  const yPrimaryTickColor = yPrimaryTickBase;
  const xTickLabelColor = xAxisConfig.color ?? axisColor;

  ctx.save();
  ctx.globalAlpha = op.primaryAxis ?? 1;
  ctx.strokeStyle = yPrimaryTickColor;
  drawYAxisTicks(
    ctx,
    originX,
    originY,
    axisEndY,
    primaryPack.yScaleMin,
    primaryPack.yScaleMax,
    primaryPack.yStep,
    tickFontSize,
    primaryPack.yAxisCustomValues,
    primaryPack.yAxisValueSpacing,
    primaryPack.yAxisScale,
    primaryPack.yAxisDateFormat,
    primaryPack.yAxisDateTime,
    yPrimaryTickColor
  );
  ctx.restore();

  if (xShowTickMarks) {
    ctx.save();
    ctx.globalAlpha = op.xAxis ?? 1;
    ctx.strokeStyle = xTickLabelColor;
    drawXAxisTicks(
      ctx,
      originX,
      baselineY,
      axisEndX,
      xMin,
      xMax,
      xStep,
      tickFontSize,
      xAxisCustomValues,
      xAxisValueSpacing,
      xAxisScale,
      xAxisDateFormat,
      xAxisDateTime,
      xTickLabelColor,
      "marks"
    );
    ctx.restore();
  }

  if (showGrid) {
    ctx.save();
    ctx.globalAlpha = op.grid ?? 1;
    drawGrid(
      ctx,
      originX,
      originY,
      axisEndX,
      axisEndY,
      xMin,
      xMax,
      xStep,
      gridColor,
      gridWidth,
      true,
      xAxisCustomValues
    );
    drawGrid(
      ctx,
      originX,
      originY,
      axisEndX,
      axisEndY,
      primaryPack.yScaleMin,
      primaryPack.yScaleMax,
      primaryPack.yStep,
      gridColor,
      gridWidth,
      false,
      primaryPack.yAxisCustomValues
    );
    ctx.restore();
  }

  interface LabelInfo {
    type: "value" | "bar";
    text: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    color?: string;
    gradient?: gradient;
    textStyle?: EnhancedTextStyle;
    fontSize: number;
  }
  const labelsToDraw: LabelInfo[] = [];
  const valueLabelPositions = new Map<number, { y: number; fontSize: number; baseline: CanvasTextBaseline }>();

  const chartAreaWidth = axisEndX - originX;
  const ySpanPrimary = primaryPack.ySpan || 1;

  function pushComboCategoryBarLabel(
    bi: number,
    item: BarChartData,
    barCenterX: number,
    barCenterY: number,
    topBarY: number,
    barDrawLeft: number,
    barDrawRight: number,
    insideFallbackBarColor: string
  ): void {
    if (!showBarLabels) return;

    let labelX: number;
    let labelY: number;
    let textAlign: CanvasTextAlign = "center";
    let textBaseline: CanvasTextBaseline = "middle";

    const currentLabelPosition = item.labelPosition ?? barLabelPosition;

    switch (currentLabelPosition) {
      case "top":
        labelX = barCenterX;
        {
          const vi = valueLabelPositions.get(bi);
          if (vi && vi.baseline === "bottom") {
            const spacing = 5;
            labelY = vi.y - vi.fontSize - spacing;
          } else {
            labelY = topBarY - 5;
          }
        }
        textAlign = "center";
        textBaseline = "bottom";
        break;
      case "bottom":
        labelX = barCenterX;
        labelY = originY + 5;
        textAlign = "center";
        textBaseline = "top";
        break;
      case "left":
        labelX = barDrawLeft - 5;
        labelY = barCenterY;
        textAlign = "right";
        textBaseline = "middle";
        break;
      case "right":
        labelX = barDrawRight + 5;
        labelY = barCenterY;
        textAlign = "left";
        textBaseline = "middle";
        break;
      case "inside":
        labelX = barCenterX;
        labelY = barCenterY;
        textAlign = "center";
        textBaseline = "middle";
        break;
      default:
        labelX = barCenterX;
        labelY = originY + 5;
        textAlign = "center";
        textBaseline = "top";
    }

    let labelColor = item.labelColor || "#000000";
    if (currentLabelPosition === "inside") {
      const barColor = insideFallbackBarColor;
      const isDark =
        barColor === "#000000" ||
        barColor.toLowerCase().includes("dark") ||
        (barColor.startsWith("#") && parseInt(barColor.slice(1, 3), 16) < 128);
      labelColor = isDark ? "#FFFFFF" : item.labelColor || "#000000";
    }

    labelsToDraw.push({
      type: "bar",
      text: item.label,
      x: labelX,
      y: labelY,
      align: textAlign,
      baseline: textBaseline,
      color: labelColor,
      fontSize: axisLabelFontSize,
    });
  }

  ctx.save();
  ctx.globalAlpha = op.bars ?? 1;

  for (let bi = 0; bi < bars.length; bi++) {
    const item = bars[bi];

    let barXStart: number;
    let barXEnd: number;
    if (xAxisCustomValues && xAxisCustomValues.length > 0) {
      const actualMin = Math.min(...xAxisCustomValues);
      const actualMax = Math.max(...xAxisCustomValues);
      const xr = actualMax - actualMin || 1;
      barXStart = originX + ((item.xStart - actualMin) / xr) * chartAreaWidth;
      barXEnd = originX + ((item.xEnd - actualMin) / xr) * chartAreaWidth;
    } else {
      const xr = xMax - xMin || 1;
      barXStart = originX + ((item.xStart - xMin) / xr) * chartAreaWidth;
      barXEnd = originX + ((item.xEnd - xMin) / xr) * chartAreaWidth;
    }

    let groupWidth = Math.max(barXEnd - barXStart, minBarWidth);
    if (item.xStart === item.xEnd) {
      const centerX = barXStart;
      barXStart = centerX - groupWidth / 2;
      barXEnd = centerX + groupWidth / 2;
    }

    const barOpacity =
      (item.opacity ?? globalBarOpacity ?? 1) * (op.bars ?? 1);

    const barDrawLeft = Math.max(originX, barXStart);
    const barDrawRight = Math.min(axisEndX, barXStart + groupWidth);
    let drawW = barDrawRight - barDrawLeft;
    if (drawW < 1) continue;
    drawW = Math.min(drawW, axisEndX - barDrawLeft);

    const barCenterX = barDrawLeft + drawW / 2;

    const useMulti =
      (barsType === "grouped" || barsType === "stacked") &&
      item.values &&
      item.values.length > 0;

    if (useMulti && barsType === "grouped") {
      const segments = item.values!;
      const n = segments.length;
      const segmentWidth = (drawW - groupSpacing * (n - 1)) / n;
      if (segmentWidth < 1) continue;

      let clusterTop = baselineY;
      let highestValueLabelY: number | null = null;

      segments.forEach((segment, segIndex) => {
        const segXStart = barDrawLeft + segIndex * (segmentWidth + groupSpacing);
        let segBarHeight: number;
        let segBarY: number;
        if (segment.value >= baselinePrimary) {
          const positiveRatio = (segment.value - baselinePrimary) / ySpanPrimary;
          segBarHeight = positiveRatio * chartAreaHeight;
          segBarY = baselineY - segBarHeight;
          clusterTop = Math.min(clusterTop, segBarY);
        } else {
          const negativeRatio = (baselinePrimary - segment.value) / ySpanPrimary;
          segBarHeight = negativeRatio * chartAreaHeight;
          segBarY = baselineY;
        }

        drawBar(
          ctx,
          segXStart,
          segBarY,
          segmentWidth,
          segBarHeight,
          segment.color || item.color || "#4A90E2",
          segment.gradient || item.gradient,
          segment.opacity ?? item.opacity ?? barOpacity,
          segment.shadow || item.shadow,
          segment.stroke || item.stroke,
          globalBarShadow,
          globalBarStroke
        );

        const shouldShowSegValue =
          segment.showValue !== undefined ? segment.showValue : showValues;
        if (shouldShowSegValue) {
          const valueLabelY =
            segment.value >= baselinePrimary ? segBarY - 5 : segBarY + segBarHeight + 5;
          const valueLabelBaseline =
            segment.value >= baselinePrimary ? ("bottom" as const) : ("top" as const);
          if (
            segment.value >= baselinePrimary &&
            (highestValueLabelY === null || valueLabelY < highestValueLabelY)
          ) {
            highestValueLabelY = valueLabelY;
          }
          labelsToDraw.push({
            type: "value",
            text: segmentValueDisplayText(segment),
            x: segXStart + segmentWidth / 2,
            y: valueLabelY,
            align: "center",
            baseline: valueLabelBaseline,
            color: segment.valueColor || valueColor,
            fontSize: valueFontSize,
          });
        }
      });

      if (highestValueLabelY !== null) {
        valueLabelPositions.set(bi, {
          y: highestValueLabelY,
          fontSize: valueFontSize,
          baseline: "bottom",
        });
      }

      const barCenterYGrouped = (baselineY + clusterTop) / 2;
      pushComboCategoryBarLabel(
        bi,
        item,
        barCenterX,
        barCenterYGrouped,
        clusterTop,
        barDrawLeft,
        barDrawRight,
        item.color || segments[0]?.color || "#4A90E2"
      );
      continue;
    }

    if (useMulti && barsType === "stacked") {
      const segments = item.values!;
      const positiveSegments = segments.filter((s) => s.value >= baselinePrimary);
      const negativeSegments = segments.filter((s) => s.value < baselinePrimary);

      let accumulatedPositiveHeight = 0;
      positiveSegments.forEach((segment) => {
        const positiveRatio = (segment.value - baselinePrimary) / ySpanPrimary;
        const segmentHeight = positiveRatio * chartAreaHeight;
        const barY = baselineY - accumulatedPositiveHeight - segmentHeight;

        drawBar(
          ctx,
          barDrawLeft,
          barY,
          drawW,
          segmentHeight,
          segment.color || item.color || "#4A90E2",
          segment.gradient || item.gradient,
          segment.opacity ?? item.opacity ?? barOpacity,
          segment.shadow || item.shadow,
          segment.stroke || item.stroke,
          globalBarShadow,
          globalBarStroke
        );

        const shouldShowSegValue =
          segment.showValue !== undefined ? segment.showValue : showValues;
        if (shouldShowSegValue && segmentHeight > valueFontSize + 5) {
          labelsToDraw.push({
            type: "value",
            text: segmentValueDisplayText(segment),
            x: barDrawLeft + drawW / 2,
            y: barY + segmentHeight / 2,
            align: "center",
            baseline: "middle",
            color: segment.valueColor || valueColor,
            fontSize: valueFontSize,
          });
        }

        accumulatedPositiveHeight += segmentHeight;
      });

      let accumulatedNegativeHeight = 0;
      negativeSegments.forEach((segment) => {
        const negativeRatio = (baselinePrimary - segment.value) / ySpanPrimary;
        const segmentHeight = negativeRatio * chartAreaHeight;
        const barY = baselineY + accumulatedNegativeHeight;

        drawBar(
          ctx,
          barDrawLeft,
          barY,
          drawW,
          segmentHeight,
          segment.color || item.color || "#FF6B6B",
          segment.gradient || item.gradient,
          segment.opacity ?? item.opacity ?? barOpacity,
          segment.shadow || item.shadow,
          segment.stroke || item.stroke,
          globalBarShadow,
          globalBarStroke
        );

        const shouldShowSegValue =
          segment.showValue !== undefined ? segment.showValue : showValues;
        if (shouldShowSegValue && segmentHeight > valueFontSize + 5) {
          labelsToDraw.push({
            type: "value",
            text: segmentValueDisplayText(segment),
            x: barDrawLeft + drawW / 2,
            y: barY + segmentHeight / 2,
            align: "center",
            baseline: "middle",
            color: segment.valueColor || valueColor,
            fontSize: valueFontSize,
          });
        }

        accumulatedNegativeHeight += segmentHeight;
      });

      const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
      const shouldShowTotal = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowTotal) {
        const totalValueY =
          totalValue >= baselinePrimary
            ? baselineY - accumulatedPositiveHeight - 5
            : baselineY + accumulatedNegativeHeight + 5;
        const totalValueBaseline =
          totalValue >= baselinePrimary ? ("bottom" as const) : ("top" as const);
        if (totalValue >= baselinePrimary) {
          valueLabelPositions.set(bi, {
            y: totalValueY,
            fontSize: valueFontSize,
            baseline: totalValueBaseline,
          });
        }
        labelsToDraw.push({
          type: "value",
          text: totalValue.toString(),
          x: barCenterX,
          y: totalValueY,
          align: "center",
          baseline: totalValueBaseline,
          color: item.valueColor || valueColor,
          fontSize: valueFontSize,
        });
      }

      const stackTop = baselineY - accumulatedPositiveHeight;
      const barCenterYStack = (baselineY + stackTop) / 2;
      pushComboCategoryBarLabel(
        bi,
        item,
        barCenterX,
        barCenterYStack,
        stackTop,
        barDrawLeft,
        barDrawRight,
        item.color || segments[0]?.color || "#4A90E2"
      );
      continue;
    }

    const value = item.value ?? baselinePrimary;
    let barHeight: number;
    let barY: number;
    if (value >= baselinePrimary) {
      const positiveRatio = (value - baselinePrimary) / ySpanPrimary;
      barHeight = positiveRatio * chartAreaHeight;
      barY = baselineY - barHeight;
    } else {
      const negativeRatio = (baselinePrimary - value) / ySpanPrimary;
      barHeight = negativeRatio * chartAreaHeight;
      barY = baselineY;
    }

    drawBar(
      ctx,
      barDrawLeft,
      barY,
      drawW,
      barHeight,
      item.color || "#4A90E2",
      item.gradient,
      barOpacity,
      item.shadow,
      item.stroke,
      globalBarShadow,
      globalBarStroke
    );

    const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
    if (shouldShowValue) {
      const valueLabelY =
        value >= baselinePrimary ? barY - 5 : barY + barHeight + 5;
      const valueLabelBaseline = value >= baselinePrimary ? "bottom" : "top";
      if (value >= baselinePrimary) {
        valueLabelPositions.set(bi, {
          y: valueLabelY,
          fontSize: valueFontSize,
          baseline: valueLabelBaseline,
        });
      }
      labelsToDraw.push({
        type: "value",
        text: value.toString(),
        x: barCenterX,
        y: valueLabelY,
        align: "center",
        baseline: valueLabelBaseline,
        color: item.valueColor || valueColor,
        fontSize: valueFontSize,
      });
    }

    pushComboCategoryBarLabel(
      bi,
      item,
      barCenterX,
      barY + barHeight / 2,
      barY,
      barDrawLeft,
      barDrawRight,
      item.color || "#4A90E2"
    );
  }

  ctx.restore();

  await renderComboLineSeries(
    ctx,
    lines,
    primaryPack,
    secondaryPack,
    {
      xMin,
      xMax,
      xAxisScale,
      originX,
      originY,
      axisEndX,
      axisEndY,
      baselineY,
    },
    op.lines ?? 1,
    op.pointLabels ?? 1,
    showPointLabels,
    pointLabelFontSize,
    pointLabelColor,
    pointLabelGradient,
    pointLabelStyle,
    pointLabelPosition
  );

  if (showSecondaryAxis) {
    ctx.save();
    ctx.globalAlpha = op.secondaryAxis ?? 1;
    ctx.strokeStyle = ySecondaryTickBase;
    ctx.lineWidth = axisWidth;
    ctx.lineCap = "butt";
    ctx.beginPath();
    ctx.moveTo(axisEndX, originY);
    ctx.lineTo(axisEndX, axisEndY);
    ctx.stroke();
    ctx.restore();
  }

  if (showSecondaryAxis && secondaryPack) {
    ctx.save();
    ctx.strokeStyle = ySecondaryTickBase;
    ctx.globalAlpha = op.secondaryAxis ?? 1;
    drawRightYAxisTicks(
      ctx,
      axisEndX,
      originY,
      axisEndY,
      secondaryPack.yScaleMin,
      secondaryPack.yScaleMax,
      secondaryPack.yStep,
      tickFontSize,
      secondaryPack.yAxisCustomValues,
      secondaryPack.yAxisValueSpacing,
      secondaryPack.yAxisScale,
      secondaryPack.yAxisDateFormat,
      secondaryPack.yAxisDateTime,
      ySecondaryTickBase
    );
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = op.xAxis ?? 1;
  ctx.strokeStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = "butt";
  ctx.beginPath();
  ctx.moveTo(originX, baselineY);
  ctx.lineTo(axisEndX, baselineY);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = op.primaryAxis ?? 1;
  ctx.strokeStyle = yPrimaryTickBase;
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();
  ctx.restore();

  if (xShowTickLabels) {
    ctx.save();
    ctx.globalAlpha = op.xAxis ?? 1;
    ctx.strokeStyle = xTickLabelColor;
    drawXAxisTicks(
      ctx,
      originX,
      baselineY,
      axisEndX,
      xMin,
      xMax,
      xStep,
      tickFontSize,
      xAxisCustomValues,
      xAxisValueSpacing,
      xAxisScale,
      xAxisDateFormat,
      xAxisDateTime,
      xTickLabelColor,
      "labels"
    );
    ctx.restore();
  }

  if (yPrimaryLabel) {
    ctx.save();
    ctx.globalAlpha = op.primaryAxis ?? 1;
    ctx.fillStyle = yPrimaryLabelColor;
    ctx.font = `${tickFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.translate(
      chartAreaLeft + yPrimaryTitleReservePx / 2,
      (originY + axisEndY) / 2
    );
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yPrimaryLabel, 0, 0);
    ctx.restore();
  }

  if (ySecondaryLabel && showSecondaryAxis) {
    ctx.save();
    ctx.globalAlpha = op.secondaryAxis ?? 1;
    ctx.fillStyle = ySecondaryLabelColor;
    ctx.font = `${tickFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    let secTitleReserve = reserveHorizontalForRotatedYAxisTitle(ctx, ySecondaryLabel, tickFontSize);
    const labelCenterX =
      axisEndX +
      TICK_LABEL_TO_AXIS_GAP +
      maxSecondaryTickW +
      Y_AXIS_TITLE_TO_TICK_LABEL_GAP +
      secTitleReserve / 2;
    ctx.translate(labelCenterX, (originY + axisEndY) / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(ySecondaryLabel, 0, 0);
    ctx.restore();
  }

  if (xAxisLabel) {
    ctx.save();
    ctx.globalAlpha = op.xAxis ?? 1;
    ctx.fillStyle = xAxisLabelColor;
    ctx.font = `${tickFontSize}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      xAxisLabel,
      (originX + axisEndX) / 2,
      baselineY + X_AXIS_TICK_TOP_OFFSET + tickFontSize + X_AXIS_TITLE_GAP_BELOW_TICKS
    );
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = op.valueLabels ?? 1;
  for (const L of labelsToDraw) {
    if (L.type === "value") {
      ctx.font = `${L.fontSize}px Arial`;
      ctx.fillStyle = L.color || valueColor;
      ctx.textAlign = L.align;
      ctx.textBaseline = L.baseline;
      ctx.fillText(L.text, L.x, L.y);
    }
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = op.barLabels ?? 1;
  for (const L of labelsToDraw) {
    if (L.type === "bar") {
      ctx.font = `${L.fontSize}px Arial`;
      ctx.fillStyle = L.color || "#000000";
      ctx.textAlign = L.align;
      ctx.textBaseline = L.baseline;
      ctx.fillText(L.text, L.x, L.y);
    }
  }
  ctx.restore();

  if (legendActive) {
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendBgColor = options.legend?.backgroundColor;
    const legendBorderColor = options.legend?.borderColor;
    const legendTextColor = options.legend?.textColor;
    const legendPadding = options.legend?.padding;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;

    let legendX: number;
    let legendY: number;
    const plotHeight = originY - axisEndY;

    switch (legendPlacement) {
      case "top":
        legendX = (baseWidth - legendWidth) / 2;
        legendY = vstack.chartAreaTopStart;
        break;
      case "top-left":
        legendX = paddingLeft + minLegendSpacing;
        legendY = vstack.legendCornerTopY;
        break;
      case "top-right":
        legendX = baseWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY = vstack.legendCornerTopY;
        break;
      case "bottom":
        legendX = (baseWidth - legendWidth) / 2;
        legendY =
          height - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case "bottom-left":
        legendX = paddingLeft + minLegendSpacing;
        legendY =
          height - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case "bottom-right":
        legendX = baseWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY =
          height - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case "left":
        legendX = paddingLeft + minLegendSpacing;
        legendY = axisEndY + (plotHeight - legendHeight) / 2;
        break;
      case "right":
      default:
        legendX = baseWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY = axisEndY + (plotHeight - legendHeight) / 2;
        break;
    }

    ctx.save();
    ctx.globalAlpha = op.legend ?? 1;
    await drawLegend(
      ctx,
      legendX,
      legendY,
      mergedLegendEntries,
      legendSpacing,
      legendFontSize,
      legendBgColor,
      legendBorderColor,
      legendTextColor,
      legendPadding,
      legendMaxWidth,
      legendWrapText,
      options.legend?.backgroundGradient,
      options.legend?.textGradient,
      options.legend?.textStyle,
      legendWidth,
      legendHeight
    );
    ctx.restore();
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
    const fw = baseWidth - frameW;
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
