import { createCanvas, SKRSContext2D, loadImage, Image } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../image/imageProperties";
import { paintChartCanvasBackground, type ChartAppearanceExtended } from "./chartBackground";
import type { PieSlice, PieChartOptions } from "./piechart";
import type { BarChartData, BarChartOptions } from "./barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "./horizontalbarchart";
import type { LineSeries, LineChartOptions } from "./linechart";
import type { ScatterSeries, ScatterChartOptions } from "./scatterchart";
import type { RadarSeries, RadarChartOptions } from "./radarchart";
import type { PolarAreaSlice, PolarAreaChartOptions } from "./polarareachart";
import { createPieChart } from './piechart';
import { createBarChart } from './barchart';
import { createHorizontalBarChart } from './horizontalbarchart';
import { createLineChart } from './linechart';
import { createScatterChart } from './scatterchart';
import { createRadarChart } from './radarchart';
import { createPolarAreaChart } from './polarareachart';

/**
 * Chart type for comparison charts
 */
export type ComparisonChartType =
  | 'pie'
  | 'bar'
  | 'horizontalBar'
  | 'line'
  | 'donut'
  | 'scatter'
  | 'radar'
  | 'polarArea';

/**
 * Chart data for comparison (union type)
 */
export type ComparisonChartData =
  | PieSlice[]
  | BarChartData[]
  | HorizontalBarChartData[]
  | LineSeries[]
  | ScatterSeries[]
  | RadarSeries[]
  | PolarAreaSlice[];

/**
 * Chart options for individual charts in comparison (union type)
 */
export type IndividualChartOptions =
  | PieChartOptions
  | BarChartOptions
  | HorizontalBarChartOptions
  | LineChartOptions
  | ScatterChartOptions
  | RadarChartOptions
  | PolarAreaChartOptions;

/**
 * Enhanced text styling for comparison chart title
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
 * Layout options for comparison charts
 */
export type ComparisonLayout = 'sideBySide' | 'topBottom';

/**
 * Individual chart configuration in comparison
 */
export interface ComparisonChartConfig {
  type: ComparisonChartType;
  data: ComparisonChartData;
  options: IndividualChartOptions;
  title?: {
    text: string;
    fontSize?: number;
    color?: string;
    gradient?: gradient;
    textStyle?: EnhancedTextStyle;
  };

  barType?: 'standard' | 'grouped' | 'stacked' | 'lollipop' | 'waterfall';

  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'longdash' | 'shortdash' | 'dashdotdot' | 'step' | 'stepline';
  lineSmoothness?: 'none' | 'bezier' | 'spline';
}

/**
 * Comparison chart options
 */
export interface ComparisonChartOptions {

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

layout?: ComparisonLayout;
spacing?: number;

  /** Same background options as standalone charts (`customBg`, `bgLayers`, `patternBg`, `noiseBg`, etc.). */
  appearance?: ChartAppearanceExtended;

  generalTitle?: {
    text: string;
    fontSize?: number;
    color?: string;
    gradient?: gradient;
    textStyle?: EnhancedTextStyle;
  };

  chart1: ComparisonChartConfig;
  chart2: ComparisonChartConfig;
}

