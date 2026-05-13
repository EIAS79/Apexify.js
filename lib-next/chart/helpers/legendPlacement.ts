import type { LegendPlacement } from "../../types/chart-common";

export type { LegendPlacement };

/**
 * First word = primary band (top/bottom strip vs left/right strip); second = alignment within it.
 * E.g. `top-right` = above the chart, flush right; `right-top` = beside the chart on the right, top-aligned.
 */
export function normalizeLegendPosition(raw: string | undefined): LegendPlacement {
  const key = String(raw ?? 'right')
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '');
  const map: Record<string, LegendPlacement> = {
    top: 'top',
    bottom: 'bottom',
    left: 'left',
    right: 'right',
    'top-left': 'top-left',
    topleft: 'top-left',
    'top-right': 'top-right',
    topright: 'top-right',
    'bottom-left': 'bottom-left',
    bottomleft: 'bottom-left',
    'bottom-right': 'bottom-right',
    bottomright: 'bottom-right',
    'right-top': 'right-top',
    righttop: 'right-top',
    'right-bottom': 'right-bottom',
    rightbottom: 'right-bottom',
    'left-top': 'left-top',
    lefttop: 'left-top',
    'left-bottom': 'left-bottom',
    leftbottom: 'left-bottom',
  };
  return map[key] ?? 'right';
}

export function legendConsumesLeftEdge(p: LegendPlacement): boolean {
  return (
    p === 'left' ||
    p === 'top-left' ||
    p === 'bottom-left' ||
    p === 'left-top' ||
    p === 'left-bottom'
  );
}

export function legendConsumesRightEdge(p: LegendPlacement): boolean {
  return (
    p === 'right' ||
    p === 'top-right' ||
    p === 'bottom-right' ||
    p === 'right-top' ||
    p === 'right-bottom'
  );
}

export function legendConsumesTopEdge(p: LegendPlacement): boolean {
  return p === 'top' || p === 'top-left' || p === 'top-right';
}

export function legendConsumesBottomEdge(p: LegendPlacement): boolean {
  return p === 'bottom' || p === 'bottom-left' || p === 'bottom-right';
}

/** True for `top-left` / `top-right`. Plot layout still reserves the same top band as {@link legendConsumesTopEdge}; inset adds horizontal + vertical clearance like full `top`. */
export function legendIsCornerTop(p: LegendPlacement): boolean {
  return p === 'top-left' || p === 'top-right';
}

export interface LegendChartAreaInsetBounds {
  chartAreaLeft: number;
  chartAreaRight: number;
  chartAreaTop: number;
  chartAreaBottom: number;
}

/**
 * Shrinks the plot rectangle so the legend fits inside the canvas (no extra blank stripes).
 * For bar charts with a left legend, pass `additionalLeftInset` = Y-axis tick label reserve.
 */
export function applyLegendChartAreaInset(
  placement: LegendPlacement,
  bounds: LegendChartAreaInsetBounds,
  legendWidth: number,
  legendHeight: number,
  legendGap: number,
  additionalLeftInset = 0
): LegendChartAreaInsetBounds {
  const w = legendWidth + legendGap;
  const h = legendHeight + legendGap;
  let { chartAreaLeft, chartAreaRight, chartAreaTop, chartAreaBottom } = bounds;

  const bumpLeft = (): void => {
    chartAreaLeft += w + additionalLeftInset;
  };

  switch (placement) {
    case 'left':
      bumpLeft();
      break;
    case 'right':
      chartAreaRight -= w;
      break;
    case 'top':
      chartAreaTop += h;
      break;
    case 'bottom':
      chartAreaBottom -= h;
      break;
    case 'top-left':
      bumpLeft();
      chartAreaTop += h;
      break;
    case 'top-right':
      chartAreaRight -= w;
      chartAreaTop += h;
      break;
    case 'bottom-left':
      bumpLeft();
      chartAreaBottom -= h;
      break;
    case 'bottom-right':
      chartAreaRight -= w;
      chartAreaBottom -= h;
      break;
    case 'right-top':
    case 'right-bottom':
      chartAreaRight -= w;
      break;
    case 'left-top':
    case 'left-bottom':
      bumpLeft();
      break;
    default:
      chartAreaRight -= w;
  }

  return { chartAreaLeft, chartAreaRight, chartAreaTop, chartAreaBottom };
}

