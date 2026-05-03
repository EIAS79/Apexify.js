import { createPieChart } from '../utils/Charts/piechart';
import { createBarChart } from '../utils/Charts/barchart';
import { createHorizontalBarChart } from '../utils/Charts/horizontalbarchart';
import { createLineChart } from '../utils/Charts/linechart';
import { createScatterChart } from '../utils/Charts/scatterchart';
import { createRadarChart } from '../utils/Charts/radarchart';
import { createPolarAreaChart } from '../utils/Charts/polarareachart';
import { createComboChart } from '../utils/Charts/combochart';
import { createComparisonChart } from '../utils/Charts/comparisonchart';
import { getErrorMessage } from '../utils/core/errorUtils';

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
    data: import('../utils/Charts/piechart').PieSlice[],
    options?: import('../utils/Charts/piechart').PieChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'bar',
    data: import('../utils/Charts/barchart').BarChartData[],
    options?: import('../utils/Charts/barchart').BarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'horizontalBar',
    data: import('../utils/Charts/horizontalbarchart').HorizontalBarChartData[],
    options?: import('../utils/Charts/horizontalbarchart').HorizontalBarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'line',
    data: import('../utils/Charts/linechart').LineSeries[],
    options?: import('../utils/Charts/linechart').LineChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'scatter',
    data: import('../utils/Charts/scatterchart').ScatterSeries[],
    options?: import('../utils/Charts/scatterchart').ScatterChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'radar',
    data: import('../utils/Charts/radarchart').RadarSeries[],
    options?: import('../utils/Charts/radarchart').RadarChartOptions
  ): Promise<Buffer>;
  async createChart(
    chartType: 'polarArea',
    data: import('../utils/Charts/polarareachart').PolarAreaSlice[],
    options?: import('../utils/Charts/polarareachart').PolarAreaChartOptions
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
    options: import('../utils/Charts/comparisonchart').ComparisonChartOptions
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
    options: import('../utils/Charts/combochart').ComboChartOptions
  ): Promise<Buffer> {
    try {
      return await createComboChart(options);
    } catch (error) {
      throw new Error(`createComboChart failed: ${getErrorMessage(error)}`);
    }
  }
}

