import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";

/**
 * Pie slice data
 */
export interface PieSlice {
  label: string;
  value: number;
  color?: string; // Solid color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for slice (overrides color)
  showValue?: boolean; // Show/hide value label on slice (default: true)
  showLabel?: boolean; // Show/hide slice label on slice (default: false)
  valueLabel?: string; // Custom value label (default: auto-generated from value and percentage)
  opacity?: number; // Slice opacity (0-1, default: 1)
  shadow?: {
    color?: string; // Shadow color
    offsetX?: number; // Shadow X offset
    offsetY?: number; // Shadow Y offset
    blur?: number; // Shadow blur radius
  };
  stroke?: {
    color?: string; // Stroke color
    width?: number; // Stroke width
    gradient?: gradient; // Stroke gradient (overrides color)
  };
}

/**
 * Legend entry interface
 */
export interface LegendEntry {
  color?: string; // Solid color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for legend box (overrides color)
  label: string;
}

/**
 * Enhanced text styling for chart labels
 */
export interface EnhancedTextStyle {
  fontPath?: string; // Path to custom font file
  fontName?: string; // Custom font name
  fontFamily?: string; // Font family (e.g., 'Arial', 'Helvetica')
  fontSize?: number; // Font size (can override default)
  bold?: boolean; // Make text bold
  italic?: boolean; // Make text italic
  shadow?: {
    color?: string; // Shadow color
    offsetX?: number; // Shadow X offset
    offsetY?: number; // Shadow Y offset
    blur?: number; // Shadow blur radius
    opacity?: number; // Shadow opacity (0-1)
  };
  stroke?: {
    color?: string; // Stroke color
    width?: number; // Stroke width
    gradient?: gradient; // Stroke gradient (overrides color)
  };
  glow?: {
    color?: string; // Glow color
    intensity?: number; // Glow intensity
    opacity?: number; // Glow opacity (0-1)
  };
}

/**
 * Standard legend configuration (Type 1)
 */
export interface StandardLegendConfig {
  show?: boolean; // Show/hide standard legend (default: false)
  position?: 'top' | 'bottom' | 'left' | 'right'; // Legend position (default: 'right')
  fontSize?: number; // Font size for legend text (default: 12)
  backgroundColor?: string; // Background color of legend container (default: 'rgba(255, 255, 255, 0.9)')
  backgroundGradient?: gradient; // Background gradient (overrides backgroundColor)
  borderColor?: string; // Border color of legend container (default: '#000000')
  textColor?: string; // Text color (default: '#000000')
  textGradient?: gradient; // Text gradient (overrides textColor)
  textStyle?: EnhancedTextStyle; // Enhanced text styling
  spacing?: number; // Spacing between legend items (default: 15)
  padding?: number; // Padding inside legend container (default: 8)
  maxWidth?: number; // Maximum width of legend container (default: undefined, auto-calculated)
  wrapText?: boolean; // Enable text wrapping (default: true)
}

/**
 * Connected legend configuration (Type 2 - for pie charts)
 */
export interface ConnectedLegendConfig {
  show?: boolean; // Show/hide connected legend (default: false)
  fontSize?: number; // Font size for labels (default: 12)
  backgroundColor?: string; // Background color of label boxes (default: 'rgba(255, 255, 255, 0.9)')
  backgroundGradient?: gradient; // Background gradient (overrides backgroundColor)
  borderColor?: string; // Border color of label boxes (default: '#000000')
  textColor?: string; // Text color (default: '#000000')
  textGradient?: gradient; // Text gradient (overrides textColor)
  textStyle?: EnhancedTextStyle; // Enhanced text styling
  lineColor?: string; // Color of connecting lines (default: '#000000')
  lineGradient?: gradient; // Line gradient (overrides lineColor)
  lineWidth?: number; // Width of connecting lines (default: 1)
  padding?: number; // Padding inside label boxes (default: 5)
  maxWidth?: number; // Maximum width of label boxes (default: 150)
  wrapText?: boolean; // Enable text wrapping (default: true)
}

/**
 * Pie chart configuration
 */
export interface PieChartOptions {
  // Dimensions
  dimensions?: {
    width?: number; // Canvas width (default: 800)
    height?: number; // Canvas height (default: 600)
    padding?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };
  
