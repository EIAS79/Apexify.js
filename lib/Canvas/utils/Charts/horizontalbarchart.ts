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
 * Interface for a single bar segment (used in grouped/stacked charts)
 */
export interface HorizontalBarSegment {
  value: number; // Bar value (determines bar length on X-axis)
  color?: string; // Bar color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for bar segment (overrides color)
  label?: string; // Optional label for this segment
  valueColor?: string; // Individual bar value text color
  showValue?: boolean; // Show/hide value for this specific segment
}

/**
 * Interface for horizontal bar chart data
 */
export interface HorizontalBarChartData {
  label: string; // Category label (displayed on Y-axis)
  // Standard chart: use value
  value?: number; // Bar value (for standard charts)
  // Grouped/stacked charts: use values array
  values?: HorizontalBarSegment[]; // Array of values for grouped/stacked charts
  xStart?: number; // X-axis start position (optional, for value range on X-axis - like xStart in standard chart)
  xEnd?: number; // X-axis end position (optional, for value range on X-axis - like xEnd in standard chart)
  yStart?: number; // Y-axis start position (optional, for custom positioning)
  yEnd?: number; // Y-axis end position (optional, for custom positioning)
  color?: string; // Bar color (for standard charts, or default for grouped/stacked) (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for bar (overrides color)
  labelColor?: string; // Label text color
  labelPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom'; // Individual bar label position
  valueColor?: string; // Individual bar value text color (for standard charts)
  showValue?: boolean; // Show/hide value for this specific bar (for standard charts)
}

/**
 * Interface for legend entry
 */
export interface LegendEntry {
  color?: string; // Legend box color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for legend box (overrides color)
  label: string;
}

/**
 * Axis configuration for horizontal bar chart
 */
export interface HorizontalAxisConfig {
  label?: string; // Axis name/label
  labelColor?: string; // Color of axis label
  range?: {
    min?: number;
    max?: number;
    step?: number;
  };
  values?: number[]; // Custom tick values array
  color?: string; // Axis line color
  width?: number; // Axis line width
  tickFontSize?: number; // Font size for tick labels
  valueSpacing?: number; // Pixel spacing between each tick value
}

/**
 * Horizontal bar chart configuration - organized by category
 */
export interface HorizontalBarChartOptions {
  // Chart type
  type?: HorizontalBarChartType; // 'standard' | 'grouped' | 'stacked' (default: 'standard')
  
  // Dimensions
  dimensions?: {
    width?: number; // Fixed width (default: 800)
    height?: number; // Calculated responsively based on number of bars
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
    axisColor?: string; // Default axis color
    axisWidth?: number; // Default axis width
    arrowSize?: number; // Size of axis arrows
  };
  
  // Axes Configuration
  axes?: {
    x?: HorizontalAxisConfig & {
      baseline?: number; // Custom baseline value (default: 0). Bars extend left/right of this value
    }; // X-axis (value axis - horizontal)
    y?: HorizontalAxisConfig; // Y-axis (category axis - vertical)
  };
  
