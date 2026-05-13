import type { PieSlice, PieChartOptions } from "../../types/chart";
import type { BarChartData, BarChartOptions } from "../../chart/impl/barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "../../chart/impl/horizontalbarchart";
import type { LineSeries, LineChartOptions } from "../../chart/impl/linechart";
import type { ScatterSeries, ScatterChartOptions } from "../../chart/impl/scatterchart";
import type { RadarSeries, RadarChartOptions } from "../../chart/impl/radarchart";
import type { PolarAreaSlice, PolarAreaChartOptions } from "../../chart/impl/polarareachart";
import { ChartCreator } from "../../chart/chart-creator";

/** Typed chart entrypoints (`createChart`, comparison, combo). */
export class ChartCreate {
  constructor(private readonly chartCreator: ChartCreator) {}

  async createChart<T extends "pie" | "bar" | "horizontalBar" | "line" | "scatter" | "radar" | "polarArea">(
    chartType: T,
    data: T extends "pie"
      ? PieSlice[]
      : T extends "bar"
        ? BarChartData[]
        : T extends "horizontalBar"
          ? HorizontalBarChartData[]
          : T extends "line"
            ? LineSeries[]
            : T extends "scatter"
              ? ScatterSeries[]
              : T extends "radar"
                ? RadarSeries[]
                : T extends "polarArea"
                  ? PolarAreaSlice[]
                  : never,
    options?: T extends "pie"
      ? PieChartOptions
      : T extends "bar"
        ? BarChartOptions
        : T extends "horizontalBar"
          ? HorizontalBarChartOptions
          : T extends "line"
            ? LineChartOptions
            : T extends "scatter"
              ? ScatterChartOptions
              : T extends "radar"
                ? RadarChartOptions
                : T extends "polarArea"
                  ? PolarAreaChartOptions
                  : never
  ): Promise<Buffer> {
    switch (chartType) {
      case "pie":
        return await this.chartCreator.createChart("pie", data as PieSlice[], options as PieChartOptions | undefined);
      case "bar":
        return await this.chartCreator.createChart("bar", data as BarChartData[], options as BarChartOptions | undefined);
      case "horizontalBar":
        return await this.chartCreator.createChart(
          "horizontalBar",
          data as HorizontalBarChartData[],
          options as HorizontalBarChartOptions | undefined
        );
      case "line":
        return await this.chartCreator.createChart("line", data as LineSeries[], options as LineChartOptions | undefined);
      case "scatter":
        return await this.chartCreator.createChart(
          "scatter",
          data as ScatterSeries[],
          options as ScatterChartOptions | undefined
        );
      case "radar":
        return await this.chartCreator.createChart("radar", data as RadarSeries[], options as RadarChartOptions | undefined);
      case "polarArea":
        return await this.chartCreator.createChart(
          "polarArea",
          data as PolarAreaSlice[],
          options as PolarAreaChartOptions | undefined
        );
      default:
        throw new Error(`Unsupported chart type: ${String(chartType)}`);
    }
  }

  createComparisonChart(options: import("../../chart/impl/comparisonchart").ComparisonChartOptions): Promise<Buffer> {
    return this.chartCreator.createComparisonChart(options);
  }

  createComboChart(options: import("../../chart/impl/combochart").ComboChartOptions): Promise<Buffer> {
    return this.chartCreator.createComboChart(options);
  }
}
