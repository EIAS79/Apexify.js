/**
 * Charts — public API. Chart renderers: `./impl/*`. Shared layout/background: `./helpers/*`. Types: `../types/chart*.ts`.
 */
export { ChartCreator, ChartCreator as ChartRenderer } from "./chart-creator";

export { paintChartCanvasBackground } from "./helpers/chartBackground";

export * from "./helpers/chartPadding";
export * from "./helpers/cartesianLegendLayout";
export * from "./helpers/axisTitleLayout";

export {
  normalizeLegendPosition,
  legendConsumesLeftEdge,
  legendConsumesRightEdge,
  legendConsumesTopEdge,
  legendConsumesBottomEdge,
} from "./helpers/legendPlacement";
export * from "./helpers/legendTextLayout";

/** Per-chart modules as namespaces (avoids type name collisions across charts). */
export * as pie from "./impl/piechart";
export * as bar from "./impl/barchart";
export * as horizontalBar from "./impl/horizontalbarchart";
export * as line from "./impl/linechart";
export * as scatter from "./impl/scatterchart";
export * as radar from "./impl/radarchart";
export * as polarArea from "./impl/polarareachart";
export * as combo from "./impl/combochart";
export * as comparison from "./impl/comparisonchart";
