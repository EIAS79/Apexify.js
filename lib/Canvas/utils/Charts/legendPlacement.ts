/**
 * Canonical legend positions for chart layout.
 * Accepts aliases via {@link normalizeLegendPosition} (e.g. `topLeft`, `bottom_right`).
 */
export type LegendPlacement =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

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
    lefttop: 'top-left',
    'top-right': 'top-right',
    topright: 'top-right',
    righttop: 'top-right',
    'bottom-left': 'bottom-left',
    bottomleft: 'bottom-left',
    leftbottom: 'bottom-left',
    'bottom-right': 'bottom-right',
    bottomright: 'bottom-right',
    rightbottom: 'bottom-right',
  };
  return map[key] ?? 'right';
}

export function legendConsumesLeftEdge(p: LegendPlacement): boolean {
  return p === 'left' || p === 'top-left' || p === 'bottom-left';
}

export function legendConsumesRightEdge(p: LegendPlacement): boolean {
  return p === 'right' || p === 'top-right' || p === 'bottom-right';
}

export function legendConsumesTopEdge(p: LegendPlacement): boolean {
  return p === 'top' || p === 'top-left' || p === 'top-right';
}

export function legendConsumesBottomEdge(p: LegendPlacement): boolean {
  return p === 'bottom' || p === 'bottom-left' || p === 'bottom-right';
}

/** Legend in a top corner may overlap the plot horizontally only — avoid full-width vertical inset. */
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
      break;
    case 'top-right':
      chartAreaRight -= w;
      break;
    case 'bottom-left':
      bumpLeft();
      chartAreaBottom -= h;
      break;
    case 'bottom-right':
      chartAreaRight -= w;
      chartAreaBottom -= h;
      break;
    default:
      chartAreaRight -= w;
  }

  return { chartAreaLeft, chartAreaRight, chartAreaTop, chartAreaBottom };
}

