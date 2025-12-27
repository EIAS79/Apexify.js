import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";

/**
 * Chart types for horizontal bar chart
 */
export type HorizontalBarChartType = 'standard' | 'grouped' | 'stacked' | 'lollipop';

/**
 * Enhanced text styling for chart labels
 */
export interface EnhancedTextStyle {
fontPath?: string;
fontName?: string;
fontFamily?: string;
fontSize?: number;
bold?: boolean;
italic?: boolean;
  shadow?: {
color?: string;
offsetX?: number;
offsetY?: number;
blur?: number;
opacity?: number;
  };
  stroke?: {
color?: string;
width?: number;
gradient?: gradient;
  };
  glow?: {
color?: string;
intensity?: number;
opacity?: number;
  };
}

/**
 * Interface for a single bar segment (used in grouped/stacked charts)
 */
export interface HorizontalBarSegment {
value: number;
color?: string;
gradient?: gradient;
label?: string;
valueColor?: string;
showValue?: boolean;
}

/**
 * Interface for horizontal bar chart data
 */
export interface HorizontalBarChartData {
label: string;

value?: number;

values?: HorizontalBarSegment[];
xStart?: number;
xEnd?: number;
yStart?: number;
yEnd?: number;
color?: string;
gradient?: gradient;
labelColor?: string;
labelPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom';
valueColor?: string;
showValue?: boolean;
}

/**
 * Interface for legend entry
 */
export interface LegendEntry {
color?: string;
gradient?: gradient;
  label: string;
}

/**
 * Axis configuration for horizontal bar chart
 */
export interface HorizontalAxisConfig {
label?: string;
labelColor?: string;
  range?: {
    min?: number;
    max?: number;
    step?: number;
  };
values?: number[];
color?: string;
width?: number;
tickFontSize?: number;
tickColor?: string;
valueSpacing?: number;
}

/**
 * Horizontal bar chart configuration - organized by category
 */
export interface HorizontalBarChartOptions {

type?: HorizontalBarChartType;

  dimensions?: {
width?: number;
height?: number;
    padding?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };

  appearance?: {
backgroundColor?: string;
backgroundGradient?: gradient;
backgroundImage?: string;
axisColor?: string;
axisWidth?: number;
arrowSize?: number;
  };

  axes?: {
    x?: HorizontalAxisConfig & {
baseline?: number;
};
y?: HorizontalAxisConfig;
  };

  labels?: {
    title?: {
      text?: string;
fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
    barLabelDefaults?: {
show?: boolean;
defaultPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom';
fontSize?: number;
defaultColor?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
    valueLabelDefaults?: {
show?: boolean;
fontSize?: number;
defaultColor?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
  };

  legend?: {
show?: boolean;
entries?: LegendEntry[];
position?: 'top' | 'bottom' | 'left' | 'right';
spacing?: number;
fontSize?: number;
backgroundColor?: string;
backgroundGradient?: gradient;
borderColor?: string;
textColor?: string;
textGradient?: gradient;
textStyle?: EnhancedTextStyle;
padding?: number;
maxWidth?: number;
wrapText?: boolean;
  };

  grid?: {
show?: boolean;
color?: string;
width?: number;
lineWidth?: number;
style?: 'solid' | 'dashed' | 'dotted';
  };

  bars?: {
spacing?: number;
minHeight?: number;
groupSpacing?: number;
segmentSpacing?: number;
lineWidth?: number;
dotSize?: number;
borderRadius?: number;
  };
}

/**
 * Helper function to render enhanced text with custom fonts, gradients, shadows, strokes
 */
async function renderEnhancedText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  style?: EnhancedTextStyle,
  fontSize?: number,
  color?: string,
  textGradient?: gradient
): Promise<void> {
  ctx.save();

  const savedTextAlign = ctx.textAlign;
  const savedTextBaseline = ctx.textBaseline;

  const effectiveFontSize = fontSize || style?.fontSize || 16;
  const fontFamily = style?.fontFamily || style?.fontName || 'Arial';
  let fontString = '';

  if (style?.bold) fontString += 'bold ';
  if (style?.italic) fontString += 'italic ';

  fontString += `${effectiveFontSize}px ${fontFamily}`;

  ctx.font = fontString;

  ctx.letterSpacing = '0px';
  ctx.wordSpacing = '0px';

  ctx.textAlign = savedTextAlign;
  ctx.textBaseline = savedTextBaseline;

  if (style?.fontPath && style?.fontName) {
    try {
      const { GlobalFonts } = await import('@napi-rs/canvas');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), style.fontPath);
      GlobalFonts.registerFromPath(fullPath, style.fontName);

      ctx.font = fontString.replace(fontFamily, style.fontName);
    } catch (error) {
      console.warn(`Failed to register font: ${style.fontPath}`, error);
    }
  }

  if (style?.shadow) {
    ctx.shadowColor = style.shadow.color || 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = style.shadow.offsetX || 2;
    ctx.shadowOffsetY = style.shadow.offsetY || 2;
    ctx.shadowBlur = style.shadow.blur || 4;
    if (style.shadow.opacity !== undefined) {
      ctx.globalAlpha = style.shadow.opacity;
    }
  }

  if (textGradient) {
    const metrics = ctx.measureText(text);
    ctx.fillStyle = createGradientFill(ctx, textGradient, {
      x, y, w: metrics.width, h: effectiveFontSize
    }) as any;
  } else if (color) {
    ctx.fillStyle = color;
  }

  ctx.fillText(text, x, y);