  // Labels & Text
  labels?: {
    title?: {
      text?: string;
      fontSize?: number; // Default: 24
      color?: string; // Text color (overridden by gradient if provided)
      gradient?: gradient; // Text gradient (overrides color)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    barLabelDefaults?: {
      show?: boolean; // Show/hide all bar labels globally (default: true)
      defaultPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom'; // Default position
      fontSize?: number; // Font size for all bar labels (default: 14)
      defaultColor?: string; // Default text color
      gradient?: gradient; // Text gradient (overrides defaultColor)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    valueLabelDefaults?: {
      show?: boolean; // Show/hide all value labels globally (default: true)
      fontSize?: number; // Font size for all value labels (default: 12)
      defaultColor?: string; // Default text color
      gradient?: gradient; // Text gradient (overrides defaultColor)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
  };
  
  // Legend
  legend?: {
    show?: boolean; // Show/hide legend (default: false)
    entries?: LegendEntry[]; // Legend entries
    position?: 'top' | 'bottom' | 'left' | 'right'; // Legend position (default: 'right')
    spacing?: number; // Extra spacing/margin from chart edges (default: 20)
    fontSize?: number; // Font size for legend text (default: 16)
    backgroundColor?: string; // Background color of legend container (default: 'rgba(255, 255, 255, 0.9)') (overridden by gradient if provided)
    backgroundGradient?: gradient; // Background gradient (overrides backgroundColor)
    borderColor?: string; // Border color of legend container (default: '#000000')
    textColor?: string; // Text color (default: '#000000') (overridden by gradient if provided)
    textGradient?: gradient; // Text gradient (overrides textColor)
    textStyle?: EnhancedTextStyle; // Enhanced text styling
    padding?: number; // Padding inside legend container (default: 8)
    maxWidth?: number; // Maximum width of legend container (default: undefined, auto-calculated)
    wrapText?: boolean; // Enable text wrapping (default: true)
  };
  
  // Grid
  grid?: {
    show?: boolean; // Show/hide grid lines (default: false)
    color?: string; // Grid line color (default: '#E0E0E0')
    width?: number; // Grid line width (default: 1)
  };
  
  // Bar styling
  bars?: {
    spacing?: number; // Spacing between bars (default: calculated automatically)
    minHeight?: number; // Minimum bar height (default: 30)
    groupSpacing?: number; // Spacing between groups in grouped charts (default: 10)
    segmentSpacing?: number; // Spacing between segments in grouped charts (default: 2)
    lineWidth?: number; // Line width for lollipop charts (default: 2)
    dotSize?: number; // Dot/circle size for lollipop charts (default: 8)
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
  valueSpacing?: number
): void {
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.font = `${tickFontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  
  const chartWidth = axisEndX - originX;
  
  if (customValues && customValues.length > 0) {
    // Position labels based on their actual values, not pixel spacing
    const actualMin = Math.min(...customValues);
    const actualMax = Math.max(...customValues);
    const range = actualMax - actualMin || 1; // Avoid division by zero
    
    let lastLabelX = -Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40; // Use valueSpacing as min spacing if provided
    
    customValues.forEach((value) => {
      const x = originX + ((value - actualMin) / range) * chartWidth;
      const labelText = value.toString();
      
      // Check if this label would overlap with the previous one
      if (x - lastLabelX < minLabelSpacing && value > actualMin) {
        // Skip this label to prevent overlap (but still draw tick mark)
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
      ctx.fillText(labelText, x, originY + 10);
      
      lastLabelX = x; // Update last label center position
    });
  } else {
    // Range-based positioning - always position based on values, use valueSpacing only for label density
    const range = maxValue - minValue || 1; // Avoid division by zero
      
      // Calculate all tick positions first
      const tickValues: number[] = [];
      for (let value = minValue; value <= maxValue; value += step) {
        tickValues.push(value);
      }
      
      // Draw ticks, but skip labels if they're too close together
      let lastLabelX = -Infinity;
      const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 40; // Use valueSpacing as min spacing if provided
      
      for (const value of tickValues) {
        const x = originX + ((value - minValue) / range) * chartWidth;
        const labelText = value.toString();
        
        // Check if this label center is too close to the previous label center
        if (x - lastLabelX < minLabelSpacing && value > minValue) {
          // Skip this label to prevent overlap - but still draw the tick mark
          ctx.beginPath();
          ctx.moveTo(x, originY);
          ctx.lineTo(x, originY + 5);
          ctx.stroke();
          continue;
        }
        
        // Draw tick mark
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();
        
        // Draw label
        ctx.fillText(labelText, x, originY + 10);
        
        // Update last label position (center of the label)
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
  valueSpacing?: number
): void {
  ctx.save();
  ctx.fillStyle = '#000000';
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
      // Position based on value range
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
    // Range-based positioning
    const range = maxValue - minValue || 1;
    let lastLabelY = Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30; // Vertical spacing
    
    for (let value = minValue; value <= maxValue; value += step) {
      const y = originY - ((value - minValue) / range) * chartHeight;
      const labelText = value.toString();
      
      // Check if this label would overlap with the previous one
      if (lastLabelY - y < minLabelSpacing && value > minValue) {
        // Skip this label to prevent overlap - but still draw the tick mark
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
      
      lastLabelY = y; // Update last label position
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
  
  // Draw vertical grid lines (based on X-axis values)
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
  
  // Draw horizontal grid lines (based on Y-axis values/range)
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
  
  // Create a temporary canvas to measure text
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
  
  // Determine colors
  const isDarkBackground = backgroundColor === '#000000' || backgroundColor.toLowerCase() === 'black';
  const effectiveTextColor = textColor ?? (isDarkBackground ? '#FFFFFF' : '#000000');
  const effectiveBgColor = isDarkBackground ? 'rgba(0, 0, 0, 0.8)' : (backgroundColor.startsWith('rgba') || backgroundColor.startsWith('rgb') ? backgroundColor : 'rgba(255, 255, 255, 0.9)');
  const effectiveBorderColor = borderColor ?? (isDarkBackground ? '#FFFFFF' : '#000000');
  
  // Calculate dimensions with text wrapping support
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
  
  // Draw legend background (gradient or color)
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
    
    // Draw color box (gradient or color)
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
  const barSpacing = options.bars?.spacing ?? 15; // Use same default spacing
  
  // Calculate minimum height needed: (number of bars * bar height) + (spacing between bars)
  // Each bar needs minBarHeight, and between each pair of bars we need barSpacing
  const chartAreaHeight = dataLength * minBarHeight + (dataLength - 1) * barSpacing;
  
  // Add title height if needed
  const titleHeight = options.labels?.title?.text ? (options.labels.title.fontSize ?? 24) + 30 : 0;
  const axisLabelHeight = ((options.axes?.x?.label || options.axes?.y?.label) ? (options.labels?.barLabelDefaults?.fontSize ?? 14) + 20 : 0);
  
  return paddingTop + titleHeight + chartAreaHeight + axisLabelHeight + paddingBottom;
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
  // Extract and map organized config to internal variables
  let width = options.dimensions?.width ?? 800;
  const padding = options.dimensions?.padding || {};
  
  // Appearance
  const backgroundColor = options.appearance?.backgroundColor ?? '#FFFFFF';
  const backgroundGradient = options.appearance?.backgroundGradient;
  const backgroundImage = options.appearance?.backgroundImage;
  const axisColor = options.appearance?.axisColor ?? options.axes?.x?.color ?? options.axes?.y?.color ?? '#000000';
  const axisWidth = options.appearance?.axisWidth ?? options.axes?.x?.width ?? options.axes?.y?.width ?? 2;
  const arrowSize = options.appearance?.arrowSize ?? 10;
  
  // Labels
  const chartTitle = options.labels?.title?.text;
  const chartTitleFontSize = options.labels?.title?.fontSize ?? 24;
  const showBarLabels = options.labels?.barLabelDefaults?.show ?? true;
  const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'left';
  const axisLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
  const showValues = options.labels?.valueLabelDefaults?.show ?? true;
  const valueFontSize = options.labels?.valueLabelDefaults?.fontSize ?? 12;
  const valueColor = options.labels?.valueLabelDefaults?.defaultColor ?? '#000000';
  
  // Axes
  const xAxisLabel = options.axes?.x?.label;
  const yAxisLabel = options.axes?.y?.label;
  const axisLabelColor = options.axes?.x?.labelColor ?? options.axes?.y?.labelColor ?? '#000000';
  const xAxisRange = options.axes?.x?.range;
  const xAxisValues = options.axes?.x?.values;
  const baseline = options.axes?.x?.baseline ?? 0; // Custom baseline value (default: 0)
  const yAxisValues = options.axes?.y?.values;
  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const xAxisValueSpacing = options.axes?.x?.valueSpacing;
  const yAxisValueSpacing = options.axes?.y?.valueSpacing;
  
  // Legend
  const showLegend = options.legend?.show ?? false;
  const legend = options.legend?.entries;
  const legendPosition = options.legend?.position ?? 'right'; // Default: right
  
  // Grid
  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;
  
  // Chart type
  const chartType = options.type ?? 'standard';
  
  // Bars
  const minBarHeight = options.bars?.minHeight ?? 30;
  const barSpacing = options.bars?.spacing;
  const groupSpacing = options.bars?.groupSpacing ?? 10;
  const segmentSpacing = options.bars?.segmentSpacing ?? 2;
  const lollipopLineWidth = options.bars?.lineWidth ?? 2; // Line width for lollipop charts (default: 2)
  const lollipopDotSize = options.bars?.dotSize ?? 8; // Dot/circle size for lollipop charts (default: 8)
  
  const paddingTop = padding.top ?? 60;
  const paddingRight = padding.right ?? 80;
  const paddingBottom = padding.bottom ?? 80;
  const paddingLeft = padding.left ?? 100;
  
  // Calculate responsive height based on number of bars
  let baseHeight = calculateResponsiveHeight(data.length, options);
  
  // Calculate legend dimensions and adjust canvas size based on legend position
  let legendWidth = 0;
  let legendHeight = 0;
  let extraWidth = 0;
  let extraHeight = 0;
  const minLegendSpacing = 10; // Minimum spacing from chart area
  if (showLegend && legend && legend.length > 0) {
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    const legendPadding = options.legend?.padding;
    const legendDims = calculateLegendDimensions(legend, axisLabelFontSize, legendMaxWidth, legendWrapText, legendPadding);
    legendWidth = legendDims.width;
    legendHeight = legendDims.height;
    
    const legendSpacing = options.legend?.spacing ?? 20;
    
    // Adjust canvas dimensions based on legend position
    // For left position, add extra space for Y-axis labels and bar labels
    if (legendPosition === 'left') {
      // Estimate Y-axis label width: measure potential category labels or numeric values
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      let estimatedYAxisLabelWidth = 80; // Default estimate (category labels can be longer)
      if (tempCtx) {
        // Check if bar labels are on the left (they act as Y-axis labels)
        const barLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
        const showBarLabels = options.labels?.barLabelDefaults?.show ?? true;
        const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'left';
        
        const hasLeftLabels = showBarLabels && (barLabelPosition === 'left' || 
          data.some(item => (item.labelPosition ?? barLabelPosition) === 'left'));
        
        if (hasLeftLabels) {
          // Measure category labels (bar labels) which are typically longer
          tempCtx.font = `${barLabelFontSize}px Arial`;
          data.forEach(d => {
            const labelWidth = tempCtx.measureText(d.label).width;
            estimatedYAxisLabelWidth = Math.max(estimatedYAxisLabelWidth, labelWidth);
          });
          // Add padding: 5px (label offset from originX) + 10px (spacing) = 15px total
          estimatedYAxisLabelWidth += 15;
        } else {
          // No left labels, but might have Y-axis numeric ticks
          tempCtx.font = `${tickFontSize}px Arial`;
          // Estimate for numeric Y-axis values if custom values are provided
          estimatedYAxisLabelWidth = 60; // Default for numeric values
          // Add padding: 10px (label offset) + 5px (tick) + 15px (spacing) = 30px total
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
  
  // adjustedWidth and adjustedHeight are already calculated above
  
  // Determine X-axis (value axis) range
  // For grouped charts: find max value across all segments
  // For stacked charts: find max sum of values per category
  // For lollipop charts: same as standard (single value per bar)
  let allValues: number[] = [];
  if (chartType === 'grouped' || chartType === 'stacked' || chartType === 'lollipop') {
    if (chartType === 'grouped') {
      // For grouped: find max value across all segments
      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          d.values.forEach(seg => allValues.push(seg.value));
        } else if (d.value !== undefined) {
          allValues.push(d.value);
        }
      });
    } else {
      // For stacked: find max sum per category
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
    // Standard chart: use value directly
    allValues = data.map(d => d.value ?? 0).filter(v => v !== undefined && v !== null);
  }
  
  let xMin: number, xMax: number;
  let xAxisCustomValues: number[] | undefined = xAxisValues;
  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;
  
  // Check if any bars have xStart/xEnd (value ranges)
  const hasValueRanges = data.some(d => d.xStart !== undefined || d.xEnd !== undefined);
  if (hasValueRanges) {
    const allXStarts = data.map(d => d.xStart ?? d.value ?? 0).filter(v => v !== undefined);
    const allXEnds = data.map(d => d.xEnd ?? d.value ?? 0).filter(v => v !== undefined);
    xMin = Math.min(...allXStarts, ...allXEnds);
    xMax = Math.max(...allXStarts, ...allXEnds);
    // Add some padding
    const xPadding = (xMax - xMin) * 0.1;
    xMin = Math.max(0, xMin - xPadding);
    xMax = xMax + xPadding;
  } else if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
  } else if (hasExplicitXRange) {
    xMin = xAxisRange!.min!;
    xMax = xAxisRange!.max!;
    // Ensure baseline is within range
    const effectiveBaseline = baseline !== undefined ? baseline : 0;
    xMin = Math.min(xMin, effectiveBaseline);
    xMax = Math.max(xMax, effectiveBaseline);
  } else {
    xMin = 0;
    xMax = Math.max(...allValues, 1);
    const xPadding = (xMax - xMin) * 0.1;
    const effectiveBaseline = baseline !== undefined ? baseline : 0;
    // Ensure baseline is always included in the range
    xMin = Math.min(Math.max(0, xMin - xPadding), effectiveBaseline);
    xMax = xMax + xPadding;
  }
  
  // Determine Y-axis (category axis) range - similar to X-axis in standard chart
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
    // Auto-calculate from data indices (0 to data.length - 1)
    yMin = 0;
    yMax = data.length - 1;
  }
  
  // Validate data values against explicit axis ranges
  if (hasExplicitXRange || xAxisCustomValues) {
    const effectiveXMin = xAxisCustomValues ? Math.min(...xAxisCustomValues) : xAxisRange!.min!;
    const effectiveXMax = xAxisCustomValues ? Math.max(...xAxisCustomValues) : xAxisRange!.max!;
    
    data.forEach((item, itemIndex) => {
      // Check value (X-axis for horizontal bars)
      if (item.value !== undefined && (item.value < effectiveXMin || item.value > effectiveXMax)) {
        throw new Error(
          `Horizontal Bar Chart Error: Data value out of X-axis bounds.\n` +
          `Bar ${itemIndex} "${item.label || `at index ${itemIndex}`}" has value ${item.value}, ` +
          `which exceeds the X-axis range [${effectiveXMin}, ${effectiveXMax}].`
        );
      }
      // Check xStart and xEnd if they exist
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
      // Check grouped/stacked values
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
      // Check yStart and yEnd (Y-axis for horizontal bars)
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
  
  // Legend dimensions already calculated above, no need to recalculate
  
  // Calculate adjusted dimensions (needed before creating canvas)
  const adjustedWidth = width + extraWidth;
  const adjustedHeight = baseHeight + extraHeight;
  
  // Create canvas
  const canvas = createCanvas(adjustedWidth, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');
  
  // Fill background (gradient, image, or color)
  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      ctx.drawImage(bgImage, 0, 0, adjustedWidth, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);
      // Fallback to gradient or color if image fails to load
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
  
  // Calculate axis positions
  const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0;
  const axisLabelHeight = (xAxisLabel || yAxisLabel) ? axisLabelFontSize + 20 : 0;
  
  // Adjust chart area based on legend position
  // Note: adjustedWidth and adjustedHeight are already calculated above (before canvas creation)
  let chartAreaLeft = paddingLeft;
  let chartAreaRight = width - paddingRight;
  let chartAreaTop = paddingTop + titleHeight;
  let chartAreaBottom = adjustedHeight - paddingBottom;
  
  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    if (legendPosition === 'left') {
      // Calculate actual Y-axis label width (category labels or numeric values)
      let actualYAxisLabelWidth = 80; // Default estimate
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      if (tempCtx) {
        // Check if bar labels are positioned on the left (they act as Y-axis labels)
        const barLabelFontSize = options.labels?.barLabelDefaults?.fontSize ?? 14;
        tempCtx.font = `${barLabelFontSize}px Arial`;
        
        // Check if bar labels are on the left side
        const hasLeftLabels = barLabelPosition === 'left' || 
          data.some(item => (item.labelPosition ?? barLabelPosition) === 'left');
        
        if (hasLeftLabels && showBarLabels) {
          // Measure category labels (bar labels) - these are the Y-axis labels
          data.forEach(d => {
            const labelWidth = tempCtx.measureText(d.label).width;
            actualYAxisLabelWidth = Math.max(actualYAxisLabelWidth, labelWidth);
          });
          // Add padding: 5px (label offset from originX) + 10px (spacing) = 15px total
          actualYAxisLabelWidth += 15;
        } else {
          // No left labels, but might have Y-axis numeric ticks
          tempCtx.font = `${tickFontSize}px Arial`;
          // Estimate for numeric Y-axis values if custom values are provided
          actualYAxisLabelWidth = 60; // Default for numeric values
          // Add padding: 10px (label offset) + 5px (tick) + 15px (spacing) = 30px total
          actualYAxisLabelWidth += 30;
        }
      }
      // Position chart area to leave room for legend + Y-axis labels
      chartAreaLeft = paddingLeft + legendWidth + legendSpacing + actualYAxisLabelWidth;
      chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'right') {
      chartAreaLeft = paddingLeft;
      chartAreaRight = width - paddingRight;
    } else if (legendPosition === 'top') {
      chartAreaTop = paddingTop + titleHeight + legendHeight + legendSpacing + minLegendSpacing;
      chartAreaBottom = adjustedHeight - paddingBottom;
    } else if (legendPosition === 'bottom') {
      chartAreaTop = paddingTop + titleHeight;
      chartAreaBottom = adjustedHeight - paddingBottom;
    }
  }
  
  const originX = chartAreaLeft;
  // Use adjustedHeight for originY calculation to account for legend space
  const originY = adjustedHeight - paddingBottom - axisLabelHeight;
  const axisEndY = chartAreaTop;
  const axisEndX = chartAreaRight;
  
  // Draw chart title
  if (chartTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Title positioned with proper spacing from top
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
  
  // Set axis style
  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';
  
  // X-axis will be drawn after calculating zero line
  
  // Draw Y-axis (vertical - category axis)
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

  // Draw Y-axis arrow
  drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize); // Y-axis arrow (up)
  
  // Calculate X-axis step
  const xStep = xAxisRange?.step ?? Math.ceil((xMax - xMin) / 10);
  
  // Calculate Y-axis step
  const yStep = yAxisRange?.step ?? 1;
  
  // Calculate chart area dimensions (needed for baseline calculation)
  const chartAreaWidth = axisEndX - originX;
  
  // Calculate baseline position for X-axis (custom baseline value, default is 0)
  const baselineX = originX + ((baseline - xMin) / (xMax - xMin)) * chartAreaWidth;
  
  // Draw X-axis at baseline position (horizontal line at originY)
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();
  
  // Draw X-axis arrow
  drawArrow(ctx, axisEndX, originY, 0, arrowSize);
  
  // Draw X-axis ticks and labels at baseline position
  drawXAxisTicks(ctx, originX, originY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing);
  
  // Draw Y-axis ticks and labels (with values/range support)
  drawYAxisTicks(ctx, originX, originY, axisEndY, yMin, yMax, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing);
  
  // Draw axis labels
  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, originY + 25);
    ctx.restore();
  }
  
  if (yAxisLabel) {
    // Check if bar labels are on the left side - if so, position Y-axis label further left
    let maxBarLabelWidth = 0;
    if (showBarLabels) {
      // Check if default position or any bar has labels on the left
      const hasLeftLabels = barLabelPosition === 'left' || 
        data.some(item => (item.labelPosition ?? barLabelPosition) === 'left');
      
      if (hasLeftLabels) {
        // Calculate maximum width of bar labels
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
    // Position Y-axis label further left if bar labels are on the left
    // Add extra spacing (20px) after the bar labels
    const labelX = originX - maxBarLabelWidth - 20 - 30;
    const labelY = (originY + axisEndY) / 2;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
  }
  
  // Draw grid lines if enabled
  if (showGrid) {
    drawGrid(ctx, originX, originY, axisEndX, axisEndY, xMin, xMax, xStep, yMin, yMax, yStep, yAxisCustomValues, xAxisCustomValues, gridColor, gridWidth);
  }
  
  // Draw legend if provided - positioned based on legendPosition option
  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    const legendFontSize = options.legend?.fontSize ?? 16;
    const legendTextColor = options.legend?.textColor;
    const legendBorderColor = options.legend?.borderColor;
    const legendBgColor = options.legend?.backgroundColor;
    const legendPadding = options.legend?.padding;
    const legendMaxWidth = options.legend?.maxWidth;
    const legendWrapText = options.legend?.wrapText !== false;
    
    // Calculate legend position based on legendPosition option
    let legendX: number, legendY: number;
    const chartAreaHeight = originY - axisEndY;
    const chartAreaWidth = axisEndX - originX;
    
    switch (legendPosition) {
      case 'top':
        legendX = (adjustedWidth - legendWidth) / 2; // Centered horizontally
        legendY = paddingTop + titleHeight + minLegendSpacing;
        break;
      case 'bottom':
        legendX = (adjustedWidth - legendWidth) / 2; // Centered horizontally
        legendY = adjustedHeight - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case 'left':
        // Position legend at the very left edge to make maximum room for Y-axis labels
        // The chart area already accounts for legend width + label width, so position legend at leftmost
        legendX = paddingLeft;
        legendY = axisEndY + (chartAreaHeight - legendHeight) / 2; // Vertically centered in chart area
        break;
      case 'right':
      default:
        legendX = axisEndX + minLegendSpacing;
        legendY = axisEndY + (chartAreaHeight - legendHeight) / 2; // Vertically centered in chart area
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
  
  // Calculate chart area dimensions (Y-axis area for bars)
  // chartAreaWidth and baselineX already calculated above when drawing X-axis
  const chartAreaHeight = originY - axisEndY;
  
  // Calculate bar dimensions to fit within Y-axis bounds (between axisEndY and originY)
  const calculatedBarSpacing = barSpacing ?? 15;
  const totalSpacing = (data.length - 1) * calculatedBarSpacing;
  const availableHeight = chartAreaHeight - totalSpacing;
  const calculatedBarHeight = Math.max(minBarHeight, availableHeight / data.length);
  
  // Store label information for drawing after bars
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
  
  // Track value label positions per bar (for adjusting bar label positions)
  const valueLabelPositions: Map<number, { x: number; fontSize: number; align: CanvasTextAlign }> = new Map();

  // First pass: Draw all bars (no labels)
  data.forEach((item, index) => {
    // Calculate bar Y position - start from axisEndY (top) and space bars downward
    // First bar starts after spacing, each subsequent bar: previous position + bar height + spacing
    const barY = axisEndY + (index * (calculatedBarHeight + calculatedBarSpacing)) + calculatedBarSpacing;
    const barCenterY = barY + calculatedBarHeight / 2;
    
    // Ensure bar stays within Y-axis bounds (between axisEndY and originY)
    if (barY + calculatedBarHeight > originY) {
      // Bar would exceed Y-axis bottom - skip it to prevent overflow
      return;
    }
    
    // Ensure bar doesn't exceed Y-axis bounds
    if (barY + calculatedBarHeight > originY) {
      // Adjust if bar would go below originY (Y-axis bottom)
      return; // Skip this bar if it doesn't fit
    }
    
    // Calculate bar position and dimensions for label positioning (used for all chart types)
    let barX: number, barEndX: number, barLength: number;
    
    // Handle grouped/stacked/lollipop vs standard charts
    if ((chartType === 'grouped' || chartType === 'stacked' || chartType === 'lollipop') && item.values && item.values.length > 0) {
      // Grouped or stacked chart
      const segments = item.values;
      const numSegments = segments.length;
      
      if (chartType === 'grouped') {
        // Grouped: bars side-by-side (vertically stacked in horizontal chart)
        const segmentHeight = (calculatedBarHeight - (groupSpacing * (numSegments - 1))) / numSegments;
        
        // Calculate overall bar bounds for label positioning (use max segment)
        const maxSegment = segments.reduce((max, seg) => seg.value > max.value ? seg : max, segments[0]);
        if (item.xStart !== undefined || item.xEnd !== undefined) {
          const startValue = item.xStart ?? xMin;
          const endValue = item.xEnd ?? maxSegment.value;
          const startRatio = (startValue - xMin) / (xMax - xMin);
          const endRatio = (endValue - xMin) / (xMax - xMin);
          barX = originX + startRatio * chartAreaWidth;
          barEndX = originX + endRatio * chartAreaWidth;
        } else {
          // Calculate based on positive/negative
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
          
          // Calculate segment bar position and length
          let segBarX: number, segBarEndX: number;
          if (item.xStart !== undefined || item.xEnd !== undefined) {
            const startValue = item.xStart ?? xMin;
            const endValue = item.xEnd ?? segment.value;
            const startRatio = (startValue - xMin) / (xMax - xMin);
            const endRatio = (endValue - xMin) / (xMax - xMin);
            segBarX = originX + startRatio * chartAreaWidth;
            segBarEndX = originX + endRatio * chartAreaWidth;
          } else {
            // Calculate bar position based on positive/negative value
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
          
          // Draw segment bar with gradient or color
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
          
          // Store value label for later drawing
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
        // Stacked: bars on top of each other (horizontally stacked in horizontal chart)
        let accumulatedLength = 0;
        
        segments.forEach((segment, segIndex) => {
          // For stacked, separate positive and negative segments
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
          
          // Draw segment bar
          ctx.fillStyle = segment.color || item.color || '#4A90E2';
          ctx.fillRect(segBarX, barY, segmentLength, calculatedBarHeight);
          
          // Store value label for later drawing
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
        
        // Calculate overall bar bounds for label positioning
        barX = originX;
        barEndX = originX + accumulatedLength;
        barLength = accumulatedLength;
        
        // Store total value label for later drawing
        const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
        const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
        if (shouldShowValue) {
          // Calculate total position
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
      // Lollipop chart: line with dot at end (horizontal)
      const value = item.value ?? baseline;
      
      // Calculate value X position
      let valueX: number;
      if (value >= baseline) {
        // Value to the right of baseline
        const positiveRatio = (value - baseline) / (xMax - xMin);
        valueX = baselineX + positiveRatio * chartAreaWidth;
      } else {
        // Value to the left of baseline
        const negativeRatio = (baseline - value) / (xMax - xMin);
        valueX = baselineX - negativeRatio * chartAreaWidth;
      }

      // Draw horizontal line from baseline to value position
      ctx.save();
      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = lollipopLineWidth;
      ctx.beginPath();
      ctx.moveTo(baselineX, barCenterY);
      ctx.lineTo(valueX, barCenterY);
      ctx.stroke();
      
      // Draw dot/circle at value position
      ctx.fillStyle = item.color || '#4A90E2';
      ctx.beginPath();
      ctx.arc(valueX, barCenterY, lollipopDotSize / 2, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw dot border for better visibility
      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Store value label for later drawing
      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        // Store value label position for this bar (for adjusting bar label position)
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
      
      // Set bar bounds for label positioning
      barX = baselineX;
      barEndX = valueX;
      barLength = Math.abs(barEndX - barX);
    } else {
      // Standard chart: single bar
      // Calculate bar position and length
      // If xStart/xEnd are provided, use them for bar range; otherwise use value
      if (item.xStart !== undefined || item.xEnd !== undefined) {
        const startValue = item.xStart ?? xMin;
        const endValue = item.xEnd ?? (item.value ?? 0);
        const startRatio = (startValue - xMin) / (xMax - xMin);
        const endRatio = (endValue - xMin) / (xMax - xMin);
        barX = originX + startRatio * chartAreaWidth;
        barEndX = originX + endRatio * chartAreaWidth;
      } else {
        // Use value as end position, handle relative to baseline
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
      
      // Draw horizontal bar
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
      
      // Store value label for later drawing
      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        const value = item.value ?? baseline;
        const valueLabelX = value >= baseline ? barEndX + 5 : barX - 5;
        const valueLabelAlign = value >= baseline ? 'left' : 'right';
        
        // Store value label position for this bar (for adjusting bar label position)
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
    
    // Store bar label information for later drawing
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
          // Check if there's a value label at the right - if so, position bar label to the right of it
          const valueLabelInfo = valueLabelPositions.get(index);
          if (valueLabelInfo && valueLabelInfo.align === 'left') {
            // Value label is at right, so position bar label to the right of it
            // Calculate spacing: value label width + gap
            ctx.save();
            ctx.font = `${valueLabelInfo.fontSize}px Arial`;
            const valueLabelWidth = ctx.measureText((item.value ?? baseline).toString()).width;
            ctx.restore();
            const spacing = 5; // Gap between value and bar label
            labelX = valueLabelInfo.x + valueLabelWidth + spacing;
          } else {
            labelX = barEndX + 5;
          }
          textAlign = 'left';
          textBaseline = 'middle';
          break;
        case 'top':
          labelX = barX + barLength / 2;
          // Check if there's a value label - for horizontal charts, value labels are at the end (right side)
          // So 'top' bar label won't conflict with value labels (they're on different axes)
          // But we still need to check if value is shown and adjust if needed
          // For horizontal charts, 'top' means above the bar, value labels are at the end
          // So no conflict, but if we want to be safe, we can check
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
      
      // Calculate label color (for 'inside' position, check if bar is dark)
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

  // Second pass: Draw all labels (values and bar labels) on top of everything
  for (const label of labelsToDraw) {
    ctx.save();
    ctx.textAlign = label.align;
    ctx.textBaseline = label.baseline;
    
    // Determine text style and gradient based on label type
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