import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumber, assertFiniteNumericLeaves, assertRecord } from "../runtime/validation";

const DEFAULT_CHART_WIDTH = 800;
const DEFAULT_CHART_HEIGHT = 600;
const TYPES = ["pie", "bar", "horizontalBar", "line", "scatter", "radar", "polarArea"] as const;
type SupportedChartType = (typeof TYPES)[number];

interface TraversalCounters { items: number; text: number; }

function inspectBoundedValue(value: unknown, name: string, counters: TraversalCounters, depth = 0): void {
  if (depth > 16 || value == null || Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof URL || typeof value === "function") return;
  if (typeof value === "string") { counters.text += value.length; assertWithinLimit("maxTextLength", counters.text); return; }
  if (Array.isArray(value)) {
    counters.items += value.length;
    assertWithinLimit("maxCollectionItems", counters.items);
    for (let i = 0; i < value.length; i++) inspectBoundedValue(value[i], `${name}[${i}]`, counters, depth + 1);
    return;
  }
  if (typeof value === "object") for (const [key, child] of Object.entries(value as Record<string, unknown>)) inspectBoundedValue(child, `${name}.${key}`, counters, depth + 1);
}

function validateChartDimensions(options: unknown, name: string): void {
  if (options === undefined) { assertCanvasResourceLimits(DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT); return; }
  assertRecord(options, name);
  const dimensions = options.dimensions;
  if (dimensions === undefined) { assertCanvasResourceLimits(DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT); return; }
  assertRecord(dimensions, `${name}.dimensions`);
  const width = dimensions.width ?? DEFAULT_CHART_WIDTH;
  const height = dimensions.height ?? DEFAULT_CHART_HEIGHT;
  assertFiniteNumber(width, `${name}.dimensions.width`, { min: 1, integer: true });
  assertFiniteNumber(height, `${name}.dimensions.height`, { min: 1, integer: true });
  assertCanvasResourceLimits(width, height);
}

function validateChartValueTree(value: unknown, name: string): void {
  assertFiniteNumericLeaves(value, name);
  inspectBoundedValue(value, name, { items: 0, text: 0 });
  inspectSemanticOptionRanges(value, name);
}

function inspectSemanticOptionRanges(value: unknown, name: string, depth = 0): void {
  if (depth > 16 || value == null || typeof value !== "object" || Buffer.isBuffer(value) || value instanceof Uint8Array) return;
  if (Array.isArray(value)) { value.forEach((item, index) => inspectSemanticOptionRanges(item, `${name}[${index}]`, depth + 1)); return; }
  const record = value as Record<string, unknown>;
  for (const key of ["opacity", "fillOpacity", "innerRadiusRatio", "donutInnerRadius"] as const) {
    if (record[key] !== undefined) assertFiniteNumber(record[key], `${name}.${key}`, { min: 0, max: 1 });
  }
  if (record.range !== undefined) {
    assertRecord(record.range, `${name}.range`);
    const range = record.range;
    if (range.min !== undefined) assertFiniteNumber(range.min, `${name}.range.min`);
    if (range.max !== undefined) assertFiniteNumber(range.max, `${name}.range.max`);
    if (range.step !== undefined) assertFiniteNumber(range.step, `${name}.range.step`, { min: 0, exclusiveMin: true });
    if (typeof range.min === "number" && typeof range.max === "number" && range.min >= range.max) {
      throw new ApexifyInputError(`${name}.range.min must be less than range.max.`);
    }
  }
  for (const [key, child] of Object.entries(record)) inspectSemanticOptionRanges(child, `${name}.${key}`, depth + 1);
}

function nonEmptyLabel(record: Record<string, unknown>, name: string): void {
  if (typeof record.label !== "string") throw new ApexifyInputError(`${name}.label must be a string.`);
}

function validatePieLike(data: unknown[], name: string): void {
  let total = 0;
  data.forEach((item, index) => {
    assertRecord(item, `${name}[${index}]`);
    nonEmptyLabel(item, `${name}[${index}]`);
    assertFiniteNumber(item.value, `${name}[${index}].value`, { min: 0 });
    total += item.value;
  });
  if (!(total > 0)) throw new ApexifyInputError(`${name} total must be greater than zero.`);
}

