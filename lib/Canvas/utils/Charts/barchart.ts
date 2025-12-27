import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";
import { EnhancedTextRenderer } from "../Texts/enhancedTextRenderer";

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
export interface BarSegment {
value: number;
color?: string;
gradient?: gradient;
label?: string;
valueColor?: string;
showValue?: boolean;
opacity?: number;
  shadow?: {
color?: string;
offsetX?: number;
offsetY?: number;
blur?: number;
  };
  stroke?: {
color?: string;
width?: number;
gradient?: gradient;
  };
}

/**
 * Interface for bar chart data with X-axis range
 * For standard charts: single value per bar
 * For grouped/stacked charts: multiple values per bar
 */
export interface BarChartData {
label: string;

value?: number;

values?: BarSegment[];
xStart: number;
xEnd: number;
color?: string;
gradient?: gradient;
labelColor?: string;
labelPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom';
valueColor?: string;
showValue?: boolean;
opacity?: number;
  shadow?: {
color?: string;
offsetX?: number;
offsetY?: number;
blur?: number;
  };
  stroke?: {
color?: string;
width?: number;
gradient?: gradient;
  };
}

/**
 * Chart types
 */
export type BarChartType = 'standard' | 'grouped' | 'stacked' | 'waterfall' | 'lollipop';

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
  fontString += `${effectiveFontSize}px "${fontFamily}"`;

  ctx.font = fontString;

  ctx.textAlign = savedTextAlign;
  ctx.textBaseline = savedTextBaseline;

  if (style?.fontPath && style?.fontName) {
    try {
      const { GlobalFonts } = await import('@napi-rs/canvas');
      const path = await import('path');
      const fullPath = path.join(process.cwd(), style.fontPath);
      GlobalFonts.registerFromPath(fullPath, style.fontName);
      ctx.font = fontString.replace(`"${fontFamily}"`, `"${style.fontName}"`);
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
 * Helper function to draw a bar with opacity, shadow, and stroke support
 */
function drawBar(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  gradient?: gradient,
  opacity?: number,
  shadow?: { color?: string; offsetX?: number; offsetY?: number; blur?: number },
  stroke?: { color?: string; width?: number; gradient?: gradient },
  globalShadow?: { color?: string; offsetX?: number; offsetY?: number; blur?: number },
  globalStroke?: { color?: string; width?: number; gradient?: gradient }
): void {
  ctx.save();

  const effectiveOpacity = opacity !== undefined ? opacity : 1;
  ctx.globalAlpha = effectiveOpacity;

  const effectiveShadow = shadow || globalShadow;
  if (effectiveShadow) {
    ctx.shadowColor = effectiveShadow.color || 'rgba(0,0,0,0.3)';
    ctx.shadowOffsetX = effectiveShadow.offsetX ?? 2;
    ctx.shadowOffsetY = effectiveShadow.offsetY ?? 2;
    ctx.shadowBlur = effectiveShadow.blur ?? 4;
  }

  ctx.beginPath();
  ctx.rect(x, y, width, height);

  if (gradient) {
    fillWithGradientOrColor(ctx, gradient, color, color, { x, y, w: width, h: height });
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();

  if (effectiveShadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }

  const effectiveStroke = stroke || globalStroke;
  if (effectiveStroke && effectiveStroke.width && effectiveStroke.width > 0) {
    ctx.beginPath();
    ctx.rect(x, y, width, height);

    if (effectiveStroke.gradient) {
      ctx.strokeStyle = createGradientFill(ctx, effectiveStroke.gradient, { x, y, w: width, h: height }) as any;
    } else {
      ctx.strokeStyle = effectiveStroke.color || '#000000';
    }
    ctx.lineWidth = effectiveStroke.width;
    ctx.stroke();
  }

  ctx.restore();
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
 * Axis configuration
 */
export interface AxisConfig {
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
valueSpacing?: number;
}

/**
 * Bar chart configuration - organized by category
 */
export interface BarChartOptions {

type?: BarChartType;

  waterfall?: {
initialValue?: number;
  };

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
x?: AxisConfig;
    y?: AxisConfig & {
baseline?: number;
};
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
  };

  bars?: {
spacing?: number;
minWidth?: number;
groupSpacing?: number;
segmentSpacing?: number;

lineWidth?: number;
dotSize?: number;

opacity?: number;
    shadow?: {
color?: string;
offsetX?: number;
offsetY?: number;
blur?: number;
    };
    stroke?: {
color?: string;
width?: number;
gradient?: gradient;
    };
  };
}

/**
 * Draws an arrow at the end of an axis
 * @param ctx Canvas context
 * @param x X position of arrow tip
 * @param y Y position of arrow tip
 * @param angle Angle in radians (0 = right, PI/2 = down)
 * @param size Size of the arrow
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
 * Draws Y-axis ticks and labels with custom values support
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
  valueSpacing?: number
): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const chartHeight = originY - axisEndY;

  if (customValues && customValues.length > 0) {

    const actualMin = Math.min(...customValues);
    const actualMax = Math.max(...customValues);
    const range = actualMax - actualMin;

    let lastLabelY = Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30;

    customValues.forEach((value) => {
      const y = originY - ((value - actualMin) / range) * chartHeight;

      if (Math.abs(y - lastLabelY) < minLabelSpacing) {

        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(originX - 5, y);
      ctx.lineTo(originX, y);
      ctx.stroke();

      ctx.fillText(value.toFixed(1), originX - 10, y);

lastLabelY = y;
    });
  } else {

    const range = maxValue - minValue;

    let lastLabelY = Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30;

    for (let value = minValue; value <= maxValue; value += step) {
      const y = originY - ((value - minValue) / range) * chartHeight;

      if (Math.abs(y - lastLabelY) < minLabelSpacing && value > minValue) {

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

      const labelText = value.toFixed(1);
      ctx.fillText(labelText, originX - 10, y);

lastLabelY = y;
    }
  }

  ctx.restore();
}

/**
 * Draws X-axis ticks and labels with custom values
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
  valueSpacing?: number
): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const chartWidth = axisEndX - originX;

  if (customValues && customValues.length > 0) {

    if (valueSpacing && valueSpacing > 0) {

      let currentX = originX;
      customValues.forEach((value, index) => {
        if (index === 0) {
          currentX = originX;
        } else {
currentX += valueSpacing;
        }

        if (currentX >= originX && currentX <= axisEndX) {

          ctx.beginPath();
          ctx.moveTo(currentX, originY);
          ctx.lineTo(currentX, originY + 5);
          ctx.stroke();

          ctx.fillText(value.toString(), currentX, originY + 10);
        }
      });
    } else {

      const totalValues = customValues.length;
      const divisor = totalValues > 1 ? totalValues - 1 : 1;

      let lastLabelX = -Infinity;
const minLabelSpacing = 40;

      customValues.forEach((value, index) => {

        const x = originX + (index / divisor) * chartWidth;
        const labelText = value.toString();
        const labelWidth = ctx.measureText(labelText).width;

        if (x - lastLabelX < minLabelSpacing && index > 0) {

          return;
        }

        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();

        ctx.fillText(labelText, x, originY + 10);

lastLabelX = x + labelWidth / 2;
      });
    }
  } else {

    const range = maxValue - minValue;

    if (valueSpacing && valueSpacing > 0) {

      let currentX = originX;
      let currentValue = minValue;

      while (currentX <= axisEndX && currentValue <= maxValue) {

        ctx.beginPath();
        ctx.moveTo(currentX, originY);
        ctx.lineTo(currentX, originY + 5);
        ctx.stroke();

        ctx.fillText(currentValue.toString(), currentX, originY + 10);

        currentX += valueSpacing;
        currentValue += step;
      }
    } else {

      let lastLabelX = -Infinity;
const minLabelSpacing = 40;

      for (let value = minValue; value <= maxValue; value += step) {
        const x = originX + ((value - minValue) / range) * chartWidth;
        const labelText = value.toString();
        const labelWidth = ctx.measureText(labelText).width;

        if (x - lastLabelX < minLabelSpacing && value > minValue) {

          continue;
        }

        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();

        ctx.fillText(labelText, x, originY + 10);

lastLabelX = x + labelWidth / 2;
      }
    }
  }

  ctx.restore();
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
  ctx.fillStyle = effectiveTextColor;

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
 * Draws legend/key showing colors and their meanings (legacy function for compatibility)
 */
async function drawLegend(
  ctx: SKRSContext2D,
  legend: LegendEntry[],
  position: 'top' | 'bottom' | 'right' | 'left',
  width: number,
  height: number,
  padding: { top: number; right: number; bottom: number; left: number },
  fontSize: number,
  backgroundColor: string = '#FFFFFF',
  legendSpacing: number = 20
): Promise<void> {
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

  for (let index = 0; index < legend.length; index++) {
    const entry = legend[index];
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
  }

  ctx.restore();
}

/**
 * Draws grid lines on the chart
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
  xAxisCustomValues?: number[],
  yAxisCustomValues?: number[],
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
    const totalValues = xAxisCustomValues.length;
    const divisor = totalValues > 1 ? totalValues - 1 : 1;

    xAxisCustomValues.forEach((_, index) => {
      const x = originX + (index / divisor) * chartWidth;
      ctx.beginPath();
      ctx.moveTo(x, axisEndY);
      ctx.lineTo(x, originY);
      ctx.stroke();
    });
  } else {
    const xRange = xMax - xMin;
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
    const yRange = actualMax - actualMin;

    yAxisCustomValues.forEach((value) => {
      const y = originY - ((value - actualMin) / yRange) * chartHeight;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(axisEndX, y);
      ctx.stroke();
    });
  } else {
    const yRange = yMax - yMin;
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
 * Calculates responsive canvas width based on X-axis range or custom values
 */
function calculateResponsiveWidth(
  xAxisRange: { min: number; max: number },
  options: BarChartOptions = {},
  customValues?: number[]
): number {
  const padding = options.dimensions?.padding || {};
  const paddingLeft = padding.left ?? 100;
  const paddingRight = padding.right ?? 80;

  if (customValues && customValues.length > 0) {

    const minChartAreaWidth = Math.max(400, customValues.length * 20);
    return paddingLeft + minChartAreaWidth + paddingRight;
  }

  const xRange = xAxisRange.max - xAxisRange.min;
const minChartAreaWidth = Math.max(400, xRange * 10);

  return paddingLeft + minChartAreaWidth + paddingRight;
}

/**
 * Draws x and y axes with arrows on a white background
 * @param width Canvas width
 * @param height Canvas height
 * @param options Chart options
 * @returns Canvas buffer and context
 */
export function drawAxes(
  width: number = 800,
  height: number = 600,
  options: BarChartOptions = {}
): { buffer: Buffer; ctx: SKRSContext2D; canvas: any } {
  const padding = options.dimensions?.padding || {};
  const axisColor = options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? '#000000';
  const axisWidth = options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;
  const arrowSize = options.appearance?.arrowSize ?? 10;
  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';

  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 80;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 100;

  const canvas = createCanvas(width, height);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  const originX = paddingLeft;
  const originY = height - paddingBottom;
  const axisEndX = width - paddingRight;
  const axisEndY = paddingTop;

  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();

  drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize);

  drawArrow(ctx, axisEndX, originY, 0, arrowSize);

  return { buffer: canvas.toBuffer('image/png'), ctx, canvas };
}

/**
 * Creates a single bar chart with X-axis range support
 * @param data Array of bar chart data with X-axis ranges
 * @param options Chart options
 * @returns Canvas buffer
 */
export async function createBarChart(
  data: BarChartData[],
  options: BarChartOptions = {}
): Promise<Buffer> {

  const height = options.dimensions?.height ?? 600;
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
  const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'bottom';
  const axisLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
  const showValues = options.labels?.valueLabelDefaults?.show ?? true;
  const valueFontSize = options.labels?.valueLabelDefaults?.fontSize ?? 12;
  const valueColor = options.labels?.valueLabelDefaults?.defaultColor ?? '#000000';

  const xAxisLabel = options.axes?.x?.label;
  const yAxisLabel = options.axes?.y?.label;
  const axisLabelColor = options.axes?.x?.labelColor ?? options.axes?.y?.labelColor ?? '#000000';
  const xAxisRange = options.axes?.x?.range;
  const xAxisValues = options.axes?.x?.values;
  const yAxisRange = options.axes?.y?.range;
  const yAxisValues = options.axes?.y?.values;
const baseline = options.axes?.y?.baseline ?? 0;
  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const xAxisValueSpacing = options.axes?.x?.valueSpacing;
  const yAxisValueSpacing = options.axes?.y?.valueSpacing;

  const chartType = options.type ?? 'standard';

  const initialValue = options.waterfall?.initialValue ?? 0;

  const showLegend = options.legend?.show ?? false;
  const legend = options.legend?.entries;
const legendPosition = options.legend?.position ?? 'right';

  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;

  const minBarWidth = options.bars?.minWidth ?? 20;
  const barSpacing = options.bars?.spacing;
  const groupSpacing = options.bars?.groupSpacing ?? 10;
  const segmentSpacing = options.bars?.segmentSpacing ?? 2;
  const lollipopLineWidth = options.bars?.lineWidth ?? 2;
  const lollipopDotSize = options.bars?.dotSize ?? 8;
  const globalBarOpacity = options.bars?.opacity;
  const globalBarShadow = options.bars?.shadow;
  const globalBarStroke = options.bars?.stroke;

  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 80;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 100;

  let xMin: number, xMax: number;
  let xAxisCustomValues: number[] | undefined = xAxisValues;

  if (xAxisCustomValues && xAxisCustomValues.length > 0) {

    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
  } else if (xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined) {
    xMin = xAxisRange.min;
    xMax = xAxisRange.max;
  } else {

    if (data.length === 0) {
      xMin = 0;
      xMax = 100;
    } else {
      const allXStarts = data.map(d => d.xStart);
      const allXEnds = data.map(d => d.xEnd);
      xMin = Math.min(...allXStarts, ...allXEnds);
      xMax = Math.max(...allXStarts, ...allXEnds);

      const xPadding = (xMax - xMin) * 0.1;
      xMin = Math.max(0, xMin - xPadding);
      xMax = xMax + xPadding;
    }
  }

  let baseWidth = calculateResponsiveWidth({ min: xMin, max: xMax }, options, xAxisCustomValues);

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
let estimatedYAxisLabelWidth = 60;
      if (tempCtx) {
        tempCtx.font = `${tickFontSize}px Arial`;

        const allValues: number[] = [];
        data.forEach(d => {
          if (d.values && d.values.length > 0) {
            if (chartType === 'stacked') {
              allValues.push(d.values.reduce((sum, seg) => sum + seg.value, 0));
            } else {
              d.values.forEach(seg => allValues.push(seg.value));
            }
          } else if (d.value !== undefined) {
            allValues.push(d.value);
          }
        });
        if (allValues.length > 0) {
          const maxValue = Math.max(...allValues);
          const minValue = Math.min(...allValues);

          const testLabels = [
            maxValue.toFixed(1),
            minValue.toFixed(1),
            Math.abs(maxValue).toFixed(1),
            Math.abs(minValue).toFixed(1)
          ];
          testLabels.forEach(label => {
            const width = tempCtx.measureText(label).width;
            estimatedYAxisLabelWidth = Math.max(estimatedYAxisLabelWidth, width);
          });
        }

        estimatedYAxisLabelWidth += 30;
      }
      extraWidth = legendWidth + legendSpacing + estimatedYAxisLabelWidth + minLegendSpacing;
    } else if (legendPosition === 'right') {
      extraWidth = legendWidth + legendSpacing + minLegendSpacing;
    } else if (legendPosition === 'top' || legendPosition === 'bottom') {
      extraHeight = legendHeight + legendSpacing + minLegendSpacing;
    }
  }

  const width = baseWidth + extraWidth;
  const adjustedHeight = height + extraHeight;

  const canvas = createCanvas(width, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);

      ctx.drawImage(bgImage, 0, 0, width, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);

      fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
        x: 0, y: 0, w: width, h: adjustedHeight
      });
      ctx.fillRect(0, 0, width, adjustedHeight);
    }
  } else {
    fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
      x: 0, y: 0, w: width, h: adjustedHeight
    });
    ctx.fillRect(0, 0, width, adjustedHeight);
  }

  const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0;
  const axisLabelHeight = (xAxisLabel || yAxisLabel) ? axisLabelFontSize + 20 : 0;

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = baseWidth - paddingRight;
  let chartAreaTop = paddingTop + titleHeight;
  let chartAreaBottom = height - paddingBottom;

  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    if (legendPosition === 'left') {

let actualYAxisLabelWidth = 60;
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      if (tempCtx) {
        tempCtx.font = `${tickFontSize}px Arial`;

        const allValues: number[] = [];
        data.forEach(d => {
          if (d.values && d.values.length > 0) {
            if (chartType === 'stacked') {
              allValues.push(d.values.reduce((sum, seg) => sum + seg.value, 0));
            } else {
              d.values.forEach(seg => allValues.push(seg.value));
            }
          } else if (d.value !== undefined) {
            allValues.push(d.value);
          }
        });
        if (allValues.length > 0) {
          const maxVal = Math.max(...allValues);
          const minVal = Math.min(...allValues);
          const testLabels = [
            maxVal.toFixed(1),
            minVal.toFixed(1),
            Math.abs(maxVal).toFixed(1),
            Math.abs(minVal).toFixed(1)
          ];
          testLabels.forEach(label => {
            const width = tempCtx.measureText(label).width;
            actualYAxisLabelWidth = Math.max(actualYAxisLabelWidth, width);
          });
        }

        actualYAxisLabelWidth += 30;
      }

      chartAreaLeft = paddingLeft + legendWidth + legendSpacing + actualYAxisLabelWidth;
      chartAreaRight = baseWidth - paddingRight;
    } else if (legendPosition === 'right') {
      chartAreaLeft = paddingLeft;
      chartAreaRight = baseWidth - paddingRight;
    } else if (legendPosition === 'top') {
      chartAreaTop = paddingTop + titleHeight + legendHeight + legendSpacing + minLegendSpacing;
      chartAreaBottom = height - paddingBottom;
    } else if (legendPosition === 'bottom') {
      chartAreaTop = paddingTop + titleHeight;
      chartAreaBottom = height - paddingBottom;
    }
  }

  const originX = chartAreaLeft;
  const originY = chartAreaBottom - axisLabelHeight;
  const axisEndX = chartAreaRight;
  const axisEndY = chartAreaTop;

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const titleY = paddingTop + 10;
    const titleX = width / 2;
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

  let allValues: number[] = [];
  if (chartType === 'grouped' || chartType === 'stacked' || chartType === 'waterfall') {
    if (chartType === 'grouped') {

      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          d.values.forEach(seg => allValues.push(seg.value));
        } else if (d.value !== undefined) {
          allValues.push(d.value);
        }
      });
    } else if (chartType === 'waterfall') {

      let cumulativeValue = initialValue;
allValues.push(initialValue);

      data.forEach(d => {
        if (d.values && d.values.length > 0) {

          const itemTotal = d.values.reduce((sum, seg) => sum + seg.value, 0);
          cumulativeValue += itemTotal;
        } else if (d.value !== undefined) {
          cumulativeValue += d.value;
        }

        allValues.push(cumulativeValue);
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

  let minValue: number, maxValue: number, yStep: number;
  let yAxisCustomValues: number[] | undefined = yAxisValues;
  const hasExplicitYRange = yAxisRange && yAxisRange.min !== undefined && yAxisRange.max !== undefined;
  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;

  if (yAxisCustomValues && yAxisCustomValues.length > 0) {

    minValue = Math.min(...yAxisCustomValues);
    maxValue = Math.max(...yAxisCustomValues);
yStep = 1;
  } else if (hasExplicitYRange) {

    minValue = yAxisRange!.min!;
    maxValue = yAxisRange!.max!;

    const effectiveBaseline = baseline !== undefined ? baseline : 0;
    minValue = Math.min(minValue, effectiveBaseline);
    maxValue = Math.max(maxValue, effectiveBaseline);

    if (chartType === 'waterfall' && allValues.length > 0) {
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);

      minValue = Math.min(minValue, dataMin);
      maxValue = Math.max(maxValue, dataMax);

      const range = maxValue - minValue;
      const padding = range * 0.1;
      minValue = Math.min(minValue - padding, effectiveBaseline);
      maxValue = maxValue + padding;
    }

    yStep = yAxisRange.step ?? Math.ceil((maxValue - minValue) / 10);
  } else {

    if (allValues.length > 0) {
      minValue = Math.min(...allValues);
      maxValue = Math.max(...allValues);

      if (chartType === 'waterfall') {
        minValue = Math.min(minValue, initialValue);
        maxValue = Math.max(maxValue, initialValue);
      }

      const range = maxValue - minValue;
      const padding = range * 0.1;
      const effectiveBaseline = baseline !== undefined ? baseline : 0;

      minValue = Math.min(minValue - padding, effectiveBaseline);
      maxValue = maxValue + padding;
    } else {
      minValue = 0;
      maxValue = 1;
    }
    yStep = Math.ceil((maxValue - minValue) / 10);
  }

  if (hasExplicitXRange || xAxisCustomValues) {
    const effectiveXMin = xAxisCustomValues ? Math.min(...xAxisCustomValues) : xAxisRange!.min!;
    const effectiveXMax = xAxisCustomValues ? Math.max(...xAxisCustomValues) : xAxisRange!.max!;

    data.forEach((item, itemIndex) => {
      if (item.xStart < effectiveXMin || item.xStart > effectiveXMax) {
        throw new Error(
          `Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has xStart value ${item.xStart}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }
      if (item.xEnd < effectiveXMin || item.xEnd > effectiveXMax) {
        throw new Error(
          `Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has xEnd value ${item.xEnd}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }
    });
  }

  if (hasExplicitYRange || yAxisCustomValues) {
    const effectiveYMin = yAxisCustomValues ? Math.min(...yAxisCustomValues) : minValue;
    const effectiveYMax = yAxisCustomValues ? Math.max(...yAxisCustomValues) : maxValue;

    data.forEach((item, itemIndex) => {
      if (chartType === 'grouped' || chartType === 'stacked') {
        if (item.values && item.values.length > 0) {
          item.values.forEach((seg, segIndex) => {
            if (seg.value < effectiveYMin || seg.value > effectiveYMax) {
              throw new Error(
                `Bar Chart Error: Data value out of Y-axis bounds.\n` +
                `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" segment ${segIndex} has value ${seg.value}, ` +
                `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
              );
            }
          });
        } else if (item.value !== undefined) {
          if (item.value < effectiveYMin || item.value > effectiveYMax) {
            throw new Error(
              `Bar Chart Error: Data value out of Y-axis bounds.\n` +
              `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has value ${item.value}, ` +
              `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
            );
          }
        }
      } else if (chartType === 'waterfall') {

        if (item.values && item.values.length > 0) {
          item.values.forEach((seg, segIndex) => {
            if (seg.value < effectiveYMin || seg.value > effectiveYMax) {
              throw new Error(
                `Bar Chart Error: Data value out of Y-axis bounds.\n` +
                `Waterfall bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" segment ${segIndex} has value ${seg.value}, ` +
                `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
              );
            }
          });
        } else if (item.value !== undefined) {
          if (item.value < effectiveYMin || item.value > effectiveYMax) {
            throw new Error(
              `Bar Chart Error: Data value out of Y-axis bounds.\n` +
              `Waterfall bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has value ${item.value}, ` +
              `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
            );
          }
        }
      } else {

        if (item.value !== undefined && (item.value < effectiveYMin || item.value > effectiveYMax)) {
          throw new Error(
            `Bar Chart Error: Data value out of Y-axis bounds.\n` +
            `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has value ${item.value}, ` +
            `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
          );
        }
      }
    });
  }

  drawYAxisTicks(ctx, originX, originY, axisEndY, minValue, maxValue, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing);

  const chartAreaHeight = originY - axisEndY;

  const baselineY = originY - ((baseline - minValue) / (maxValue - minValue)) * chartAreaHeight;

  const xAxisY = baselineY;
  ctx.beginPath();
  ctx.moveTo(originX, xAxisY);
  ctx.lineTo(axisEndX, xAxisY);
  ctx.stroke();

  drawArrow(ctx, axisEndX, xAxisY, 0, arrowSize);

  const xStep = xAxisRange?.step ?? Math.ceil((xMax - xMin) / 10);

  drawXAxisTicks(ctx, originX, xAxisY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing);

  if (showGrid) {
    drawGrid(
      ctx,
      originX,
      originY,
      axisEndX,
      axisEndY,
      xMin,
      xMax,
      xStep,
      minValue,
      maxValue,
      yStep,
      xAxisCustomValues,
      yAxisCustomValues,
      gridColor,
      gridWidth
    );
  }

  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, xAxisY + 25);
    ctx.restore();
  }

  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const labelX = originX - 30;
    const labelY = (originY + axisEndY) / 2;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
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
legendX = (width - legendWidth) / 2;
        legendY = paddingTop + titleHeight + minLegendSpacing;
        break;
      case 'bottom':
legendX = (width - legendWidth) / 2;
        legendY = adjustedHeight - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case 'left':

        legendX = paddingLeft + minLegendSpacing;
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

  const chartAreaWidth = axisEndX - originX;

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

  const valueLabelPositions: Map<number, { y: number; fontSize: number; baseline: CanvasTextBaseline }> = new Map();

  data.forEach((item, itemIndex) => {

    let barXStart: number, barXEnd: number;

    if (xAxisCustomValues && xAxisCustomValues.length > 0) {

      const actualMin = Math.min(...xAxisCustomValues);
      const actualMax = Math.max(...xAxisCustomValues);
      const xRange = actualMax - actualMin;

      const startIndex = xAxisCustomValues.indexOf(item.xStart);
      const endIndex = xAxisCustomValues.indexOf(item.xEnd);

      if (startIndex !== -1 && endIndex !== -1) {

        const totalValues = xAxisCustomValues.length;
        const divisor = totalValues > 1 ? totalValues - 1 : 1;
        barXStart = originX + (startIndex / divisor) * chartAreaWidth;
        barXEnd = originX + (endIndex / divisor) * chartAreaWidth;
      } else {

        barXStart = originX + ((item.xStart - actualMin) / xRange) * chartAreaWidth;
        barXEnd = originX + ((item.xEnd - actualMin) / xRange) * chartAreaWidth;
      }
    } else {

      const xRange = xMax - xMin;
      barXStart = originX + ((item.xStart - xMin) / xRange) * chartAreaWidth;
      barXEnd = originX + ((item.xEnd - xMin) / xRange) * chartAreaWidth;
    }

    const groupWidth = Math.max(barXEnd - barXStart, minBarWidth);
    if (item.xStart === item.xEnd) {

      const centerX = barXStart;
      barXStart = centerX - groupWidth / 2;
    }

    if ((chartType === 'grouped' || chartType === 'stacked' || chartType === 'waterfall') && item.values && item.values.length > 0) {

      const segments = item.values;
      const numSegments = segments.length;

      if (chartType === 'grouped') {

        const segmentWidth = (groupWidth - (groupSpacing * (numSegments - 1))) / numSegments;

        let highestValueLabelY: number | null = null;

        segments.forEach((segment, segIndex) => {
          const segXStart = barXStart + (segIndex * (segmentWidth + groupSpacing));

          let barY: number, barHeight: number;
          if (segment.value >= baseline) {

            const positiveRatio = (segment.value - baseline) / (maxValue - minValue);
            barHeight = positiveRatio * chartAreaHeight;
            barY = baselineY - barHeight;
          } else {

            const negativeRatio = (baseline - segment.value) / (maxValue - minValue);
            barHeight = negativeRatio * chartAreaHeight;
            barY = baselineY;
          }

          drawBar(
            ctx,
            segXStart,
            barY,
            segmentWidth,
            barHeight,
            segment.color || item.color || '#4A90E2',
            segment.gradient || item.gradient,
            segment.opacity ?? item.opacity ?? globalBarOpacity,
            segment.shadow || item.shadow,
            segment.stroke || item.stroke,
            globalBarShadow,
            globalBarStroke
          );

          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue) {
            const valueLabelY = barY - 5;

            if (segment.value >= baseline && (highestValueLabelY === null || valueLabelY < highestValueLabelY)) {
              highestValueLabelY = valueLabelY;
            }

            labelsToDraw.push({
              type: 'value',
              text: segment.value.toString(),
              x: segXStart + segmentWidth / 2,
              y: valueLabelY,
              align: 'center',
              baseline: 'bottom',
              color: segment.valueColor || valueColor,
              fontSize: valueFontSize
            });
          }
        });

        if (highestValueLabelY !== null) {
          valueLabelPositions.set(data.indexOf(item), { y: highestValueLabelY, fontSize: valueFontSize, baseline: 'bottom' });
        }
      } else if (chartType === 'waterfall') {

        let cumulativeValue = initialValue;
        const currentIndex = data.indexOf(item);
        for (let i = 0; i < currentIndex; i++) {
          const prevItem = data[i];
          if (prevItem.values && prevItem.values.length > 0) {

            const prevTotal = prevItem.values.reduce((sum, seg) => sum + seg.value, 0);
            cumulativeValue += prevTotal;
          } else if (prevItem.value !== undefined) {
            cumulativeValue += prevItem.value;
          }
        }

        const cumulativeBaselineY = originY - ((cumulativeValue - minValue) / (maxValue - minValue)) * chartAreaHeight;

        const positiveSegments: typeof segments = [];
        const negativeSegments: typeof segments = [];

        segments.forEach(seg => {
          if (seg.value >= 0) {
            positiveSegments.push(seg);
          } else {
            negativeSegments.push(seg);
          }
        });

        let accumulatedPositiveHeight = 0;
        positiveSegments.forEach((segment) => {
          const positiveRatio = segment.value / (maxValue - minValue);
          const segmentHeight = positiveRatio * chartAreaHeight;
          const barY = cumulativeBaselineY - accumulatedPositiveHeight - segmentHeight;

          const clampedBarY = Math.max(axisEndY, barY);
          const clampedBarHeight = Math.min(segmentHeight, cumulativeBaselineY - accumulatedPositiveHeight - clampedBarY);

          if (clampedBarHeight > 0) {

            const clampedBarXStart = Math.max(originX, Math.min(barXStart, axisEndX));
            const clampedGroupWidth = Math.min(groupWidth, axisEndX - clampedBarXStart);

            if (clampedGroupWidth > 0) {
              drawBar(
                ctx,
                clampedBarXStart,
                clampedBarY,
                clampedGroupWidth,
                clampedBarHeight,
                segment.color || item.color || '#4A90E2',
                segment.gradient || item.gradient,
                segment.opacity ?? item.opacity ?? globalBarOpacity,
                segment.shadow || item.shadow,
                segment.stroke || item.stroke,
                globalBarShadow,
                globalBarStroke
              );

            const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
            if (shouldShowValue && clampedBarHeight > valueFontSize + 5) {
              labelsToDraw.push({
                type: 'value',
                text: segment.value.toString(),
                x: clampedBarXStart + clampedGroupWidth / 2,
                y: clampedBarY + clampedBarHeight / 2,
                align: 'center',
                baseline: 'middle',
                color: segment.valueColor || valueColor,
                fontSize: valueFontSize
              });
            }
            }
          }

          accumulatedPositiveHeight += segmentHeight;
        });

        let accumulatedNegativeHeight = 0;
        negativeSegments.forEach((segment) => {
          const negativeRatio = Math.abs(segment.value) / (maxValue - minValue);
          const segmentHeight = negativeRatio * chartAreaHeight;
          const barY = cumulativeBaselineY + accumulatedNegativeHeight;

          const clampedBarY = Math.max(barY, axisEndY);
          const clampedBarHeight = Math.min(segmentHeight, originY - clampedBarY);

          if (clampedBarHeight > 0) {

            const clampedBarXStart = Math.max(originX, Math.min(barXStart, axisEndX));
            const clampedGroupWidth = Math.min(groupWidth, axisEndX - clampedBarXStart);

            if (clampedGroupWidth > 0) {
              drawBar(
                ctx,
                clampedBarXStart,
                clampedBarY,
                clampedGroupWidth,
                clampedBarHeight,
                segment.color || item.color || '#FF6B6B',
                segment.gradient || item.gradient,
                segment.opacity ?? item.opacity ?? globalBarOpacity,
                segment.shadow || item.shadow,
                segment.stroke || item.stroke,
                globalBarShadow,
                globalBarStroke
              );

            const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
            if (shouldShowValue && clampedBarHeight > valueFontSize + 5) {
              labelsToDraw.push({
                type: 'value',
                text: segment.value.toString(),
                x: clampedBarXStart + clampedGroupWidth / 2,
                y: clampedBarY + clampedBarHeight / 2,
                align: 'center',
                baseline: 'middle',
                color: segment.valueColor || valueColor,
                fontSize: valueFontSize
              });
            }
            }
          }

          accumulatedNegativeHeight += segmentHeight;
        });
      } else {

        const positiveSegments: typeof segments = [];
        const negativeSegments: typeof segments = [];

        segments.forEach(seg => {
          if (seg.value >= baseline) {
            positiveSegments.push(seg);
          } else {
            negativeSegments.push(seg);
          }
        });

        let accumulatedPositiveHeight = 0;
        positiveSegments.forEach((segment) => {
          const positiveRatio = (segment.value - baseline) / (maxValue - minValue);
          const segmentHeight = positiveRatio * chartAreaHeight;
          const barY = baselineY - accumulatedPositiveHeight - segmentHeight;

          drawBar(
            ctx,
            barXStart,
            barY,
            groupWidth,
            segmentHeight,
            segment.color || item.color || '#4A90E2',
            segment.gradient || item.gradient,
            segment.opacity ?? item.opacity ?? globalBarOpacity,
            segment.shadow || item.shadow,
            segment.stroke || item.stroke,
            globalBarShadow,
            globalBarStroke
          );

          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue && segmentHeight > valueFontSize + 5) {
            labelsToDraw.push({
              type: 'value',
              text: segment.value.toString(),
              x: barXStart + groupWidth / 2,
              y: barY + segmentHeight / 2,
              align: 'center',
              baseline: 'middle',
              color: segment.valueColor || valueColor,
              fontSize: valueFontSize
            });
          }

          accumulatedPositiveHeight += segmentHeight;
        });

        let accumulatedNegativeHeight = 0;
        negativeSegments.forEach((segment) => {
          const negativeRatio = (baseline - segment.value) / (maxValue - minValue);
          const segmentHeight = negativeRatio * chartAreaHeight;
          const barY = baselineY + accumulatedNegativeHeight;

          drawBar(
            ctx,
            barXStart,
            barY,
            groupWidth,
            segmentHeight,
            segment.color || item.color || '#FF6B6B',
            segment.gradient || item.gradient,
            segment.opacity ?? item.opacity ?? globalBarOpacity,
            segment.shadow || item.shadow,
            segment.stroke || item.stroke,
            globalBarShadow,
            globalBarStroke
          );

          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue && segmentHeight > valueFontSize + 5) {
            labelsToDraw.push({
              type: 'value',
              text: segment.value.toString(),
              x: barXStart + groupWidth / 2,
              y: barY + segmentHeight / 2,
              align: 'center',
              baseline: 'middle',
              color: segment.valueColor || valueColor,
              fontSize: valueFontSize
            });
          }

          accumulatedNegativeHeight += segmentHeight;
        });

        const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
        const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
        if (shouldShowValue) {
          const totalValueY = totalValue >= baseline ? baselineY - accumulatedPositiveHeight - 5 : baselineY + accumulatedNegativeHeight + 5;
          const totalValueBaseline = totalValue >= baseline ? 'bottom' : 'top';

          if (totalValue >= baseline) {
            valueLabelPositions.set(data.indexOf(item), { y: totalValueY, fontSize: valueFontSize, baseline: totalValueBaseline });
          }

          labelsToDraw.push({
            type: 'value',
            text: totalValue.toString(),
            x: barXStart + groupWidth / 2,
            y: totalValueY,
            align: 'center',
            baseline: totalValueBaseline,
            color: item.valueColor || valueColor,
            fontSize: valueFontSize
          });
        }
      }
    } else if (chartType === 'lollipop') {

      const barCenterX = barXStart + groupWidth / 2;
      const value = item.value ?? baseline;

      let valueY: number;
      if (value >= baseline) {

        const positiveRatio = (value - baseline) / (maxValue - minValue);
        valueY = baselineY - positiveRatio * chartAreaHeight;
      } else {

        const negativeRatio = (baseline - value) / (maxValue - minValue);
        valueY = baselineY + negativeRatio * chartAreaHeight;
      }

      ctx.save();
      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = lollipopLineWidth;
      ctx.beginPath();
      ctx.moveTo(barCenterX, baselineY);
      ctx.lineTo(barCenterX, valueY);
      ctx.stroke();

      ctx.save();
      const dotOpacity = item.opacity ?? globalBarOpacity;
      if (dotOpacity !== undefined) {
        ctx.globalAlpha = dotOpacity;
      }

      const dotShadow = item.shadow || globalBarShadow;
      if (dotShadow) {
        ctx.shadowColor = dotShadow.color || 'rgba(0,0,0,0.3)';
        ctx.shadowOffsetX = dotShadow.offsetX ?? 2;
        ctx.shadowOffsetY = dotShadow.offsetY ?? 2;
        ctx.shadowBlur = dotShadow.blur ?? 4;
      }

      ctx.beginPath();
      ctx.arc(barCenterX, valueY, lollipopDotSize / 2, 0, Math.PI * 2);
      fillWithGradientOrColor(
        ctx,
        item.gradient,
        item.color || '#4A90E2',
        '#4A90E2',
        { x: barCenterX - lollipopDotSize / 2, y: valueY - lollipopDotSize / 2, w: lollipopDotSize, h: lollipopDotSize }
      );
      ctx.fill();

      if (dotShadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
      }

      const dotStroke = item.stroke || globalBarStroke;
      if (dotStroke && dotStroke.width && dotStroke.width > 0) {
        ctx.beginPath();
        ctx.arc(barCenterX, valueY, lollipopDotSize / 2, 0, Math.PI * 2);
        if (dotStroke.gradient) {
          ctx.strokeStyle = createGradientFill(ctx, dotStroke.gradient, {
            x: barCenterX - lollipopDotSize / 2,
            y: valueY - lollipopDotSize / 2,
            w: lollipopDotSize,
            h: lollipopDotSize
          }) as any;
        } else {
          ctx.strokeStyle = dotStroke.color || item.color || '#4A90E2';
        }
        ctx.lineWidth = dotStroke.width;
        ctx.stroke();
      } else {

        ctx.strokeStyle = item.color || '#4A90E2';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        labelsToDraw.push({
          type: 'value',
          text: value.toString(),
          x: barCenterX,
          y: value >= baseline ? valueY - lollipopDotSize / 2 - 5 : valueY + lollipopDotSize / 2 + 5,
          align: 'center',
          baseline: value >= baseline ? 'bottom' : 'top',
          color: item.valueColor || valueColor,
          fontSize: valueFontSize
        });
      }
    } else {

      const barWidth = groupWidth;
      const value = item.value ?? baseline;

      let barHeight: number;
      let barY: number;

      if (value >= baseline) {

        const positiveRatio = (value - baseline) / (maxValue - minValue);
        barHeight = positiveRatio * chartAreaHeight;
        barY = baselineY - barHeight;
      } else {

        const negativeRatio = (baseline - value) / (maxValue - minValue);
        barHeight = negativeRatio * chartAreaHeight;
        barY = baselineY;
      }

      drawBar(
        ctx,
        barXStart,
        barY,
        barWidth,
        barHeight,
        item.color || '#4A90E2',
        item.gradient,
        item.opacity ?? globalBarOpacity,
        item.shadow,
        item.stroke,
        globalBarShadow,
        globalBarStroke
      );

      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        const valueLabelY = value >= baseline ? barY - 5 : barY + barHeight + 5;
        const valueLabelBaseline = value >= baseline ? 'bottom' : 'top';

        if (value >= baseline) {
          valueLabelPositions.set(data.indexOf(item), { y: valueLabelY, fontSize: valueFontSize, baseline: valueLabelBaseline });
        }

        labelsToDraw.push({
          type: 'value',
          text: value.toString(),
          x: barXStart + barWidth / 2,
          y: valueLabelY,
          align: 'center',
          baseline: valueLabelBaseline,
          color: item.valueColor || valueColor,
          fontSize: valueFontSize
        });
      }
    }

    if (showBarLabels) {
      ctx.save();
      ctx.fillStyle = item.labelColor || '#000000';
      ctx.font = `${axisLabelFontSize}px Arial`;

      let labelX: number, labelY: number;
      let textAlign: CanvasTextAlign = 'center';
      let textBaseline: CanvasTextBaseline = 'middle';

      const barCenterX = barXStart + groupWidth / 2;

      let barCenterY: number;
      if ((chartType === 'grouped' || chartType === 'stacked') && item.values && item.values.length > 0) {
        if (chartType === 'stacked') {

          const totalValue = item.values.reduce((sum, seg) => sum + seg.value, 0);
          const totalHeight = ((totalValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          barCenterY = originY - totalHeight / 2;
        } else {

          const maxSegValue = Math.max(...item.values.map(seg => seg.value));
          const maxHeight = ((maxSegValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          barCenterY = originY - maxHeight / 2;
        }
      } else {

        const value = item.value ?? 0;
        const barHeight = ((value - minValue) / (maxValue - minValue)) * chartAreaHeight;
        barCenterY = originY - barHeight / 2;
      }

      const currentLabelPosition = item.labelPosition ?? barLabelPosition;

      let topBarY: number;
      if ((chartType === 'grouped' || chartType === 'stacked') && item.values && item.values.length > 0) {
        if (chartType === 'stacked') {
          const totalValue = item.values.reduce((sum, seg) => sum + seg.value, 0);
          const totalHeight = ((totalValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          topBarY = originY - totalHeight;
        } else {
          const maxSegValue = Math.max(...item.values.map(seg => seg.value));
          const maxHeight = ((maxSegValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          topBarY = originY - maxHeight;
        }
      } else {
        const value = item.value ?? 0;
        const barHeight = ((value - minValue) / (maxValue - minValue)) * chartAreaHeight;
        topBarY = originY - barHeight;
      }

      switch (currentLabelPosition) {
        case 'top':
          labelX = barCenterX;

          const valueLabelInfo = valueLabelPositions.get(data.indexOf(item));
          if (valueLabelInfo && valueLabelInfo.baseline === 'bottom') {

const spacing = 5;
            labelY = valueLabelInfo.y - valueLabelInfo.fontSize - spacing;
          } else {
            labelY = topBarY - 5;
          }
          textAlign = 'center';
          textBaseline = 'bottom';
          break;
        case 'bottom':
          labelX = barCenterX;
          labelY = originY + 5;
          textAlign = 'center';
          textBaseline = 'top';
          break;
        case 'left':
          labelX = barXStart - 5;
          labelY = barCenterY;
          textAlign = 'right';
          textBaseline = 'middle';
          break;
        case 'right':
          labelX = barXEnd + 5;
          labelY = barCenterY;
          textAlign = 'left';
          textBaseline = 'middle';
          break;
        case 'inside':
          labelX = barCenterX;
          labelY = barCenterY;
          textAlign = 'center';
          textBaseline = 'middle';

          const barColor = item.color || '#4A90E2';

          const isDark = barColor === '#000000' || barColor.toLowerCase().includes('dark') ||
                         (barColor.startsWith('#') && parseInt(barColor.slice(1, 3), 16) < 128);
          ctx.fillStyle = isDark ? '#FFFFFF' : (item.labelColor || '#000000');
          break;
        default:
          labelX = barCenterX;
          labelY = originY + 5;
          textAlign = 'center';
          textBaseline = 'top';
      }

      let labelColor = item.labelColor || '#000000';
      if (currentLabelPosition === 'inside') {
        const barColor = item.color || '#4A90E2';
        const isDark = barColor === '#000000' || barColor.toLowerCase().includes('dark') ||
                       (barColor.startsWith('#') && parseInt(barColor.slice(1, 3), 16) < 128);
        labelColor = isDark ? '#FFFFFF' : (item.labelColor || '#000000');
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

(async () => {
  const chart = await createBarChart([
    {
      label: 'Day 25',
      value: 1,
      xStart: 25,
      xEnd: 29,
      color: '#50C878',
      labelColor: 'black',
      labelPosition: 'top',
      valueColor: '#000000',
      showValue: true
    },
    {
      label: 'Day 12',
      value: 13,
      xStart: 10,
      xEnd: 14,
      color: '#50C878',
      labelColor: 'black',
      labelPosition: 'inside',
      valueColor: '#FFFFFF',
      showValue: true
    },
    {
      label: 'Day 13',
      value: 4,
      xStart: 17,
      xEnd: 22,
      color: '#50C878',
      labelColor: 'black',
      labelPosition: 'right',
      valueColor: '#000000',
      showValue: true
    }
  ], {

type: 'standard',

    dimensions: {
      height: 600,
      padding: {
        top: 60,
        right: 80,
        bottom: 80,
        left: 100
      }
    },

    appearance: {
      backgroundColor: 'white',

      axisColor: '#000000',
      axisWidth: 2,
      arrowSize: 10
    },

    axes: {
      x: {
        label: 'Day',
        labelColor: 'black',
        values: [24, 25, 26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],

        tickFontSize: 10,
valueSpacing: 5
      },
      y: {
        label: 'Count',
        labelColor: 'black',
        values: [0, 2, 4, 6, 8, 10, 12, 14],

        tickFontSize: 10,
valueSpacing: 3
      }
    },

    labels: {
      title: {
        text: 'Joined Members',
        fontSize: 18,
        color: '#000000'
      },
      barLabelDefaults: {
show: true,
defaultPosition: 'bottom',
        fontSize: 12,
defaultColor: '#000000'
      },
      valueLabelDefaults: {
show: true,
        fontSize: 11,
defaultColor: '#000000'
      }
    },

    legend: {
      show: true,
      entries: [
        { color: '#50C878', label: 'Members' },
        { color: '#4A90E2', label: 'Bots' }
      ]
    },

    grid: {
      show: true,
      color: '#E0E0E0',
      width: 1
    }
  });

  fs.writeFileSync('./chart.png', chart);
})();
