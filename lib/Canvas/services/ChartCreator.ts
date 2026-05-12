import { createPieChart } from '../utils/chart/piechart';
import { createBarChart } from '../utils/chart/barchart';
import { createHorizontalBarChart } from '../utils/chart/horizontalbarchart';
import { createLineChart } from '../utils/chart/linechart';
import { createScatterChart } from '../utils/chart/scatterchart';
import { createRadarChart } from '../utils/chart/radarchart';
import { createPolarAreaChart } from '../utils/chart/polarareachart';
import { createComboChart } from '../utils/chart/combochart';
import { createComparisonChart } from '../utils/chart/comparisonchart';
import { getErrorMessage } from '../utils/foundation/errorUtils';

/**
 * Extended class for chart creation functionality
 */
export class ChartCreator {
  /**
   * Creates a chart based on the specified type.
   * For side-by-side or stacked multi-chart layouts, use {@link createComparisonChart} instead.
   *
   * @param chartType - Type of chart to create ('pie', 'bar', 'horizontalBar', 'line', 'scatter', 'radar', 'polarArea')
   * @param data - Chart data (type depends on chartType)
   * @param options - Chart options (type depends on chartType)
   * @returns Promise<Buffer> - Chart image buffer
   */
  async createChart(
    chartType: 'pie',
    data: import('../utils/chart/piechart').PieSlice[],
    options?: import('../utils/chart/piechart').PieChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'bar',
    data: import('../utils/chart/barchart').BarChartData[],
    options?: import('../utils/chart/barchart').BarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'horizontalBar',
    data: import('../utils/chart/horizontalbarchart').HorizontalBarChartData[],
    options?: import('../utils/chart/horizontalbarchart').HorizontalBarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'line',
    data: import('../utils/chart/linechart').LineSeries[],
    options?: import('../utils/chart/linechart').LineChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'scatter',
    data: import('../utils/chart/scatterchart').ScatterSeries[],
    options?: import('../utils/chart/scatterchart').ScatterChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'radar',
    data: import('../utils/chart/radarchart').RadarSeries[],
    options?: import('../utils/chart/radarchart').RadarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'polarArea',
    data: import('../utils/chart/polarareachart').PolarAreaSlice[],
    options?: import('../utils/chart/polarareachart').PolarAreaChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'pie' | 'bar' | 'horizontalBar' | 'line' | 'scatter' | 'radar' | 'polarArea',
    data: any,
    options?: any
  ): Promise<Buffer> {
    try {
      switch (chartType) {
        case 'pie':
          return await createPieChart(data, options);

        case 'bar':
          return await createBarChart(data, options);

        case 'horizontalBar':
          return await createHorizontalBarChart(data, options);

        case 'line':
          return await createLineChart(data, options);

        case 'scatter':
          return await createScatterChart(data, options);

        case 'radar':
          return await createRadarChart(data, options);

        case 'polarArea':
          return await createPolarAreaChart(data, options);

        default:
          throw new Error(`Unsupported chart type: ${chartType}`);
      }
    } catch (error) {
      throw new Error(`createChart failed for type '${chartType}': ${getErrorMessage(error)}`);
    }
  }

  /**
   * Creates a comparison chart with two charts side by side or top/bottom.
   * Each chart can be of any type (pie, bar, horizontalBar, line, donut, scatter, radar, polarArea) with its own data and config.
   * Panel `appearance` supports gradient, `customBg`, `bgLayers`, and inherited axis defaults; charts are drawn with uniform scaling into each cell.
   *
   * @param options - Comparison chart configuration
   * @returns Promise<Buffer> - Comparison chart image buffer
   */
  async createComparisonChart(
    options: import('../utils/chart/comparisonchart').ComparisonChartOptions
  ): Promise<Buffer> {
    try {
      return await createComparisonChart(options);
    } catch (error) {
      throw new Error(`createComparisonChart failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Bar + line on one plot with optional **secondary Y-axis** on the right.
   * Lines default to the right scale; set `yAxis: 'primary'` to use the bar scale.
   */
  async createComboChart(
    options: import('../utils/chart/combochart').ComboChartOptions
  ): Promise<Buffer> {
    try {
      return await createComboChart(options);
    } catch (error) {
      throw new Error(`createComboChart failed: ${getErrorMessage(error)}`);
    }
  }
}

