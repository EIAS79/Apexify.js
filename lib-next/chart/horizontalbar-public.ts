import { createCanvas } from "@napi-rs/canvas";
import { loadImageCached } from "../image/image-properties";
import {
  createHorizontalBarChart as createResponsiveHorizontalBarChart,
  type HorizontalBarChartData,
  type HorizontalBarChartOptions,
} from "./impl/horizontalbarchart";

export type {
  HorizontalBarChartType,
  EnhancedTextStyle,
  HorizontalBarSegment,
  HorizontalBarChartData,
  LegendEntry,
  HorizontalAxisConfig,
  HorizontalBarChartOptions,
} from "./impl/horizontalbarchart";

/**
 * Public horizontal-bar renderer.
 *
 * The legacy implementation is responsive when no explicit height is supplied.
 * When callers provide `dimensions.height`, the public contract guarantees that
 * exact output dimension instead of silently discarding the option.
 */
export async function createHorizontalBarChart(
  data: HorizontalBarChartData[],
  options: HorizontalBarChartOptions = {}
): Promise<Buffer> {
  const rendered = await createResponsiveHorizontalBarChart(data, options);
  const requestedHeight = options.dimensions?.height;
  if (requestedHeight === undefined) return rendered;

  const image = await loadImageCached(rendered);
  const requestedWidth = options.dimensions?.width ?? image.width;
  if (image.width === requestedWidth && image.height === requestedHeight) return rendered;

  const canvas = createCanvas(requestedWidth, requestedHeight);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, requestedWidth, requestedHeight);
  return canvas.toBuffer("image/png");
}
