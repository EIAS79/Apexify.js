import type { LegendPlacement } from "./legendPlacement";
import { legendConsumesTopEdge } from "./legendPlacement";

/**
 * Outer margins scale with canvas size so plots use most of the frame on large canvases.
 */
export function defaultOuterPadding(canvasWidth: number, canvasHeight: number): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const r = Math.min(Math.max(canvasWidth, 1), Math.max(canvasHeight, 1));
  const base = Math.max(18, Math.min(52, Math.round(r * 0.048)));
  return {
    top: base + 12,
    right: base + 4,
    bottom: base + 13,
    left: base + 8,
  };
}

/**
 * Rhythm between title → legend (when legend is on the top edge) → plot.
 * Scales with canvas size so large exports get proportional breathing room.
 */
export function chartVerticalStackGaps(
  canvasWidth: number,
  canvasHeight: number,
  legendSpacing: number
): { titleToLegend: number; legendToPlot: number; titleToPlot: number } {
  const short = Math.min(Math.max(canvasWidth, 1), Math.max(canvasHeight, 1));
  const rhythm = Math.max(14, Math.min(36, Math.round(short * 0.034)));
  const ls = Math.max(legendSpacing, 12);
  return {
    titleToLegend: Math.max(Math.round(ls * 0.72), Math.round(rhythm * 0.95)),
    legendToPlot: Math.max(ls, rhythm),
    titleToPlot: Math.max(Math.round(ls * 0.88), rhythm),
  };
}

export interface ChartVerticalStackOptions {
  paddingTop: number;
  width: number;
  height: number;
  chartTitle?: string | undefined;
  chartTitleFontSize: number;
  legendSpacing: number;
  showLegend: boolean;
  legendPlacement: LegendPlacement;
  legendWidth: number;
  legendHeight: number;
  /** Minimum inset gap passed to legend/plot inset math (default 10). */
  minLegendInsetFloor?: number;
}

/**
 * Computes where the plot band starts vertically (before {@link applyLegendChartAreaInset}),
 * and a canvas-aware gap between legend box and plot for inset math.
 */
export function computeChartVerticalStack(options: ChartVerticalStackOptions): {
  chartAreaTopStart: number;
  legendInsetGap: number;
  legendAtTop: boolean;
  titleTopInset: number;
  titleTextBottom: number;
  /** Y for top-left / top-right legends (below title; may overlap plot corner). */
  legendCornerTopY: number;
} {
  const titleTopInset = 10;
  const stack = chartVerticalStackGaps(options.width, options.height, options.legendSpacing);
  const floor = options.minLegendInsetFloor ?? 10;
  const legendInsetGap = Math.max(floor, stack.legendToPlot);

  /** Any legend in the top margin (`top`, `top-left`, `top-right`) uses the same title→plot spacing so the plot does not jump when switching between them. */
  const legendAtTop =
    options.showLegend &&
    options.legendWidth > 0 &&
    options.legendHeight > 0 &&
    legendConsumesTopEdge(options.legendPlacement);

  const titleTextBottom =
    options.paddingTop +
    (options.chartTitle ? titleTopInset + options.chartTitleFontSize : 0);

  let chartAreaTopStart: number;
  if (legendAtTop) {
    chartAreaTopStart = options.chartTitle
      ? titleTextBottom + stack.titleToLegend
      : options.paddingTop + stack.titleToLegend;
  } else {
    chartAreaTopStart =
      titleTextBottom + (options.chartTitle ? stack.titleToPlot : 0);
  }

  /** Align corner top legends (`top-left` / `top-right`) on the same row as `top` after {@link chartAreaTopStart}. */
  const legendCornerTopY = chartAreaTopStart;

  return {
    chartAreaTopStart,
    legendInsetGap,
    legendAtTop,
    titleTopInset,
    titleTextBottom,
    legendCornerTopY,
  };
}

export function resolveOuterPadding(
  user: { top?: number; right?: number; bottom?: number; left?: number } | undefined,
  canvasWidth: number,
  canvasHeight: number
): { top: number; right: number; bottom: number; left: number } {
  const d = defaultOuterPadding(canvasWidth, canvasHeight);
  return {
    top: user?.top ?? d.top,
    right: user?.right ?? d.right,
    bottom: user?.bottom ?? d.bottom,
    left: user?.left ?? d.left,
  };
}
