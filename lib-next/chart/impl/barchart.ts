import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import type { gradient } from "../../types";
import { createGradientFill } from "../../render/gradient-fill";
import { paintChartCanvasBackground, type ChartAppearanceExtended } from "../helpers/chartBackground";
import {
  normalizeLegendPosition,
  legendConsumesLeftEdge,
  applyLegendChartAreaInset,
  type LegendPlacement,
} from "../helpers/legendPlacement";
import { computeChartVerticalStack, resolveOuterPadding } from "../helpers/chartPadding";
import {
  computeLegendRowMetrics,
  legendLineHeight,
} from "../helpers/legendTextLayout";
import { segmentValueDisplayText } from "../helpers/segmentValueLabel";
import {
  reserveBelowBarChartValueBaseline,
  reserveHorizontalForRotatedYAxisTitle,
} from "../helpers/axisTitleLayout";

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
  /** When set (non-empty), drawn as the segment value label instead of {@link value} */
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
export function drawBar(
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
  /**
   * X/Y domain. X range much wider than bar positions spreads bars thinly across the plot.
   * Omit X range for auto bounds from `xStart`/`xEnd` (with padding).
   */
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
    /**
     * Plot-band canvas width before legend horizontal growth (`extraWidth`).
     * If omitted, width is inferred from the X-axis span (~10px per X unit, ≥ ~400px),
     * which often mismatches a large requested layout (wasted space after scale-to-fit).
     * Set explicitly whenever the chart should fill a known width (e.g. comparison cells).
     */
    width?: number;
    height?: number;
    padding?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };

  appearance?: ChartAppearanceExtended;

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
/** See {@link LegendPlacement}; aliases like `topLeft`, `bottom_right` accepted. */
position?: LegendPlacement | string;
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

    customValues.forEach((value, index) => {
      const y = originY - ((value - actualMin) / range) * chartHeight;
      const isLastCustom = index === customValues.length - 1;

      if (Math.abs(y - lastLabelY) < minLabelSpacing && !isLastCustom) {

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
      const isLastStepTick = value + step > maxValue + 1e-9;

      if (Math.abs(y - lastLabelY) < minLabelSpacing && value > minValue && !isLastStepTick) {

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

/** `marks` = tick strokes only; `labels` = numeric labels only; `both` = default */
type XAxisTickPhase = 'marks' | 'labels' | 'both';

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
  valueSpacing?: number,
  phase: XAxisTickPhase = 'both',
  tickLabelColor: string = '#000000'
): void {
  ctx.save();
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const chartWidth = axisEndX - originX;
  const drawMarks = phase === 'both' || phase === 'marks';
  const drawLabels = phase === 'both' || phase === 'labels';

  if (customValues && customValues.length > 0) {

    const actualMin = Math.min(...customValues);
    const actualMax = Math.max(...customValues);
    const range = actualMax - actualMin || 1;
    let lastLabelX = -Infinity;
const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40;

    customValues.forEach((value, index) => {

      const x = originX + ((value - actualMin) / range) * chartWidth;
      const labelText = value.toString();
      const labelWidth = ctx.measureText(labelText).width;
      const isLastCustom = index === customValues.length - 1;

      if (x - lastLabelX < minLabelSpacing && index > 0 && !isLastCustom) {

        return;
      }

      if (drawMarks) {
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();
      }

      if (drawLabels) {
        ctx.fillStyle = tickLabelColor;
        ctx.fillText(labelText, x, originY + 10);
      }

lastLabelX = x + labelWidth / 2;
    });
  } else {

    const range = maxValue - minValue;

    if (valueSpacing && valueSpacing > 0) {

      let currentX = originX;
      let currentValue = minValue;

      while (currentX <= axisEndX && currentValue <= maxValue) {

        if (drawMarks) {
          ctx.beginPath();
          ctx.moveTo(currentX, originY);
          ctx.lineTo(currentX, originY + 5);
          ctx.stroke();
        }

        if (drawLabels) {
          ctx.fillStyle = tickLabelColor;
          ctx.fillText(currentValue.toString(), currentX, originY + 10);
        }

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
        const isLastStepTick = value + step > maxValue + 1e-9;

        if (x - lastLabelX < minLabelSpacing && value > minValue && !isLastStepTick) {

          continue;
        }

        if (drawMarks) {
          ctx.beginPath();
          ctx.moveTo(x, originY);
          ctx.lineTo(x, originY + 5);
          ctx.stroke();
        }

        if (drawLabels) {
          ctx.fillStyle = tickLabelColor;
          ctx.fillText(labelText, x, originY + 10);
        }

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
  const inner =
    maxWidth != null && maxWidth > 0
      ? maxWidth - padding * 2 - boxSize - textSpacing
      : undefined;
  const effectiveMaxWidth =
    inner != null && inner > 0 ? inner : undefined;

  let maxEntryWidth = 0;
  const entryHeights: number[] = [];

  legend.forEach(entry => {
    const m = computeLegendRowMetrics(
      tempCtx,
      entry.label,
      effectiveMaxWidth,
      wrapTextEnabled,
      fontSize,
      boxSize
    );
    const entryWidth = boxSize + textSpacing + m.contentWidth;
    maxEntryWidth = Math.max(maxEntryWidth, entryWidth);
    entryHeights.push(m.rowHeight);
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
  const inner =
    maxWidth != null && maxWidth > 0
      ? maxWidth - padding * 2 - boxSize - textSpacing
      : undefined;
  const effectiveMaxWidth =
    inner != null && inner > 0 ? inner : undefined;

  const metricsList = legend.map((entry) =>
    computeLegendRowMetrics(ctx, entry.label, effectiveMaxWidth, wrapTextEnabled, fontSize, boxSize)
  );

  let maxEntryWidth = 0;
  for (const m of metricsList) {
    maxEntryWidth = Math.max(maxEntryWidth, boxSize + textSpacing + m.contentWidth);
  }
  const entryHeights = metricsList.map((m) => m.rowHeight);

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

    const lines = metricsList[index]!.lines;
    const lh = legendLineHeight(fontSize);
    if (lines.length > 1) {
      const startY = centerY - ((lines.length - 1) * lh) / 2;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        await renderEnhancedText(
          ctx,
          lines[lineIndex]!,
          textX,
          startY + lineIndex * lh,
          textStyle,
          fontSize,
          effectiveTextColor,
          textGradient
        );
      }
    } else {
      await renderEnhancedText(
        ctx,
        lines[0] ?? entry.label,
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
 * Draws x and y axes on a white background (no arrowheads; lines span padding bounds).
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
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();
  ctx.restore();

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

  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const axisColor = options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? '#000000';
  const axisWidth = options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;

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
const legendPlacement = normalizeLegendPosition(options.legend?.position);

  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;

  const minBarWidth = options.bars?.minWidth ?? 20;
  const groupSpacing = options.bars?.groupSpacing ?? 10;
  const lollipopLineWidth = options.bars?.lineWidth ?? 2;
  const lollipopDotSize = options.bars?.dotSize ?? 8;
  const globalBarOpacity = options.bars?.opacity;
  const globalBarShadow = options.bars?.shadow;
  const globalBarStroke = options.bars?.stroke;

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

  const baseWidth =
    options.dimensions?.width ??
    calculateResponsiveWidth({ min: xMin, max: xMax }, options, xAxisCustomValues);

  const padResolved = resolveOuterPadding(options.dimensions?.padding, baseWidth, height);
  const paddingTop = padResolved.top;
  const paddingRight = padResolved.right;
  const paddingBottom = padResolved.bottom;
  const paddingLeft = padResolved.left;

  const width = baseWidth;

  let legendWidth = 0;
  let legendHeight = 0;
const minLegendSpacing = 10;
  const legendSpacing = options.legend?.spacing ?? 20;
  if (showLegend && legend && legend.length > 0) {
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendDims = calculateLegendDimensions(legend, axisLabelFontSize, legendMaxWidth, legendWrapText, legendPadding);
    legendWidth = legendDims.width;
    legendHeight = legendDims.height;
  }

  const legendActive =
    !!(showLegend && legend && legend.length > 0 && legendWidth > 0 && legendHeight > 0);

  const vstack = computeChartVerticalStack({
    paddingTop,
    width,
    height,
    chartTitle,
    chartTitleFontSize,
    legendSpacing,
    showLegend: legendActive,
    legendPlacement,
    legendWidth,
    legendHeight,
    minLegendInsetFloor: minLegendSpacing,
  });

  const measCanvas = createCanvas(1, 1);
  const measureCtx = measCanvas.getContext('2d') as SKRSContext2D;
  const axisLabelHeight = reserveBelowBarChartValueBaseline(
    measureCtx,
    xAxisLabel,
    tickFontSize,
    axisLabelFontSize
  );

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = baseWidth - paddingRight;
  let chartAreaTop = vstack.chartAreaTopStart;
  let chartAreaBottom = height - paddingBottom;

  if (legendActive) {
    let additionalLeftInset = 0;
    if (legendConsumesLeftEdge(legendPlacement)) {
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
            const lw = tempCtx.measureText(label).width;
            actualYAxisLabelWidth = Math.max(actualYAxisLabelWidth, lw);
          });
        }

        actualYAxisLabelWidth += 30;
      }
      additionalLeftInset = actualYAxisLabelWidth;
    }

    const inset = applyLegendChartAreaInset(
      legendPlacement,
      {
        chartAreaLeft,
        chartAreaRight,
        chartAreaTop,
        chartAreaBottom,
      },
      legendWidth,
      legendHeight,
      vstack.legendInsetGap,
      additionalLeftInset
    );
    chartAreaLeft = inset.chartAreaLeft;
    chartAreaRight = inset.chartAreaRight;
    chartAreaTop = inset.chartAreaTop;
    chartAreaBottom = inset.chartAreaBottom;
  }

  const originY = chartAreaBottom - axisLabelHeight;
  /** Top canvas row for max Y tick (tick padding only). */
  const yTickHeadroom = Math.ceil(tickFontSize * 0.45 + 6);
  const xTickTailroom = Math.ceil(tickFontSize * 0.65 + 8);
  const axisEndY = chartAreaTop + yTickHeadroom;

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

  let yScaleMin = minValue;
  const yScaleMax = maxValue;
  const preliminaryChartAreaHeight = originY - axisEndY;
  const baselineSpanPre = yScaleMax - yScaleMin || 1;
  const baselineRef = baseline !== undefined ? baseline : 0;
  if (baselineRef > yScaleMin && preliminaryChartAreaHeight > 1e-6) {
    const belowBaselinePx = ((baselineRef - yScaleMin) / baselineSpanPre) * preliminaryChartAreaHeight;
    const reserveBelowBaselinePx =
      tickFontSize +
      22 +
      (xAxisLabel ? axisLabelFontSize + 16 : 0) +
      (showBarLabels && barLabelPosition === 'bottom' ? axisLabelFontSize + 10 : 0);
    if (belowBaselinePx < reserveBelowBaselinePx) {
      const gapPx = reserveBelowBaselinePx - belowBaselinePx;
      yScaleMin -= (gapPx / preliminaryChartAreaHeight) * baselineSpanPre;
    }
  }
  const ySpan = yScaleMax - yScaleMin || 1;

  let maxYTickLabelWidth = 0;
  if (measureCtx) {
    measureCtx.font = `${tickFontSize}px Arial`;
    const labels: string[] = [];
    if (yAxisCustomValues && yAxisCustomValues.length > 0) {
      for (const v of yAxisCustomValues) labels.push(v.toFixed(1));
    } else {
      const safeStep = Number.isFinite(yStep) && yStep > 0 ? yStep : 1;
      let guard = 0;
      for (let v = yScaleMin; v <= yScaleMax + 1e-9 && guard < 2000; v += safeStep) {
        labels.push(v.toFixed(1));
        guard++;
      }
    }
    for (const txt of labels) {
      maxYTickLabelWidth = Math.max(maxYTickLabelWidth, measureCtx.measureText(txt).width);
    }
  }

  let yAxisTitleReservePx = 0;
  if (yAxisLabel && measureCtx) {
    yAxisTitleReservePx = reserveHorizontalForRotatedYAxisTitle(
      measureCtx,
      yAxisLabel,
      axisLabelFontSize
    );
  }

  const TICK_LABEL_TO_AXIS_GAP = 10;
  const Y_AXIS_TITLE_TO_TICK_LABEL_GAP = 12;

  const originX =
    chartAreaLeft +
    yAxisTitleReservePx +
    (yAxisLabel ? Y_AXIS_TITLE_TO_TICK_LABEL_GAP : 0) +
    maxYTickLabelWidth +
    TICK_LABEL_TO_AXIS_GAP;

  const minPlotWidth = 80;
  let axisEndX = Math.max(originX + minPlotWidth, chartAreaRight - xTickTailroom);
  const plotRightNeeds = originX + minPlotWidth + xTickTailroom;
  let outputWidth = width;
  if (plotRightNeeds > chartAreaRight + 1e-6) {
    outputWidth = Math.ceil(width + (plotRightNeeds - chartAreaRight));
    chartAreaRight = outputWidth - paddingRight;
    axisEndX = Math.max(originX + minPlotWidth, chartAreaRight - xTickTailroom);
  }

  const canvas = createCanvas(outputWidth, height);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  await paintChartCanvasBackground(ctx, canvas, outputWidth, height, options.appearance);

  if (chartTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const titleY = paddingTop + vstack.titleTopInset;
    const titleX = outputWidth / 2;
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
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();
  ctx.restore();

  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;

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

  const xTickLabelColor = options.axes?.x?.color ?? axisLabelColor;

  drawYAxisTicks(ctx, originX, originY, axisEndY, yScaleMin, yScaleMax, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing);

  const chartAreaHeight = originY - axisEndY;

  const baselineY = originY - ((baseline - yScaleMin) / ySpan) * chartAreaHeight;

  const xAxisY = baselineY;
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(originX, xAxisY);
  ctx.lineTo(axisEndX, xAxisY);
  ctx.stroke();
  ctx.restore();

  const xStep = xAxisRange?.step ?? Math.ceil((xMax - xMin) / 10);

  drawXAxisTicks(ctx, originX, xAxisY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing, 'marks', xTickLabelColor);

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
      yScaleMin,
      yScaleMax,
      yStep,
      xAxisCustomValues,
      yAxisCustomValues,
      gridColor,
      gridWidth
    );
  }

  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.translate(chartAreaLeft + yAxisTitleReservePx / 2, (originY + axisEndY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
  }

  if (legendActive) {
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendTextColor = options.legend?.textColor;
    const legendBorderColor = options.legend?.borderColor;
    const legendBgColor = options.legend?.backgroundColor;
    const legendPadding = options.legend?.padding;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;

    let legendX: number, legendY: number;
    const chartAreaHeight = originY - axisEndY;

    switch (legendPlacement) {
      case 'top':
        legendX = (originX + axisEndX - legendWidth) / 2;
        legendY = vstack.chartAreaTopStart;
        break;
      case 'top-left':
        legendX = paddingLeft + minLegendSpacing;
        legendY = vstack.legendCornerTopY;
        break;
      case 'top-right':
        legendX = outputWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY = vstack.legendCornerTopY;
        break;
      case 'bottom':
        legendX = (originX + axisEndX - legendWidth) / 2;
        {
          const naturalBottomLegendY =
            height - paddingBottom - legendHeight - minLegendSpacing;
          const xTickLabelBottom = xAxisY + tickFontSize + 10;
          const xAxisTitleGap = Math.max(26, tickFontSize + 16);
          const xAxisTitleBottom = xAxisLabel
            ? xAxisY + xAxisTitleGap + axisLabelFontSize
            : xTickLabelBottom;
          const minLegendTop = xAxisTitleBottom + Math.max(8, minLegendSpacing);
          legendY = Math.max(naturalBottomLegendY, minLegendTop);
        }
        break;
      case 'bottom-left':
        legendX = paddingLeft + minLegendSpacing;
        {
          const naturalBottomLegendY =
            height - paddingBottom - legendHeight - minLegendSpacing;
          const xTickLabelBottom = xAxisY + tickFontSize + 10;
          const xAxisTitleGap = Math.max(26, tickFontSize + 16);
          const xAxisTitleBottom = xAxisLabel
            ? xAxisY + xAxisTitleGap + axisLabelFontSize
            : xTickLabelBottom;
          const minLegendTop = xAxisTitleBottom + Math.max(8, minLegendSpacing);
          legendY = Math.max(naturalBottomLegendY, minLegendTop);
        }
        break;
      case 'bottom-right':
        legendX = outputWidth - paddingRight - legendWidth - minLegendSpacing;
        {
          const naturalBottomLegendY =
            height - paddingBottom - legendHeight - minLegendSpacing;
          const xTickLabelBottom = xAxisY + tickFontSize + 10;
          const xAxisTitleGap = Math.max(26, tickFontSize + 16);
          const xAxisTitleBottom = xAxisLabel
            ? xAxisY + xAxisTitleGap + axisLabelFontSize
            : xTickLabelBottom;
          const minLegendTop = xAxisTitleBottom + Math.max(8, minLegendSpacing);
          legendY = Math.max(naturalBottomLegendY, minLegendTop);
        }
        break;
      case 'left':
        legendX = paddingLeft + minLegendSpacing;
        legendY = axisEndY + (chartAreaHeight - legendHeight) / 2;
        break;
      case 'left-top':
        legendX = paddingLeft + minLegendSpacing;
        legendY = axisEndY + minLegendSpacing;
        break;
      case 'left-bottom':
        legendX = paddingLeft + minLegendSpacing;
        legendY = originY - legendHeight - minLegendSpacing;
        break;
      case 'right-top':
        legendX = outputWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY = axisEndY + minLegendSpacing;
        break;
      case 'right-bottom':
        legendX = outputWidth - paddingRight - legendWidth - minLegendSpacing;
        legendY = originY - legendHeight - minLegendSpacing;
        break;
      case 'right':
      default:
        legendX = outputWidth - paddingRight - legendWidth - minLegendSpacing;
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

  data.forEach((item) => {

    let barXStart: number, barXEnd: number;

    if (xAxisCustomValues && xAxisCustomValues.length > 0) {

      const actualMin = Math.min(...xAxisCustomValues);
      const actualMax = Math.max(...xAxisCustomValues);
      const xRange = actualMax - actualMin || 1;
      barXStart = originX + ((item.xStart - actualMin) / xRange) * chartAreaWidth;
      barXEnd = originX + ((item.xEnd - actualMin) / xRange) * chartAreaWidth;
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

            const positiveRatio = (segment.value - baseline) / ySpan;
            barHeight = positiveRatio * chartAreaHeight;
            barY = baselineY - barHeight;
          } else {

            const negativeRatio = (baseline - segment.value) / ySpan;
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
              text: segmentValueDisplayText(segment),
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

        const cumulativeBaselineY = originY - ((cumulativeValue - yScaleMin) / ySpan) * chartAreaHeight;

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
          const positiveRatio = segment.value / ySpan;
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
                text: segmentValueDisplayText(segment),
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
          const negativeRatio = Math.abs(segment.value) / ySpan;
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
                text: segmentValueDisplayText(segment),
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
          const positiveRatio = (segment.value - baseline) / ySpan;
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
              text: segmentValueDisplayText(segment),
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
          const negativeRatio = (baseline - segment.value) / ySpan;
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
              text: segmentValueDisplayText(segment),
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

        const positiveRatio = (value - baseline) / ySpan;
        valueY = baselineY - positiveRatio * chartAreaHeight;
      } else {

        const negativeRatio = (baseline - value) / ySpan;
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

        const positiveRatio = (value - baseline) / ySpan;
        barHeight = positiveRatio * chartAreaHeight;
        barY = baselineY - barHeight;
      } else {

        const negativeRatio = (baseline - value) / ySpan;
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
          const totalHeight = ((totalValue - yScaleMin) / ySpan) * chartAreaHeight;
          barCenterY = originY - totalHeight / 2;
        } else {

          const maxSegValue = Math.max(...item.values.map(seg => seg.value));
          const maxHeight = ((maxSegValue - yScaleMin) / ySpan) * chartAreaHeight;
          barCenterY = originY - maxHeight / 2;
        }
      } else {

        const value = item.value ?? 0;
        const barHeight = ((value - yScaleMin) / ySpan) * chartAreaHeight;
        barCenterY = originY - barHeight / 2;
      }

      const currentLabelPosition = item.labelPosition ?? barLabelPosition;

      let topBarY: number;
      if ((chartType === 'grouped' || chartType === 'stacked') && item.values && item.values.length > 0) {
        if (chartType === 'stacked') {
          const totalValue = item.values.reduce((sum, seg) => sum + seg.value, 0);
          const totalHeight = ((totalValue - yScaleMin) / ySpan) * chartAreaHeight;
          topBarY = originY - totalHeight;
        } else {
          const maxSegValue = Math.max(...item.values.map(seg => seg.value));
          const maxHeight = ((maxSegValue - yScaleMin) / ySpan) * chartAreaHeight;
          topBarY = originY - maxHeight;
        }
      } else {
        const value = item.value ?? 0;
        const barHeight = ((value - yScaleMin) / ySpan) * chartAreaHeight;
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

  // Re-stroke main axes above bars so bars can touch zero-lines without visually covering them.
  ctx.save();
  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(originX, xAxisY);
  ctx.lineTo(axisEndX, xAxisY);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = axisColor;
  drawXAxisTicks(ctx, originX, xAxisY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing, 'labels', xTickLabelColor);

  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const xAxisTitleGap = Math.max(26, tickFontSize + 16);
    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, xAxisY + xAxisTitleGap);
    ctx.restore();
  }

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

