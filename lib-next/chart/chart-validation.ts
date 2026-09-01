import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumericLeaves, assertRecord } from "../runtime/validation";

const DEFAULT_CHART_WIDTH = 800;
const DEFAULT_CHART_HEIGHT = 600;

interface TraversalCounters {
  items: number;
  text: number;
}

function inspectBoundedValue(value: unknown, name: string, counters: TraversalCounters, depth = 0): void {
  if (depth > 16 || value == null || Buffer.isBuffer(value) || value instanceof Uint8Array || value instanceof URL) return;
  if (typeof value === "string") {
    counters.text += value.length;
    assertWithinLimit("maxTextLength", counters.text);
    return;
  }
  if (Array.isArray(value)) {
    counters.items += value.length;
    assertWithinLimit("maxCollectionItems", counters.items);
    for (let i = 0; i < value.length; i++) inspectBoundedValue(value[i], `${name}[${i}]`, counters, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      inspectBoundedValue(child, `${name}.${key}`, counters, depth + 1);
    }
  }
}

function validateChartDimensions(options: unknown, name: string): void {
  if (options === undefined) {
    assertCanvasResourceLimits(DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT);
    return;
  }
  assertRecord(options, name);
  const dimensions = options.dimensions;
  if (dimensions === undefined) {
    assertCanvasResourceLimits(DEFAULT_CHART_WIDTH, DEFAULT_CHART_HEIGHT);
    return;
  }
  assertRecord(dimensions, `${name}.dimensions`);
  const width = dimensions.width ?? DEFAULT_CHART_WIDTH;
  const height = dimensions.height ?? DEFAULT_CHART_HEIGHT;
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0 || !Number.isInteger(width)) {
    throw new ApexifyInputError(`${name}.dimensions.width must be a finite positive integer.`);
  }
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0 || !Number.isInteger(height)) {
    throw new ApexifyInputError(`${name}.dimensions.height must be a finite positive integer.`);
  }
  assertCanvasResourceLimits(width, height);
}

function validateChartValueTree(value: unknown, name: string): void {
  assertFiniteNumericLeaves(value, name);
  inspectBoundedValue(value, name, { items: 0, text: 0 });
}

export function validateChartRequest(chartType: unknown, data: unknown, options?: unknown): void {
  if (typeof chartType !== "string" || !["pie", "bar", "horizontalBar", "line", "scatter", "radar", "polarArea"].includes(chartType)) {
    throw new ApexifyInputError("chart.type is unsupported.");
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new ApexifyInputError("chart.data must be a non-empty array.");
  }
  validateChartValueTree(data, "chart.data");
  if (options !== undefined) validateChartValueTree(options, "chart.options");
  validateChartDimensions(options, "chart.options");
}

export function validateCompositeChartOptions(options: unknown, name: "comparisonChart" | "comboChart"): void {
  assertRecord(options, name);
  validateChartValueTree(options, name);
  validateChartDimensions(options, name);
}
