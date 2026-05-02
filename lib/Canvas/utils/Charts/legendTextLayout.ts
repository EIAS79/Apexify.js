import type { SKRSContext2D } from "@napi-rs/canvas";

/** Line spacing for wrapped legend labels (must match drawing). */
export const LEGEND_LINE_HEIGHT_RATIO = 1.38;

/** Extra vertical slack so the last wrapped line/stroke stays inside the legend box. */
export const LEGEND_ENTRY_VERTICAL_PAD = 6;

export function legendLineHeight(fontSize: number): number {
  return fontSize * LEGEND_LINE_HEIGHT_RATIO;
}

/**
 * Row height for one legend entry: single-line rows stay compact; multi-line rows get full leading + pad.
 */
export function legendEntryRowHeightForLines(
  lines: string[],
  fontSize: number,
  boxSize: number
): number {
  const n = lines.length;
  if (n <= 0) return boxSize;
  if (n === 1) {
    return Math.max(boxSize, fontSize);
  }
  const textBlock = n * legendLineHeight(fontSize) + LEGEND_ENTRY_VERTICAL_PAD;
  return Math.max(boxSize, textBlock);
}

/**
 * Word-wrap then break overly long tokens so labels stay within `maxWidth`.
 */
export function wrapLegendLabel(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [""];

  const mw = Math.max(8, maxWidth);
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  const segments: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const trial = cur + " " + word;
    if (ctx.measureText(trial).width <= mw) {
      cur = trial;
    } else {
      segments.push(cur);
      cur = word;
    }
  }
  segments.push(cur);

  const lines: string[] = [];
  for (const seg of segments) {
    if (ctx.measureText(seg).width <= mw) {
      lines.push(seg);
      continue;
    }
    let buf = "";
    for (let k = 0; k < seg.length; k++) {
      const ch = seg[k]!;
      const trial = buf + ch;
      if (buf.length === 0 || ctx.measureText(trial).width <= mw) {
        buf = trial;
      } else {
        lines.push(buf);
        buf = ch;
      }
    }
    if (buf.length > 0) lines.push(buf);
  }

  return lines.length > 0 ? lines : [trimmed];
}

export interface LegendRowMetrics {
  lines: string[];
  rowHeight: number;
  contentWidth: number;
}

export function computeLegendRowMetrics(
  ctx: SKRSContext2D,
  label: string,
  effectiveMaxWidth: number | undefined,
  wrapTextEnabled: boolean,
  fontSize: number,
  boxSize: number
): LegendRowMetrics {
  const canWrap =
    wrapTextEnabled && effectiveMaxWidth != null && effectiveMaxWidth > 0;

  let lines: string[];
  let contentWidth: number;

  if (canWrap) {
    lines = wrapLegendLabel(ctx, label, effectiveMaxWidth);
    contentWidth = lines.reduce((m, line) => Math.max(m, ctx.measureText(line).width), 0);
  } else {
    lines = [label];
    contentWidth = ctx.measureText(label).width;
  }

  const rowHeight = legendEntryRowHeightForLines(lines, fontSize, boxSize);

  return { lines, rowHeight, contentWidth };
}
