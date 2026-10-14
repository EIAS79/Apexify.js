import { createCanvas } from "@napi-rs/canvas";
import { resolveTextLayout, type TextProperties, type TextMetrics } from "../types";
import { getCanvasContext } from "../core/errors";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";
import { computeCircularArcPlacements } from "./text-curved";
import {
  computeWrappedTextLines,
  registerTextFontFromPath,
  resolveTextFontIdentity,
  resolveTextFontSize,
  resolveTextLineHeight,
  setupTextAlignment,
  setupTextFont,
} from "./text-layout";
import { validateTextProperties } from "./text-validation";

type NativeMetrics = ReturnType<ReturnType<typeof getCanvasContext>["measureText"]>;

type BaseMetricFields = Omit<TextMetrics, "lines" | "totalHeight" | "lineCount" | "charWidths" | "charPositions">;

function optionalMetric(native: NativeMetrics, key: string): number | undefined {
  const value = (native as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function metricFields(native: NativeMetrics, fontSize: number, lineHeight: number): BaseMetricFields {
  const ascent = native.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = native.actualBoundingBoxDescent || fontSize * 0.2;
  const result: BaseMetricFields = {
    width: native.width,
    actualBoundingBoxAscent: native.actualBoundingBoxAscent,
    actualBoundingBoxDescent: native.actualBoundingBoxDescent,
    actualBoundingBoxLeft: native.actualBoundingBoxLeft,
    actualBoundingBoxRight: native.actualBoundingBoxRight,
    fontBoundingBoxAscent: native.fontBoundingBoxAscent,
    fontBoundingBoxDescent: native.fontBoundingBoxDescent,
    height: ascent + descent,
    lineHeight,
    baseline: ascent,
    top: -ascent,
    bottom: descent,
    centerX: native.width / 2,
    centerY: (descent - ascent) / 2,
  };
  for (const key of ["alphabeticBaseline", "emHeightAscent", "emHeightDescent", "hangingBaseline", "ideographicBaseline"] as const) {
    const value = optionalMetric(native, key);
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function graphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: "grapheme" } as never).segment(value)].map((entry) => entry.segment);
  return Array.from(value);
}

/** Measures text using the same font, spacing, alignment, and wrapping helpers as rendering. */
export class TextMetricsCreator {
  async measureText(textProps: TextProperties): Promise<TextMetrics> {
    validateTextProperties(textProps);
    return this.measureValidatedText(textProps);
  }

  /** Trusted internal path after the public text boundary has validated the same object. */
  async measureValidatedText(textProps: TextProperties): Promise<TextMetrics> {
    try {
      const lay = resolveTextLayout(textProps);
      const fontSize = resolveTextFontSize(textProps);
      const lineHeight = resolveTextLineHeight(textProps);
      const identity = resolveTextFontIdentity(textProps);
      if (identity.path) await registerTextFontFromPath(identity.path, identity.family);

      // Native text metrics are independent of surface dimensions. A 1000x500+ temporary
      // canvas was previously allocated for ordinary measurements even though no pixels are
      // drawn. Honor explicit measurementCanvas dimensions, otherwise use the smallest surface.
      const requestedWidth = textProps.measurementCanvas?.width ?? 1;
      const requestedHeight = textProps.measurementCanvas?.height ?? 1;
      const canvas = createCanvas(Math.max(1, Math.ceil(requestedWidth)), Math.max(1, Math.ceil(requestedHeight)));
      const ctx = getCanvasContext(canvas);
      setupTextFont(ctx, textProps);
      setupTextAlignment(ctx, textProps);

      const wrapped =
        lay.maxWidth !== undefined || lay.maxHeight !== undefined
          ? computeWrappedTextLines(ctx, textProps)
          : textProps.text.split("\n");
      const lines = wrapped.length > 0 ? wrapped : [""];
      const lineNative = lines.map((line) => ctx.measureText(line));
      const lineFields = lineNative.map((metric) => metricFields(metric, fontSize, lineHeight));
      const widest = lineNative.reduce((max, metric) => Math.max(max, metric.width), 0);
      const firstFields = lineFields[0]!;
      const metrics: TextMetrics = {
        ...firstFields,
        width: widest,
        height: lines.length * lineHeight,
        totalHeight: lines.length * lineHeight,
        lineCount: lines.length,
        lines: lines.map((line, index) => ({
          text: line,
          width: lineNative[index]!.width,
          height: lineFields[index]!.height,
          metrics: lineFields[index]!,
        })),
        centerX: widest / 2,
        centerY: (lines.length * lineHeight) / 2,
      };

      if (textProps.includeCharMetrics) {
        const units = graphemes(textProps.text);
        const charWidths: number[] = [];
        const charPositions: Array<{ x: number; width: number }> = [];
        let currentX = 0;
        for (const unit of units) {
          const width = ctx.measureText(unit).width;
          charWidths.push(width);
          charPositions.push({ x: currentX, width });
          currentX += width;
        }
        metrics.charWidths = charWidths;
        metrics.charPositions = charPositions;
      }

      if (textProps.textOnCurve) {
        const curve = textProps.textOnCurve;
        let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const placements = computeCircularArcPlacements(
            ctx, lines[lineIndex]!, 0, lineIndex * lineHeight, {
              sweepDegrees: curve.sweepAngle,
              radius: curve.radius,
              up: curve.up !== false,
              layoutMode: curve.layoutMode,
              baselineOffset: curve.baselineOffset,
              startAngleDeg: curve.startAngleDeg,
            }
          );
          for (const glyph of placements ?? []) {
            const glyphMetrics = ctx.measureText(glyph.grapheme);
            const halfWidth = Math.max(0, glyphMetrics.width / 2);
            const halfHeight = Math.max(fontSize / 2,
              (glyphMetrics.actualBoundingBoxAscent + glyphMetrics.actualBoundingBoxDescent) / 2);
            const c = Math.abs(Math.cos(glyph.rotationRad));
            const s = Math.abs(Math.sin(glyph.rotationRad));
            const dx = halfWidth * c + halfHeight * s;
            const dy = halfWidth * s + halfHeight * c;
            left = Math.min(left, glyph.x - dx);
            right = Math.max(right, glyph.x + dx);
            top = Math.min(top, glyph.y - dy);
            bottom = Math.max(bottom, glyph.y + dy);
          }
        }
        // Empty lines still occupy their authored line-height; no glyph has
        // an ink box, so preserve the ordinary line metrics as a fallback.
        metrics.width = Number.isFinite(left) ? right - left : widest;
        metrics.height = Number.isFinite(top) ? bottom - top : lines.length * lineHeight;
        metrics.totalHeight = metrics.height;
        metrics.centerX = metrics.width / 2;
        metrics.centerY = metrics.height / 2;
      }

      return metrics;
    } catch (cause) {
      if (cause instanceof ApexifyError) throw cause;
      throw new ApexifyDecodeError("measureText failed.", { cause });
    }
  }
}

export { TextMetricsCreator as TextMetricsService };
