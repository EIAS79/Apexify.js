/**
 * Unified chart exports
 */

export {
  PieSlice,
  LegendEntry as PieLegendEntry,
  StandardLegendConfig,
  ConnectedLegendConfig,
  PieChartOptions,
  createPieChart
} from './piechart';

export {
  BarSegment,
  BarChartData,
  BarChartType,
  LegendEntry as BarLegendEntry,
  AxisConfig as BarAxisConfig,
  BarChartOptions,
  createBarChart
} from './barchart';

export {
  HorizontalBarChartType,
  HorizontalBarSegment,
  HorizontalBarChartData,
  LegendEntry as HorizontalBarLegendEntry,
  HorizontalAxisConfig,
  HorizontalBarChartOptions,
  createHorizontalBarChart
} from './horizontalbarchart';

export {
  LineStyle,
  MarkerType,
  SmoothnessType,
  CorrelationType,
  ErrorBarConfig,
  LineDataPoint,
  AreaConfig,
  LineSeries,
  LegendEntry as LineLegendEntry,
  AxisConfig as LineAxisConfig,
  LineChartOptions,
  createLineChart
} from './linechart';

export {
  ComparisonChartType,
  ComparisonChartData,
  ComparisonChartOptions,
  ComparisonChartConfig,
  ComparisonLayout,
  EnhancedTextStyle as ComparisonEnhancedTextStyle,
  createComparisonChart
} from './comparisonchart';

/**
 * Unified chart type
 */
export type ChartType = 'pie' | 'bar' | 'horizontalBar' | 'line';

/**
 * Unified chart data (union of all chart data types)
 */
export type ChartData =
  | { type: 'pie'; data: import('./piechart').PieSlice[] }
  | { type: 'bar'; data: import('./barchart').BarChartData[] }
  | { type: 'horizontalBar'; data: import('./horizontalbarchart').HorizontalBarChartData[] }
  | { type: 'line'; data: import('./linechart').LineSeries[] };

/**
 * Unified chart options (union of all chart options types)
 */
export type ChartOptions =
  | { type: 'pie'; options: import('./piechart').PieChartOptions }
  | { type: 'bar'; options: import('./barchart').BarChartOptions }
  | { type: 'horizontalBar'; options: import('./horizontalbarchart').HorizontalBarChartOptions }
  | { type: 'line'; options: import('./linechart').LineChartOptions };

