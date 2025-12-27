import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";

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
 * Line style types
 */
export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'longdash' | 'shortdash' | 'dashdotdot' | 'step' | 'stepline';

/**
 * Marker/plot types for data points
 */
export type MarkerType = 'circle' | 'square' | 'triangle' | 'diamond' | 'cross' | 'none';

/**
 * Line smoothness type
 */
export type SmoothnessType = 'none' | 'bezier' | 'spline';

/**
 * Correlation/Regression line type
 */
export type CorrelationType = 'none' | 'linear' | 'polynomial' | 'exponential' | 'logarithmic';

/**
 * Error bar configuration
 */
export interface ErrorBarConfig {
positive?: number;
negative?: number;
color?: string;
width?: number;
capSize?: number;
show?: boolean;
}

/**
 * Interface for a single data point in a line chart
 */
export interface LineDataPoint {
x: number;
y: number;
label?: string;
markerColor?: string;
showMarker?: boolean;
errorBar?: ErrorBarConfig;
}

/**
 * Area shading configuration
 */
export interface AreaConfig {
type?: 'none' | 'below' | 'above' | 'between' | 'around';
color?: string;
opacity?: number;
secondLine?: LineSeries;
upperBound?: number[];
lowerBound?: number[];
show?: boolean;
toValue?: number;
showAreaSize?: boolean;
areaSizeColor?: string;
}

/**
 * Interface for a single line/series in the chart
 */
export interface LineSeries {
label: string;
data: LineDataPoint[];
color?: string;
gradient?: gradient;
lineWidth?: number;
lineStyle?: LineStyle;
smoothness?: SmoothnessType;
showLine?: boolean;
  errorBar?: {
show?: boolean;
color?: string;
width?: number;
capSize?: number;
  };
area?: AreaConfig;
  correlation?: {
type?: CorrelationType;
degree?: number;
color?: string;
lineWidth?: number;
lineStyle?: LineStyle;
show?: boolean;
  };
  marker?: {
type?: MarkerType;
size?: number;
color?: string;
show?: boolean;
filled?: boolean;
  };
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
baseline?: number;
scale?: 'linear' | 'log';
dateFormat?: string;
dateTime?: boolean;
}

/**
 * Line chart configuration - organized by category
 */
