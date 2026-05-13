import { getErrorMessage } from "../core/errors";
import { createPieChart } from "./impl/piechart";
import { createBarChart } from "./impl/barchart";
import { createHorizontalBarChart } from "./impl/horizontalbarchart";
import { createLineChart } from "./impl/linechart";
import { createScatterChart } from "./impl/scatterchart";
import { createRadarChart } from "./impl/radarchart";
import { createPolarAreaChart } from "./impl/polarareachart";
import { createComboChart } from "./impl/combochart";
import { createComparisonChart } from "./impl/comparisonchart";

/**
 * Chart facades — same surface as legacy {@link ChartCreator}; implementations live in `./impl/*`.
 */
export class ChartCreator {
  async createChart(
    chartType: "pie",
    data: import("./impl/piechart").PieSlice[],
    options?: import("./impl/piechart").PieChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "bar",
    data: import("./impl/barchart").BarChartData[],
    options?: import("./impl/barchart").BarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "horizontalBar",
    data: import("./impl/horizontalbarchart").HorizontalBarChartData[],
    options?: import("./impl/horizontalbarchart").HorizontalBarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "line",
    data: import("./impl/linechart").LineSeries[],
    options?: import("./impl/linechart").LineChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "scatter",
    data: import("./impl/scatterchart").ScatterSeries[],
    options?: import("./impl/scatterchart").ScatterChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "radar",
    data: import("./impl/radarchart").RadarSeries[],
    options?: import("./impl/radarchart").RadarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "polarArea",
    data: import("./impl/polarareachart").PolarAreaSlice[],
    options?: import("./impl/polarareachart").PolarAreaChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: "pie" | "bar" | "horizontalBar" | "line" | "scatter" | "radar" | "polarArea",
    data: unknown,
    options?: unknown
  ): Promise<Buffer> {
    try {
      switch (chartType) {
        case "pie":
          return await createPieChart(data as import("./impl/piechart").PieSlice[], options as never);
        case "bar":
          return await createBarChart(data as import("./impl/barchart").BarChartData[], options as never);
        case "horizontalBar":
          return await createHorizontalBarChart(
            data as import("./impl/horizontalbarchart").HorizontalBarChartData[],
            options as never
          );
        case "line":
          return await createLineChart(data as import("./impl/linechart").LineSeries[], options as never);
        case "scatter":
          return await createScatterChart(
            data as import("./impl/scatterchart").ScatterSeries[],
            options as never
          );
        case "radar":
          return await createRadarChart(data as import("./impl/radarchart").RadarSeries[], options as never);
        case "polarArea":
          return await createPolarAreaChart(
            data as import("./impl/polarareachart").PolarAreaSlice[],
            options as never
          );
        default:
          throw new Error(`Unsupported chart type: ${chartType}`);
      }
    } catch (error) {
      throw new Error(`createChart failed for type '${chartType}': ${getErrorMessage(error)}`);
    }
  }

  async createComparisonChart(
    options: import("./impl/comparisonchart").ComparisonChartOptions
  ): Promise<Buffer> {
    try {
      return await createComparisonChart(options);
    } catch (error) {
      throw new Error(`createComparisonChart failed: ${getErrorMessage(error)}`);
    }
  }

  async createComboChart(options: import("./impl/combochart").ComboChartOptions): Promise<Buffer> {
    try {
      return await createComboChart(options);
    } catch (error) {
      throw new Error(`createComboChart failed: ${getErrorMessage(error)}`);
    }
  }
}
