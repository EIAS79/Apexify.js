import type { SKRSContext2D } from "@napi-rs/canvas";

/**
 * Height of a single-line title using measured glyphs (fallback when bbox missing).
 */
export function measureTextBlockHeight(ctx: SKRSContext2D, text: string, fontSize: number): number {
  const s = text.trim();
  if (!s) return 0;
  ctx.font = `${fontSize}px Arial`;
  const m = ctx.measureText(s);
  const asc = m.actualBoundingBoxAscent ?? fontSize * 0.75;
  const desc = m.actualBoundingBoxDescent ?? fontSize * 0.25;
  return asc + desc;
}

/**
 * Horizontal canvas reserve for a Y-axis title rotated −90° (single-line heuristic).
 * Exported for line / bar / combo charts.
 */
export function reserveHorizontalForRotatedYAxisTitle(
  ctx: SKRSContext2D,
  label: string,
  fontSize: number
): number {
  if (!label.trim()) return 0;
  ctx.font = `${fontSize}px Arial`;
  const m = ctx.measureText(label);
  const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.72;
  const descent = m.actualBoundingBoxDescent ?? fontSize * 0.28;
  const verticalExtent = ascent + descent;
  return Math.ceil(Math.min(Math.max(verticalExtent + 12, fontSize + 10), m.width + fontSize));
}

/**
 * Vertical band reserved below the horizontal **value** baseline on bar charts:
 * X tick labels (below baseline) + optional X-axis title.
 */
export function reserveBelowBarChartValueBaseline(
  ctx: SKRSContext2D,
  xAxisLabel: string | undefined,
  tickFontSize: number,
  axisTitleFontSize: number
): number {
  const TICK_TOP = 10;
  const TICK_DESC = 8;
  const tickBand = TICK_TOP + tickFontSize + TICK_DESC;
  const t = xAxisLabel?.trim();
  if (!t) return tickBand;
  const gap = Math.max(26, tickFontSize + 16);
  const titleH = measureTextBlockHeight(ctx, t, axisTitleFontSize);
  const bottomPad = 14;
  return tickBand + gap + titleH + bottomPad;
}

/**
 * Same stacking order as {@link createLineChart}: tick row below plot bottom line + optional X-axis title.
 */
export function reserveBelowLineChartPlotBottom(
  ctx: SKRSContext2D,
  xAxisLabel: string | undefined,
  tickFontSize: number
): number {
  const X_AXIS_TICK_TOP_OFFSET = 10;
  const X_AXIS_TICK_DESCENDER_PAD = 8;
  const X_AXIS_TITLE_GAP_BELOW_TICKS = 14;
  const X_AXIS_TITLE_BOTTOM_PAD = 12;
  let h = X_AXIS_TICK_TOP_OFFSET + tickFontSize + X_AXIS_TICK_DESCENDER_PAD;
  if (xAxisLabel?.trim()) {
    h +=
      X_AXIS_TITLE_GAP_BELOW_TICKS +
      measureTextBlockHeight(ctx, xAxisLabel, tickFontSize) +
      X_AXIS_TITLE_BOTTOM_PAD;
  }
  return h;
}