function validateBars(data: unknown[], name: string, horizontal: boolean): void {
  data.forEach((item, index) => {
    assertRecord(item, `${name}[${index}]`);
    nonEmptyLabel(item, `${name}[${index}]`);
    const hasValue = item.value !== undefined;
    const hasValues = item.values !== undefined;
    if (hasValue === hasValues) throw new ApexifyInputError(`${name}[${index}] must provide exactly one of value or values.`);
    if (hasValue) assertFiniteNumber(item.value, `${name}[${index}].value`);
    if (hasValues) {
      if (!Array.isArray(item.values) || item.values.length === 0) throw new ApexifyInputError(`${name}[${index}].values must be a non-empty array.`);
      item.values.forEach((segment, segmentIndex) => {
        assertRecord(segment, `${name}[${index}].values[${segmentIndex}]`);
        assertFiniteNumber(segment.value, `${name}[${index}].values[${segmentIndex}].value`);
      });
    }
    for (const key of horizontal ? ["xStart", "xEnd", "yStart", "yEnd"] : ["xStart", "xEnd"]) {
      if (item[key] !== undefined) assertFiniteNumber(item[key], `${name}[${index}].${key}`);
    }
    if (!horizontal) {
      if (item.xStart === undefined || item.xEnd === undefined) throw new ApexifyInputError(`${name}[${index}] requires xStart and xEnd.`);
      if ((item.xEnd as number) <= (item.xStart as number)) throw new ApexifyInputError(`${name}[${index}].xEnd must be greater than xStart.`);
    }
  });
}

function validateCartesianSeries(data: unknown[], name: string): void {
  data.forEach((series, seriesIndex) => {
    assertRecord(series, `${name}[${seriesIndex}]`);
    nonEmptyLabel(series, `${name}[${seriesIndex}]`);
    if (!Array.isArray(series.data) || series.data.length === 0) throw new ApexifyInputError(`${name}[${seriesIndex}].data must be a non-empty array.`);
    series.data.forEach((point, pointIndex) => {
      assertRecord(point, `${name}[${seriesIndex}].data[${pointIndex}]`);
      assertFiniteNumber(point.x, `${name}[${seriesIndex}].data[${pointIndex}].x`);
      assertFiniteNumber(point.y, `${name}[${seriesIndex}].data[${pointIndex}].y`);
    });
  });
}

function validateRadar(data: unknown[], options: unknown, name: string): void {
  if (options === undefined) throw new ApexifyInputError("chart.options.radar.categories is required for radar charts.");
  assertRecord(options, "chart.options");
  assertRecord(options.radar, "chart.options.radar");
  if (!Array.isArray(options.radar.categories) || options.radar.categories.length < 3) throw new ApexifyInputError("chart.options.radar.categories must contain at least three labels.");
  const count = options.radar.categories.length;
  data.forEach((series, index) => {
    assertRecord(series, `${name}[${index}]`);
    nonEmptyLabel(series, `${name}[${index}]`);
    if (!Array.isArray(series.values) || series.values.length !== count) throw new ApexifyInputError(`${name}[${index}].values length must match radar.categories.`);
    series.values.forEach((value, valueIndex) => assertFiniteNumber(value, `${name}[${index}].values[${valueIndex}]`, { min: 0 }));
  });
  if (options.radar.maxValue !== undefined) assertFiniteNumber(options.radar.maxValue, "chart.options.radar.maxValue", { min: 0, exclusiveMin: true });
}

function validateTypeSemantics(chartType: SupportedChartType, data: unknown[], options: unknown): void {
  switch (chartType) {
    case "pie": validatePieLike(data, "chart.data"); break;
    case "polarArea": validatePieLike(data, "chart.data"); break;
    case "bar": validateBars(data, "chart.data", false); break;
    case "horizontalBar": validateBars(data, "chart.data", true); break;
    case "line": validateCartesianSeries(data, "chart.data"); break;
    case "scatter": validateCartesianSeries(data, "chart.data"); break;
    case "radar": validateRadar(data, options, "chart.data"); break;
  }
}

export function validateChartRequest(chartType: unknown, data: unknown, options?: unknown): void {
  if (typeof chartType !== "string" || !TYPES.includes(chartType as SupportedChartType)) throw new ApexifyInputError("chart.type is unsupported.");
  if (!Array.isArray(data) || data.length === 0) throw new ApexifyInputError("chart.data must be a non-empty array.");
  validateChartValueTree(data, "chart.data");
  if (options !== undefined) validateChartValueTree(options, "chart.options");
  validateChartDimensions(options, "chart.options");
  validateTypeSemantics(chartType as SupportedChartType, data, options);
}

export function validateCompositeChartOptions(options: unknown, name: "comparisonChart" | "comboChart"): void {
  assertRecord(options, name);
  validateChartValueTree(options, name);
  validateChartDimensions(options, name);
}
