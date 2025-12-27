import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";
import type { PieSlice, PieChartOptions } from "./piechart";
import type { BarChartData, BarChartOptions } from "./barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "./horizontalbarchart";
import type { LineSeries, LineChartOptions } from "./linechart";
import { createPieChart } from './piechart';
import { createBarChart } from './barchart';
import { createHorizontalBarChart } from './horizontalbarchart';
import { createLineChart } from './linechart';

/**
 * Chart type for comparison charts
 */
export type ComparisonChartType = 'pie' | 'bar' | 'horizontalBar' | 'line' | 'donut';

/**
 * Chart data for comparison (union type)
 */
export type ComparisonChartData =
  | PieSlice[]
  | BarChartData[]
  | HorizontalBarChartData[]
  | LineSeries[];

/**
 * Chart options for individual charts in comparison (union type)
 */
export type IndividualChartOptions =
  | PieChartOptions
  | BarChartOptions
  | HorizontalBarChartOptions
  | LineChartOptions;

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

  appearance?: {
    backgroundColor?: string;
    backgroundGradient?: gradient;
    backgroundImage?: string;
  };

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

/**
 * Helper function to fill with gradient or color
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

  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const backgroundGradient = options.appearance?.backgroundGradient;
  const backgroundImage = options.appearance?.backgroundImage;

  const generalTitle = options.generalTitle;
  const generalTitleFontSize = generalTitle?.fontSize ?? 28;
  const generalTitleHeight = generalTitle ? generalTitleFontSize + 40 : 0;

  const canvas = createCanvas(width, height);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      ctx.drawImage(bgImage, 0, 0, width, height);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);
      fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
        x: 0, y: 0, w: width, h: height
      });
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
      x: 0, y: 0, w: width, h: height
    });
    ctx.fillRect(0, 0, width, height);
  }

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

  const getOptimizedPadding = (originalPadding?: { top?: number; right?: number; bottom?: number; left?: number }) => {
    if (!originalPadding) {

      return {
        top: 50,
        right: 50,
        bottom: 50,
        left: 60
      };
    }

    return {
      top: Math.max(40, Math.floor((originalPadding.top ?? 60) * 0.7)),
      right: Math.max(40, Math.floor((originalPadding.right ?? 80) * 0.7)),
      bottom: Math.max(40, Math.floor((originalPadding.bottom ?? 80) * 0.7)),
      left: Math.max(50, Math.floor((originalPadding.left ?? 100) * 0.7))
    };
  };

  const getLegendProps = (chartType: ComparisonChartType, chartOptions: IndividualChartOptions) => {
    const props: any = {};
    if (chartType === 'pie' || chartType === 'donut') {
      const pieOptions = chartOptions as PieChartOptions;
      if (pieOptions.legends) {
        props.legends = pieOptions.legends;
      }
    } else {
      const otherOptions = chartOptions as BarChartOptions | HorizontalBarChartOptions | LineChartOptions;
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

      padding: getOptimizedPadding(options.chart1.options.dimensions?.padding)
    },
    labels: {
      ...options.chart1.options.labels,
      title: options.chart1.title ? {
        ...options.chart1.options.labels?.title,
        ...options.chart1.title
      } : options.chart1.options.labels?.title
    },

    ...getLegendProps(options.chart1.type, options.chart1.options),

    appearance: {
      ...options.chart1.options.appearance,
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined
    }
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

      padding: getOptimizedPadding(options.chart2.options.dimensions?.padding)
    },
    labels: {
      ...options.chart2.options.labels,
      title: options.chart2.title ? {
        ...options.chart2.options.labels?.title,
        ...options.chart2.title
      } : options.chart2.options.labels?.title
    },

    ...getLegendProps(options.chart2.type, options.chart2.options),

    appearance: {
      ...options.chart2.options.appearance,
      backgroundColor: 'transparent',
      backgroundGradient: undefined,
      backgroundImage: undefined
    }
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
    default:
      throw new Error(`Unsupported chart type for chart 2: ${options.chart2.type}`);
  }

  const chart1Image = await loadImage(chart1Buffer);
  const chart2Image = await loadImage(chart2Buffer);

  ctx.drawImage(chart1Image, chart1X, chart1Y, chart1Width, chart1Height);
  ctx.drawImage(chart2Image, chart2X, chart2Y, chart2Width, chart2Height);

  return canvas.toBuffer('image/png');
}

