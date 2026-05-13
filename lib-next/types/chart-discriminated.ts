import type { PieSlice, PieChartOptions } from "./chart-pie";

/** Discriminated chart kind for `ChartCreator.createChart`. Combo / comparison use dedicated methods. */
export type ChartType =
  | "pie"
  | "bar"
  | "horizontalBar"
  | "line"
  | "scatter"
  | "radar"
  | "polarArea";

export type ChartData =
  | { type: "pie"; data: PieSlice[] }
  | { type: "bar"; data: import("../chart/impl/barchart").BarChartData[] }
  | { type: "horizontalBar"; data: import("../chart/impl/horizontalbarchart").HorizontalBarChartData[] }
  | { type: "line"; data: import("../chart/impl/linechart").LineSeries[] }
  | { type: "scatter"; data: import("../chart/impl/scatterchart").ScatterSeries[] }
  | { type: "radar"; data: import("../chart/impl/radarchart").RadarSeries[] }
  | { type: "polarArea"; data: import("../chart/impl/polarareachart").PolarAreaSlice[] };

export type ChartOptions =
  | { type: "pie"; options: PieChartOptions }
  | { type: "bar"; options: import("../chart/impl/barchart").BarChartOptions }
  | { type: "horizontalBar"; options: import("../chart/impl/horizontalbarchart").HorizontalBarChartOptions }
  | { type: "line"; options: import("../chart/impl/linechart").LineChartOptions }
  | { type: "scatter"; options: import("../chart/impl/scatterchart").ScatterChartOptions }
  | { type: "radar"; options: import("../chart/impl/radarchart").RadarChartOptions }
  | { type: "polarArea"; options: import("../chart/impl/polarareachart").PolarAreaChartOptions };
