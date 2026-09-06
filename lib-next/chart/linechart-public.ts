import {
  createLineChart as createLineChartImpl,
  type LineChartOptions,
  type LineSeries,
} from "./impl/linechart";

export * from "./impl/linechart";

function expandedDomain(value: number): { min: number; max: number; step: number } {
  const delta = Math.max(Math.abs(value) * 0.1, 1);
  return {
    min: value - delta,
    max: value + delta,
    step: delta,
  };
}

function hasCompleteRange(range: { min?: number; max?: number } | undefined): boolean {
  return range?.min !== undefined && range.max !== undefined;
}

/**
 * Public line-chart renderer with finite-domain normalization.
 *
 * The legacy renderer derives tick steps from the observed span. A single X
 * coordinate, or a flat Y series whose effective baseline equals that value,
 * produces a zero-width span and therefore a zero tick step. Tick/grid loops
 * cannot advance with a zero step. Expand only those automatically-derived
 * degenerate domains; explicit ranges and custom tick values remain untouched.
 */
export async function createLineChart(
  series: LineSeries[],
  options: LineChartOptions = {}
): Promise<Buffer> {
  const xValues = series.flatMap((entry) => entry.data.map((point) => point.x));
  const yValues = series.flatMap((entry) => entry.data.map((point) => point.y));

  let xRange = options.axes?.x?.range;
  let yRange = options.axes?.y?.range;

  const hasCustomXValues = (options.axes?.x?.values?.length ?? 0) > 0;
  const hasCustomYValues = (options.axes?.y?.values?.length ?? 0) > 0;

  if (!hasCustomXValues && !hasCompleteRange(xRange) && xValues.length > 0) {
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    if (xMin === xMax) xRange = expandedDomain(xMin);
  }

  if (!hasCustomYValues && !hasCompleteRange(yRange) && yValues.length > 0) {
    const baseline = options.axes?.y?.baseline ?? 0;
    const yMin = Math.min(...yValues, baseline);
    const yMax = Math.max(...yValues, baseline);
    if (yMin === yMax) yRange = expandedDomain(yMin);
  }

  if (xRange === options.axes?.x?.range && yRange === options.axes?.y?.range) {
    return createLineChartImpl(series, options);
  }

  const normalized: LineChartOptions = {
    ...options,
    axes: {
      ...options.axes,
      x: {
        ...options.axes?.x,
        ...(xRange !== undefined ? { range: xRange } : {}),
      },
      y: {
        ...options.axes?.y,
        ...(yRange !== undefined ? { range: yRange } : {}),
      },
    },
  };

  return createLineChartImpl(series, normalized);
}
