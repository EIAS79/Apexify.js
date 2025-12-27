import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";

/**
 * Pie slice data
 */
export interface PieSlice {
  label: string;
  value: number;
color?: string;
gradient?: gradient;
showValue?: boolean;
showLabel?: boolean;
valueLabel?: string;
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
 * Legend entry interface
 */
export interface LegendEntry {
color?: string;
gradient?: gradient;
  label: string;
}

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
 * Standard legend configuration (Type 1)
 */
export interface StandardLegendConfig {
show?: boolean;
position?: 'top' | 'bottom' | 'left' | 'right';
fontSize?: number;
backgroundColor?: string;
backgroundGradient?: gradient;
borderColor?: string;
textColor?: string;
textGradient?: gradient;
textStyle?: EnhancedTextStyle;
spacing?: number;
padding?: number;
maxWidth?: number;
wrapText?: boolean;
}

/**
 * Connected legend configuration (Type 2 - for pie charts)
 */
export interface ConnectedLegendConfig {
show?: boolean;
fontSize?: number;
backgroundColor?: string;
backgroundGradient?: gradient;
borderColor?: string;
textColor?: string;
textGradient?: gradient;
textStyle?: EnhancedTextStyle;
lineColor?: string;
lineGradient?: gradient;
lineWidth?: number;
padding?: number;
maxWidth?: number;
wrapText?: boolean;
}

/**
 * Pie chart configuration
 */
export interface PieChartOptions {

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
  };

type?: 'pie' | 'donut';
donutInnerRadius?: number;

