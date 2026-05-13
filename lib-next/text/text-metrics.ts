import { createCanvas } from "@napi-rs/canvas";
import { resolveTextDecorations, resolveTextLayout, resolveTextPlacement, type TextProperties, type TextMetrics } from "../types/text";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import { curvedArcBoundingChord, resolveArcRadiusAndSweep } from "./text-curved";
import { computeWrappedTextLines, registerTextFontFromPath } from "./text-layout";

/**
 * Text layout metrics (measurement) — same inputs as {@link TextCreator} and {@link EnhancedTextRenderer}.
 */
export class TextMetricsCreator {
  /**
   * Measures text dimensions and properties
   * @param textProps - Text properties to measure (same as createText)
   * @returns Comprehensive text metrics
   */
  async measureText(textProps: TextProperties): Promise<TextMetrics> {
    try {
      const lay = resolveTextLayout(textProps);
      const pl = resolveTextPlacement(textProps);
      const fontSize = textProps.font?.size || textProps.fontSize || 16;

      let canvasWidth = 2000;
      let canvasHeight = 1000;

      if (textProps.measurementCanvas) {
        canvasWidth = textProps.measurementCanvas.width ?? canvasWidth;
        canvasHeight = textProps.measurementCanvas.height ?? canvasHeight;
      } else {
        const estimatedCharWidth = fontSize * 0.6;
        const maxTextWidth = textProps.text.length * estimatedCharWidth;
        const letterSpacing = lay.letterSpacing ?? 0;
        const spacingWidth = textProps.text.length * letterSpacing;

        const targetWidth = lay.maxWidth ?? maxTextWidth + spacingWidth;

        canvasWidth = Math.max(1000, Math.min(10000, targetWidth * 2));

        const lineHeightMul = (lay.lineHeight || 1.4) * fontSize;
        const estimatedLines = lay.maxWidth ? Math.ceil(targetWidth / lay.maxWidth) : 1;
        const maxLines = lay.maxHeight ? Math.ceil(lay.maxHeight / lineHeightMul) : estimatedLines;

        canvasHeight = Math.max(500, Math.min(5000, maxLines * lineHeightMul * 2));
      }

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);

      const fontPath = textProps.font?.path || textProps.fontPath;
      const fontName = textProps.font?.name || textProps.fontName;

      if (fontPath) {
        try {
          await registerTextFontFromPath(fontPath, fontName || "customFont");
        } catch (error) {
          console.warn(`measureText: failed to register font from path: ${fontPath}`, error);
        }
      }

      const fontFamily =
        textProps.font?.name ||
        textProps.fontName ||
        textProps.font?.family ||
        textProps.fontFamily ||
        "Arial";

      let fontString = "";
      const dec = resolveTextDecorations(textProps);
      if (dec.bold) fontString += "bold ";
      if (dec.italic) fontString += "italic ";
      fontString += `${fontSize}px "${fontFamily}"`;

      ctx.font = fontString;

      if (lay.letterSpacing !== undefined) {
        ctx.letterSpacing = `${lay.letterSpacing}px`;
      }

      if (lay.wordSpacing !== undefined) {
        ctx.wordSpacing = `${lay.wordSpacing}px`;
      }

      ctx.textAlign = pl.textAlign || "left";
      ctx.textBaseline = pl.textBaseline || "alphabetic";

      const baseMetrics = ctx.measureText(textProps.text);

      const lineHeight = (lay.lineHeight || 1.4) * fontSize;
      const height = fontSize;
      const baseline = baseMetrics.actualBoundingBoxAscent || fontSize * 0.8;
      const top = -baseline;
      const bottom = baseMetrics.actualBoundingBoxDescent || fontSize * 0.2;

      const metrics: any = {
        width: baseMetrics.width,
        actualBoundingBoxAscent: baseMetrics.actualBoundingBoxAscent,
        actualBoundingBoxDescent: baseMetrics.actualBoundingBoxDescent,
        actualBoundingBoxLeft: baseMetrics.actualBoundingBoxLeft,
        actualBoundingBoxRight: baseMetrics.actualBoundingBoxRight,
        fontBoundingBoxAscent: baseMetrics.fontBoundingBoxAscent,
        fontBoundingBoxDescent: baseMetrics.fontBoundingBoxDescent,
        ...((baseMetrics as any).alphabeticBaseline !== undefined && {
          alphabeticBaseline: (baseMetrics as any).alphabeticBaseline,
        }),
        ...((baseMetrics as any).emHeightAscent !== undefined && { emHeightAscent: (baseMetrics as any).emHeightAscent }),
        ...((baseMetrics as any).emHeightDescent !== undefined && {
          emHeightDescent: (baseMetrics as any).emHeightDescent,
        }),
        ...((baseMetrics as any).hangingBaseline !== undefined && {
          hangingBaseline: (baseMetrics as any).hangingBaseline,
        }),
        ...((baseMetrics as any).ideographicBaseline !== undefined && {
          ideographicBaseline: (baseMetrics as any).ideographicBaseline,
        }),
        height,
        lineHeight,
        baseline,
        top,
        bottom,
        centerX: baseMetrics.width / 2,
        centerY: (height - baseline) / 2,
      };

      if (textProps.includeCharMetrics) {
        const charWidths: number[] = [];
        const charPositions: Array<{ x: number; width: number }> = [];
        let currentX = 0;

        for (const char of textProps.text) {
          const charMetric = ctx.measureText(char);
          charWidths.push(charMetric.width);
          charPositions.push({ x: currentX, width: charMetric.width });
          currentX += charMetric.width;
        }

        metrics.charWidths = charWidths;
        metrics.charPositions = charPositions;
      }

      if (lay.maxWidth) {
        const lines = computeWrappedTextLines(ctx, textProps);
        const lineMetrics = lines.map((line) => {
          const lineMetric = ctx.measureText(line);
          return {
            text: line,
            width: lineMetric.width,
            height: fontSize,
            metrics: {
              width: lineMetric.width,
              actualBoundingBoxAscent: lineMetric.actualBoundingBoxAscent,
              actualBoundingBoxDescent: lineMetric.actualBoundingBoxDescent,
              actualBoundingBoxLeft: lineMetric.actualBoundingBoxLeft,
              actualBoundingBoxRight: lineMetric.actualBoundingBoxRight,
              fontBoundingBoxAscent: lineMetric.fontBoundingBoxAscent,
              fontBoundingBoxDescent: lineMetric.fontBoundingBoxDescent,
              ...((lineMetric as any).alphabeticBaseline !== undefined && {
                alphabeticBaseline: (lineMetric as any).alphabeticBaseline,
              }),
              ...((lineMetric as any).emHeightAscent !== undefined && { emHeightAscent: (lineMetric as any).emHeightAscent }),
              ...((lineMetric as any).emHeightDescent !== undefined && {
                emHeightDescent: (lineMetric as any).emHeightDescent,
              }),
              ...((lineMetric as any).hangingBaseline !== undefined && {
                hangingBaseline: (lineMetric as any).hangingBaseline,
              }),
              ...((lineMetric as any).ideographicBaseline !== undefined && {
                ideographicBaseline: (lineMetric as any).ideographicBaseline,
              }),
              height: fontSize,
              lineHeight,
              baseline,
              top,
              bottom,
              centerX: lineMetric.width / 2,
              centerY: (fontSize - baseline) / 2,
            } as Omit<TextMetrics, "lines" | "totalHeight" | "lineCount">,
          };
        });

        metrics.lines = lineMetrics;
        metrics.totalHeight = lineMetrics.length * lineHeight;
        metrics.lineCount = lineMetrics.length;
      }

      if (textProps.textOnCurve) {
        const c = textProps.textOnCurve;
        const sweepDeg = c.sweepAngle;
        if (sweepDeg > 0 && sweepDeg < 360) {
          const sweepRad = (sweepDeg * Math.PI) / 180;
          const W = metrics.width;
          const { R, sweepRad: effSweep } = resolveArcRadiusAndSweep(W, sweepRad, c.radius, c.layoutMode);
          const { chord, sagitta } = curvedArcBoundingChord(effSweep, R);
          metrics.width = chord;
          metrics.height = fontSize + sagitta;
        }
      }

      return metrics as TextMetrics;
    } catch (error) {
      throw new Error(`measureText failed: ${getErrorMessage(error)}`);
    }
  }
}

export { TextMetricsCreator as TextMetricsService };