/**
 * Helper function to render enhanced text
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

/** Uniform scale + center so chart buffers are not stretched in their cells. */
function drawChartImageContain(
  ctx: SKRSContext2D,
  img: Image,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number
): void {
  const iw = img.width;
  const ih = img.height;
  if (iw <= 0 || ih <= 0) return;
  const scale = Math.min(cellW / iw, cellH / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = cellX + (cellW - dw) / 2;
  const dy = cellY + (cellH - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

/**
 * Padding inside each cell scales with cell size (avoids huge inner margins that shrink plots,
 * and avoids the old 0.7× heuristic that still forced large minimums).
 */
function paddingForCell(
  original: { top?: number; right?: number; bottom?: number; left?: number } | undefined,
  cellW: number,
  cellH: number
): { top: number; right: number; bottom: number; left: number } {
  const m = Math.min(cellW, cellH);
  if (!original) {
    const p = Math.max(24, Math.min(52, Math.floor(m * 0.07)));
    return { top: p, right: p, bottom: p, left: p };
  }
  const ref = 850;
  const scale = Math.min(1.15, Math.max(0.5, m / ref));
  const sc = (v: number) => Math.max(22, Math.round(v * scale));
  return {
    top: sc(original.top ?? 56),
    right: sc(original.right ?? 56),
    bottom: sc(original.bottom ?? 56),
    left: sc(original.left ?? 64),
  };
}

/** Merge panel `appearance` into a sub-chart so backgrounds/axis styling inherit when omitted. */
function mergeInheritedChartAppearance(
  parent: ChartAppearanceExtended | undefined,
  child: IndividualChartOptions
): ChartAppearanceExtended {
  const c = (child as { appearance?: ChartAppearanceExtended }).appearance ?? {};
  const p = parent ?? {};
  return {
    ...p,
    ...c,
    backgroundColor: c.backgroundColor ?? p.backgroundColor ?? "#FFFFFF",
    backgroundGradient: c.backgroundGradient ?? p.backgroundGradient,
    backgroundImage: c.backgroundImage ?? p.backgroundImage,
    customBg: c.customBg ?? p.customBg,
    bgLayers: c.bgLayers ?? p.bgLayers,
    patternBg: c.patternBg ?? p.patternBg,
    noiseBg: c.noiseBg ?? p.noiseBg,
    blur: c.blur ?? p.blur,
    axisColor: c.axisColor ?? p.axisColor,
    axisWidth: c.axisWidth ?? p.axisWidth,
    arrowSize: c.arrowSize ?? p.arrowSize,
  };
}

/**
 * Creates a comparison chart with two charts side by side or top/bottom
 */
export async function createComparisonChart(
  options: ComparisonChartOptions
): Promise<Buffer> {

  const width = options.dimensions?.width ?? 2400;
  const height = options.dimensions?.height ?? 1200;
  const padding = options.dimensions?.padding || {};
  const paddingTop = padding.top ?? 100;
  const paddingRight = padding.right ?? 60;
  const paddingBottom = padding.bottom ?? 60;
  const paddingLeft = padding.left ?? 60;

  const layout = options.layout ?? 'sideBySide';
  const spacing = options.spacing ?? 40;

  const generalTitle = options.generalTitle;
  const generalTitleFontSize = generalTitle?.fontSize ?? 28;
  const generalTitleHeight = generalTitle ? generalTitleFontSize + 40 : 0;

  const canvas = createCanvas(width, height);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  await paintChartCanvasBackground(ctx, canvas, width, height, options.appearance);

  if (generalTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const titleY = paddingTop + 10;
    const titleX = width / 2;
    await renderEnhancedText(
      ctx,
      generalTitle.text,
      titleX,
      titleY,
      generalTitle.textStyle,
      generalTitleFontSize,
      generalTitle.color,
      generalTitle.gradient
    );
    ctx.restore();
  }

  const availableWidth = width - paddingLeft - paddingRight;
  const availableHeight = height - paddingTop - paddingBottom - generalTitleHeight;

  let chart1Width: number, chart1Height: number;
  let chart2Width: number, chart2Height: number;
  let chart1X: number, chart1Y: number;
  let chart2X: number, chart2Y: number;

  if (layout === 'sideBySide') {

    chart1Width = (availableWidth - spacing) / 2;
    chart1Height = availableHeight;
    chart2Width = (availableWidth - spacing) / 2;
    chart2Height = availableHeight;

    chart1X = paddingLeft;
    chart1Y = paddingTop + generalTitleHeight;
    chart2X = paddingLeft + chart1Width + spacing;
    chart2Y = paddingTop + generalTitleHeight;
  } else {

    chart1Width = availableWidth;
    chart1Height = (availableHeight - spacing) / 2;
    chart2Width = availableWidth;
    chart2Height = (availableHeight - spacing) / 2;

    chart1X = paddingLeft;
    chart1Y = paddingTop + generalTitleHeight;
    chart2X = paddingLeft;
    chart2Y = paddingTop + generalTitleHeight + chart1Height + spacing;
  }

  let chart1Buffer: Buffer;
  let chart2Buffer: Buffer;

  const getLegendProps = (chartType: ComparisonChartType, chartOptions: IndividualChartOptions) => {
    const props: any = {};
    if (chartType === 'pie' || chartType === 'donut') {
      const pieOptions = chartOptions as PieChartOptions;
      if (pieOptions.legends) {
        props.legends = pieOptions.legends;
      }
    } else {
      const otherOptions = chartOptions as
        | BarChartOptions
        | HorizontalBarChartOptions
        | LineChartOptions
        | ScatterChartOptions
        | RadarChartOptions
        | PolarAreaChartOptions;
      if (otherOptions.legend && otherOptions.legend.entries && otherOptions.legend.entries.length > 0) {
        props.legend = otherOptions.legend;
      }
    }
    return props;
  };

  const chart1Options: any = {
    ...options.chart1.options,
    dimensions: {
      ...options.chart1.options.dimensions,
      width: chart1Width,
      height: chart1Height,

      padding: paddingForCell(options.chart1.options.dimensions?.padding, chart1Width, chart1Height)
    },
    labels: {
      ...options.chart1.options.labels,
      title: {
        ...options.chart1.options.labels?.title,
        ...options.chart1.title,
        textStyle:
          options.chart1.options.labels?.title?.textStyle
          ?? options.chart1.title?.textStyle
          ?? options.generalTitle?.textStyle
      }
    },

    ...getLegendProps(options.chart1.type, options.chart1.options),

    appearance: mergeInheritedChartAppearance(options.appearance, options.chart1.options)
  };

  if (options.chart1.type === 'bar' && options.chart1.barType) {
    chart1Options.type = options.chart1.barType;
  }

  if (options.chart1.type === 'line') {
    if (options.chart1.lineStyle && chart1Options.labels) {

      const lineData = options.chart1.data as LineSeries[];
      if (lineData && Array.isArray(lineData)) {
        lineData.forEach(series => {
          if (!series.lineStyle) {
            series.lineStyle = options.chart1.lineStyle;
          }
          if (options.chart1.lineSmoothness && !series.smoothness) {
            series.smoothness = options.chart1.lineSmoothness;
          }
        });
      }
    }
  }

  const chart2Options: any = {
    ...options.chart2.options,
    dimensions: {
      ...options.chart2.options.dimensions,
      width: chart2Width,
      height: chart2Height,

      padding: paddingForCell(options.chart2.options.dimensions?.padding, chart2Width, chart2Height)
    },
    labels: {
      ...options.chart2.options.labels,
      title: {
        ...options.chart2.options.labels?.title,
        ...options.chart2.title,
        textStyle:
          options.chart2.options.labels?.title?.textStyle
          ?? options.chart2.title?.textStyle
          ?? options.generalTitle?.textStyle
      }
    },

    ...getLegendProps(options.chart2.type, options.chart2.options),

    appearance: mergeInheritedChartAppearance(options.appearance, options.chart2.options)
  };

  if (options.chart2.type === 'bar' && options.chart2.barType) {
    chart2Options.type = options.chart2.barType;
  }

  if (options.chart2.type === 'line') {
    if (options.chart2.lineStyle && chart2Options.labels) {

      const lineData = options.chart2.data as LineSeries[];
      if (lineData && Array.isArray(lineData)) {
        lineData.forEach(series => {
          if (!series.lineStyle) {
            series.lineStyle = options.chart2.lineStyle;
          }
          if (options.chart2.lineSmoothness && !series.smoothness) {
            series.smoothness = options.chart2.lineSmoothness;
          }
        });
      }
    }
  }

  switch (options.chart1.type) {
    case 'pie':
    case 'donut':
      const pieOptions1 = chart1Options as PieChartOptions;
      if (options.chart1.type === 'donut') {
        pieOptions1.type = 'donut';
      }
      chart1Buffer = await createPieChart(options.chart1.data as PieSlice[], pieOptions1);
      break;
    case 'bar':
      chart1Buffer = await createBarChart(options.chart1.data as BarChartData[], chart1Options as BarChartOptions);
      break;
    case 'horizontalBar':
      chart1Buffer = await createHorizontalBarChart(options.chart1.data as HorizontalBarChartData[], chart1Options as HorizontalBarChartOptions);
      break;
    case 'line':
      chart1Buffer = await createLineChart(options.chart1.data as LineSeries[], chart1Options as LineChartOptions);
      break;
    case 'scatter':
      chart1Buffer = await createScatterChart(options.chart1.data as ScatterSeries[], chart1Options as ScatterChartOptions);
      break;
    case 'radar':
      chart1Buffer = await createRadarChart(options.chart1.data as RadarSeries[], chart1Options as RadarChartOptions);
      break;
    case 'polarArea':
      chart1Buffer = await createPolarAreaChart(options.chart1.data as PolarAreaSlice[], chart1Options as PolarAreaChartOptions);
      break;
    default:
      throw new Error(`Unsupported chart type for chart 1: ${options.chart1.type}`);
  }

  switch (options.chart2.type) {
    case 'pie':
    case 'donut':
      const pieOptions2 = chart2Options as PieChartOptions;
      if (options.chart2.type === 'donut') {
        pieOptions2.type = 'donut';
      }
      chart2Buffer = await createPieChart(options.chart2.data as PieSlice[], pieOptions2);
      break;
    case 'bar':
      chart2Buffer = await createBarChart(options.chart2.data as BarChartData[], chart2Options as BarChartOptions);
      break;
    case 'horizontalBar':
      chart2Buffer = await createHorizontalBarChart(options.chart2.data as HorizontalBarChartData[], chart2Options as HorizontalBarChartOptions);
      break;
    case 'line':
      chart2Buffer = await createLineChart(options.chart2.data as LineSeries[], chart2Options as LineChartOptions);
      break;
    case 'scatter':
      chart2Buffer = await createScatterChart(options.chart2.data as ScatterSeries[], chart2Options as ScatterChartOptions);
      break;
    case 'radar':
      chart2Buffer = await createRadarChart(options.chart2.data as RadarSeries[], chart2Options as RadarChartOptions);
      break;
    case 'polarArea':
      chart2Buffer = await createPolarAreaChart(options.chart2.data as PolarAreaSlice[], chart2Options as PolarAreaChartOptions);
      break;
    default:
      throw new Error(`Unsupported chart type for chart 2: ${options.chart2.type}`);
  }

  const chart1Image = await loadImage(chart1Buffer);
  const chart2Image = await loadImage(chart2Buffer);

  drawChartImageContain(ctx, chart1Image, chart1X, chart1Y, chart1Width, chart1Height);
  drawChartImageContain(ctx, chart2Image, chart2X, chart2Y, chart2Width, chart2Height);

  return canvas.toBuffer('image/png');
}

