import { createCanvas } from "@napi-rs/canvas";
import { resolveTextLayout, type TextProperties, type TextMetrics } from "../types";
import { getCanvasContext } from "../core/errors";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";
import { curvedArcBoundingChord, resolveArcRadiusAndSweep } from "./text-curved";
import {
  computeWrappedTextLines,
  registerTextFontFromPath,
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
    try {
      const lay = resolveTextLayout(textProps);
      const fontSize = resolveTextFontSize(textProps);
      const lineHeight = resolveTextLineHeight(textProps);
      const fontPath = textProps.font?.path ?? textProps.fontPath;
      const fontName = textProps.font?.name ?? textProps.fontName;
      if (fontPath) await registerTextFontFromPath(fontPath, fontName ?? "customFont");

      const estimatedWidth = Math.max(1, textProps.text.length * fontSize * 0.7 + Math.max(0, textProps.text.length - 1) * (lay.letterSpacing ?? 0));
      const requestedWidth = textProps.measurementCanvas?.width ?? lay.maxWidth ?? Math.min(10000, Math.max(1000, estimatedWidth * 2));
      const estimatedLineCount = lay.maxWidth === undefined ? textProps.text.split("\n").length : Math.max(1, Math.ceil(estimatedWidth / lay.maxWidth));
      const requestedHeight = textProps.measurementCanvas?.height ?? Math.min(5000, Math.max(500, estimatedLineCount * lineHeight * 2));
      const canvas = createCanvas(Math.ceil(requestedWidth), Math.ceil(requestedHeight));
      const ctx = getCanvasContext(canvas);
      setupTextFont(ctx, textProps);
      setupTextAlignment(ctx, textProps);

      const wrapped = lay.maxWidth !== undefined ? computeWrappedTextLines(ctx, textProps) : textProps.text.split("\n");
      const lines = wrapped.length > 0 ? wrapped : [""];
      const lineNative = lines.map((line) => ctx.measureText(line));
      const widest = lineNative.reduce((max, metric) => Math.max(max, metric.width), 0);
      const first = lineNative[0]!;
      const firstFields = metricFields(first, fontSize, lineHeight);
      const metrics: TextMetrics = {
        ...firstFields,
        width: widest,
        height: lines.length * lineHeight,
        totalHeight: lines.length * lineHeight,
        lineCount: lines.length,
        lines: lines.map((line, index) => ({
          text: line,
          width: lineNative[index]!.width,
          height: metricFields(lineNative[index]!, fontSize, lineHeight).height,
          metrics: metricFields(lineNative[index]!, fontSize, lineHeight),
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

      if (textProps.textOnCurve && lines.length === 1) {
        const curve = textProps.textOnCurve;
        const sweepRad = (curve.sweepAngle * Math.PI) / 180;
        const { R, sweepRad: effectiveSweep } = resolveArcRadiusAndSweep(metrics.width, sweepRad, curve.radius, curve.layoutMode);
        const { chord, sagitta } = curvedArcBoundingChord(effectiveSweep, R);
        metrics.width = chord;
        metrics.height = firstFields.height + sagitta;
        metrics.totalHeight = metrics.height;
        metrics.centerX = chord / 2;
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