export interface LineChartOptions {

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
    y?: AxisConfig;
  };

  labels?: {
    title?: {
      text?: string;
fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
    pointLabelDefaults?: {
show?: boolean;
fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
position?: 'top' | 'bottom' | 'left' | 'right';
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
 * Formats a date/timestamp value according to the format string
 */
function formatDate(value: number, format: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace(/YYYY/g, String(year))
    .replace(/MM/g, month)
    .replace(/DD/g, day)
    .replace(/HH/g, hours)
    .replace(/mm/g, minutes)
    .replace(/ss/g, seconds);
}

/**
 * Converts a linear value to logarithmic scale position
 */
function logScale(value: number, min: number, max: number): number {
  if (value <= 0) return 0;
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logValue = Math.log10(value);
  return (logValue - logMin) / (logMax - logMin);
}

/**
 * Converts a logarithmic scale position back to linear value
 */
function logScaleInverse(position: number, min: number, max: number): number {
  const logMin = Math.log10(min);
  const logMax = Math.log10(max);
  const logValue = logMin + position * (logMax - logMin);
  return Math.pow(10, logValue);
}

/**
 * Helper function to draw an arrow
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
  valueSpacing?: number,
  scale: 'linear' | 'log' = 'linear',
  dateFormat?: string,
  isDateTime: boolean = false
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

      let labelText: string;
      if (isDateTime && dateFormat) {
        labelText = formatDate(value, dateFormat);
      } else {
        labelText = value.toFixed(1);
      }
      ctx.fillText(labelText, originX - 10, y);
      lastLabelY = y;
    });
  } else {
    let lastLabelY = Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : (tickFontSize + 5);

    if (scale === 'log' && minValue > 0 && maxValue > 0) {

      const logMin = Math.floor(Math.log10(minValue));
      const logMax = Math.ceil(Math.log10(maxValue));

      for (let power = logMin; power <= logMax; power++) {
        const value = Math.pow(10, power);
        if (value < minValue || value > maxValue) continue;

        const logPos = logScale(value, minValue, maxValue);
        const y = originY - logPos * chartHeight;

        if (lastLabelY - y < minLabelSpacing && power !== logMin) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();

        let labelText: string;
        if (isDateTime && dateFormat) {
          labelText = formatDate(value, dateFormat);
        } else {
          labelText = value.toFixed(1);
        }
        ctx.fillText(labelText, originX - 10, y);
        lastLabelY = y;
      }
    } else {

      const range = maxValue - minValue;
      for (let value = minValue; value <= maxValue; value += step) {
        const y = originY - ((value - minValue) / range) * chartHeight;

        if (lastLabelY - y < minLabelSpacing && value !== minValue) {
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();

        let labelText: string;
        if (isDateTime && dateFormat) {
          labelText = formatDate(value, dateFormat);
        } else {
          labelText = value.toFixed(1);
        }
        ctx.fillText(labelText, originX - 10, y);
        lastLabelY = y;
      }
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
  valueSpacing?: number,
  scale: 'linear' | 'log' = 'linear',
  dateFormat?: string,
  isDateTime: boolean = false
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

          let labelText: string;
          if (isDateTime && dateFormat) {
            labelText = formatDate(value, dateFormat);
          } else {
            labelText = value.toString();
          }
          ctx.fillText(labelText, currentX, originY + 10);
        }
      });
    } else {
      const numValues = customValues.length;
      let lastLabelX = -Infinity;
      const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40;

      customValues.forEach((value, index) => {
        const x = originX + (index / (numValues - 1)) * chartWidth;

        if (x - lastLabelX < minLabelSpacing && index > 0) {
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

        let labelText: string;
        if (isDateTime && dateFormat) {
          labelText = formatDate(value, dateFormat);
        } else {
          labelText = value.toString();
        }
        ctx.fillText(labelText, x, originY + 10);
        lastLabelX = x;
      });
    }
  } else {
    const range = maxValue - minValue;
    let lastLabelX = -Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40;

    for (let value = minValue; value <= maxValue; value += step) {
      const x = originX + ((value - minValue) / range) * chartWidth;

      if (x - lastLabelX < minLabelSpacing && value !== minValue) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(x, originY);
      ctx.lineTo(x, originY + 5);
      ctx.stroke();

      let labelText: string;
      if (isDateTime && dateFormat) {
        labelText = formatDate(value, dateFormat);
      } else {
        labelText = value.toFixed(1);
      }
      ctx.fillText(labelText, x, originY + 10);
      lastLabelX = x;
    }
  }

  ctx.restore();
}

/**
 * Draws grid lines
 */
function drawGrid(
  ctx: SKRSContext2D,
  originX: number,
  originY: number,
  axisEndX: number,
  axisEndY: number,
  minValue: number,
  maxValue: number,
  step: number,
  gridColor: string,
  gridWidth: number,
  isVertical: boolean,
  customValues?: number[]
): void {
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = gridWidth;
  ctx.setLineDash([5, 5]);

  if (isVertical) {

    if (customValues && customValues.length > 0) {
      const chartWidth = axisEndX - originX;
      const numValues = customValues.length;
      customValues.forEach((value, index) => {
        const x = originX + (index / (numValues - 1)) * chartWidth;
        ctx.beginPath();
        ctx.moveTo(x, axisEndY);
        ctx.lineTo(x, originY);
        ctx.stroke();
      });
    } else {
      const range = maxValue - minValue;
      for (let value = minValue; value <= maxValue; value += step) {
        const x = originX + ((value - minValue) / range) * (axisEndX - originX);
        ctx.beginPath();
        ctx.moveTo(x, axisEndY);
        ctx.lineTo(x, originY);
        ctx.stroke();
      }
    }
  } else {

    if (customValues && customValues.length > 0) {
      const chartHeight = originY - axisEndY;
      const actualMin = Math.min(...customValues);
      const actualMax = Math.max(...customValues);
      const range = actualMax - actualMin;
      customValues.forEach((value) => {
        const y = originY - ((value - actualMin) / range) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(axisEndX, y);
        ctx.stroke();
      });
    } else {
      const range = maxValue - minValue;
      const chartHeight = originY - axisEndY;
      for (let value = minValue; value <= maxValue; value += step) {
        const y = originY - ((value - minValue) / range) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(axisEndX, y);
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

/**
 * Draws an error bar at a point
 */
function drawErrorBar(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  positive: number,
  negative: number,
  color: string,
  width: number,
  capSize: number,
  chartAreaHeight: number,
  yMin: number,
  yMax: number
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;

  const positivePixels = (positive / (yMax - yMin)) * chartAreaHeight;
  const negativePixels = (negative / (yMax - yMin)) * chartAreaHeight;

  const topY = y - positivePixels;
  const bottomY = y + negativePixels;

  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.lineTo(x, bottomY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - capSize / 2, topY);
  ctx.lineTo(x + capSize / 2, topY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - capSize / 2, bottomY);
  ctx.lineTo(x + capSize / 2, bottomY);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a marker at a point
 */
function drawMarker(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  type: MarkerType,
  size: number,
  color: string,
  filled: boolean = true
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  switch (type) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      if (filled) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
      break;
    case 'square':
      if (filled) {
        ctx.fillRect(x - size / 2, y - size / 2, size, size);
      } else {
        ctx.strokeRect(x - size / 2, y - size / 2, size, size);
      }
      break;
    case 'triangle':
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.closePath();
      if (filled) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
      break;
    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(x, y - size / 2);
      ctx.lineTo(x + size / 2, y);
      ctx.lineTo(x, y + size / 2);
      ctx.lineTo(x - size / 2, y);
      ctx.closePath();
      if (filled) {
        ctx.fill();
      } else {
        ctx.stroke();
      }
      break;
    case 'cross':

      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - size / 2, y - size / 2);
      ctx.lineTo(x + size / 2, y + size / 2);
      ctx.moveTo(x + size / 2, y - size / 2);
      ctx.lineTo(x - size / 2, y + size / 2);
      ctx.stroke();
      break;
    case 'none':

      break;
  }

  ctx.restore();
}

/**
 * Applies line style to context
 */
function applyLineStyle(ctx: SKRSContext2D, style: LineStyle): void {
  switch (style) {
    case 'solid':
      ctx.setLineDash([]);
      break;
    case 'dashed':
      ctx.setLineDash([10, 5]);
      break;
    case 'dotted':
      ctx.setLineDash([2, 5]);
      break;
    case 'dashdot':
      ctx.setLineDash([10, 5, 2, 5]);
      break;
  }
}

/**
 * Calculates Bezier control points for smooth curve
 */
function calculateBezierControlPoints(
  points: { x: number; y: number }[],
  tension: number = 0.5
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number }[] {
  const controlPoints: { cp1x: number; cp1y: number; cp2x: number; cp2y: number }[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    controlPoints.push({ cp1x, cp1y, cp2x, cp2y });
  }

  return controlPoints;
}

/**
 * Calculates cubic spline interpolation points
 * Uses natural cubic spline interpolation
 */
function calculateSplinePoints(
  points: { x: number; y: number }[]
): { x: number; y: number }[] {
  if (points.length < 2) return points;
  if (points.length === 2) {

    return points;
  }

  const n = points.length;
  const h: number[] = [];
  const alpha: number[] = [];
  const l: number[] = [];
  const mu: number[] = [];
  const z: number[] = [];
  const c: number[] = [];
  const b: number[] = [];
  const d: number[] = [];

  for (let i = 0; i < n - 1; i++) {
    h.push(points[i + 1].x - points[i].x);
  }

  alpha[0] = 0;
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (points[i + 1].y - points[i].y) - (3 / h[i - 1]) * (points[i].y - points[i - 1].y);
  }
  alpha[n - 1] = 0;

  l[0] = 1;
  mu[0] = 0;
  z[0] = 0;

  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (points[i + 1].x - points[i - 1].x) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  l[n - 1] = 1;
  z[n - 1] = 0;
  c[n - 1] = 0;

  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (points[j + 1].y - points[j].y) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  const splinePoints: { x: number; y: number }[] = [];
const numPointsPerSegment = 20;

  for (let i = 0; i < n - 1; i++) {
    const x0 = points[i].x;
    const y0 = points[i].y;
    const a = y0;
    const b_coeff = b[i];
    const c_coeff = c[i];
    const d_coeff = d[i];

    for (let j = 0; j <= numPointsPerSegment; j++) {
      const t = j / numPointsPerSegment;
      const x = x0 + t * h[i];
      const dx = x - x0;
      const y = a + b_coeff * dx + c_coeff * dx * dx + d_coeff * dx * dx * dx;
      splinePoints.push({ x, y });
    }
  }

  return splinePoints;
}

/**
 * Calculates linear regression (y = mx + b)
 */
function calculateLinearRegression(points: { x: number; y: number }[]): { m: number; b: number } {
  const n = points.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;

  points.forEach(p => {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  });

  const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const b = (sumY - m * sumX) / n;

  return { m, b };
}

/**
 * Calculates polynomial regression (y = a0 + a1*x + a2*x^2 + ... + an*x^n)
 */
function calculatePolynomialRegression(
  points: { x: number; y: number }[],
  degree: number = 2
): number[] {
  const n = points.length;
  const m = degree + 1;

  const X: number[][] = points.map(p => {
    const row: number[] = [];
    for (let i = 0; i <= degree; i++) {
      row.push(Math.pow(p.x, i));
    }
    return row;
  });

  const XTX: number[][] = [];
  for (let i = 0; i <= degree; i++) {
    XTX[i] = [];
    for (let j = 0; j <= degree; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += X[k][i] * X[k][j];
      }
      XTX[i][j] = sum;
    }
  }

  const XTy: number[] = [];
  for (let i = 0; i <= degree; i++) {
    let sum = 0;
    for (let k = 0; k < n; k++) {
      sum += X[k][i] * points[k].y;
    }
    XTy[i] = sum;
  }

  const coefficients: number[] = new Array(m).fill(0);

  for (let i = 0; i <= degree; i++) {

    let maxRow = i;
    for (let k = i + 1; k <= degree; k++) {
      if (Math.abs(XTX[k][i]) > Math.abs(XTX[maxRow][i])) {
        maxRow = k;
      }
    }

    [XTX[i], XTX[maxRow]] = [XTX[maxRow], XTX[i]];
    [XTy[i], XTy[maxRow]] = [XTy[maxRow], XTy[i]];

    for (let k = i + 1; k <= degree; k++) {
      const factor = XTX[k][i] / XTX[i][i];
      for (let j = i; j <= degree; j++) {
        XTX[k][j] -= factor * XTX[i][j];
      }
      XTy[k] -= factor * XTy[i];
    }
  }

  for (let i = degree; i >= 0; i--) {
    coefficients[i] = XTy[i];
    for (let j = i + 1; j <= degree; j++) {
      coefficients[i] -= XTX[i][j] * coefficients[j];
    }
    coefficients[i] /= XTX[i][i];
  }

  return coefficients;
}

/**
 * Calculates exponential regression (y = a * e^(b*x))
 */
function calculateExponentialRegression(points: { x: number; y: number }[]): { a: number; b: number } {

  const transformedPoints = points
    .filter(p => p.y > 0)
    .map(p => ({ x: p.x, y: Math.log(p.y) }));

  if (transformedPoints.length < 2) {
    return { a: 1, b: 0 };
  }

  const linear = calculateLinearRegression(transformedPoints);
  return { a: Math.exp(linear.b), b: linear.m };
}

/**
 * Calculates logarithmic regression (y = a + b*ln(x))
 */
function calculateLogarithmicRegression(points: { x: number; y: number }[]): { a: number; b: number } {

  const transformedPoints = points
    .filter(p => p.x > 0)
    .map(p => ({ x: Math.log(p.x), y: p.y }));

  if (transformedPoints.length < 2) {
    return { a: 0, b: 0 };
  }

  const linear = calculateLinearRegression(transformedPoints);
  return { a: linear.b, b: linear.m };
}

/**
 * Generates correlation line points based on regression type
 */
function generateCorrelationPoints(
  points: { x: number; y: number }[],
  correlationType: CorrelationType,
  xMin: number,
  xMax: number,
  degree?: number
): { x: number; y: number }[] {
  if (correlationType === 'none' || points.length < 2) {
    return [];
  }

const numPoints = 100;
  const correlationPoints: { x: number; y: number }[] = [];

  switch (correlationType) {
    case 'linear': {
      const { m, b } = calculateLinearRegression(points);
      for (let i = 0; i <= numPoints; i++) {
        const x = xMin + (i / numPoints) * (xMax - xMin);
        const y = m * x + b;
        correlationPoints.push({ x, y });
      }
      break;
    }

    case 'polynomial': {
      const polyDegree = degree ?? 2;
      const coefficients = calculatePolynomialRegression(points, polyDegree);
      for (let i = 0; i <= numPoints; i++) {
        const x = xMin + (i / numPoints) * (xMax - xMin);
        let y = 0;
        for (let j = 0; j < coefficients.length; j++) {
          y += coefficients[j] * Math.pow(x, j);
        }
        correlationPoints.push({ x, y });
      }
      break;
    }

    case 'exponential': {
      const { a, b } = calculateExponentialRegression(points);
      for (let i = 0; i <= numPoints; i++) {
        const x = xMin + (i / numPoints) * (xMax - xMin);
        const y = a * Math.exp(b * x);
        correlationPoints.push({ x, y });
      }
      break;
    }

    case 'logarithmic': {
      const { a, b } = calculateLogarithmicRegression(points);
      for (let i = 0; i <= numPoints; i++) {
        const x = xMin + (i / numPoints) * (xMax - xMin);
        if (x > 0) {
          const y = a + b * Math.log(x);
          correlationPoints.push({ x, y });
        }
      }
      break;
    }
  }

  return correlationPoints;
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
 * Calculates legend dimensions
 */
function calculateLegendDimensions(
  entries: LegendEntry[],
  spacing: number,
  fontSize: number = 12,
  maxWidth?: number,
  wrapTextEnabled: boolean = true,
  padding?: number
): { width: number; height: number } {
  if (!entries || entries.length === 0) {
    return { width: 0, height: 0 };
  }

  const boxSize = 15;
  const entrySpacing = spacing || 15;
  const paddingBox = padding ?? 8;

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px Arial`;

  const textSpacing = 10;
  const effectiveMaxWidth = maxWidth ? maxWidth - paddingBox * 2 - boxSize - textSpacing : undefined;

  let maxEntryWidth = 0;
  const entryHeights: number[] = [];

  entries.forEach(entry => {
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

  const width = maxWidth ? maxWidth : Math.max(200, maxEntryWidth + paddingBox * 2);
  const height = entryHeights.reduce((sum, h, i) => sum + h + (i < entryHeights.length - 1 ? entrySpacing : 0), 0) + paddingBox * 2;

  return { width, height };
}

/**
 * Draws legend
 */
async function drawLegend(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  entries: LegendEntry[],
  spacing: number,
  fontSize: number = 12,
  backgroundColor?: string,
  borderColor?: string,
  textColor?: string,
  padding?: number,
  maxWidth?: number,
  wrapTextEnabled: boolean = true,
  backgroundGradient?: gradient,
  textGradient?: gradient,
  textStyle?: EnhancedTextStyle
): Promise<void> {
  if (!entries || entries.length === 0) return;

  ctx.save();

  const boxSize = 15;
  const entrySpacing = spacing || 15;
  const textSpacing = 10;
  const paddingBox = padding ?? 8;

  ctx.font = `${fontSize}px Arial`;

  const effectiveMaxWidth = maxWidth ? maxWidth - paddingBox * 2 - boxSize - textSpacing : undefined;

  const entryHeights: number[] = [];
  entries.forEach(entry => {
    if (wrapTextEnabled && effectiveMaxWidth) {
      const wrappedLines = wrapText(ctx, entry.label, effectiveMaxWidth);
      const textHeight = wrappedLines.length * fontSize * 1.2;
      entryHeights.push(Math.max(boxSize, textHeight));
    } else {
      entryHeights.push(boxSize);
    }
  });

  const legendHeight = entryHeights.reduce((sum, h, i) => sum + h + (i < entryHeights.length - 1 ? entrySpacing : 0), 0) + paddingBox * 2;
  let legendWidth = 200;

  if (maxWidth) {
    legendWidth = maxWidth;
  } else {
    let maxEntryWidth = 0;
    entries.forEach((entry, index) => {
      if (wrapTextEnabled && effectiveMaxWidth) {
        const wrappedLines = wrapText(ctx, entry.label, effectiveMaxWidth);
        const textWidth = Math.max(...wrappedLines.map(line => ctx.measureText(line).width));
        maxEntryWidth = Math.max(maxEntryWidth, boxSize + textSpacing + textWidth);
      } else {
        const textWidth = ctx.measureText(entry.label).width;
        maxEntryWidth = Math.max(maxEntryWidth, boxSize + textSpacing + textWidth);
      }
    });
    legendWidth = Math.max(200, maxEntryWidth + paddingBox * 2);
  }

  if (backgroundColor || backgroundGradient) {
    ctx.beginPath();
    ctx.rect(x, y, legendWidth, legendHeight);
    fillWithGradientOrColor(
      ctx,
      backgroundGradient,
      backgroundColor,
      backgroundColor || 'rgba(255, 255, 255, 0.9)',
      { x, y, w: legendWidth, h: legendHeight }
    );
    ctx.fill();

    if (borderColor) {
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, legendWidth, legendHeight);
    }
  }

  const effectiveTextColor = textColor ?? '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  let currentY = y + paddingBox;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const entryHeight = entryHeights[index];
    const centerY = currentY + entryHeight / 2;

    ctx.beginPath();
    ctx.rect(x + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    fillWithGradientOrColor(
      ctx,
      entry.gradient,
      entry.color || '#4A90E2',
      '#4A90E2',
      { x: x + paddingBox, y: centerY - boxSize / 2, w: boxSize, h: boxSize }
    );
    ctx.fill();

    const textX = x + paddingBox + boxSize + textSpacing;

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

    currentY += entryHeight + entrySpacing;
  }

  ctx.restore();
}

/**
 * Creates a line chart with multiple series support
 */
export async function createLineChart(
  series: LineSeries[],
  options: LineChartOptions = {}
): Promise<Buffer> {

  const width = options.dimensions?.width ?? 800;
  const height = options.dimensions?.height ?? 600;
  const padding = options.dimensions?.padding || {};
  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 100;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 100;

  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const backgroundGradient = options.appearance?.backgroundGradient;
  const backgroundImage = options.appearance?.backgroundImage;
  const axisColor = options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? '#000000';
  const axisWidth = options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;
  const arrowSize = options.appearance?.arrowSize ?? 10;

  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const chartTitleColor = options.labels?.title?.color ?? '#000000';

  const showPointLabels = options.labels?.pointLabelDefaults?.show ?? false;
  const pointLabelFontSize = options.labels?.pointLabelDefaults?.fontSize ?? 12;
  const pointLabelColor = options.labels?.pointLabelDefaults?.color ?? '#000000';
  const pointLabelPosition = options.labels?.pointLabelDefaults?.position ?? 'top';

  const showLegend = options.legend?.show ?? false;
  const legendSpacing = options.legend?.spacing ?? 20;
  const legendEntries = options.legend?.entries;
const legendPosition = options.legend?.position ?? 'right';

  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;

  const xAxisConfig = options.axes?.x || {};
  const yAxisConfig = options.axes?.y || {};
  const xAxisLabel = xAxisConfig.label;
  const yAxisLabel = yAxisConfig.label;
  const xAxisLabelColor = xAxisConfig.labelColor ?? '#000000';
  const yAxisLabelColor = yAxisConfig.labelColor ?? '#000000';
  const xAxisRange = xAxisConfig.range;
  const yAxisRange = yAxisConfig.range;
  const xAxisCustomValues = xAxisConfig.values;
  const yAxisCustomValues = yAxisConfig.values;
  const xAxisValueSpacing = xAxisConfig.valueSpacing;
  const yAxisValueSpacing = yAxisConfig.valueSpacing;
  const tickFontSize = xAxisConfig.tickFontSize ?? yAxisConfig.tickFontSize ?? 12;
  const baseline = yAxisConfig.baseline;
  const xAxisScale = xAxisConfig.scale ?? 'linear';
  const yAxisScale = yAxisConfig.scale ?? 'linear';
  const xAxisDateFormat = xAxisConfig.dateFormat;
  const yAxisDateFormat = yAxisConfig.dateFormat;
  const xAxisDateTime = xAxisConfig.dateTime ?? false;
  const yAxisDateTime = yAxisConfig.dateTime ?? false;

  const allXValues: number[] = [];
  const allYValues: number[] = [];

  series.forEach(serie => {
    serie.data.forEach(point => {
      allXValues.push(point.x);
      allYValues.push(point.y);
    });
  });

  let xMin: number, xMax: number, xStep: number;
  if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
    xStep = 1;
  } else if (xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined) {
    xMin = xAxisRange.min;
    xMax = xAxisRange.max;
    xStep = xAxisRange.step ?? Math.ceil((xMax - xMin) / 10);
  } else {
    if (allXValues.length > 0) {
      xMin = Math.min(...allXValues);
      xMax = Math.max(...allXValues);
      const range = xMax - xMin;
      const padding = range * 0.1;
      xMin = xMin - padding;
      xMax = xMax + padding;
    } else {
      xMin = 0;
      xMax = 100;
    }
    xStep = Math.ceil((xMax - xMin) / 10);
  }

  let yMin: number, yMax: number, yStep: number;
  const hasExplicitYRange = yAxisRange && yAxisRange.min !== undefined && yAxisRange.max !== undefined;

  if (yAxisCustomValues && yAxisCustomValues.length > 0) {
    yMin = Math.min(...yAxisCustomValues);
    yMax = Math.max(...yAxisCustomValues);
    yStep = 1;
  } else if (hasExplicitYRange) {
    yMin = yAxisRange!.min!;
    yMax = yAxisRange!.max!;
    yStep = yAxisRange!.step ?? Math.ceil((yMax - yMin) / 10);

    if (baseline !== undefined) {
      yMin = Math.min(yMin, baseline);
      yMax = Math.max(yMax, baseline);
    }
  } else {
    if (allYValues.length > 0) {
      yMin = Math.min(...allYValues);
      yMax = Math.max(...allYValues);
      const effectiveBaseline = baseline !== undefined ? baseline : 0;
      yMin = Math.min(yMin, effectiveBaseline);
      yMax = Math.max(yMax, effectiveBaseline);
      const range = yMax - yMin;
      const padding = range * 0.1;
      yMin = Math.max(yMin - padding, Math.min(effectiveBaseline, yMin));
      yMax = yMax + padding;
    } else {
      yMin = 0;
      yMax = 100;
    }
    yStep = Math.ceil((yMax - yMin) / 10);
  }

  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;

  if (hasExplicitXRange || xAxisCustomValues) {
    const effectiveXMin = xAxisCustomValues ? Math.min(...xAxisCustomValues) : xAxisRange!.min!;
    const effectiveXMax = xAxisCustomValues ? Math.max(...xAxisCustomValues) : xAxisRange!.max!;

    series.forEach((serie, seriesIndex) => {
      serie.data.forEach((point, pointIndex) => {
        if (point.x < effectiveXMin || point.x > effectiveXMax) {
          throw new Error(
            `Line Chart Error: Data value out of X-axis bounds.\n` +
            `Series "${serie.label}" point ${pointIndex} has X value ${point.x}, ` +
            `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
          );
        }
      });
    });
  }

  if (hasExplicitYRange || yAxisCustomValues) {
    const effectiveYMin = yAxisCustomValues ? Math.min(...yAxisCustomValues) : yMin;
    const effectiveYMax = yAxisCustomValues ? Math.max(...yAxisCustomValues) : yMax;

    series.forEach((serie, seriesIndex) => {
      serie.data.forEach((point, pointIndex) => {
        if (point.y < effectiveYMin || point.y > effectiveYMax) {
          throw new Error(
            `Line Chart Error: Data value out of Y-axis bounds.\n` +
            `Series "${serie.label}" point ${pointIndex} has Y value ${point.y}, ` +
            `which exceeds the Y-axis range [${effectiveYMin}, ${effectiveYMax}].`
          );
        }
      });
    });
  }

  let legendWidth = 0;
  let legendHeight = 0;
  let extraWidth = 0;
  let extraHeight = 0;
  const minLegendSpacing = 10;

  if (showLegend) {
    const entries = legendEntries || series.map(s => ({
      color: s.color || '#4A90E2',
      label: s.label
    }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendDims = calculateLegendDimensions(entries, legendSpacing, legendFontSize, legendMaxWidth, legendWrapText, legendPadding);
    legendWidth = legendDims.width;
    legendHeight = legendDims.height;

    if (legendPosition === 'left' || legendPosition === 'right') {
      extraWidth = legendWidth + minLegendSpacing;
    } else if (legendPosition === 'top' || legendPosition === 'bottom') {
      extraHeight = legendHeight + minLegendSpacing;
    }
  }

  const adjustedWidth = width + extraWidth;
  const adjustedHeight = height + extraHeight;

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

  const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0;
  const axisLabelHeight = (xAxisLabel || yAxisLabel) ? tickFontSize + 40 : 0;

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = width - paddingRight;
  let chartAreaTop = paddingTop + titleHeight;
  let chartAreaBottom = height - paddingBottom;

  if (showLegend) {
    if (legendPosition === 'left') {
      chartAreaLeft = paddingLeft + legendWidth + minLegendSpacing;
      chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'right') {
      chartAreaLeft = paddingLeft;
      chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'top') {
      chartAreaTop = paddingTop + titleHeight + legendHeight + minLegendSpacing;
      chartAreaBottom = height - paddingBottom;
    } else if (legendPosition === 'bottom') {
      chartAreaTop = paddingTop + titleHeight;
      chartAreaBottom = height - paddingBottom;
    }
  }

  const originX = chartAreaLeft;
  const originY = chartAreaBottom - axisLabelHeight;
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
      chartTitleColor,
      options.labels?.title?.gradient
    );
    ctx.restore();
  }

  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';

  const chartAreaHeight = originY - axisEndY;
  const effectiveBaseline = baseline !== undefined ? baseline : 0;
  const baselineY = originY - ((effectiveBaseline - yMin) / (yMax - yMin)) * chartAreaHeight;

  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

  drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize);

  ctx.beginPath();
  ctx.moveTo(originX, baselineY);
  ctx.lineTo(axisEndX, baselineY);
  ctx.stroke();

  drawArrow(ctx, axisEndX, baselineY, 0, arrowSize);

  drawYAxisTicks(ctx, originX, originY, axisEndY, yMin, yMax, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing, yAxisScale, yAxisDateFormat, yAxisDateTime);

  drawXAxisTicks(ctx, originX, originY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing, xAxisScale, xAxisDateFormat, xAxisDateTime);

  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = xAxisLabelColor;
    ctx.font = `${tickFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, originY + 25);
    ctx.restore();
  }

  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = yAxisLabelColor;
    ctx.font = `${tickFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.save();
    ctx.translate(paddingLeft / 2, (originY + axisEndY) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  if (showGrid) {
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, xMin, xMax, xStep, gridColor, gridWidth, true, xAxisCustomValues);
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, yMin, yMax, yStep, gridColor, gridWidth, false, yAxisCustomValues);
  }

  const chartAreaWidth = axisEndX - originX;
  const chartAreaHeightForPoints = originY - axisEndY;

  series.forEach(serie => {
    const lineColor = serie.color || '#4A90E2';
    const lineWidth = serie.lineWidth ?? 2;
    const lineStyle = serie.lineStyle || 'solid';
    const smoothness = serie.smoothness || 'none';

    const hasCorrelation = serie.correlation && serie.correlation.type && serie.correlation.type !== 'none' && serie.correlation.show !== false;
    const showLine = serie.showLine !== false && (serie.showLine === true || !hasCorrelation);

    const markerType = serie.marker?.type ?? 'circle';
const markerSize = serie.marker?.size ?? (hasCorrelation ? 8 : 6);
    const markerColor = serie.marker?.color || lineColor;
const markerFilled = serie.marker?.filled !== false && markerType !== 'cross';
const showMarkers = serie.marker?.show !== false || hasCorrelation;
    const showErrorBars = serie.errorBar?.show ?? false;
    const errorBarColor = serie.errorBar?.color || lineColor;
    const errorBarWidth = serie.errorBar?.width ?? 1;
    const errorBarCapSize = serie.errorBar?.capSize ?? 5;
    const areaConfig = serie.area;

    const canvasPoints = serie.data.map(point => {

      let x: number;
      if (xAxisScale === 'log' && xMin > 0 && xMax > 0) {
        const logPos = logScale(point.x, xMin, xMax);
        x = originX + logPos * chartAreaWidth;
      } else {
        x = originX + ((point.x - xMin) / (xMax - xMin)) * chartAreaWidth;
      }

      let y: number;
      if (yAxisScale === 'log' && yMin > 0 && yMax > 0) {
        const logPos = logScale(point.y, yMin, yMax);
        y = originY - logPos * chartAreaHeightForPoints;
      } else {
        y = originY - ((point.y - yMin) / (yMax - yMin)) * chartAreaHeightForPoints;
      }

      x = Math.max(originX, Math.min(axisEndX, x));
      y = Math.max(axisEndY, Math.min(originY, y));

      return {
        x,
        y,
        originalPoint: point
      };
    });

    let areaSize: number | null = null;
let shadeToYCanvas: number | null = null;

    if (areaConfig && areaConfig.type && areaConfig.type !== 'none' && areaConfig.show !== false) {
      ctx.save();

      ctx.beginPath();
      ctx.rect(originX, axisEndY, axisEndX - originX, originY - axisEndY);
      ctx.clip();

      const areaColor = areaConfig.color || lineColor;
      const areaOpacity = areaConfig.opacity ?? 0.3;

      let fillColor = areaColor;
      if (areaColor.startsWith('#')) {
        const r = parseInt(areaColor.slice(1, 3), 16);
        const g = parseInt(areaColor.slice(3, 5), 16);
        const b = parseInt(areaColor.slice(5, 7), 16);
        fillColor = `rgba(${r}, ${g}, ${b}, ${areaOpacity})`;
      } else if (areaColor.startsWith('rgba')) {
        fillColor = areaColor;
      } else {
fillColor = `rgba(74, 144, 226, ${areaOpacity})`;
      }

      ctx.fillStyle = fillColor;
      ctx.beginPath();

      if (areaConfig.type === 'below') {

        let shadeToYValue: number;
        let localShadeToYCanvas: number;

        if (areaConfig.toValue !== undefined) {

          const allYValues = serie.data.map(p => p.y);
          const minY = Math.min(...allYValues);
          const maxY = Math.max(...allYValues);

          if (areaConfig.toValue >= minY) {
            throw new Error(
              `Line Chart Error: Invalid area shading configuration.\n` +
              `For area type "below", the toValue (${areaConfig.toValue}) must be below all Y values in the line.\n` +
              `Line Y range: [${minY}, ${maxY}].\n` +
              `The toValue cannot be above or equal to the minimum Y value (${minY}), and cannot be within the line's Y range.`
            );
          }

          shadeToYValue = areaConfig.toValue;

          if (yAxisScale === 'log' && yMin > 0 && yMax > 0) {
            const logPos = logScale(shadeToYValue, yMin, yMax);
            localShadeToYCanvas = originY - logPos * chartAreaHeightForPoints;
          } else {
            localShadeToYCanvas = originY - ((shadeToYValue - yMin) / (yMax - yMin)) * chartAreaHeightForPoints;
          }

          localShadeToYCanvas = Math.max(axisEndY, Math.min(originY, localShadeToYCanvas));
        } else {

          shadeToYValue = baseline !== undefined ? baseline : 0;
          localShadeToYCanvas = baselineY;
        }
shadeToYCanvas = localShadeToYCanvas;

        let sum = 0;
        for (let i = 0; i < serie.data.length - 1; i++) {
          const x1 = serie.data[i].x;
          const y1 = serie.data[i].y;
          const x2 = serie.data[i + 1].x;
          const y2 = serie.data[i + 1].y;
          const avgY = (y1 + y2) / 2;
          const height = avgY - shadeToYValue;
          const width = x2 - x1;
          sum += height * width;
        }
        areaSize = Math.abs(sum);

        ctx.moveTo(canvasPoints[0].x, localShadeToYCanvas);

        for (let i = 0; i < canvasPoints.length; i++) {
          ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }

        ctx.lineTo(canvasPoints[canvasPoints.length - 1].x, shadeToYCanvas);

        ctx.closePath();
        ctx.fill();
      } else if (areaConfig.type === 'above') {

        let shadeToYValue: number;
        let localShadeToYCanvas: number;

        if (areaConfig.toValue !== undefined) {

          const allYValues = serie.data.map(p => p.y);
          const minY = Math.min(...allYValues);
          const maxY = Math.max(...allYValues);

          if (areaConfig.toValue <= maxY) {
            throw new Error(
              `Line Chart Error: Invalid area shading configuration.\n` +
              `For area type "above", the toValue (${areaConfig.toValue}) must be above all Y values in the line.\n` +
              `Line Y range: [${minY}, ${maxY}].\n` +
              `The toValue cannot be below or equal to the maximum Y value (${maxY}), and cannot be within the line's Y range.`
            );
          }

          shadeToYValue = areaConfig.toValue;

          if (yAxisScale === 'log' && yMin > 0 && yMax > 0) {
            const logPos = logScale(shadeToYValue, yMin, yMax);
            localShadeToYCanvas = originY - logPos * chartAreaHeightForPoints;
          } else {
            localShadeToYCanvas = originY - ((shadeToYValue - yMin) / (yMax - yMin)) * chartAreaHeightForPoints;
          }

          localShadeToYCanvas = Math.max(axisEndY, Math.min(originY, localShadeToYCanvas));
        } else {

shadeToYValue = yMax;
          localShadeToYCanvas = axisEndY;
        }
shadeToYCanvas = localShadeToYCanvas;

        let sum = 0;
        for (let i = 0; i < serie.data.length - 1; i++) {
          const x1 = serie.data[i].x;
          const y1 = serie.data[i].y;
          const x2 = serie.data[i + 1].x;
          const y2 = serie.data[i + 1].y;
          const avgY = (y1 + y2) / 2;
const height = shadeToYValue - avgY;
          const width = x2 - x1;
          sum += height * width;
        }
        areaSize = Math.abs(sum);

        ctx.moveTo(canvasPoints[0].x, localShadeToYCanvas);

        canvasPoints.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });

        ctx.lineTo(canvasPoints[canvasPoints.length - 1].x, localShadeToYCanvas);

        ctx.closePath();
        ctx.fill();
      } else if (areaConfig.type === 'between' && areaConfig.secondLine) {

        const secondLineColor = areaConfig.secondLine.color || '#50C878';
        const secondLinePoints = areaConfig.secondLine.data.map(point => {

          let x: number;
          if (xAxisScale === 'log' && xMin > 0 && xMax > 0) {
            const logPos = logScale(point.x, xMin, xMax);
            x = originX + logPos * chartAreaWidth;
          } else {
            x = originX + ((point.x - xMin) / (xMax - xMin)) * chartAreaWidth;
          }

          let y: number;
          if (yAxisScale === 'log' && yMin > 0 && yMax > 0) {
            const logPos = logScale(point.y, yMin, yMax);
            y = originY - logPos * chartAreaHeightForPoints;
          } else {
            y = originY - ((point.y - yMin) / (yMax - yMin)) * chartAreaHeightForPoints;
          }

          x = Math.max(originX, Math.min(axisEndX, x));
          y = Math.max(axisEndY, Math.min(originY, y));

          return {
            x,
            y,
            originalPoint: point
          };
        });

        let sum = 0;
        const minLength = Math.min(serie.data.length, areaConfig.secondLine.data.length);
        for (let i = 0; i < minLength - 1; i++) {
          const x1 = serie.data[i].x;
          const y1 = serie.data[i].y;
          const x2 = serie.data[i + 1].x;
          const y2 = serie.data[i + 1].y;
          const y1Second = areaConfig.secondLine.data[i].y;
          const y2Second = areaConfig.secondLine.data[i + 1].y;
          const avgHeight = Math.abs(((y1 + y2) / 2) - ((y1Second + y2Second) / 2));
          const width = x2 - x1;
          sum += avgHeight * width;
        }
        areaSize = sum;

        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        canvasPoints.forEach(point => {
          ctx.lineTo(point.x, point.y);
        });

        for (let i = secondLinePoints.length - 1; i >= 0; i--) {
          ctx.lineTo(secondLinePoints[i].x, secondLinePoints[i].y);
        }
        ctx.closePath();
        ctx.fill();

        ctx.save();
        ctx.strokeStyle = secondLineColor;
        ctx.lineWidth = areaConfig.secondLine.lineWidth ?? 2;
        applyLineStyle(ctx, areaConfig.secondLine.lineStyle || 'solid');
        ctx.beginPath();
        ctx.moveTo(secondLinePoints[0].x, secondLinePoints[0].y);
        for (let i = 1; i < secondLinePoints.length; i++) {
          ctx.lineTo(secondLinePoints[i].x, secondLinePoints[i].y);
        }
        ctx.stroke();
        ctx.restore();

        if (areaConfig.secondLine.marker?.show !== false) {
          const secondMarkerType = areaConfig.secondLine.marker?.type ?? 'circle';
          const secondMarkerSize = areaConfig.secondLine.marker?.size ?? 6;
          const secondMarkerColor = areaConfig.secondLine.marker?.color || secondLineColor;
          const secondMarkerFilled = areaConfig.secondLine.marker?.filled !== false && secondMarkerType !== 'cross';
          secondLinePoints.forEach(canvasPoint => {
            if (secondMarkerType !== 'none') {
              drawMarker(ctx, canvasPoint.x, canvasPoint.y, secondMarkerType, secondMarkerSize, secondMarkerColor, secondMarkerFilled);
            }
          });
        }
      } else if (areaConfig.type === 'around') {

        const upperBound = areaConfig.upperBound || [];
        const lowerBound = areaConfig.lowerBound || [];

        if (upperBound.length === canvasPoints.length && lowerBound.length === canvasPoints.length) {
          const upperPoints = upperBound.map((value, index) => ({
            x: canvasPoints[index].x,
            y: originY - ((value - yMin) / (yMax - yMin)) * chartAreaHeightForPoints
          }));
          const lowerPoints = lowerBound.map((value, index) => ({
            x: canvasPoints[index].x,
            y: originY - ((value - yMin) / (yMax - yMin)) * chartAreaHeightForPoints
          }));

          upperPoints.forEach(point => {
            ctx.lineTo(point.x, point.y);
          });

          for (let i = lowerPoints.length - 1; i >= 0; i--) {
            ctx.lineTo(lowerPoints[i].x, lowerPoints[i].y);
          }
          ctx.closePath();
          ctx.fill();
        }
      }

      ctx.restore();
    }

    if (showLine) {
      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;

      const isStepLine = lineStyle === 'step' || lineStyle === 'stepline';
      if (!isStepLine) {
        applyLineStyle(ctx, lineStyle);
      }

      if (smoothness === 'bezier' && canvasPoints.length > 1) {

        const controlPoints = calculateBezierControlPoints(canvasPoints.map(p => ({ x: p.x, y: p.y })));

        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);

        for (let i = 0; i < canvasPoints.length - 1; i++) {
          const cp = controlPoints[i];
          ctx.bezierCurveTo(cp.cp1x, cp.cp1y, cp.cp2x, cp.cp2y, canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        }

        ctx.stroke();
      } else if (smoothness === 'spline' && canvasPoints.length > 1) {

        const splinePoints = calculateSplinePoints(canvasPoints.map(p => ({ x: p.x, y: p.y })));

        ctx.beginPath();
        ctx.moveTo(splinePoints[0].x, splinePoints[0].y);
        for (let i = 1; i < splinePoints.length; i++) {
          ctx.lineTo(splinePoints[i].x, splinePoints[i].y);
        }
        ctx.stroke();
      } else if (isStepLine && canvasPoints.length > 1) {

        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 0; i < canvasPoints.length - 1; i++) {

          ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i].y);

          ctx.lineTo(canvasPoints[i + 1].x, canvasPoints[i + 1].y);
        }
        ctx.stroke();
      } else {

        ctx.beginPath();
        ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
        for (let i = 1; i < canvasPoints.length; i++) {
          ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }

    if (serie.correlation && serie.correlation.type && serie.correlation.type !== 'none') {
      const correlationType = serie.correlation.type;
      const correlationColor = serie.correlation.color || lineColor;
      const correlationLineWidth = serie.correlation.lineWidth ?? 2;
      const correlationLineStyle = serie.correlation.lineStyle || 'dashed';
      const correlationDegree = serie.correlation.degree ?? 2;
      const showCorrelation = serie.correlation.show !== false;

      if (showCorrelation && serie.data.length >= 2) {

        const dataXValues = serie.data.map(p => p.x);
        const dataXMin = Math.min(...dataXValues);
        const dataXMax = Math.max(...dataXValues);
        const xRangeForCorrelation = dataXMax - dataXMin;
        const correlationXMin = Math.max(xMin, dataXMin - xRangeForCorrelation * 0.1);
        const correlationXMax = Math.min(xMax, dataXMax + xRangeForCorrelation * 0.1);

        const correlationPoints = generateCorrelationPoints(
          serie.data.map(p => ({ x: p.x, y: p.y })),
          correlationType,
          correlationXMin,
          correlationXMax,
          correlationDegree
        );

        if (correlationPoints.length > 0) {

          const canvasCorrelationPoints = correlationPoints
            .map(point => {

              let x: number;
              if (xAxisScale === 'log' && xMin > 0 && xMax > 0) {
                const logPos = logScale(point.x, xMin, xMax);
                x = originX + logPos * chartAreaWidth;
              } else {
                x = originX + ((point.x - xMin) / (xMax - xMin)) * chartAreaWidth;
              }

              let y: number;
              if (yAxisScale === 'log' && yMin > 0 && yMax > 0) {
                const logPos = logScale(point.y, yMin, yMax);
                y = originY - logPos * chartAreaHeightForPoints;
              } else {
                y = originY - ((point.y - yMin) / (yMax - yMin)) * chartAreaHeightForPoints;
              }

              return { x, y };
            })
            .filter(point =>
              point.x >= originX && point.x <= axisEndX &&
              point.y >= axisEndY && point.y <= originY
            );

          if (canvasCorrelationPoints.length > 0) {

            ctx.save();
            ctx.strokeStyle = correlationColor;
            ctx.lineWidth = correlationLineWidth;
            applyLineStyle(ctx, correlationLineStyle);

            ctx.beginPath();
            ctx.moveTo(canvasCorrelationPoints[0].x, canvasCorrelationPoints[0].y);
            for (let i = 1; i < canvasCorrelationPoints.length; i++) {
              ctx.lineTo(canvasCorrelationPoints[i].x, canvasCorrelationPoints[i].y);
            }
            ctx.stroke();

            ctx.restore();
          }
        }
      }
    }

    if (showMarkers) {
      canvasPoints.forEach(canvasPoint => {
        const point = canvasPoint.originalPoint;
        const shouldShowMarker = point.showMarker !== false;
        const markerColorForPoint = point.markerColor || markerColor;

        if (shouldShowMarker && markerType !== 'none') {
          drawMarker(ctx, canvasPoint.x, canvasPoint.y, markerType, markerSize, markerColorForPoint, markerFilled);
        }
      });
    }

    if (showErrorBars) {
      canvasPoints.forEach(canvasPoint => {
        const point = canvasPoint.originalPoint;
        const errorBar = point.errorBar;

        if (errorBar && errorBar.show !== false) {
          const positive = errorBar.positive ?? 0;
          const negative = errorBar.negative ?? 0;
          const errorColor = errorBar.color || errorBarColor;
          const errorWidth = errorBar.width ?? errorBarWidth;
          const errorCapSize = errorBar.capSize ?? errorBarCapSize;

          if (positive > 0 || negative > 0) {
            drawErrorBar(
              ctx,
              canvasPoint.x,
              canvasPoint.y,
              positive,
              negative,
              errorColor,
              errorWidth,
              errorCapSize,
              chartAreaHeightForPoints,
              yMin,
              yMax
            );
          }
        }
      });
    }

    if (showPointLabels) {
      ctx.save();
      ctx.fillStyle = pointLabelColor;
      ctx.font = `${pointLabelFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      canvasPoints.forEach(canvasPoint => {
        const point = canvasPoint.originalPoint;
        if (point.label) {
          let labelX = canvasPoint.x;
          let labelY = canvasPoint.y;

          switch (pointLabelPosition) {
            case 'top':
              labelY = canvasPoint.y - markerSize / 2 - 5;
              ctx.textBaseline = 'bottom';
              break;
            case 'bottom':
              labelY = canvasPoint.y + markerSize / 2 + 5;
              ctx.textBaseline = 'top';
              break;
            case 'left':
              labelX = canvasPoint.x - markerSize / 2 - 5;
              ctx.textAlign = 'right';
              break;
            case 'right':
              labelX = canvasPoint.x + markerSize / 2 + 5;
              ctx.textAlign = 'left';
              break;
          }

          ctx.fillText(point.label, labelX, labelY);
        }
      });

      ctx.restore();
    }

    if (areaSize !== null && areaConfig && areaConfig.showAreaSize === true) {
      ctx.save();
      ctx.fillStyle = areaConfig.areaSizeColor || '#000000';
      ctx.font = `${pointLabelFontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const centerX = (canvasPoints[0].x + canvasPoints[canvasPoints.length - 1].x) / 2;
      let centerY = 0;
      if (areaConfig.type === 'below') {
        const shadeY = shadeToYCanvas !== null ? shadeToYCanvas : baselineY;
        centerY = (shadeY + canvasPoints[Math.floor(canvasPoints.length / 2)].y) / 2;
      } else if (areaConfig.type === 'above') {
        const shadeY = shadeToYCanvas !== null ? shadeToYCanvas : axisEndY;
        centerY = (shadeY + canvasPoints[Math.floor(canvasPoints.length / 2)].y) / 2;
      } else if (areaConfig.type === 'between') {
        centerY = canvasPoints[Math.floor(canvasPoints.length / 2)].y;
      }

      ctx.fillText(`Area: ${areaSize.toFixed(2)}`, centerX, centerY);
      ctx.restore();
    }
  });

  if (showLegend) {
    const entries = legendEntries || series.map(s => ({
      color: s.color || '#4A90E2',
      label: s.label
    }));
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendBgColor = options.legend?.backgroundColor;
    const legendBorderColor = options.legend?.borderColor;
    const legendTextColor = options.legend?.textColor;
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
        legendX = paddingLeft + minLegendSpacing;
legendY = axisEndY + (chartAreaHeight - legendHeight) / 2;
        break;
      case 'right':
      default:
        legendX = axisEndX + minLegendSpacing;
legendY = axisEndY + (chartAreaHeight - legendHeight) / 2;
        break;
    }

    await drawLegend(
      ctx,
      legendX,
      legendY,
      entries,
      legendSpacing,
      legendFontSize,
      legendBgColor,
      legendBorderColor,
      legendTextColor,
      legendPadding,
      legendMaxWidth,
      legendWrapText,
      options.legend?.backgroundGradient,
      options.legend?.textGradient,
      options.legend?.textStyle
    );
  }

  return canvas.toBuffer('image/png');
}