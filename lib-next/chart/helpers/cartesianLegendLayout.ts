import type { LegendPlacement } from "../../types/chart-common";

const X_AXIS_TICK_TOP_OFFSET = 10;
const X_AXIS_TITLE_GAP_BELOW_TICKS = 14;

export interface CartesianLegendLayoutInput {
  legendPlacement: LegendPlacement;
  width: number;
  height: number;
  paddingLeft: number;
  paddingRight: number;
  paddingBottom: number;
  legendWidth: number;
  legendHeight: number;
  minLegendSpacing: number;
  chartAreaTopStart: number;
  legendCornerTopY: number;
  originX: number;
  axisEndX: number;
  originY: number;
  axisEndY: number;
  xAxisLabel?: string;
  tickFontSize: number;
}

/**
 * Same legend `(x,y)` rules as {@link createLineChart} for Cartesian plots.
 */
export function layoutCartesianLegendBox(p: CartesianLegendLayoutInput): {
  legendX: number;
  legendY: number;
} {
  const chartAreaHeight = p.originY - p.axisEndY;
  let legendX = 0;
  let legendY = 0;

  switch (p.legendPlacement) {
    case "top":
      legendX = (p.originX + p.axisEndX - p.legendWidth) / 2;
      legendY = p.chartAreaTopStart;
      break;
    case "top-left":
      legendX = p.paddingLeft + p.minLegendSpacing;
      legendY = p.legendCornerTopY;
      break;
    case "top-right":
      legendX = p.width - p.paddingRight - p.legendWidth - p.minLegendSpacing;
      legendY = p.legendCornerTopY;
      break;
    case "bottom":
      legendX = (p.originX + p.axisEndX - p.legendWidth) / 2;
      {
        const naturalBottomLegendY =
          p.height - p.paddingBottom - p.legendHeight - p.minLegendSpacing;
        const xTickLabelBottom = p.originY + X_AXIS_TICK_TOP_OFFSET + p.tickFontSize;
        const xAxisTitleBottom = p.xAxisLabel
          ? p.originY +
            X_AXIS_TICK_TOP_OFFSET +
            p.tickFontSize +
            X_AXIS_TITLE_GAP_BELOW_TICKS +
            p.tickFontSize
          : xTickLabelBottom;
        const minLegendTop = xAxisTitleBottom + Math.max(8, p.minLegendSpacing);
        legendY = Math.max(naturalBottomLegendY, minLegendTop);
      }
      break;
    case "bottom-left":
      legendX = p.paddingLeft + p.minLegendSpacing;
      {
        const naturalBottomLegendY =
          p.height - p.paddingBottom - p.legendHeight - p.minLegendSpacing;
        const xTickLabelBottom = p.originY + X_AXIS_TICK_TOP_OFFSET + p.tickFontSize;
        const xAxisTitleBottom = p.xAxisLabel
          ? p.originY +
            X_AXIS_TICK_TOP_OFFSET +
            p.tickFontSize +
            X_AXIS_TITLE_GAP_BELOW_TICKS +
            p.tickFontSize
          : xTickLabelBottom;
        const minLegendTop = xAxisTitleBottom + Math.max(8, p.minLegendSpacing);
        legendY = Math.max(naturalBottomLegendY, minLegendTop);
      }
      break;
    case "bottom-right":
      legendX = p.width - p.paddingRight - p.legendWidth - p.minLegendSpacing;
      {
        const naturalBottomLegendY =
          p.height - p.paddingBottom - p.legendHeight - p.minLegendSpacing;
        const xTickLabelBottom = p.originY + X_AXIS_TICK_TOP_OFFSET + p.tickFontSize;
        const xAxisTitleBottom = p.xAxisLabel
          ? p.originY +
            X_AXIS_TICK_TOP_OFFSET +
            p.tickFontSize +
            X_AXIS_TITLE_GAP_BELOW_TICKS +
            p.tickFontSize
          : xTickLabelBottom;
        const minLegendTop = xAxisTitleBottom + Math.max(8, p.minLegendSpacing);
        legendY = Math.max(naturalBottomLegendY, minLegendTop);
      }
      break;
    case "left":
      legendX = p.paddingLeft + p.minLegendSpacing;
      legendY = p.axisEndY + (chartAreaHeight - p.legendHeight) / 2;
      break;
    case "left-top":
      legendX = p.paddingLeft + p.minLegendSpacing;
      legendY = p.axisEndY + p.minLegendSpacing;
      break;
    case "left-bottom":
      legendX = p.paddingLeft + p.minLegendSpacing;
      legendY = p.originY - p.legendHeight - p.minLegendSpacing;
      break;
    case "right-top":
      legendX = p.width - p.paddingRight - p.legendWidth - p.minLegendSpacing;
      legendY = p.axisEndY + p.minLegendSpacing;
      break;
    case "right-bottom":
      legendX = p.width - p.paddingRight - p.legendWidth - p.minLegendSpacing;
      legendY = p.originY - p.legendHeight - p.minLegendSpacing;
      break;
    case "right":
    default:
      legendX = p.width - p.paddingRight - p.legendWidth - p.minLegendSpacing;
      legendY = p.axisEndY + (chartAreaHeight - p.legendHeight) / 2;
      break;
  }

  return { legendX, legendY };
}