  if (style?.stroke) {
    ctx.strokeStyle = style.stroke.color || '#000000';
    ctx.lineWidth = style.stroke.width || 1;
    if (style.stroke.gradient) {
      const metrics = ctx.measureText(text);
      ctx.strokeStyle = createGradientFill(ctx, style.stroke.gradient, {
        x, y, w: metrics.width, h: effectiveFontSize
      }) as any;
    }
    ctx.strokeText(text, x, y);
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  ctx.restore();
}

/**
 * Helper function to fill a shape with gradient or color
 */
function fillWithGradientOrColor(
  ctx: SKRSContext2D,
  gradient?: gradient,
  color?: string,
  defaultColor: string = '#000000',
  rect?: { x: number; y: number; w: number; h: number }
): void {
  if (gradient && rect) {
    ctx.fillStyle = createGradientFill(ctx, gradient, rect) as any;
  } else {
    ctx.fillStyle = color || defaultColor;
  }
}

/**
 * Draws an arrow at the end of an axis
 */
function drawArrow(ctx: SKRSContext2D, x: number, y: number, angle: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size / 2);
  ctx.lineTo(-size, size / 2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Draws X-axis ticks and labels (horizontal axis - value axis)
 */
function drawXAxisTicks(
  ctx: SKRSContext2D,
  originX: number,
  originY: number,
  axisEndX: number,
  minValue: number,
  maxValue: number,
  step: number,
  tickFontSize: number,
  customValues?: number[],
  valueSpacing?: number,
  tickColor: string = '#000000'
): void {
  ctx.save();
  ctx.fillStyle = tickColor;
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const chartWidth = axisEndX - originX;

  if (customValues && customValues.length > 0) {

    const actualMin = Math.min(...customValues);
    const actualMax = Math.max(...customValues);
const range = actualMax - actualMin || 1;

    let lastLabelX = -Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40;

    customValues.forEach((value) => {
      const x = originX + ((value - actualMin) / range) * chartWidth;
      const labelText = value.toString();

      if (x - lastLabelX < minLabelSpacing && value > actualMin) {

        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + 5);
      ctx.stroke();

      const labelMetrics = ctx.measureText(labelText);
const labelY = originY + 10;
      ctx.fillText(labelText, x, labelY);

lastLabelX = x;
    });
  } else {

const range = maxValue - minValue || 1;

      const tickValues: number[] = [];
      for (let value = minValue; value <= maxValue; value += step) {
        tickValues.push(value);
      }

      let lastLabelX = -Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40;

      for (const value of tickValues) {
        const x = originX + ((value - minValue) / range) * chartWidth;
        const labelText = value.toString();

        if (x - lastLabelX < minLabelSpacing && value > minValue) {

          ctx.beginPath();
          ctx.moveTo(x, originY);
          ctx.lineTo(x, originY + 5);
          ctx.stroke();
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();

const labelY = originY + 10;
        ctx.fillText(labelText, x, labelY);

        lastLabelX = x;
      }
  }

  ctx.restore();
}

/**
 * Draws Y-axis ticks and labels (vertical axis - category axis)
 */
function drawYAxisTicks(
  ctx: SKRSContext2D,
  originX: number,
  originY: number,
  axisEndY: number,
  minValue: number,
  maxValue: number,
  step: number,
  tickFontSize: number,
  customValues?: number[],
  valueSpacing?: number,
  tickColor: string = '#000000'
): void {
  ctx.save();
  ctx.fillStyle = tickColor;
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const chartHeight = originY - axisEndY;

  if (customValues && customValues.length > 0) {
    const totalValues = customValues.length;
    const divisor = totalValues > 1 ? totalValues - 1 : 1;

    if (valueSpacing && valueSpacing > 0) {
      let currentY = originY;
      customValues.forEach((value, index) => {
        if (index === 0) {
          currentY = originY;
        } else {
          currentY -= valueSpacing;
        }

        if (currentY >= axisEndY && currentY <= originY) {
          ctx.beginPath();
          ctx.moveTo(originX - 5, currentY);
          ctx.lineTo(originX, currentY);
          ctx.stroke();
          ctx.fillText(value.toString(), originX - 10, currentY);
        }
      });
    } else {

      const range = maxValue - minValue || 1;
      customValues.forEach((value) => {
        const y = originY - ((value - minValue) / range) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();
        ctx.fillText(value.toString(), originX - 10, y);
      });
    }
  } else {

    const range = maxValue - minValue || 1;
    let lastLabelY = Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30;

    for (let value = minValue; value <= maxValue; value += step) {
      const y = originY - ((value - minValue) / range) * chartHeight;
      const labelText = value.toString();

      if (lastLabelY - y < minLabelSpacing && value > minValue) {

        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(originX - 5, y);
      ctx.lineTo(originX, y);
      ctx.stroke();
      ctx.fillText(labelText, originX - 10, y);

lastLabelY = y;
    }
  }

  ctx.restore();
}

/**
 * Draws grid lines for horizontal bar chart
 */
function drawGrid(
  ctx: SKRSContext2D,
  originX: number,
  originY: number,
  axisEndX: number,
  axisEndY: number,
  xMin: number,
  xMax: number,
  xStep: number,
  yMin: number,
  yMax: number,
  yStep: number,
  yAxisCustomValues?: number[],
  xAxisCustomValues?: number[],
  gridColor: string = '#E0E0E0',
  gridWidth: number = 1
): void {
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = gridWidth;
  ctx.setLineDash([2, 2]);

  const chartWidth = axisEndX - originX;
  const chartHeight = originY - axisEndY;

  if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    const actualMin = Math.min(...xAxisCustomValues);
    const actualMax = Math.max(...xAxisCustomValues);
    const xRange = actualMax - actualMin || 1;

    xAxisCustomValues.forEach((value) => {
      const x = originX + ((value - actualMin) / xRange) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, axisEndY);
      ctx.lineTo(x, originY);
      ctx.stroke();
    });
  } else {
    const xRange = xMax - xMin || 1;
    for (let value = xMin; value <= xMax; value += xStep) {
      const x = originX + ((value - xMin) / xRange) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, axisEndY);
      ctx.lineTo(x, originY);
      ctx.stroke();
    }
  }

  if (yAxisCustomValues && yAxisCustomValues.length > 0) {
    const actualMin = Math.min(...yAxisCustomValues);
    const actualMax = Math.max(...yAxisCustomValues);
    const yRange = actualMax - actualMin || 1;

    yAxisCustomValues.forEach((value) => {
      const y = originY - ((value - actualMin) / yRange) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(axisEndX, y);
      ctx.stroke();
    });
  } else {
    const yRange = yMax - yMin || 1;
    for (let value = yMin; value <= yMax; value += yStep) {
      const y = originY - ((value - yMin) / yRange) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(axisEndX, y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

/**
 * Wraps text to fit within a maximum width
 */
function wrapText(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * Calculates legend dimensions without needing a canvas context
 */
function calculateLegendDimensions(
  legend: LegendEntry[],
  fontSize: number,
  maxWidth?: number,
  wrapTextEnabled: boolean = true,
  paddingBox: number = 8
): { width: number; height: number } {
  if (!legend || legend.length === 0) return { width: 0, height: 0 };

  const boxSize = 15;
  const spacing = 10;
  const padding = paddingBox;

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px Arial`;

  const textSpacing = 10;
  const effectiveMaxWidth = maxWidth ? maxWidth - padding * 2 - boxSize - textSpacing : undefined;

  let maxEntryWidth = 0;
  const entryHeights: number[] = [];

  legend.forEach(entry => {
    let textWidth: number;
    let textHeight: number;

    if (wrapTextEnabled && effectiveMaxWidth) {
      const wrappedLines = wrapText(tempCtx, entry.label, effectiveMaxWidth);
      textWidth = Math.max(...wrappedLines.map(line => tempCtx.measureText(line).width));
      textHeight = wrappedLines.length * fontSize * 1.2;
    } else {
      textWidth = tempCtx.measureText(entry.label).width;
      textHeight = fontSize;
    }

    const entryWidth = boxSize + textSpacing + textWidth;
    maxEntryWidth = Math.max(maxEntryWidth, entryWidth);
    entryHeights.push(Math.max(boxSize, textHeight));
  });

  const legendWidth = maxWidth ? maxWidth : maxEntryWidth + padding * 2;
  const legendHeight = entryHeights.reduce((sum, h, i) => sum + h + (i < entryHeights.length - 1 ? spacing : 0), 0) + padding * 2;

  return { width: legendWidth, height: legendHeight };
}

/**
 * Draws legend/key showing colors and their meanings at a specific position
 */
async function drawLegendAtPosition(
  ctx: SKRSContext2D,
  legend: LegendEntry[],
  legendX: number,
  legendY: number,
  fontSize: number,
  backgroundColor: string = '#FFFFFF',
  textColor?: string,
  borderColor?: string,
  paddingBox?: number,
  maxWidth?: number,
  wrapTextEnabled: boolean = true,
  backgroundGradient?: gradient,
  textGradient?: gradient,
  textStyle?: EnhancedTextStyle
): Promise<void> {
  if (!legend || legend.length === 0) return;

  ctx.save();

  const boxSize = 15;
  const spacing = 10;
  const padding = paddingBox ?? 8;

  ctx.font = `${fontSize}px Arial`;

  const isDarkBackground = backgroundColor === '#000000' || backgroundColor.toLowerCase() === 'black';
  const effectiveTextColor = textColor ?? (isDarkBackground ? '#FFFFFF' : '#000000');
  const effectiveBgColor = isDarkBackground ? 'rgba(0, 0, 0, 0.8)' : (backgroundColor.startsWith('rgba') || backgroundColor.startsWith('rgb') ? backgroundColor : 'rgba(255, 255, 255, 0.9)');
  const effectiveBorderColor = borderColor ?? (isDarkBackground ? '#FFFFFF' : '#000000');

  const textSpacing = 10;
  const effectiveMaxWidth = maxWidth ? maxWidth - padding * 2 - boxSize - textSpacing : undefined;

  let maxEntryWidth = 0;
  const entryHeights: number[] = [];

  legend.forEach(entry => {
    let textWidth: number;
    let textHeight: number;

    if (wrapTextEnabled && effectiveMaxWidth) {
      const wrappedLines = wrapText(ctx, entry.label, effectiveMaxWidth);
      textWidth = Math.max(...wrappedLines.map(line => ctx.measureText(line).width));
      textHeight = wrappedLines.length * fontSize * 1.2;
    } else {
      textWidth = ctx.measureText(entry.label).width;
      textHeight = fontSize;
    }

    const entryWidth = boxSize + textSpacing + textWidth;
    maxEntryWidth = Math.max(maxEntryWidth, entryWidth);
    entryHeights.push(Math.max(boxSize, textHeight));
  });

  const legendWidth = maxWidth ? maxWidth : maxEntryWidth + padding * 2;
  const legendHeight = entryHeights.reduce((sum, h, i) => sum + h + (i < entryHeights.length - 1 ? spacing : 0), 0) + padding * 2;

  ctx.beginPath();
  ctx.rect(legendX, legendY, legendWidth, legendHeight);
  fillWithGradientOrColor(
    ctx,
    backgroundGradient,
    effectiveBgColor,
    effectiveBgColor,
    { x: legendX, y: legendY, w: legendWidth, h: legendHeight }
  );
  ctx.fill();

  ctx.strokeStyle = effectiveBorderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let currentY = legendY + padding;

  for (let index = 0; index < legend.length; index++) {
    const entry = legend[index];
    const entryHeight = entryHeights[index];
    const centerY = currentY + entryHeight / 2;

    ctx.beginPath();
    ctx.rect(legendX + padding, centerY - boxSize / 2, boxSize, boxSize);
    fillWithGradientOrColor(
      ctx,
      entry.gradient,
      entry.color || '#4A90E2',
      '#4A90E2',
      { x: legendX + padding, y: centerY - boxSize / 2, w: boxSize, h: boxSize }
    );
    ctx.fill();

    ctx.strokeStyle = effectiveBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + padding, centerY - boxSize / 2, boxSize, boxSize);

    const textX = legendX + padding + boxSize + textSpacing;

    if (wrapTextEnabled && effectiveMaxWidth) {
      const wrappedLines = wrapText(ctx, entry.label, effectiveMaxWidth);
      const lineHeight = fontSize * 1.2;
      const startY = centerY - (wrappedLines.length - 1) * lineHeight / 2;

      for (let lineIndex = 0; lineIndex < wrappedLines.length; lineIndex++) {
        await renderEnhancedText(
          ctx,
          wrappedLines[lineIndex],
          textX,
          startY + lineIndex * lineHeight,
          textStyle,
          fontSize,
          effectiveTextColor,
          textGradient
        );
      }
    } else {
      await renderEnhancedText(
        ctx,
        entry.label,
        textX,
        centerY,
        textStyle,
        fontSize,
        effectiveTextColor,
        textGradient
      );
    }

    currentY += entryHeight + spacing;
  }

  ctx.restore();
}

/**
 * Draws legend/key showing colors and their meanings
 */
function drawLegend(
  ctx: SKRSContext2D,
  legend: LegendEntry[],
  position: 'top' | 'bottom' | 'right' | 'left',
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  fontSize: number,
  backgroundColor: string = '#FFFFFF',
  legendSpacing: number = 20
): void {
  if (!legend || legend.length === 0) return;

  ctx.save();

  const boxSize = 15;
  const spacing = 10;
  const paddingBox = 8;

  ctx.font = `${fontSize}px Arial`;
  const maxLabelWidth = Math.max(...legend.map(e => ctx.measureText(e.label).width));
  const legendWidth = boxSize + spacing + maxLabelWidth + paddingBox * 2;
  const legendHeight = legend.length * (boxSize + spacing) + paddingBox * 2;

  let legendX: number, legendY: number;

  switch (position) {
    case 'top':
      legendX = width - padding.right - legendWidth - legendSpacing;
      legendY = padding.top + legendSpacing;
      break;
    case 'bottom':
      legendX = width - padding.right - legendWidth - legendSpacing;
      legendY = height - padding.bottom - legendHeight - legendSpacing;
      break;
    case 'right':
      legendX = width - padding.right - legendWidth - legendSpacing;
      legendY = padding.top + legendSpacing;
      break;
    case 'left':
      legendX = padding.left + legendSpacing;
      legendY = padding.top + legendSpacing;
      break;
    default:
      legendX = width - padding.right - legendWidth - legendSpacing;
      legendY = padding.top + legendSpacing;
  }

  const isDarkBackground = backgroundColor === '#000000' || backgroundColor.toLowerCase() === 'black';
  const textColor = isDarkBackground ? '#FFFFFF' : '#000000';
  const bgColor = isDarkBackground ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)';
  const borderColor = isDarkBackground ? '#FFFFFF' : '#000000';

  ctx.fillStyle = bgColor;
  ctx.fillRect(legendX, legendY, legendWidth, legendHeight);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);

  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  legend.forEach((entry, index) => {
    const y = legendY + paddingBox + index * (boxSize + spacing) + boxSize / 2;
    const x = legendX + paddingBox;

    ctx.beginPath();
    ctx.rect(x, y - boxSize / 2, boxSize, boxSize);
    fillWithGradientOrColor(
      ctx,
      entry.gradient,
      entry.color || '#4A90E2',
      '#4A90E2',
      { x, y: y - boxSize / 2, w: boxSize, h: boxSize }
    );
    ctx.fill();

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - boxSize / 2, boxSize, boxSize);

    ctx.fillStyle = textColor;
    ctx.fillText(entry.label, x + boxSize + spacing, y);
  });

  ctx.restore();
}

/**
 * Calculates responsive canvas height based on number of bars
 */
function calculateResponsiveHeight(
  dataLength: number,
  options: HorizontalBarChartOptions = {}
): number {
  const padding = options.dimensions?.padding || {};
  const paddingTop = padding.top ?? 60;
  const paddingBottom = padding.bottom ?? 80;

  const minBarHeight = options.bars?.minHeight ?? 40;
const barSpacing = options.bars?.spacing ?? 15;

  const chartAreaHeight = dataLength * minBarHeight + (dataLength - 1) * barSpacing;

  const titleHeight = options.labels?.title?.text ? (options.labels.title.fontSize ?? 24) + 20 : 0;
const titleMargin = options.labels?.title?.text ? 20 : 0;

  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const axisLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
  let xAxisLabelAreaHeight = 0;
  if (options.axes?.x?.label || options.axes?.x?.values || options.axes?.x?.range) {
const tickLabelHeight = tickFontSize + 10;
const xAxisLabelTextHeight = options.axes?.x?.label ? axisLabelFontSize + 2 : 0;
xAxisLabelAreaHeight = tickLabelHeight + (options.axes?.x?.label ? 8 : 0) + xAxisLabelTextHeight;
  }

  const yAxisLabelHeight = options.axes?.y?.label ? axisLabelFontSize + 20 : 0;
  const axisLabelHeight = Math.max(xAxisLabelAreaHeight, yAxisLabelHeight);
const minBottomGap = 2;

  return paddingTop + titleHeight + titleMargin + chartAreaHeight + axisLabelHeight + minBottomGap + paddingBottom;
}

/**
 * Creates a horizontal bar chart
 * @param data Array of horizontal bar chart data
 * @param options Chart options
 * @returns Canvas buffer
 */
export async function createHorizontalBarChart(
  data: HorizontalBarChartData[],
  options: HorizontalBarChartOptions = {}
): Promise<Buffer> {

  let width = options.dimensions?.width ?? 800;
  const padding = options.dimensions?.padding || {};

  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const backgroundGradient = options.appearance?.backgroundGradient;
  const backgroundImage = options.appearance?.backgroundImage;
  const axisColor = options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? '#000000';
  const axisWidth = options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;
  const arrowSize = options.appearance?.arrowSize ?? 10;

  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const showBarLabels = options.labels?.barLabelDefaults?.show ?? true;
  const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'left';
  const axisLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
  const showValues = options.labels?.valueLabelDefaults?.show ?? true;
  const valueFontSize = options.labels?.valueLabelDefaults?.fontSize ?? 12;
  const valueColor = options.labels?.valueLabelDefaults?.defaultColor ?? '#000000';

  const xAxisLabel = options.axes?.x?.label;
  const yAxisLabel = options.axes?.y?.label;
  const axisLabelColor = options.axes?.x?.labelColor ?? options.axes?.y?.labelColor ?? '#000000';
  const xAxisRange = options.axes?.x?.range;
  const xAxisValues = options.axes?.x?.values;
const baseline = options.axes?.x?.baseline ?? 0;
  const yAxisValues = options.axes?.y?.values;
  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const xAxisTickColor = options.axes?.x?.tickColor ?? '#000000';
  const yAxisTickColor = options.axes?.y?.tickColor ?? '#000000';
  const xAxisValueSpacing = options.axes?.x?.valueSpacing;
  const yAxisValueSpacing = options.axes?.y?.valueSpacing;

  const showLegend = options.legend?.show ?? false;
  const legend = options.legend?.entries;
const legendPosition = options.legend?.position ?? 'right';

  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;

  const chartType = options.type ?? 'standard';

  const minBarHeight = options.bars?.minHeight ?? 30;
  const barSpacing = options.bars?.spacing;
  const groupSpacing = options.bars?.groupSpacing ?? 10;
  const segmentSpacing = options.bars?.segmentSpacing ?? 2;
const lollipopLineWidth = options.bars?.lineWidth ?? 2;
const lollipopDotSize = options.bars?.dotSize ?? 8;

  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 80;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 100;

  let baseHeight = calculateResponsiveHeight(data.length, options);

  let legendWidth = 0;
  let legendHeight = 0;
  let extraWidth = 0;
  let extraHeight = 0;
const minLegendSpacing = 10;
  if (showLegend && legend && legend.length > 0) {
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendDims = calculateLegendDimensions(legend, axisLabelFontSize, legendMaxWidth, legendWrapText, legendPadding);
    legendWidth = legendDims.width;
    legendHeight = legendDims.height;

    const legendSpacing = options.legend?.spacing ?? 20;

    if (legendPosition === 'left') {

      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
let estimatedYAxisLabelWidth = 80;
      if (tempCtx) {

        const barLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
        const showBarLabels = options.labels?.barLabelDefaults?.show ?? true;
        const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'left';

        const hasLeftLabels = showBarLabels && (barLabelPosition === 'left' ||
          data.some(item => (item.labelPosition ?? barLabelPosition) === 'left'));

        if (hasLeftLabels) {

          tempCtx.font = `${barLabelFontSize}px Arial`;
          data.forEach(d => {
            const labelWidth = tempCtx.measureText(d.label).width;
            estimatedYAxisLabelWidth = Math.max(estimatedYAxisLabelWidth, labelWidth);
          });

          estimatedYAxisLabelWidth += 15;
        } else {

          tempCtx.font = `${tickFontSize}px Arial`;

estimatedYAxisLabelWidth = 60;

          estimatedYAxisLabelWidth += 30;
        }
      }
      extraWidth = legendWidth + legendSpacing + estimatedYAxisLabelWidth + minLegendSpacing;
    } else if (legendPosition === 'right') {
      extraWidth = legendWidth + legendSpacing + minLegendSpacing;
    } else if (legendPosition === 'top' || legendPosition === 'bottom') {
      extraHeight = legendHeight + legendSpacing + minLegendSpacing;
    }
  }

  let allValues: number[] = [];
  if (chartType === 'grouped' || chartType === 'stacked' || chartType === 'lollipop') {
    if (chartType === 'grouped') {

      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          d.values.forEach(seg => allValues.push(seg.value));
        } else if (d.value !== undefined) {
          allValues.push(d.value);
        }
      });
    } else {

      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          const sum = d.values.reduce((acc, seg) => acc + seg.value, 0);
          allValues.push(sum);
        } else if (d.value !== undefined) {
          allValues.push(d.value);
        }
      });
    }
  } else {

    allValues = data.map(d => d.value ?? 0).filter(v => v !== undefined && v !== null);
  }

  let xMin: number, xMax: number;
  let xAxisCustomValues: number[] | undefined = xAxisValues;
  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;

  const hasValueRanges = data.some(d => d.xStart !== undefined || d.xEnd !== undefined);
  if (hasValueRanges) {
    const allXStarts = data.map(d => d.xStart ?? d.value ?? 0).filter(v => v !== undefined);
    const allXEnds = data.map(d => d.xEnd ?? d.value ?? 0).filter(v => v !== undefined);
    xMin = Math.min(...allXStarts, ...allXEnds);
    xMax = Math.max(...allXStarts, ...allXEnds);

    const xPadding = (xMax - xMin) * 0.1;
    xMin = Math.max(0, xMin - xPadding);
    xMax = xMax + xPadding;
  } else if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
  } else if (hasExplicitXRange) {
    xMin = xAxisRange!.min!;
    xMax = xAxisRange!.max!;

    const effectiveBaseline = baseline !== undefined ? baseline : 0;
    xMin = Math.min(xMin, effectiveBaseline);
    xMax = Math.max(xMax, effectiveBaseline);
  } else {
    xMin = 0;
    xMax = Math.max(...allValues, 1);
    const xPadding = (xMax - xMin) * 0.1;
    const effectiveBaseline = baseline !== undefined ? baseline : 0;

    xMin = Math.min(Math.max(0, xMin - xPadding), effectiveBaseline);
    xMax = xMax + xPadding;
  }

  const yAxisRange = options.axes?.y?.range;
  let yMin: number, yMax: number;
  let yAxisCustomValues: number[] | undefined = yAxisValues;
  const hasExplicitYRange = yAxisRange && yAxisRange.min !== undefined && yAxisRange.max !== undefined;

  if (yAxisCustomValues && yAxisCustomValues.length > 0) {
    yMin = Math.min(...yAxisCustomValues);
    yMax = Math.max(...yAxisCustomValues);
  } else if (hasExplicitYRange) {
    yMin = yAxisRange!.min!;
    yMax = yAxisRange!.max!;
  } else {

    yMin = 0;
    yMax = data.length - 1;
  }

  if (hasExplicitXRange || xAxisCustomValues) {
    const effectiveXMin = xAxisCustomValues ? Math.min(...xAxisCustomValues) : xAxisRange!.min!;
    const effectiveXMax = xAxisCustomValues ? Math.max(...xAxisCustomValues) : xAxisRange!.max!;

    data.forEach((item, itemIndex) => {

      if (item.value !== undefined && (item.value < effectiveXMin || item.value > effectiveXMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has value ${item.value}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }

      if (item.xStart !== undefined && (item.xStart < effectiveXMin || item.xStart > effectiveXMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has xStart value ${item.xStart}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }
      if (item.xEnd !== undefined && (item.xEnd < effectiveXMin || item.xEnd > effectiveXMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has xEnd value ${item.xEnd}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }

      if (item.values && item.values.length > 0) {
        item.values.forEach((seg, segIndex) => {
          if (seg.value < effectiveXMin || seg.value > effectiveXMax) {
            throw new Error(
              `Horizontal Bar Chart Error: Data value out of X-axis bounds.\n` +
              `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" segment ${segIndex} has value ${seg.value}, ` +
              `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
            );
          }
        });
      }
    });
  }

  if (hasExplicitYRange || yAxisCustomValues) {
    const effectiveYMin = yAxisCustomValues ? Math.min(...yAxisCustomValues) : yAxisRange!.min!;
    const effectiveYMax = yAxisCustomValues ? Math.max(...yAxisCustomValues) : yAxisRange!.max!;

    data.forEach((item, itemIndex) => {

      if (item.yStart !== undefined && (item.yStart < effectiveYMin || item.yStart > effectiveYMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of Y-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has yStart value ${item.yStart}, ` +
          `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
        );
      }
      if (item.yEnd !== undefined && (item.yEnd < effectiveYMin || item.yEnd > effectiveYMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of Y-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has yEnd value ${item.yEnd}, ` +
          `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
        );
      }
    });
  }

  const adjustedWidth = width + extraWidth;
  const adjustedHeight = baseHeight + extraHeight;

  const canvas = createCanvas(adjustedWidth, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      ctx.drawImage(bgImage, 0, 0, adjustedWidth, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);

      fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
        x: 0, y: 0, w: adjustedWidth, h: adjustedHeight
      });
      ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
    }
  } else {
    fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
      x: 0, y: 0, w: adjustedWidth, h: adjustedHeight
    });
    ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
  }

  const titleHeight = chartTitle ? chartTitleFontSize + 20 : 0;

  let xAxisLabelAreaHeight = 0;
  if (xAxisLabel || (xAxisCustomValues && xAxisCustomValues.length > 0) || xAxisRange) {

const tickLabelHeight = tickFontSize + 10;

const xAxisLabelTextHeight = xAxisLabel ? axisLabelFontSize + 2 : 0;

xAxisLabelAreaHeight = tickLabelHeight + (xAxisLabel ? 8 : 0) + xAxisLabelTextHeight;
  }

  const yAxisLabelHeight = yAxisLabel ? axisLabelFontSize + 20 : 0;
  const axisLabelHeight = Math.max(xAxisLabelAreaHeight, yAxisLabelHeight);

  let chartAreaLeft = paddingLeft;
let chartAreaRight = width - paddingRight;

const titleMargin = chartTitle ? 20 : 0;
  let chartAreaTop = paddingTop + titleHeight + titleMargin;
let chartAreaBottom = baseHeight - paddingBottom;

  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    if (legendPosition === 'left') {

let actualYAxisLabelWidth = 80;
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      if (tempCtx) {

        const barLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
        tempCtx.font = `${barLabelFontSize}px Arial`;

        const hasLeftLabels = barLabelPosition === 'left' ||
          data.some(item => (item.labelPosition ?? barLabelPosition) === 'left');

        if (hasLeftLabels && showBarLabels) {

          data.forEach(d => {
            const labelWidth = tempCtx.measureText(d.label).width;
            actualYAxisLabelWidth = Math.max(actualYAxisLabelWidth, labelWidth);
          });

          actualYAxisLabelWidth += 15;
        } else {

          tempCtx.font = `${tickFontSize}px Arial`;

actualYAxisLabelWidth = 60;

          actualYAxisLabelWidth += 30;
        }
      }

      chartAreaLeft = paddingLeft + legendWidth + legendSpacing + actualYAxisLabelWidth;
chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'right') {

      chartAreaLeft = paddingLeft;
chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'top') {

      chartAreaTop = paddingTop + titleHeight + legendHeight + legendSpacing + minLegendSpacing;
chartAreaBottom = baseHeight - paddingBottom;
    } else if (legendPosition === 'bottom') {

      chartAreaTop = paddingTop + titleHeight;
chartAreaBottom = baseHeight - paddingBottom;
    }
  }

  const originX = chartAreaLeft;

  const minBottomGap = 2;
  const originY = baseHeight - paddingBottom - xAxisLabelAreaHeight - minBottomGap;
  const axisEndY = chartAreaTop;
  const axisEndX = chartAreaRight;

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const titleY = paddingTop + 10;
    const titleX = adjustedWidth / 2;
    await renderEnhancedText(
      ctx,
      chartTitle,
      titleX,
      titleY,
      options.labels?.title?.textStyle,
      chartTitleFontSize,
      options.labels?.title?.color,
      options.labels?.title?.gradient
    );
    ctx.restore();
  }

  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize);

  const xStep = xAxisRange?.step ?? Math.ceil((xMax - xMin) / 10);

  const yStep = yAxisRange?.step ?? 1;

  const chartAreaWidth = axisEndX - originX;

  const baselineX = originX + ((baseline - xMin) / (xMax - xMin)) * chartAreaWidth;

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();

  drawArrow(ctx, axisEndX, originY, 0, arrowSize);

  drawXAxisTicks(ctx, originX, originY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing, xAxisTickColor);

  const shouldDrawYAxisTicks = (yAxisValues && yAxisValues.length > 0) || (options.axes?.y?.range && options.axes.y.range.min !== undefined && options.axes.y.range.max !== undefined);
  if (shouldDrawYAxisTicks) {
    drawYAxisTicks(ctx, originX, originY, axisEndY, yMin, yMax, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing, yAxisTickColor);
  }

  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const tickLabelBottom = originY + tickFontSize + 10;
const xAxisLabelY = tickLabelBottom + 8;
    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, xAxisLabelY);
    ctx.restore();
  }

  if (yAxisLabel) {

    let maxBarLabelWidth = 0;
    if (showBarLabels) {

      const hasLeftLabels = barLabelPosition === 'left' ||
        data.some(item => (item.labelPosition ?? barLabelPosition) === 'left');

      if (hasLeftLabels) {

        ctx.save();
        ctx.font = `${axisLabelFontSize}px Arial`;
        data.forEach(item => {
          const currentLabelPosition = item.labelPosition ?? barLabelPosition;
          if (currentLabelPosition === 'left') {
            const labelWidth = ctx.measureText(item.label).width;
            maxBarLabelWidth = Math.max(maxBarLabelWidth, labelWidth);
          }
        });
        ctx.restore();
      }
    }

    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const labelX = originX - maxBarLabelWidth - 20 - 30;
    const labelY = (originY + axisEndY) / 2;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
  }

  if (showGrid) {
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, xMin, xMax, xStep, yMin, yMax, yStep, yAxisCustomValues, xAxisCustomValues, gridColor, gridWidth);
  }

  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendTextColor = options.legend?.textColor;
    const legendBorderColor = options.legend?.borderColor;
    const legendBgColor = options.legend?.backgroundColor;
    const legendPadding = options.legend?.padding;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;

    let legendX: number, legendY: number;
    const chartAreaHeight = originY - axisEndY;
    const chartAreaWidth = axisEndX - originX;

    switch (legendPosition) {
      case 'top':
legendX = (adjustedWidth - legendWidth) / 2;
        legendY = paddingTop + titleHeight + minLegendSpacing;
        break;
      case 'bottom':
legendX = (adjustedWidth - legendWidth) / 2;
        legendY = adjustedHeight - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case 'left':

        legendX = paddingLeft;
legendY = axisEndY + (chartAreaHeight - legendHeight) / 2;
        break;
      case 'right':
      default:
        legendX = axisEndX + minLegendSpacing;
legendY = axisEndY + (chartAreaHeight - legendHeight) / 2;
        break;
    }

    await drawLegendAtPosition(
      ctx,
      legend,
      legendX,
      legendY,
      legendFontSize,
      legendBgColor || backgroundColor,
      legendTextColor,
      legendBorderColor,
      legendPadding,
      legendMaxWidth,
      legendWrapText,
      options.legend?.backgroundGradient,
      options.legend?.textGradient,
      options.legend?.textStyle
    );
  }

  const chartAreaHeight = originY - axisEndY;

  const calculatedBarSpacing = barSpacing ?? 15;

const totalSpacing = data.length * calculatedBarSpacing;
  const availableHeight = chartAreaHeight - totalSpacing;
  const calculatedBarHeight = Math.max(minBarHeight, availableHeight / data.length);

  const totalBarsHeight = data.length * calculatedBarHeight + totalSpacing;
  if (totalBarsHeight > chartAreaHeight) {

    const adjustedBarHeight = Math.max(minBarHeight, (chartAreaHeight - totalSpacing) / data.length);
    if (adjustedBarHeight < calculatedBarHeight) {
      console.warn(`Bar height adjusted from ${calculatedBarHeight} to ${adjustedBarHeight} to fit all ${data.length} bars`);
    }
  }

  interface LabelInfo {
    type: 'value' | 'bar';
    text: string;
    x: number;
    y: number;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
    color?: string;
    gradient?: gradient;
    textStyle?: EnhancedTextStyle;
    fontSize: number;
  }
  const labelsToDraw: LabelInfo[] = [];

  const valueLabelPositions: Map<number, { x: number; fontSize: number; align: CanvasTextAlign }> = new Map();

  data.forEach((item, index) => {

    const barY = axisEndY + (index * (calculatedBarHeight + calculatedBarSpacing));
    const barCenterY = barY + calculatedBarHeight / 2;

    if (barY + calculatedBarHeight > originY) {

      console.warn(`Bar at index ${index} (${item.label}) would exceed chart bounds. Skipping.`);
      return;
    }

    let barX: number, barEndX: number, barLength: number;

    if ((chartType === 'grouped' || chartType === 'stacked' || chartType === 'lollipop') && item.values && item.values.length > 0) {

      const segments = item.values;
      const numSegments = segments.length;

      if (chartType === 'grouped') {

        const segmentHeight = (calculatedBarHeight - (groupSpacing * (numSegments - 1))) / numSegments;

        const maxSegment = segments.reduce((max, seg) => seg.value > max.value ? seg : max, segments[0]);
        if (item.xStart !== undefined || item.xEnd !== undefined) {
          const startValue = item.xStart ?? xMin;
          const endValue = item.xEnd ?? maxSegment.value;
          const startRatio = (startValue - xMin) / (xMax - xMin);
          const endRatio = (endValue - xMin) / (xMax - xMin);
          barX = originX + startRatio * chartAreaWidth;
          barEndX = originX + endRatio * chartAreaWidth;
        } else {

          if (maxSegment.value >= 0) {
            const positiveRatio = (maxSegment.value - 0) / (xMax - xMin);
            barX = baselineX;
            barEndX = baselineX + positiveRatio * chartAreaWidth;
          } else {
            const negativeRatio = (baseline - maxSegment.value) / (xMax - xMin);
            barX = baselineX - negativeRatio * chartAreaWidth;
            barEndX = baselineX;
          }
        }
        barLength = Math.abs(barEndX - barX);

        segments.forEach((segment, segIndex) => {
          const segY = barY + (segIndex * (segmentHeight + groupSpacing));
          const segCenterY = segY + segmentHeight / 2;

          let segBarX: number, segBarEndX: number;
          if (item.xStart !== undefined || item.xEnd !== undefined) {
            const startValue = item.xStart ?? xMin;
            const endValue = item.xEnd ?? segment.value;
            const startRatio = (startValue - xMin) / (xMax - xMin);
            const endRatio = (endValue - xMin) / (xMax - xMin);
            segBarX = originX + startRatio * chartAreaWidth;
            segBarEndX = originX + endRatio * chartAreaWidth;
          } else {

            if (segment.value >= baseline) {
              const positiveRatio = (segment.value - baseline) / (xMax - xMin);
              segBarX = baselineX;
              segBarEndX = baselineX + positiveRatio * chartAreaWidth;
            } else {
              const negativeRatio = (baseline - segment.value) / (xMax - xMin);
              segBarX = baselineX - negativeRatio * chartAreaWidth;
              segBarEndX = baselineX;
            }
          }
          const segBarLength = Math.abs(segBarEndX - segBarX);

          ctx.beginPath();
          ctx.rect(segBarX, segY, segBarLength, segmentHeight);
          fillWithGradientOrColor(
            ctx,
            segment.gradient || item.gradient,
            segment.color || item.color || '#4A90E2',
            '#4A90E2',
            { x: segBarX, y: segY, w: segBarLength, h: segmentHeight }
          );
          ctx.fill();

          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue) {
            labelsToDraw.push({
              type: 'value',
              text: segment.value.toString(),
              x: segment.value >= baseline ? segBarEndX + 5 : segBarX - 5,
              y: segCenterY,
              align: segment.value >= baseline ? 'left' : 'right',
              baseline: 'middle',
              color: segment.valueColor || valueColor,
              fontSize: valueFontSize
            });
          }
        });
      } else {

        let accumulatedLength = 0;

        segments.forEach((segment, segIndex) => {

          let segmentLength: number;
          let segBarX: number;

          if (segment.value >= baseline) {
            const positiveRatio = (segment.value - baseline) / (xMax - xMin);
            segmentLength = positiveRatio * chartAreaWidth;
            segBarX = baselineX + accumulatedLength;
          } else {
            const negativeRatio = (baseline - segment.value) / (xMax - xMin);
            segmentLength = negativeRatio * chartAreaWidth;
            segBarX = baselineX - accumulatedLength - segmentLength;
          }

          ctx.fillStyle = segment.color || item.color || '#4A90E2';
          ctx.fillRect(segBarX, barY, segmentLength, calculatedBarHeight);

          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue && segmentLength > valueFontSize + 10) {
            labelsToDraw.push({
              type: 'value',
              text: segment.value.toString(),
              x: segBarX + segmentLength / 2,
              y: barCenterY,
              align: 'center',
              baseline: 'middle',
              color: segment.valueColor || valueColor,
              fontSize: valueFontSize
            });
          }

          accumulatedLength += segmentLength;
        });

        barX = originX;
        barEndX = originX + accumulatedLength;
        barLength = accumulatedLength;

        const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
        const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
        if (shouldShowValue) {

          const totalPositive = segments.filter(s => s.value >= 0).reduce((sum, s) => sum + s.value, 0);
          const totalNegative = segments.filter(s => s.value < 0).reduce((sum, s) => sum + Math.abs(s.value), 0);
          const totalPositiveLength = (totalPositive / (xMax - xMin)) * chartAreaWidth;
          const totalNegativeLength = (totalNegative / (xMax - xMin)) * chartAreaWidth;
          const totalX = totalValue >= 0
            ? baselineX + totalPositiveLength + 5
            : baselineX - totalNegativeLength - 5;
          labelsToDraw.push({
            type: 'value',
            text: totalValue.toString(),
            x: totalX,
            y: barCenterY,
            align: totalValue >= 0 ? 'left' : 'right',
            baseline: 'middle',
            color: item.valueColor || valueColor,
            fontSize: valueFontSize
          });
        }
      }
    } else if (chartType === 'lollipop') {

      const value = item.value ?? baseline;

      let valueX: number;
      if (value >= baseline) {

        const positiveRatio = (value - baseline) / (xMax - xMin);
        valueX = baselineX + positiveRatio * chartAreaWidth;
      } else {

        const negativeRatio = (baseline - value) / (xMax - xMin);
        valueX = baselineX - negativeRatio * chartAreaWidth;
      }

      ctx.save();
      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = lollipopLineWidth;
      ctx.beginPath();
      ctx.moveTo(baselineX, barCenterY);
      ctx.lineTo(valueX, barCenterY);
      ctx.stroke();

      ctx.fillStyle = item.color || '#4A90E2';
      ctx.beginPath();
      ctx.arc(valueX, barCenterY, lollipopDotSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {

        if (value >= baseline) {
          valueLabelPositions.set(index, { x: valueX + lollipopDotSize / 2 + 5, fontSize: valueFontSize, align: 'left' });
        }

        labelsToDraw.push({
          type: 'value',
          text: value.toString(),
          x: value >= baseline ? valueX + lollipopDotSize / 2 + 5 : valueX - lollipopDotSize / 2 - 5,
          y: barCenterY,
          align: value >= baseline ? 'left' : 'right',
          baseline: 'middle',
          color: item.valueColor || valueColor,
          fontSize: valueFontSize
        });
      }

      barX = baselineX;
      barEndX = valueX;
      barLength = Math.abs(barEndX - barX);
    } else {

      if (item.xStart !== undefined || item.xEnd !== undefined) {
        const startValue = item.xStart ?? xMin;
        const endValue = item.xEnd ?? (item.value ?? 0);
        const startRatio = (startValue - xMin) / (xMax - xMin);
        const endRatio = (endValue - xMin) / (xMax - xMin);
        barX = originX + startRatio * chartAreaWidth;
        barEndX = originX + endRatio * chartAreaWidth;
      } else {

        const value = item.value ?? baseline;
        if (value >= baseline) {
          const positiveRatio = (value - baseline) / (xMax - xMin);
          barX = baselineX;
          barEndX = baselineX + positiveRatio * chartAreaWidth;
        } else {
          const negativeRatio = (baseline - value) / (xMax - xMin);
          barX = baselineX - negativeRatio * chartAreaWidth;
          barEndX = baselineX;
        }
      }
      barLength = barEndX - barX;

      ctx.beginPath();
      ctx.rect(barX, barY, barLength, calculatedBarHeight);
      fillWithGradientOrColor(
        ctx,
        item.gradient,
        item.color || '#4A90E2',
        '#4A90E2',
        { x: barX, y: barY, w: barLength, h: calculatedBarHeight }
      );
      ctx.fill();

      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        const value = item.value ?? baseline;
        const valueLabelX = value >= baseline ? barEndX + 5 : barX - 5;
        const valueLabelAlign = value >= baseline ? 'left' : 'right';

        if (value >= baseline) {
          valueLabelPositions.set(index, { x: valueLabelX, fontSize: valueFontSize, align: valueLabelAlign });
        }

        labelsToDraw.push({
          type: 'value',
          text: value.toString(),
          x: valueLabelX,
          y: barCenterY,
          align: valueLabelAlign,
          baseline: 'middle',
          color: item.valueColor || valueColor,
          fontSize: valueFontSize
        });
      }
    }

    if (showBarLabels) {
      let labelX: number, labelY: number;
      let textAlign: CanvasTextAlign = 'right';
      let textBaseline: CanvasTextBaseline = 'middle';

      const currentLabelPosition = item.labelPosition ?? barLabelPosition;

      switch (currentLabelPosition) {
        case 'left':
          labelX = originX - 5;
          labelY = barCenterY;
          textAlign = 'right';
          textBaseline = 'middle';
          break;
        case 'right':
          labelX = barEndX + 5;
          labelY = barCenterY;

          const valueLabelInfo = valueLabelPositions.get(index);
          if (valueLabelInfo && valueLabelInfo.align === 'left') {

            ctx.save();
            ctx.font = `${valueLabelInfo.fontSize}px Arial`;
            const valueLabelWidth = ctx.measureText((item.value ?? baseline).toString()).width;
            ctx.restore();
const spacing = 5;
            labelX = valueLabelInfo.x + valueLabelWidth + spacing;
          } else {
            labelX = barEndX + 5;
          }
          textAlign = 'left';
          textBaseline = 'middle';
          break;
        case 'top':
          labelX = barX + barLength / 2;

          labelY = barY - 5;
          textAlign = 'center';
          textBaseline = 'bottom';
          break;
        case 'bottom':
          labelX = barX + barLength / 2;
          labelY = barY + calculatedBarHeight + 5;
          textAlign = 'center';
          textBaseline = 'top';
          break;
        case 'inside':
          labelX = barX + barLength / 2;
          labelY = barCenterY;
          textAlign = 'center';
          textBaseline = 'middle';
          break;
        default:
          labelX = originX - 5;
          labelY = barCenterY;
          textAlign = 'right';
          textBaseline = 'middle';
      }

      const defaultBarLabelColor = options.labels?.barLabelDefaults?.defaultColor ?? '#000000';
      let labelColor = item.labelColor || defaultBarLabelColor;
      if (currentLabelPosition === 'inside') {
        const barColor = item.color || '#4A90E2';
        const isDark = barColor === '#000000' || barColor.toLowerCase().includes('dark') ||
                       (barColor.startsWith('#') && parseInt(barColor.slice(1, 3), 16) < 128);
        labelColor = isDark ? '#FFFFFF' : (item.labelColor || defaultBarLabelColor);
      }

      labelsToDraw.push({
        type: 'bar',
        text: item.label,
        x: labelX,
        y: labelY,
        align: textAlign,
        baseline: textBaseline,
        color: labelColor,
        fontSize: axisLabelFontSize
      });
    }
  });

  for (const label of labelsToDraw) {
    ctx.save();
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;

    let textStyle: EnhancedTextStyle | undefined;
    let textGradient: gradient | undefined;

    if (label.type === 'bar') {
      textStyle = options.labels?.barLabelDefaults?.textStyle || label.textStyle;
      textGradient = options.labels?.barLabelDefaults?.gradient || label.gradient;
    } else if (label.type === 'value') {
      textStyle = options.labels?.valueLabelDefaults?.textStyle || label.textStyle;
      textGradient = options.labels?.valueLabelDefaults?.gradient || label.gradient;
    }

    await renderEnhancedText(
      ctx,
      label.text,
      label.x,
      label.y,
      textStyle,
      label.fontSize,
      label.color,
      textGradient
    );
    ctx.restore();
  }

  return canvas.toBuffer('image/png');
}