  labels?: {
    title?: {
      text?: string;
      fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
    sliceLabels?: {
fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
    valueLabels?: {
fontSize?: number;
color?: string;
gradient?: gradient;
textStyle?: EnhancedTextStyle;
    };
showValues?: boolean;
showLabels?: boolean;
valueFormat?: (value: number, percentage: number) => string;
  };

  legends?: {
standard?: StandardLegendConfig;
connected?: ConnectedLegendConfig;
  };

  slices?: {

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
 * Calculates dimensions for standard legend with text wrapping
 */
function calculateStandardLegendDimensions(
  entries: LegendEntry[],
  fontSize: number,
  spacing: number,
  padding: number,
  maxWidth?: number
): { width: number; height: number; entryHeights: number[] } {

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px Arial`;

  const boxSize = Math.max(18, fontSize * 1.2);
  const textSpacing = 12;
  const effectiveMaxWidth = maxWidth ? maxWidth - padding * 2 - boxSize - textSpacing : undefined;

  let maxEntryWidth = 0;
  const entryHeights: number[] = [];

  entries.forEach(entry => {
    let textWidth: number;
    let textHeight: number;

    if (effectiveMaxWidth) {
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

  const width = maxWidth ? maxWidth : maxEntryWidth + padding * 2;
  const height = entryHeights.reduce((sum, h, i) => sum + h + (i < entryHeights.length - 1 ? spacing : 0), 0) + padding * 2;

  return { width, height, entryHeights };
}

/**
 * Draws standard legend (Type 1)
 */
async function drawStandardLegend(
  ctx: SKRSContext2D,
  entries: LegendEntry[],
  config: StandardLegendConfig,
  canvasWidth: number,
  canvasHeight: number,
  padding: { top: number; right: number; bottom: number; left: number },
  chartArea?: { left: number; right: number; top: number; bottom: number },
  legendSpacing?: number,
  titleHeight?: number
): Promise<void> {
  if (!config.show || !entries || entries.length === 0) return;

  ctx.save();

const fontSize = config.fontSize ?? 16;
const spacing = config.spacing ?? 18;
const paddingBox = config.padding ?? 10;
  const backgroundColor = config.backgroundColor ?? 'rgba(255, 255, 255, 0.9)';
  const borderColor = config.borderColor ?? '#000000';
  const textColor = config.textColor ?? '#000000';
  const maxWidth = config.maxWidth;
  const wrapTextEnabled = config.wrapText !== false;

  ctx.font = `${fontSize}px Arial`;

  const { width, height, entryHeights } = calculateStandardLegendDimensions(
    entries,
    fontSize,
    spacing,
    paddingBox,
    maxWidth
  );

  let legendX: number, legendY: number;
  const position = config.position ?? 'right';
  const gap = legendSpacing ?? 20;

  if (chartArea) {

    switch (position) {
      case 'top':
        legendX = (canvasWidth - width) / 2;

        legendY = padding.top + (titleHeight ?? 0);
        break;
      case 'bottom':
        legendX = (canvasWidth - width) / 2;
        legendY = canvasHeight - padding.bottom - height;
        break;
      case 'left':
        legendX = chartArea.left - width - gap;
        legendY = (canvasHeight - height) / 2;
        break;
      case 'right':
        legendX = chartArea.right + gap;
        legendY = (canvasHeight - height) / 2;
        break;
      default:
        legendX = chartArea.right + gap;
        legendY = (canvasHeight - height) / 2;
    }
  } else {

    switch (position) {
      case 'top':
        legendX = (canvasWidth - width) / 2;
        legendY = padding.top;
        break;
      case 'bottom':
        legendX = (canvasWidth - width) / 2;
        legendY = canvasHeight - padding.bottom - height;
        break;
      case 'left':
        legendX = padding.left;
        legendY = (canvasHeight - height) / 2;
        break;
      case 'right':
        legendX = canvasWidth - padding.right - width;
        legendY = (canvasHeight - height) / 2;
        break;
      default:
        legendX = canvasWidth - padding.right - width;
        legendY = (canvasHeight - height) / 2;
    }
  }

  if (config.backgroundGradient) {
    fillWithGradientOrColor(ctx, config.backgroundGradient, backgroundColor, backgroundColor, {
      x: legendX, y: legendY, w: width, h: height
    });
    ctx.fillRect(legendX, legendY, width, height);
  } else {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(legendX, legendY, width, height);
  }

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, width, height);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const boxSize = Math.max(18, fontSize * 1.2);
  const textSpacing = 12;
  const effectiveMaxWidth = maxWidth ? maxWidth - paddingBox * 2 - boxSize - textSpacing : undefined;

  let currentY = legendY + paddingBox;

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const entryHeight = entryHeights[index];
    const centerY = currentY + entryHeight / 2;

    if (entry.gradient) {
      fillWithGradientOrColor(ctx, entry.gradient, entry.color, '#000000', {
        x: legendX + paddingBox, y: centerY - boxSize / 2, w: boxSize, h: boxSize
      });
    ctx.fillRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    } else {
      ctx.fillStyle = entry.color || '#000000';
      ctx.fillRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    }

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);

    const textX = legendX + paddingBox + boxSize + textSpacing;
    const labelTextColor = config.textGradient ? undefined : (config.textColor || textColor);

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
          config.textStyle,
          fontSize,
          labelTextColor,
          config.textGradient
        );
      }
    } else {
      await renderEnhancedText(
        ctx,
        entry.label,
        textX,
        centerY,
        config.textStyle,
        fontSize,
        labelTextColor,
        config.textGradient
      );
    }

    currentY += entryHeight + spacing;
  }

  ctx.restore();
}

/**
 * Draws connected legend (Type 2) - labels with lines connecting to pie slices
 */
function drawConnectedLegend(
  ctx: SKRSContext2D,
  entries: LegendEntry[],
  sliceAngles: { startAngle: number; endAngle: number }[],
  centerX: number,
  centerY: number,
  radius: number,
  innerRadius: number,
  config: ConnectedLegendConfig
): void {
  if (!config.show || !entries || entries.length === 0) return;

  ctx.save();

  const fontSize = config.fontSize ?? 12;
  const padding = config.padding ?? 5;
  const backgroundColor = config.backgroundColor ?? 'rgba(255, 255, 255, 0.9)';
  const borderColor = config.borderColor ?? '#000000';
  const textColor = config.textColor ?? '#000000';
  const lineColor = config.lineColor ?? '#000000';
  const lineWidth = config.lineWidth ?? 1;
  const maxWidth = config.maxWidth ?? 150;
  const wrapTextEnabled = config.wrapText !== false;

  ctx.font = `${fontSize}px Arial`;

  const midAngles = sliceAngles.map(slice => (slice.startAngle + slice.endAngle) / 2);

  interface LabelPosition {
    angle: number;
    x: number;
    y: number;
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
    isLeftSide: boolean;
  }

  const labelPositions: LabelPosition[] = [];

  entries.forEach((entry, index) => {
    if (index >= midAngles.length) return;

    const angle = midAngles[index];
const labelRadius = radius + 20;
    const labelX = centerX + Math.cos(angle) * labelRadius;
    const labelY = centerY + Math.sin(angle) * labelRadius;

    const isLeftSide = Math.cos(angle) < 0;

    const textMaxWidth = maxWidth - padding * 2;
    let wrappedLines: string[];
    let textHeight: number;
    let textWidth: number;

    if (wrapTextEnabled) {
      wrappedLines = wrapText(ctx, entry.label, textMaxWidth);
      textWidth = Math.max(...wrappedLines.map(line => ctx.measureText(line).width));
      textHeight = wrappedLines.length * fontSize * 1.2;
    } else {
      wrappedLines = [entry.label];
      textWidth = ctx.measureText(entry.label).width;
      textHeight = fontSize;
    }

    const boxWidth = Math.min(maxWidth, textWidth + padding * 2);
    const boxHeight = textHeight + padding * 2;

    let labelBoxX = isLeftSide ? labelX - boxWidth : labelX;
    let labelBoxY = labelY;

    const minSpacing = 5;
    for (const prevPos of labelPositions) {
      const overlapX = !(labelBoxX + boxWidth < prevPos.boxX || labelBoxX > prevPos.boxX + prevPos.boxWidth);
      const overlapY = !(labelBoxY + boxHeight / 2 < prevPos.boxY - prevPos.boxHeight / 2 || labelBoxY - boxHeight / 2 > prevPos.boxY + prevPos.boxHeight / 2);

      if (overlapX && overlapY) {

        if (labelBoxY < prevPos.boxY) {
          labelBoxY = prevPos.boxY - prevPos.boxHeight / 2 - boxHeight / 2 - minSpacing;
        } else {
          labelBoxY = prevPos.boxY + prevPos.boxHeight / 2 + boxHeight / 2 + minSpacing;
        }
      }
    }

    labelPositions.push({
      angle,
      x: labelX,
      y: labelY,
      boxX: labelBoxX,
      boxY: labelBoxY,
      boxWidth,
      boxHeight,
      isLeftSide
    });
  });

  entries.forEach((entry, index) => {
    if (index >= labelPositions.length) return;

    const pos = labelPositions[index];
    const angle = pos.angle;

    const textMaxWidth = maxWidth - padding * 2;
    let wrappedLines: string[];

    if (wrapTextEnabled) {
      wrappedLines = wrapText(ctx, entry.label, textMaxWidth);
    } else {
      wrappedLines = [entry.label];
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    const lineStartX = centerX + Math.cos(angle) * radius;
    const lineStartY = centerY + Math.sin(angle) * radius;

    const lineEndX = pos.isLeftSide ? pos.boxX + pos.boxWidth : pos.boxX;
    const lineEndY = pos.boxY;

    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(pos.boxX, pos.boxY - pos.boxHeight / 2, pos.boxWidth, pos.boxHeight);

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(pos.boxX, pos.boxY - pos.boxHeight / 2, pos.boxWidth, pos.boxHeight);

    ctx.fillStyle = textColor;
    ctx.textAlign = pos.isLeftSide ? 'right' : 'left';
    ctx.textBaseline = 'middle';

    if (wrapTextEnabled && wrappedLines.length > 1) {
      const lineHeight = fontSize * 1.2;
      const startY = pos.boxY - (wrappedLines.length - 1) * lineHeight / 2;
      const textX = pos.isLeftSide ? pos.boxX + pos.boxWidth - padding : pos.boxX + padding;

      wrappedLines.forEach((line, lineIndex) => {
        ctx.fillText(line, textX, startY + lineIndex * lineHeight);
      });
    } else {
      const textX = pos.isLeftSide ? pos.boxX + pos.boxWidth - padding : pos.boxX + padding;
      ctx.fillText(entry.label, textX, pos.boxY);
    }
  });

  ctx.restore();
}

/**
 * Creates a pie or donut chart
 */
export async function createPieChart(
  data: PieSlice[],
  options: PieChartOptions = {}
): Promise<Buffer> {

  const width = options.dimensions?.width ?? 800;
  const height = options.dimensions?.height ?? 600;
  const padding = options.dimensions?.padding || {};
  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 80;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 80;

  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const backgroundGradient = options.appearance?.backgroundGradient;
  const backgroundImage = options.appearance?.backgroundImage;

  const chartType = options.type ?? 'pie';
  const donutInnerRadiusRatio = options.donutInnerRadius ?? 0.6;

  const chartTitle = options.labels?.title?.text;
const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const chartTitleColor = options.labels?.title?.color ?? '#000000';

const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0;
  const showValues = options.labels?.showValues ?? true;
  const showLabels = options.labels?.showLabels ?? false;
  const valueFormatter = options.labels?.valueFormat;

  const standardLegendConfig = options.legends?.standard;
  const connectedLegendConfig = options.legends?.connected;

  const globalSliceOpacity = options.slices?.opacity;
  const globalSliceShadow = options.slices?.shadow;
  const globalSliceStroke = options.slices?.stroke;

  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) {
    throw new Error('Pie Chart Error: Total value of all slices must be greater than 0');
  }

  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');

  let standardLegendWidth = 0;
  let standardLegendHeight = 0;
  let connectedLegendSpace = { left: 0, right: 0, top: 0, bottom: 0 };

  const legendEntries: LegendEntry[] = data.map((slice, index) => {
    const defaultColors = ['#4A90E2', '#50C878', '#FF6B6B', '#FFA500', '#9B59B6', '#F39C12', '#1ABC9C', '#E74C3C'];
    return {
      color: slice.color || defaultColors[index % defaultColors.length],
      label: slice.label
    };
  });

  if (standardLegendConfig?.show && legendEntries.length > 0) {
const legendFontSize = standardLegendConfig.fontSize ?? 16;
const legendSpacing = standardLegendConfig.spacing ?? 18;
const legendPadding = standardLegendConfig.padding ?? 10;
    const legendMaxWidth = standardLegendConfig.maxWidth;
    const legendWrapText = standardLegendConfig.wrapText !== false;

    const { width: legWidth, height: legHeight } = calculateStandardLegendDimensions(
      legendEntries,
      legendFontSize,
      legendSpacing,
      legendPadding,
      legendMaxWidth
    );
    standardLegendWidth = legWidth;
    standardLegendHeight = legHeight;
  }

  if (connectedLegendConfig?.show && legendEntries.length > 0) {
    const connectedFontSize = connectedLegendConfig.fontSize ?? 12;
    const connectedMaxWidth = connectedLegendConfig.maxWidth ?? 150;
    const connectedPadding = connectedLegendConfig.padding ?? 5;

    tempCtx.font = `${connectedFontSize}px Arial`;
    const maxLabelWidth = Math.max(...legendEntries.map(e => tempCtx.measureText(e.label).width));
    const boxWidth = Math.min(connectedMaxWidth, maxLabelWidth + connectedPadding * 2);
    const boxHeight = connectedFontSize + connectedPadding * 2;

    connectedLegendSpace.left = boxWidth + 30;
    connectedLegendSpace.right = boxWidth + 30;
    connectedLegendSpace.top = boxHeight / 2 + 20;
    connectedLegendSpace.bottom = boxHeight / 2 + 20;
  }

  const standardLegendPosition = standardLegendConfig?.position ?? 'right';
  const legendGap = 20;

  let extraWidth = 0;
  let extraHeight = 0;

  if (standardLegendConfig?.show) {
    if (standardLegendPosition === 'left') {
      extraWidth = standardLegendWidth + legendGap;
    } else if (standardLegendPosition === 'right') {
      extraWidth = standardLegendWidth + legendGap;
    } else if (standardLegendPosition === 'top') {
      extraHeight = standardLegendHeight + legendGap;
    } else if (standardLegendPosition === 'bottom') {
      extraHeight = standardLegendHeight + legendGap;
    }
  }

  extraWidth = Math.max(extraWidth, connectedLegendSpace.left, connectedLegendSpace.right);
  extraHeight = Math.max(extraHeight, connectedLegendSpace.top, connectedLegendSpace.bottom);

  const adjustedWidth = width + extraWidth;
  const adjustedHeight = height + extraHeight;

  let chartAreaLeft = paddingLeft;
  let chartAreaRight = width - paddingRight;
let chartAreaTop = paddingTop + titleHeight;
  let chartAreaBottom = height - paddingBottom;

  if (standardLegendConfig?.show) {
    if (standardLegendPosition === 'left') {

      chartAreaLeft = paddingLeft + standardLegendWidth + legendGap;
      chartAreaRight = adjustedWidth - paddingRight;
    } else if (standardLegendPosition === 'right') {

      chartAreaLeft = paddingLeft;
chartAreaRight = width - paddingRight;
    } else if (standardLegendPosition === 'top') {

      chartAreaTop = paddingTop + titleHeight + standardLegendHeight + legendGap;
      chartAreaBottom = adjustedHeight - paddingBottom;
    } else if (standardLegendPosition === 'bottom') {

      chartAreaTop = paddingTop + titleHeight;
chartAreaBottom = height - paddingBottom;
    }
  }

  const canvas = createCanvas(adjustedWidth, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      ctx.drawImage(bgImage, 0, 0, adjustedWidth, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);

      if (backgroundGradient) {
        fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
          x: 0, y: 0, w: adjustedWidth, h: adjustedHeight
        });
        ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
      } else {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
      }
    }
  } else if (backgroundGradient) {
    fillWithGradientOrColor(ctx, backgroundGradient, backgroundColor, backgroundColor, {
      x: 0, y: 0, w: adjustedWidth, h: adjustedHeight
    });
    ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
  } else {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, adjustedWidth, adjustedHeight);
  }

  if (chartTitle) {
    const titleStyle = options.labels?.title?.textStyle;
    const titleGradient = options.labels?.title?.gradient;
    const titleY = paddingTop + 10;
    await renderEnhancedText(
      ctx,
      chartTitle,
      adjustedWidth / 2,
      titleY,
      titleStyle,
      chartTitleFontSize,
      chartTitleColor,
      titleGradient
    );

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.restore();
  }

  const chartAreaWidth = chartAreaRight - chartAreaLeft;
  const chartAreaHeight = chartAreaBottom - chartAreaTop;

  const maxRadius = Math.max(Math.min(chartAreaWidth, chartAreaHeight) / 2, 0);
const radius = maxRadius;
  const centerX = chartAreaLeft + chartAreaWidth / 2;
  const centerY = chartAreaTop + chartAreaHeight / 2;
  const innerRadius = chartType === 'donut' ? radius * donutInnerRadiusRatio : 0;

let currentAngle = -Math.PI / 2;
  const sliceAngles: { startAngle: number; endAngle: number }[] = [];

  data.forEach(slice => {
    const sliceAngle = (slice.value / total) * Math.PI * 2;
    sliceAngles.push({
      startAngle: currentAngle,
      endAngle: currentAngle + sliceAngle
    });
    currentAngle += sliceAngle;
  });

  const defaultColors = ['#4A90E2', '#50C878', '#FF6B6B', '#FFA500', '#9B59B6', '#F39C12', '#1ABC9C', '#E74C3C'];

  for (let index = 0; index < data.length; index++) {
    const slice = data[index];
    const defaultColor = slice.color || defaultColors[index % defaultColors.length];
    const angles = sliceAngles[index];

    ctx.save();

    const effectiveOpacity = slice.opacity ?? globalSliceOpacity;
    if (effectiveOpacity !== undefined) {
      ctx.globalAlpha = effectiveOpacity;
    }

    const effectiveShadow = slice.shadow || globalSliceShadow;
    if (effectiveShadow) {
      ctx.shadowColor = effectiveShadow.color || 'rgba(0,0,0,0.3)';
      ctx.shadowOffsetX = effectiveShadow.offsetX ?? 2;
      ctx.shadowOffsetY = effectiveShadow.offsetY ?? 2;
      ctx.shadowBlur = effectiveShadow.blur ?? 4;
    }

    ctx.beginPath();

    if (chartType === 'donut') {

      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      ctx.lineTo(centerX + Math.cos(angles.endAngle) * innerRadius, centerY + Math.sin(angles.endAngle) * innerRadius);
      ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      ctx.closePath();
    } else {

      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      ctx.closePath();
    }

    if (slice.gradient) {

      const midAngle = (angles.startAngle + angles.endAngle) / 2;
      const gradientRect = {
        x: centerX - radius,
        y: centerY - radius,
        w: radius * 2,
        h: radius * 2
      };
      fillWithGradientOrColor(ctx, slice.gradient, defaultColor, defaultColor, gradientRect);
    } else {
      ctx.fillStyle = defaultColor;
    }

    ctx.fill();

    if (effectiveShadow) {
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
    }

    const effectiveStroke = slice.stroke || globalSliceStroke;
    if (effectiveStroke && effectiveStroke.width && effectiveStroke.width > 0) {
      ctx.beginPath();

      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      if (chartType === 'donut') {

        ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      } else {

        ctx.lineTo(centerX, centerY);
      }
      ctx.closePath();

      if (effectiveStroke.gradient) {
        const gradientRect = {
          x: centerX - radius,
          y: centerY - radius,
          w: radius * 2,
          h: radius * 2
        };
        ctx.strokeStyle = createGradientFill(ctx, effectiveStroke.gradient, gradientRect) as any;
      } else {
        ctx.strokeStyle = effectiveStroke.color || '#FFFFFF';
      }
      ctx.lineWidth = effectiveStroke.width;
      ctx.lineJoin = 'bevel';
      ctx.stroke();
    } else {

      ctx.beginPath();

      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      if (chartType === 'donut') {

        ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      } else {

        ctx.lineTo(centerX, centerY);
      }
      ctx.closePath();
ctx.strokeStyle = '#FFFFFF';
ctx.lineWidth = 2;
      ctx.lineJoin = 'bevel';
      ctx.stroke();
    }

    ctx.restore();

    const percentage = (slice.value / total) * 100;
    const sliceAngle = angles.endAngle - angles.startAngle;
    const midAngle = (angles.startAngle + angles.endAngle) / 2;

    const labelLines: string[] = [];

    if ((showLabels || slice.showLabel) && (slice.showLabel !== false)) {
      labelLines.push(slice.label);
    }

    if (showValues && (slice.showValue !== false)) {
      const valueText = slice.valueLabel || (valueFormatter ? valueFormatter(slice.value, percentage) : `${slice.value} ${percentage.toFixed(1)}%`);
      labelLines.push(valueText);
    }

    if (labelLines.length > 0) {
      ctx.save();

const isSmallSlice = percentage < 5 || sliceAngle < 0.15;

      let labelRadius: number;
      let fontSize: number;

      if (isSmallSlice) {

labelRadius = radius + 15;
fontSize = 12;
      } else {

        labelRadius = chartType === 'donut' ? (radius + innerRadius) / 2 : radius * 0.7;
        fontSize = 14;
      }

      const labelX = centerX + Math.cos(midAngle) * labelRadius;
      const labelY = centerY + Math.sin(midAngle) * labelRadius;

      const lineHeight = fontSize;

      ctx.translate(labelX, labelY);
ctx.rotate(midAngle + Math.PI / 2);

      const sliceLabelStyle = options.labels?.sliceLabels?.textStyle;
      const sliceLabelColor = options.labels?.sliceLabels?.color || '#000000';
      const sliceLabelGradient = options.labels?.sliceLabels?.gradient;
      const valueLabelStyle = options.labels?.valueLabels?.textStyle;
      const valueLabelColor = options.labels?.valueLabels?.color || '#000000';
      const valueLabelGradient = options.labels?.valueLabels?.gradient;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (labelLines.length === 1) {
        const isValueLabel = !showLabels || slice.showLabel === false;
        const style = isValueLabel ? valueLabelStyle : sliceLabelStyle;
        const color = isValueLabel ? valueLabelColor : sliceLabelColor;
        const gradient = isValueLabel ? valueLabelGradient : sliceLabelGradient;
        await renderEnhancedText(ctx, labelLines[0], 0, 0, style, fontSize, color, gradient);
      } else {
        const startY = -(labelLines.length - 1) * lineHeight / 2;
        for (let lineIndex = 0; lineIndex < labelLines.length; lineIndex++) {
          const line = labelLines[lineIndex];
          const isValueLabel = lineIndex > 0 || (!showLabels || slice.showLabel === false);
          const style = isValueLabel ? valueLabelStyle : sliceLabelStyle;
          const color = isValueLabel ? valueLabelColor : sliceLabelColor;
          const gradient = isValueLabel ? valueLabelGradient : sliceLabelGradient;
          await renderEnhancedText(ctx, line, 0, startY + lineIndex * lineHeight, style, fontSize, color, gradient);
        }
      }

      ctx.restore();
    }
  }

  if (connectedLegendConfig) {
    drawConnectedLegend(
      ctx,
      legendEntries,
      sliceAngles,
      centerX,
      centerY,
      radius,
      innerRadius,
      connectedLegendConfig
    );
  }

  if (standardLegendConfig) {

    await drawStandardLegend(
      ctx,
      legendEntries,
      standardLegendConfig,
      adjustedWidth,
      adjustedHeight,
      { top: paddingTop, right: paddingRight, bottom: paddingBottom, left: paddingLeft },
      { left: chartAreaLeft, right: chartAreaRight, top: chartAreaTop, bottom: chartAreaBottom },
      legendGap,
      titleHeight
    );
  }

  return canvas.toBuffer('image/png');
}

