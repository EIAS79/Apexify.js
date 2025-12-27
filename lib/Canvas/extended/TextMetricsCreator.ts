import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import { TextProperties, TextMetrics } from "../utils/types";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import { GlobalFonts } from "@napi-rs/canvas";
import path from "path";

/**
 * Extended class for text metrics functionality
 */
export class TextMetricsCreator {
  /**
   * Measures text dimensions and properties
   * @param textProps - Text properties to measure (same as createText)
   * @returns Comprehensive text metrics
   */
  async measureText(textProps: TextProperties): Promise<TextMetrics> {
    try {

      const fontSize = textProps.font?.size || textProps.fontSize || 16;

      let canvasWidth = 2000;
      let canvasHeight = 1000;

      if (textProps.measurementCanvas) {
        canvasWidth = textProps.measurementCanvas.width ?? canvasWidth;
        canvasHeight = textProps.measurementCanvas.height ?? canvasHeight;
      } else {
const estimatedCharWidth = fontSize * 0.6;
        const maxTextWidth = textProps.text.length * estimatedCharWidth;
        const letterSpacing = textProps.letterSpacing ?? 0;
        const spacingWidth = textProps.text.length * letterSpacing;

        const targetWidth = textProps.maxWidth ?? (maxTextWidth + spacingWidth);

        canvasWidth = Math.max(1000, Math.min(10000, targetWidth * 2));

        const lineHeight = (textProps.lineHeight || 1.4) * fontSize;
        const estimatedLines = textProps.maxWidth
          ? Math.ceil(targetWidth / textProps.maxWidth)
          : 1;
        const maxLines = textProps.maxHeight
          ? Math.ceil(textProps.maxHeight / lineHeight)
          : estimatedLines;

        canvasHeight = Math.max(500, Math.min(5000, maxLines * lineHeight * 2));
      }

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);

      const fontPath = textProps.font?.path || textProps.fontPath;
      const fontName = textProps.font?.name || textProps.fontName;

      if (fontPath) {
        try {
          const fullPath = path.join(process.cwd(), fontPath);
          GlobalFonts.registerFromPath(fullPath, fontName || 'customFont');
        } catch (error) {
        }
      }

      const fontFamily = textProps.font?.name || textProps.fontName || textProps.font?.family || textProps.fontFamily || 'Arial';

      let fontString = '';
      if (textProps.bold) fontString += 'bold ';
      if (textProps.italic) fontString += 'italic ';
      fontString += `${fontSize}px "${fontFamily}"`;

      ctx.font = fontString;

      if (textProps.letterSpacing !== undefined) {
        ctx.letterSpacing = `${textProps.letterSpacing}px`;
      }

      if (textProps.wordSpacing !== undefined) {
        ctx.wordSpacing = `${textProps.wordSpacing}px`;
      }

      ctx.textAlign = textProps.textAlign || 'left';
      ctx.textBaseline = textProps.textBaseline || 'alphabetic';

      const baseMetrics = ctx.measureText(textProps.text);

      const lineHeight = (textProps.lineHeight || 1.4) * fontSize;
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
        ...((baseMetrics as any).alphabeticBaseline !== undefined && { alphabeticBaseline: (baseMetrics as any).alphabeticBaseline }),
        ...((baseMetrics as any).emHeightAscent !== undefined && { emHeightAscent: (baseMetrics as any).emHeightAscent }),
        ...((baseMetrics as any).emHeightDescent !== undefined && { emHeightDescent: (baseMetrics as any).emHeightDescent }),
        ...((baseMetrics as any).hangingBaseline !== undefined && { hangingBaseline: (baseMetrics as any).hangingBaseline }),
        ...((baseMetrics as any).ideographicBaseline !== undefined && { ideographicBaseline: (baseMetrics as any).ideographicBaseline }),
        height,
        lineHeight,
        baseline,
        top,
        bottom,
        centerX: baseMetrics.width / 2,
        centerY: (height - baseline) / 2
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

      if (textProps.maxWidth) {
        const lines = this.wrapText(ctx, textProps.text, textProps.maxWidth, textProps);
        const lineMetrics = lines.map(line => {
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
              ...((lineMetric as any).alphabeticBaseline !== undefined && { alphabeticBaseline: (lineMetric as any).alphabeticBaseline }),
              ...((lineMetric as any).emHeightAscent !== undefined && { emHeightAscent: (lineMetric as any).emHeightAscent }),
              ...((lineMetric as any).emHeightDescent !== undefined && { emHeightDescent: (lineMetric as any).emHeightDescent }),
              ...((lineMetric as any).hangingBaseline !== undefined && { hangingBaseline: (lineMetric as any).hangingBaseline }),
              ...((lineMetric as any).ideographicBaseline !== undefined && { ideographicBaseline: (lineMetric as any).ideographicBaseline }),
              height: fontSize,
              lineHeight,
              baseline,
              top,
              bottom,
              centerX: lineMetric.width / 2,
              centerY: (fontSize - baseline) / 2
            } as Omit<TextMetrics, 'lines' | 'totalHeight' | 'lineCount'>
          };
        });

        metrics.lines = lineMetrics;
        metrics.totalHeight = lineMetrics.length * lineHeight;
        metrics.lineCount = lineMetrics.length;
      }

      return metrics as TextMetrics;
    } catch (error) {
      throw new Error(`measureText failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Wraps text to fit within maxWidth (same logic as EnhancedTextRenderer)
   * @private
   */
  private wrapText(
    ctx: SKRSContext2D,
    text: string,
    maxWidth: number,
    textProps: TextProperties
  ): string[] {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (textProps.lineHeight || 1.4) * fontSize;
    const maxLines = textProps.maxHeight ? Math.floor(textProps.maxHeight / lineHeight) : Infinity;

    const explicitLines = text.split('\n');
    const allLines: string[] = [];

    for (const explicitLine of explicitLines) {
      if (!explicitLine.trim() && explicitLines.length > 1) {
        allLines.push('');
        continue;
      }

      const words = explicitLine.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const testWidth = ctx.measureText(testLine).width;

        if (testWidth > maxWidth && currentLine) {
          allLines.push(currentLine);
          currentLine = word;

          if (allLines.length >= maxLines) {
            currentLine = '...';
            break;
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        allLines.push(currentLine);
      }
    }

    return allLines;
  }
}