  // Appearance
  appearance?: {
    backgroundColor?: string; // Background color (overridden by gradient/image if provided)
    backgroundGradient?: gradient; // Background gradient (overrides backgroundColor)
    backgroundImage?: string; // Path to local image file (overrides gradient/color)
  };
  
  // Chart type
  type?: 'pie' | 'donut'; // Chart type (default: 'pie')
  donutInnerRadius?: number; // Inner radius ratio for donut (0-1, default: 0.6)
  
  // Labels
  labels?: {
    title?: {
      text?: string;
      fontSize?: number;
      color?: string; // Text color (overridden by gradient if provided)
      gradient?: gradient; // Text gradient (overrides color)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    sliceLabels?: {
      fontSize?: number; // Font size for slice labels (default: 14)
      color?: string; // Text color (overridden by gradient if provided)
      gradient?: gradient; // Text gradient (overrides color)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    valueLabels?: {
      fontSize?: number; // Font size for value labels (default: 11 for small slices, 14 for normal)
      color?: string; // Text color (overridden by gradient if provided)
      gradient?: gradient; // Text gradient (overrides color)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    showValues?: boolean; // Show/hide value labels on slices (default: true)
    showLabels?: boolean; // Show/hide slice labels on slices (default: false)
    valueFormat?: (value: number, percentage: number) => string; // Custom value formatter (default: shows both value and percentage)
  };
  
  // Legends
  legends?: {
    standard?: StandardLegendConfig; // Type 1: Standard legend
    connected?: ConnectedLegendConfig; // Type 2: Connected legend (labels with lines)
  };
  
  // Slice styling
  slices?: {
    // Global slice styling (can be overridden per slice)
    opacity?: number; // Default slice opacity (0-1, default: 1)
    shadow?: {
      color?: string; // Default shadow color
      offsetX?: number; // Default shadow X offset
      offsetY?: number; // Default shadow Y offset
      blur?: number; // Default shadow blur radius
    };
    stroke?: {
      color?: string; // Default stroke color
      width?: number; // Default stroke width
      gradient?: gradient; // Default stroke gradient (overrides color)
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
  
  // Preserve text alignment settings
  const savedTextAlign = ctx.textAlign;
  const savedTextBaseline = ctx.textBaseline;
  
  const effectiveFontSize = fontSize || style?.fontSize || 16;
  const fontFamily = style?.fontFamily || style?.fontName || 'Arial';
  let fontString = '';
  
  if (style?.bold) fontString += 'bold ';
  if (style?.italic) fontString += 'italic ';
  fontString += `${effectiveFontSize}px "${fontFamily}"`;
  
  ctx.font = fontString;
  
  // Restore text alignment to ensure correct positioning
  ctx.textAlign = savedTextAlign;
  ctx.textBaseline = savedTextBaseline;
  
  // Register custom font if provided
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
  
  // Apply shadow
  if (style?.shadow) {
    ctx.shadowColor = style.shadow.color || 'rgba(0,0,0,0.5)';
    ctx.shadowOffsetX = style.shadow.offsetX || 2;
    ctx.shadowOffsetY = style.shadow.offsetY || 2;
    ctx.shadowBlur = style.shadow.blur || 4;
    if (style.shadow.opacity !== undefined) {
      ctx.globalAlpha = style.shadow.opacity;
    }
  }
  
  // Set fill style (gradient or color)
  if (textGradient) {
    const metrics = ctx.measureText(text);
    ctx.fillStyle = createGradientFill(ctx, textGradient, {
      x, y, w: metrics.width, h: effectiveFontSize
    }) as any;
  } else if (color) {
    ctx.fillStyle = color;
  }
  
  // Draw text
  ctx.fillText(text, x, y);
  
  // Apply stroke
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
  
  // Reset shadow and alpha
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
  // Create a temporary canvas to measure text
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${fontSize}px Arial`;
  
  // Box size scales with font size for better proportions
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
      textHeight = wrappedLines.length * fontSize * 1.2; // Line height multiplier
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
  
  const fontSize = config.fontSize ?? 16; // Increased default from 12 to 16
  const spacing = config.spacing ?? 18; // Increased default spacing
  const paddingBox = config.padding ?? 10; // Increased default padding
  const backgroundColor = config.backgroundColor ?? 'rgba(255, 255, 255, 0.9)';
  const borderColor = config.borderColor ?? '#000000';
  const textColor = config.textColor ?? '#000000';
  const maxWidth = config.maxWidth;
  const wrapTextEnabled = config.wrapText !== false;
  
  ctx.font = `${fontSize}px Arial`;
  
  // Calculate dimensions
  const { width, height, entryHeights } = calculateStandardLegendDimensions(
    entries,
    fontSize,
    spacing,
    paddingBox,
    maxWidth
  );
  
  // Determine position - position relative to chart area if provided, otherwise use canvas edges
  let legendX: number, legendY: number;
  const position = config.position ?? 'right';
  const gap = legendSpacing ?? 20;
  
  if (chartArea) {
    // Position relative to chart area for better spacing
    switch (position) {
      case 'top':
        legendX = (canvasWidth - width) / 2;
        // Position legend below title if title exists
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
    // Fallback to original positioning
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
  
  // Draw legend background with gradient or color
  if (config.backgroundGradient) {
    fillWithGradientOrColor(ctx, config.backgroundGradient, backgroundColor, backgroundColor, {
      x: legendX, y: legendY, w: width, h: height
    });
    ctx.fillRect(legendX, legendY, width, height);
  } else {
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(legendX, legendY, width, height);
  }
  
  // Draw legend border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, width, height);
  
  // Draw legend entries
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  // Box size scales with font size for better proportions
  const boxSize = Math.max(18, fontSize * 1.2);
  const textSpacing = 12;
  const effectiveMaxWidth = maxWidth ? maxWidth - paddingBox * 2 - boxSize - textSpacing : undefined;
  
  let currentY = legendY + paddingBox;
  
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const entryHeight = entryHeights[index];
    const centerY = currentY + entryHeight / 2;
    
    // Draw color box with gradient or color
    if (entry.gradient) {
      fillWithGradientOrColor(ctx, entry.gradient, entry.color, '#000000', {
        x: legendX + paddingBox, y: centerY - boxSize / 2, w: boxSize, h: boxSize
      });
    ctx.fillRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    } else {
      ctx.fillStyle = entry.color || '#000000';
      ctx.fillRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    }
    
    // Draw box border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + paddingBox, centerY - boxSize / 2, boxSize, boxSize);
    
    // Draw label with enhanced styling
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
  
  // Calculate midpoint angles for each slice
  const midAngles = sliceAngles.map(slice => (slice.startAngle + slice.endAngle) / 2);
  
  // Calculate label positions with overlap detection
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
    const labelRadius = radius + 20; // Distance from pie edge to label
    const labelX = centerX + Math.cos(angle) * labelRadius;
    const labelY = centerY + Math.sin(angle) * labelRadius;
    
    // Determine label position (left or right of pie)
    const isLeftSide = Math.cos(angle) < 0;
    
    // Calculate text dimensions with wrapping
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
    
    // Check for overlaps with previous labels and adjust position
    const minSpacing = 5;
    for (const prevPos of labelPositions) {
      const overlapX = !(labelBoxX + boxWidth < prevPos.boxX || labelBoxX > prevPos.boxX + prevPos.boxWidth);
      const overlapY = !(labelBoxY + boxHeight / 2 < prevPos.boxY - prevPos.boxHeight / 2 || labelBoxY - boxHeight / 2 > prevPos.boxY + prevPos.boxHeight / 2);
      
      if (overlapX && overlapY) {
        // Adjust vertically to avoid overlap
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
  
  // Draw labels
  entries.forEach((entry, index) => {
    if (index >= labelPositions.length) return;
    
    const pos = labelPositions[index];
    const angle = pos.angle;
    
    // Calculate text dimensions with wrapping
    const textMaxWidth = maxWidth - padding * 2;
    let wrappedLines: string[];
    
    if (wrapTextEnabled) {
      wrappedLines = wrapText(ctx, entry.label, textMaxWidth);
    } else {
      wrappedLines = [entry.label];
    }
    
    // Draw connecting line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    
    // Calculate line start point (on pie edge)
    const lineStartX = centerX + Math.cos(angle) * radius;
    const lineStartY = centerY + Math.sin(angle) * radius;
    
    // Calculate line end point (at label box edge)
    const lineEndX = pos.isLeftSide ? pos.boxX + pos.boxWidth : pos.boxX;
    const lineEndY = pos.boxY;
    
    ctx.moveTo(lineStartX, lineStartY);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();
    
    // Draw label box background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(pos.boxX, pos.boxY - pos.boxHeight / 2, pos.boxWidth, pos.boxHeight);
    
    // Draw label box border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(pos.boxX, pos.boxY - pos.boxHeight / 2, pos.boxWidth, pos.boxHeight);
    
    // Draw label text
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
  // Extract options with defaults
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
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24; // Increased default like Chart.js
  const chartTitleColor = options.labels?.title?.color ?? '#000000';
  
  // Calculate title height to account for it in layout
  const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0; // Font size + spacing
  const showValues = options.labels?.showValues ?? true;
  const showLabels = options.labels?.showLabels ?? false;
  const valueFormatter = options.labels?.valueFormat;
  
  const standardLegendConfig = options.legends?.standard;
  const connectedLegendConfig = options.legends?.connected;
  
  const globalSliceOpacity = options.slices?.opacity;
  const globalSliceShadow = options.slices?.shadow;
  const globalSliceStroke = options.slices?.stroke;
  
  // Calculate total value
  const total = data.reduce((sum, slice) => sum + slice.value, 0);
  if (total === 0) {
    throw new Error('Pie Chart Error: Total value of all slices must be greater than 0');
  }
  
  // Create temporary canvas to calculate legend dimensions
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  
  // Calculate legend dimensions BEFORE drawing to reserve proper space
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
  
  // Calculate standard legend dimensions
  if (standardLegendConfig?.show && legendEntries.length > 0) {
    const legendFontSize = standardLegendConfig.fontSize ?? 16; // Increased default
    const legendSpacing = standardLegendConfig.spacing ?? 18; // Increased default
    const legendPadding = standardLegendConfig.padding ?? 10; // Increased default
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
  
  // Calculate connected legend space needed (approximate based on max label width)
  if (connectedLegendConfig?.show && legendEntries.length > 0) {
    const connectedFontSize = connectedLegendConfig.fontSize ?? 12;
    const connectedMaxWidth = connectedLegendConfig.maxWidth ?? 150;
    const connectedPadding = connectedLegendConfig.padding ?? 5;
    
    tempCtx.font = `${connectedFontSize}px Arial`;
    const maxLabelWidth = Math.max(...legendEntries.map(e => tempCtx.measureText(e.label).width));
    const boxWidth = Math.min(connectedMaxWidth, maxLabelWidth + connectedPadding * 2);
    const boxHeight = connectedFontSize + connectedPadding * 2;
    
    // Connected labels extend from pie edge, so we need space around the pie
    // Estimate: labels can extend up to boxWidth from pie edge, plus some margin
    connectedLegendSpace.left = boxWidth + 30;
    connectedLegendSpace.right = boxWidth + 30;
    connectedLegendSpace.top = boxHeight / 2 + 20;
    connectedLegendSpace.bottom = boxHeight / 2 + 20;
  }
  
  // Calculate chart area - DO NOT shrink, add width/height for legends instead
  const standardLegendPosition = standardLegendConfig?.position ?? 'right';
  const legendGap = 20;
  
  // Calculate how much extra space we need for legends
  let extraWidth = 0;
  let extraHeight = 0;
  
  // Add extra width/height for standard legend instead of shrinking
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
  
  // Add extra space for connected legend
  extraWidth = Math.max(extraWidth, connectedLegendSpace.left, connectedLegendSpace.right);
  extraHeight = Math.max(extraHeight, connectedLegendSpace.top, connectedLegendSpace.bottom);
  
  // Adjust canvas dimensions to accommodate legends
  const adjustedWidth = width + extraWidth;
  const adjustedHeight = height + extraHeight;
  
  // Calculate chart area - reposition chart based on legend position
  let chartAreaLeft = paddingLeft;
  let chartAreaRight = width - paddingRight;
  let chartAreaTop = paddingTop + titleHeight; // Account for title
  let chartAreaBottom = height - paddingBottom;
  
  // Reposition chart based on legend position
  if (standardLegendConfig?.show) {
    if (standardLegendPosition === 'left') {
      // Legend left → Chart shifts right
      chartAreaLeft = paddingLeft + standardLegendWidth + legendGap;
      chartAreaRight = adjustedWidth - paddingRight;
    } else if (standardLegendPosition === 'right') {
      // Legend right → Chart shifts left (stays in original position, legend goes to right)
      chartAreaLeft = paddingLeft;
      chartAreaRight = width - paddingRight; // Keep original right edge
    } else if (standardLegendPosition === 'top') {
      // Legend top → Chart shifts down
      chartAreaTop = paddingTop + titleHeight + standardLegendHeight + legendGap;
      chartAreaBottom = adjustedHeight - paddingBottom;
    } else if (standardLegendPosition === 'bottom') {
      // Legend bottom → Chart shifts up
      chartAreaTop = paddingTop + titleHeight;
      chartAreaBottom = height - paddingBottom; // Keep original bottom edge
    }
  }
  
  // Create canvas with adjusted dimensions
  const canvas = createCanvas(adjustedWidth, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');
  
  // Fill background with gradient, color, or image
  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      ctx.drawImage(bgImage, 0, 0, adjustedWidth, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);
      // Fallback to gradient or color
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
  
  // Draw chart title with enhanced styling
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
    // Set alignment for title
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.restore();
  }
  
    // Calculate pie center and radius
  const chartAreaWidth = chartAreaRight - chartAreaLeft;
  const chartAreaHeight = chartAreaBottom - chartAreaTop;
  // Chart.js approach: maxRadius = min(width, height) / 2, then use 100% of that
  const maxRadius = Math.max(Math.min(chartAreaWidth, chartAreaHeight) / 2, 0);
  const radius = maxRadius; // Use 100% of available space (Chart.js default)
  const centerX = chartAreaLeft + chartAreaWidth / 2;
  const centerY = chartAreaTop + chartAreaHeight / 2;
  const innerRadius = chartType === 'donut' ? radius * donutInnerRadiusRatio : 0;
  
  // Calculate slice angles
  let currentAngle = -Math.PI / 2; // Start at top
  const sliceAngles: { startAngle: number; endAngle: number }[] = [];
  
  data.forEach(slice => {
    const sliceAngle = (slice.value / total) * Math.PI * 2;
    sliceAngles.push({
      startAngle: currentAngle,
      endAngle: currentAngle + sliceAngle
    });
    currentAngle += sliceAngle;
  });
  
  // Draw pie slices
  const defaultColors = ['#4A90E2', '#50C878', '#FF6B6B', '#FFA500', '#9B59B6', '#F39C12', '#1ABC9C', '#E74C3C'];
  
  for (let index = 0; index < data.length; index++) {
    const slice = data[index];
    const defaultColor = slice.color || defaultColors[index % defaultColors.length];
    const angles = sliceAngles[index];
    
    // Draw slice with gradient, opacity, shadow, and stroke support
    ctx.save();
    
    // Apply opacity
    const effectiveOpacity = slice.opacity ?? globalSliceOpacity;
    if (effectiveOpacity !== undefined) {
      ctx.globalAlpha = effectiveOpacity;
    }
    
    // Apply shadow (slice shadow takes precedence over global)
    const effectiveShadow = slice.shadow || globalSliceShadow;
    if (effectiveShadow) {
      ctx.shadowColor = effectiveShadow.color || 'rgba(0,0,0,0.3)';
      ctx.shadowOffsetX = effectiveShadow.offsetX ?? 2;
      ctx.shadowOffsetY = effectiveShadow.offsetY ?? 2;
      ctx.shadowBlur = effectiveShadow.blur ?? 4;
    }
    
    ctx.beginPath();
    
    if (chartType === 'donut') {
      // Draw donut slice: outer arc -> line to inner -> inner arc (reverse) -> line back
      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      ctx.lineTo(centerX + Math.cos(angles.endAngle) * innerRadius, centerY + Math.sin(angles.endAngle) * innerRadius);
      ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      ctx.closePath();
    } else {
      // Draw pie slice: center -> outer arc -> back to center
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      ctx.closePath();
    }
    
    // Fill with gradient or color
    if (slice.gradient) {
      // Calculate bounding box for gradient
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
    
    // Reset shadow before stroke
    if (effectiveShadow) {
      ctx.shadowColor = 'transparent';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
    }
    
    // Draw slice border/stroke (slice stroke takes precedence over global)
    const effectiveStroke = slice.stroke || globalSliceStroke;
    if (effectiveStroke && effectiveStroke.width && effectiveStroke.width > 0) {
      ctx.beginPath();
      // Outer arc
      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      if (chartType === 'donut') {
        // Inner arc (reverse direction for donut)
        ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      } else {
        // Line back to center for pie
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
      // Default border if no stroke specified (backward compatibility)
      ctx.beginPath();
      // Outer arc
      ctx.arc(centerX, centerY, radius, angles.startAngle, angles.endAngle);
      if (chartType === 'donut') {
        // Inner arc (reverse direction for donut)
        ctx.arc(centerX, centerY, innerRadius, angles.endAngle, angles.startAngle, true);
      } else {
        // Line back to center for pie
        ctx.lineTo(centerX, centerY);
      }
      ctx.closePath();
      ctx.strokeStyle = '#FFFFFF'; // Chart.js default: white borders
      ctx.lineWidth = 2; // Chart.js default: 2px
      ctx.lineJoin = 'bevel';
      ctx.stroke();
    }
    
    ctx.restore();
    
    // Draw labels on slice if enabled
    const percentage = (slice.value / total) * 100;
    const sliceAngle = angles.endAngle - angles.startAngle;
    const midAngle = (angles.startAngle + angles.endAngle) / 2;
    
    // Build label text lines
    const labelLines: string[] = [];
    
    // Add slice label if enabled
    if ((showLabels || slice.showLabel) && (slice.showLabel !== false)) {
      labelLines.push(slice.label);
    }
    
    // Add value label if enabled (default format: "value percentage%" or custom format)
    if (showValues && (slice.showValue !== false)) {
      const valueText = slice.valueLabel || (valueFormatter ? valueFormatter(slice.value, percentage) : `${slice.value} ${percentage.toFixed(1)}%`);
      labelLines.push(valueText);
    }
    
    // Draw labels - for small slices, position outside the slice edge
    if (labelLines.length > 0) {
      ctx.save();
      
      // Determine if slice is small (less than 5% or very narrow angle)
      const isSmallSlice = percentage < 5 || sliceAngle < 0.15; // ~8.6 degrees
      
      let labelRadius: number;
      let fontSize: number;
      
      if (isSmallSlice) {
        // For small slices: position labels OUTSIDE the slice edge (like wheel of fortune)
        // Position text just outside the outer edge of the pie
        labelRadius = radius + 15; // Outside the pie edge with some spacing
        fontSize = 12; // Smaller font for external labels
      } else {
        // For normal slices: position labels inside the slice
        labelRadius = chartType === 'donut' ? (radius + innerRadius) / 2 : radius * 0.7;
        fontSize = 14;
      }
      
      const labelX = centerX + Math.cos(midAngle) * labelRadius;
      const labelY = centerY + Math.sin(midAngle) * labelRadius;
      
      const lineHeight = fontSize;
      
      // Rotate context to make text vertical (perpendicular to radius)
      // Text is rotated vertically along the slice's angle direction
      ctx.translate(labelX, labelY);
      ctx.rotate(midAngle + Math.PI / 2); // Rotate 90 degrees to make text vertical
      
      // Get label styling options
      const sliceLabelStyle = options.labels?.sliceLabels?.textStyle;
      const sliceLabelColor = options.labels?.sliceLabels?.color || '#000000';
      const sliceLabelGradient = options.labels?.sliceLabels?.gradient;
      const valueLabelStyle = options.labels?.valueLabels?.textStyle;
      const valueLabelColor = options.labels?.valueLabels?.color || '#000000';
      const valueLabelGradient = options.labels?.valueLabels?.gradient;
      
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw multiple lines if both label and value are shown
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
  
  // Draw connected legend (Type 2) - must be drawn after slices but before standard legend
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
  
  // Draw standard legend (Type 1)
  if (standardLegendConfig) {
    // Pass title height so legend can position correctly when at top
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

