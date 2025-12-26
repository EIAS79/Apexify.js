import { createCanvas, SKRSContext2D, loadImage } from "@napi-rs/canvas";
import fs from "fs";
import type { gradient } from "../types";
import { createGradientFill } from "../Image/imageProperties";
import { EnhancedTextRenderer } from "../Texts/enhancedTextRenderer";

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
export interface BarSegment {
  value: number; // Y-axis value
  color?: string; // Bar color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for bar segment (overrides color)
  label?: string; // Optional label for this segment
  valueColor?: string; // Individual bar value text color
  showValue?: boolean; // Show/hide value for this specific segment
  opacity?: number; // Bar opacity (0-1, default: 1)
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
 * Interface for bar chart data with X-axis range
 * For standard charts: single value per bar
 * For grouped/stacked charts: multiple values per bar
 */
export interface BarChartData {
  label: string; // Category label
  // Standard chart: use value
  value?: number; // Y-axis value (for standard charts)
  // Grouped/stacked charts: use values array
  values?: BarSegment[]; // Array of values for grouped/stacked charts
  xStart: number; // X-axis start position
  xEnd: number; // X-axis end position
  color?: string; // Bar color (for standard charts, or default for grouped/stacked) (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for bar (overrides color)
  labelColor?: string; // Label text color
  labelPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom'; // Individual bar label position (overrides global barLabelPosition)
  valueColor?: string; // Individual bar value text color (for standard charts)
  showValue?: boolean; // Show/hide value for this specific bar (for standard charts)
  opacity?: number; // Bar opacity (0-1, default: 1)
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
  
  // Apply opacity
  const effectiveOpacity = opacity !== undefined ? opacity : 1;
  ctx.globalAlpha = effectiveOpacity;
  
  // Apply shadow (segment/item shadow takes precedence over global)
  const effectiveShadow = shadow || globalShadow;
  if (effectiveShadow) {
    ctx.shadowColor = effectiveShadow.color || 'rgba(0,0,0,0.3)';
    ctx.shadowOffsetX = effectiveShadow.offsetX ?? 2;
    ctx.shadowOffsetY = effectiveShadow.offsetY ?? 2;
    ctx.shadowBlur = effectiveShadow.blur ?? 4;
  }
  
  // Draw bar fill
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  
  if (gradient) {
    fillWithGradientOrColor(ctx, gradient, color, color, { x, y, w: width, h: height });
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();
  
  // Reset shadow before stroke
  if (effectiveShadow) {
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.shadowBlur = 0;
  }
  
  // Apply stroke (segment/item stroke takes precedence over global)
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
  color?: string; // Legend box color (overridden by gradient if provided)
  gradient?: gradient; // Gradient fill for legend box (overrides color)
  label: string;
}

/**
 * Axis configuration
 */
export interface AxisConfig {
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
  valueSpacing?: number; // Pixel spacing between each tick value (default: auto-calculated)
}

/**
 * Bar chart configuration - organized by category
 */
export interface BarChartOptions {
  // Chart Type
  type?: BarChartType; // Type of bar chart (default: 'standard')
  
  // Waterfall chart specific options
  waterfall?: {
    initialValue?: number; // Starting value for waterfall chart (default: 0)
  };
  
  // Dimensions
  dimensions?: {
    width?: number; // Ignored - calculated responsively
    height?: number; // Fixed height (default: 600)
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
    x?: AxisConfig; // X-axis configuration
    y?: AxisConfig & {
      baseline?: number; // Custom baseline value (default: 0). Bars extend above/below this value
    }; // Y-axis configuration
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
      show?: boolean; // Show/hide all bar labels globally (default: true) - can be overridden per bar
      defaultPosition?: 'top' | 'left' | 'right' | 'inside' | 'bottom'; // Default position when bar doesn't specify labelPosition (default: 'bottom')
      fontSize?: number; // Font size for all bar labels (default: 14)
      defaultColor?: string; // Default text color when bar doesn't specify labelColor
      gradient?: gradient; // Text gradient (overrides defaultColor)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
    valueLabelDefaults?: {
      show?: boolean; // Show/hide all value labels globally (default: true) - can be overridden per bar with showValue
      fontSize?: number; // Font size for all value labels (default: 12)
      defaultColor?: string; // Default text color when bar doesn't specify valueColor
      gradient?: gradient; // Text gradient (overrides defaultColor)
      textStyle?: EnhancedTextStyle; // Enhanced text styling
    };
  };
  
  // Legend
  legend?: {
    show?: boolean; // Show/hide legend (default: false)
    entries?: LegendEntry[]; // Legend entries (color and label pairs)
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
    minWidth?: number; // Minimum bar width (default: 20)
    groupSpacing?: number; // Spacing between groups in grouped charts (default: 10)
    segmentSpacing?: number; // Spacing between segments in grouped charts (default: 2)
    // Lollipop chart specific
    lineWidth?: number; // Line width for lollipop charts (default: 2)
    dotSize?: number; // Dot/circle size for lollipop charts (default: 8)
    // Global bar styling (can be overridden per bar/segment)
    opacity?: number; // Default bar opacity (0-1, default: 1)
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
    // Use custom Y-axis values
    const actualMin = Math.min(...customValues);
    const actualMax = Math.max(...customValues);
    const range = actualMax - actualMin;
    
    // Always position ticks based on their actual values
    // valueSpacing is used only to prevent label overlap (skip labels that are too close)
    let lastLabelY = Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30; // Minimum pixels between labels
    
    customValues.forEach((value) => {
      const y = originY - ((value - actualMin) / range) * chartHeight;
      
      // Check if this label would overlap with the previous one
      if (Math.abs(y - lastLabelY) < minLabelSpacing) {
        // Skip this label to prevent overlap, but still draw the tick mark
        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();
        return;
      }
      
      // Draw tick mark
      ctx.beginPath();
      ctx.moveTo(originX - 5, y);
      ctx.lineTo(originX, y);
      ctx.stroke();
      
      // Draw label
      ctx.fillText(value.toFixed(1), originX - 10, y);
      
      lastLabelY = y; // Update last label position
    });
  } else {
    // Use regular step-based ticks
    const range = maxValue - minValue;
    
    // Always position ticks based on their actual values
    // valueSpacing is used only to prevent label overlap (skip labels that are too close)
    let lastLabelY = Infinity;
    const minLabelSpacing = valueSpacing && valueSpacing > 0 ? valueSpacing : 30; // Minimum pixels between labels
    
    for (let value = minValue; value <= maxValue; value += step) {
      const y = originY - ((value - minValue) / range) * chartHeight;
      
      // Check if this label would overlap with the previous one
      if (Math.abs(y - lastLabelY) < minLabelSpacing && value > minValue) {
        // Skip this label to prevent overlap, but still draw the tick mark
        ctx.beginPath();
        ctx.moveTo(originX - 5, y);
        ctx.lineTo(originX, y);
        ctx.stroke();
        continue;
      }
      
      // Draw tick mark
      ctx.beginPath();
      ctx.moveTo(originX - 5, y);
      ctx.lineTo(originX, y);
      ctx.stroke();
      
      // Draw label
      const labelText = value.toFixed(1);
      ctx.fillText(labelText, originX - 10, y);
      
      lastLabelY = y; // Update last label position
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
    // Use custom X-axis values
    if (valueSpacing && valueSpacing > 0) {
      // Use specified spacing - position ticks with exact pixel spacing
      let currentX = originX;
      customValues.forEach((value, index) => {
        if (index === 0) {
          currentX = originX;
        } else {
          currentX += valueSpacing; // Move right by spacing amount
        }
        
        // Clamp to chart area
        if (currentX >= originX && currentX <= axisEndX) {
          // Draw tick mark
          ctx.beginPath();
          ctx.moveTo(currentX, originY);
          ctx.lineTo(currentX, originY + 5);
          ctx.stroke();
          
          // Draw label
          ctx.fillText(value.toString(), currentX, originY + 10);
        }
      });
    } else {
      // Use index-based positioning (original behavior)
      // But check for label overlap and skip labels if they're too close
      const totalValues = customValues.length;
      const divisor = totalValues > 1 ? totalValues - 1 : 1;
      
      let lastLabelX = -Infinity;
      const minLabelSpacing = 40; // Minimum pixels between label centers
      
      customValues.forEach((value, index) => {
        // Position based on index in the array, not the numeric value
        const x = originX + (index / divisor) * chartWidth;
        const labelText = value.toString();
        const labelWidth = ctx.measureText(labelText).width;
        
        // Check if this label would overlap with the previous one
        if (x - lastLabelX < minLabelSpacing && index > 0) {
          // Skip this label to prevent overlap
          return;
        }
        
        // Draw tick mark
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();
        
        // Draw label
        ctx.fillText(labelText, x, originY + 10);
        
        lastLabelX = x + labelWidth / 2; // Update last label position
      });
    }
  } else {
    // Use regular step-based ticks
    const range = maxValue - minValue;
    
    if (valueSpacing && valueSpacing > 0) {
      // Use specified spacing - only show ticks that fit with spacing
      let currentX = originX;
      let currentValue = minValue;
      
      while (currentX <= axisEndX && currentValue <= maxValue) {
        // Draw tick mark
        ctx.beginPath();
        ctx.moveTo(currentX, originY);
        ctx.lineTo(currentX, originY + 5);
        ctx.stroke();
        
        // Draw label
        ctx.fillText(currentValue.toString(), currentX, originY + 10);
        
        currentX += valueSpacing;
        currentValue += step;
      }
    } else {
      // Original behavior - evenly distribute based on value
      // But check for label overlap and skip labels if they're too close
      let lastLabelX = -Infinity;
      const minLabelSpacing = 40; // Minimum pixels between label centers
      
      for (let value = minValue; value <= maxValue; value += step) {
        const x = originX + ((value - minValue) / range) * chartWidth;
        const labelText = value.toString();
        const labelWidth = ctx.measureText(labelText).width;
        
        // Check if this label would overlap with the previous one
        if (x - lastLabelX < minLabelSpacing && value > minValue) {
          // Skip this label to prevent overlap
          continue;
        }
        
        // Draw tick mark
        ctx.beginPath();
        ctx.moveTo(x, originY);
        ctx.lineTo(x, originY + 5);
        ctx.stroke();
        
        // Draw label
        ctx.fillText(labelText, x, originY + 10);
        
        lastLabelX = x + labelWidth / 2; // Update last label position
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
      textHeight = wrappedLines.length * fontSize * 1.2; // Line height multiplier
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
  
  // Draw legend border
  ctx.strokeStyle = effectiveBorderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
  
  // Draw legend entries
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = effectiveTextColor;
  
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
    
    // Draw box border
    ctx.strokeStyle = effectiveBorderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(legendX + padding, centerY - boxSize / 2, boxSize, boxSize);
    
    // Draw label (with wrapping if enabled) using enhanced text
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
  
  // Calculate legend dimensions
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
  
  // Determine text color based on background
  const isDarkBackground = backgroundColor === '#000000' || backgroundColor.toLowerCase() === 'black';
  const textColor = isDarkBackground ? '#FFFFFF' : '#000000';
  const bgColor = isDarkBackground ? 'rgba(0, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.9)';
  const borderColor = isDarkBackground ? '#FFFFFF' : '#000000';
  
  // Draw legend background
  ctx.fillStyle = bgColor;
  ctx.fillRect(legendX, legendY, legendWidth, legendHeight);
  
  // Draw legend border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
  
  // Draw legend entries
  ctx.font = `${fontSize}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  
  for (let index = 0; index < legend.length; index++) {
    const entry = legend[index];
    const y = legendY + paddingBox + index * (boxSize + spacing) + boxSize / 2;
    const x = legendX + paddingBox;
    
    // Draw color box (gradient or color)
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
    
    // Draw box border
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y - boxSize / 2, boxSize, boxSize);
    
    // Draw label
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
  ctx.setLineDash([2, 2]); // Dashed lines for grid
  
  const chartWidth = axisEndX - originX;
  const chartHeight = originY - axisEndY;
  
  // Draw vertical grid lines (based on X-axis)
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
  
  // Draw horizontal grid lines (based on Y-axis)
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
    // Calculate width based on number of custom values
    // Use about 20-25 pixels per tick mark
    const minChartAreaWidth = Math.max(400, customValues.length * 20);
    return paddingLeft + minChartAreaWidth + paddingRight;
  }

  // Calculate width based on X-axis range
  // Use a reasonable scale: about 10-15 pixels per unit on X-axis
  const xRange = xAxisRange.max - xAxisRange.min;
  const minChartAreaWidth = Math.max(400, xRange * 10); // At least 400px, or 10px per unit
  
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

  // Create canvas
  const canvas = createCanvas(width, height);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  // Fill white background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);

  // Calculate axis positions
  const originX = paddingLeft;
  const originY = height - paddingBottom;
  const axisEndX = width - paddingRight;
  const axisEndY = paddingTop;

  // Set axis style
  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';

  // Draw Y-axis (vertical line from origin to top)
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

  // Draw X-axis (horizontal line from origin to right)
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(axisEndX, originY);
  ctx.stroke();

  // Draw arrow on Y-axis (pointing up)
  drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize);

  // Draw arrow on X-axis (pointing right)
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
  // Extract and map organized config to internal variables
  
  // Dimensions
  const height = options.dimensions?.height ?? 600;
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
  const barLabelPosition = options.labels?.barLabelDefaults?.defaultPosition ?? 'bottom';
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
  const yAxisRange = options.axes?.y?.range;
  const yAxisValues = options.axes?.y?.values;
  const baseline = options.axes?.y?.baseline ?? 0; // Custom baseline value (default: 0)
  const tickFontSize = options.axes?.x?.tickFontSize ?? options.axes?.y?.tickFontSize ?? 12;
  const xAxisValueSpacing = options.axes?.x?.valueSpacing;
  const yAxisValueSpacing = options.axes?.y?.valueSpacing;
  
  // Chart type
  const chartType = options.type ?? 'standard';
  
  // Waterfall chart options
  const initialValue = options.waterfall?.initialValue ?? 0;
  
  // Legend
  const showLegend = options.legend?.show ?? false;
  const legend = options.legend?.entries;
  const legendPosition = options.legend?.position ?? 'right'; // Default: right
  
  // Grid
  const showGrid = options.grid?.show ?? false;
  const gridColor = options.grid?.color ?? '#E0E0E0';
  const gridWidth = options.grid?.width ?? 1;
  
  // Bars
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

  // Determine X-axis range from custom values, options, or data
  let xMin: number, xMax: number;
  let xAxisCustomValues: number[] | undefined = xAxisValues;
  
  if (xAxisCustomValues && xAxisCustomValues.length > 0) {
    // Use custom X-axis values
    xMin = Math.min(...xAxisCustomValues);
    xMax = Math.max(...xAxisCustomValues);
  } else if (xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined) {
    xMin = xAxisRange.min;
    xMax = xAxisRange.max;
  } else {
    // Auto-calculate from data
    if (data.length === 0) {
      xMin = 0;
      xMax = 100;
    } else {
      const allXStarts = data.map(d => d.xStart);
      const allXEnds = data.map(d => d.xEnd);
      xMin = Math.min(...allXStarts, ...allXEnds);
      xMax = Math.max(...allXStarts, ...allXEnds);
      // Add some padding
      const xPadding = (xMax - xMin) * 0.1;
      xMin = Math.max(0, xMin - xPadding);
      xMax = xMax + xPadding;
    }
  }

  // Calculate responsive width based on X-axis range or custom values
  let baseWidth = calculateResponsiveWidth({ min: xMin, max: xMax }, options, xAxisCustomValues);
  
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
    // For left position, add extra space for Y-axis labels
    if (legendPosition === 'left') {
      // Estimate Y-axis label width: measure potential large values
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      let estimatedYAxisLabelWidth = 60; // Default estimate
      if (tempCtx) {
        tempCtx.font = `${tickFontSize}px Arial`;
        // Get max value from data to estimate label width
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
          // Measure potential labels
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
        // Add padding: 10px (label offset) + 5px (tick) + 15px (spacing) = 30px total
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

  // Create canvas
  const canvas = createCanvas(width, adjustedHeight);
  const ctx: SKRSContext2D = canvas.getContext('2d');

  // Fill background (gradient, image, or color)
  if (backgroundImage) {
    try {
      const bgImage = await loadImage(backgroundImage);
      // Draw image to fill entire canvas
      ctx.drawImage(bgImage, 0, 0, width, adjustedHeight);
    } catch (error) {
      console.warn(`Failed to load background image: ${backgroundImage}`, error);
      // Fallback to gradient or color if image fails to load
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

  // Calculate axis positions
  const titleHeight = chartTitle ? chartTitleFontSize + 30 : 0;
  const axisLabelHeight = (xAxisLabel || yAxisLabel) ? axisLabelFontSize + 20 : 0;
  
  // Adjust chart area based on legend position
  let chartAreaLeft = paddingLeft;
  let chartAreaRight = baseWidth - paddingRight;
  let chartAreaTop = paddingTop + titleHeight;
  let chartAreaBottom = height - paddingBottom;
  
  if (showLegend && legend && legend.length > 0) {
    const legendSpacing = options.legend?.spacing ?? 20;
    if (legendPosition === 'left') {
      // Calculate actual Y-axis label width after we have value ranges
      let actualYAxisLabelWidth = 60; // Default estimate
      const tempCanvas = createCanvas(1, 1);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      if (tempCtx) {
        tempCtx.font = `${tickFontSize}px Arial`;
        // Use the calculated min/max values if available, otherwise estimate
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
        // Add padding: 10px (label offset) + 5px (tick) + 15px (spacing)
        actualYAxisLabelWidth += 30;
      }
      // Position chart area to leave room for legend + Y-axis labels
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

  // Draw chart title if provided
  if (chartTitle) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Title positioned with proper spacing from top
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

  // Set axis style
  ctx.strokeStyle = axisColor;
  ctx.fillStyle = axisColor;
  ctx.lineWidth = axisWidth;
  ctx.lineCap = 'round';

  // Draw Y-axis
  ctx.beginPath();
  ctx.moveTo(originX, originY);
  ctx.lineTo(originX, axisEndY);
  ctx.stroke();

  // Draw arrows (X-axis will be drawn after calculating zero line)
  drawArrow(ctx, originX, axisEndY, -Math.PI / 2, arrowSize);

  // Calculate Y-axis value ranges
  // For grouped charts: find max value across all segments
  // For stacked charts: find max sum of values per category
  // For waterfall charts: find cumulative min/max across all bars
  let allValues: number[] = [];
  if (chartType === 'grouped' || chartType === 'stacked' || chartType === 'waterfall') {
    if (chartType === 'grouped') {
      // For grouped: find max value across all segments
      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          d.values.forEach(seg => allValues.push(seg.value));
        } else if (d.value !== undefined) {
          allValues.push(d.value);
        }
      });
    } else if (chartType === 'waterfall') {
      // For waterfall: calculate all cumulative values (initial + each step's cumulative total)
      let cumulativeValue = initialValue;
      allValues.push(initialValue); // Include initial value
      
      data.forEach(d => {
        if (d.values && d.values.length > 0) {
          // Sum all segments for this item
          const itemTotal = d.values.reduce((sum, seg) => sum + seg.value, 0);
          cumulativeValue += itemTotal;
        } else if (d.value !== undefined) {
          cumulativeValue += d.value;
        }
        // Add each cumulative total to allValues
        allValues.push(cumulativeValue);
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
  
  let minValue: number, maxValue: number, yStep: number;
  let yAxisCustomValues: number[] | undefined = yAxisValues;
  const hasExplicitYRange = yAxisRange && yAxisRange.min !== undefined && yAxisRange.max !== undefined;
  const hasExplicitXRange = xAxisRange && xAxisRange.min !== undefined && xAxisRange.max !== undefined;
  
  if (yAxisCustomValues && yAxisCustomValues.length > 0) {
    // Use custom Y-axis values
    minValue = Math.min(...yAxisCustomValues);
    maxValue = Math.max(...yAxisCustomValues);
    yStep = 1; // Not used when custom values are provided
  } else if (hasExplicitYRange) {
    // Use Y-axis range, but for waterfall charts, ensure it includes all cumulative values
    // TypeScript narrowing: hasExplicitYRange ensures min and max are defined
    minValue = yAxisRange!.min!;
    maxValue = yAxisRange!.max!;
    
    // Ensure baseline is within range
    const effectiveBaseline = baseline !== undefined ? baseline : 0;
    minValue = Math.min(minValue, effectiveBaseline);
    maxValue = Math.max(maxValue, effectiveBaseline);
    
    // For waterfall charts, expand range if needed to include all cumulative values
    if (chartType === 'waterfall' && allValues.length > 0) {
      const dataMin = Math.min(...allValues);
      const dataMax = Math.max(...allValues);
      // Ensure the range includes all data values
      minValue = Math.min(minValue, dataMin);
      maxValue = Math.max(maxValue, dataMax);
      // Add padding, but ensure baseline is always included
      const range = maxValue - minValue;
      const padding = range * 0.1;
      minValue = Math.min(minValue - padding, effectiveBaseline);
      maxValue = maxValue + padding;
    }
    
    yStep = yAxisRange.step ?? Math.ceil((maxValue - minValue) / 10);
  } else {
    // Auto-calculate from data
    if (allValues.length > 0) {
      minValue = Math.min(...allValues);
      maxValue = Math.max(...allValues);
      // Ensure baseline is within range for waterfall charts
      if (chartType === 'waterfall') {
        minValue = Math.min(minValue, initialValue);
        maxValue = Math.max(maxValue, initialValue);
      }
      // Add some padding, but ensure baseline is always included in the range
      const range = maxValue - minValue;
      const padding = range * 0.1;
      const effectiveBaseline = baseline !== undefined ? baseline : 0;
      // Ensure baseline is within the range
      minValue = Math.min(minValue - padding, effectiveBaseline);
      maxValue = maxValue + padding;
    } else {
      minValue = 0;
      maxValue = 1;
    }
    yStep = Math.ceil((maxValue - minValue) / 10);
  }
  
  // Validate data values against explicit axis ranges
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
        // For waterfall, check individual segment values and cumulative totals
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
        // Standard chart
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

  // Draw Y-axis ticks and labels (with custom values if provided)
  drawYAxisTicks(ctx, originX, originY, axisEndY, minValue, maxValue, yStep, tickFontSize, yAxisCustomValues, yAxisValueSpacing);

  // Calculate chart area dimensions (needed for baseline calculation)
  const chartAreaHeight = originY - axisEndY;
  
  // Calculate baseline position (custom baseline value, default is 0)
  // Position the baseline within the chart area based on minValue, maxValue, and baseline
  const baselineY = originY - ((baseline - minValue) / (maxValue - minValue)) * chartAreaHeight;

  // Draw X-axis at baseline position
  const xAxisY = baselineY;
  ctx.beginPath();
  ctx.moveTo(originX, xAxisY);
  ctx.lineTo(axisEndX, xAxisY);
  ctx.stroke();
  
  // Draw X-axis arrow
  drawArrow(ctx, axisEndX, xAxisY, 0, arrowSize);

  // Calculate X-axis step
  const xStep = xAxisRange?.step ?? Math.ceil((xMax - xMin) / 10);

  // Draw X-axis ticks and labels at baseline position
  drawXAxisTicks(ctx, originX, xAxisY, axisEndX, xMin, xMax, xStep, tickFontSize, xAxisCustomValues, xAxisValueSpacing);

  // Draw grid lines if enabled (before calculating zero line, but will use correct Y position)
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

  // Draw X-axis label if provided
  if (xAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Position label below X-axis ticks (ticks are at xAxisY + 10, so add more spacing)
    ctx.fillText(xAxisLabel, (originX + axisEndX) / 2, xAxisY + 25);
    ctx.restore();
  }

  if (yAxisLabel) {
    ctx.save();
    ctx.fillStyle = axisLabelColor;
    ctx.font = `${axisLabelFontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    // Rotate for vertical text
    const labelX = originX - 30;
    const labelY = (originY + axisEndY) / 2;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yAxisLabel, 0, 0);
    ctx.restore();
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
        legendX = (width - legendWidth) / 2; // Centered horizontally
        legendY = paddingTop + titleHeight + minLegendSpacing;
        break;
      case 'bottom':
        legendX = (width - legendWidth) / 2; // Centered horizontally
        legendY = adjustedHeight - paddingBottom - legendHeight - minLegendSpacing;
        break;
      case 'left':
        // Position legend further left to make room for Y-axis labels
        // Position legend on the left side
        legendX = paddingLeft + minLegendSpacing;
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

  // Calculate chart area dimensions
  const chartAreaWidth = axisEndX - originX;
  // chartAreaHeight and baselineY already calculated above

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
  const valueLabelPositions: Map<number, { y: number; fontSize: number; baseline: CanvasTextBaseline }> = new Map();

  // First pass: Draw all bars (no labels)
  data.forEach((item, itemIndex) => {
    // Calculate bar position and width based on X-axis range
    // If custom X-axis values are provided, map to those positions
    let barXStart: number, barXEnd: number;
    
    if (xAxisCustomValues && xAxisCustomValues.length > 0) {
      // Map to custom X-axis values
      const actualMin = Math.min(...xAxisCustomValues);
      const actualMax = Math.max(...xAxisCustomValues);
      const xRange = actualMax - actualMin;
      
      // Find the position of xStart and xEnd in the custom values array
      // If xStart equals xEnd, it's a single-position bar
      const startIndex = xAxisCustomValues.indexOf(item.xStart);
      const endIndex = xAxisCustomValues.indexOf(item.xEnd);
      
      if (startIndex !== -1 && endIndex !== -1) {
        // Both values found in custom array - use index-based positioning
        const totalValues = xAxisCustomValues.length;
        const divisor = totalValues > 1 ? totalValues - 1 : 1;
        barXStart = originX + (startIndex / divisor) * chartAreaWidth;
        barXEnd = originX + (endIndex / divisor) * chartAreaWidth;
      } else {
        // Fallback to range-based positioning
        barXStart = originX + ((item.xStart - actualMin) / xRange) * chartAreaWidth;
        barXEnd = originX + ((item.xEnd - actualMin) / xRange) * chartAreaWidth;
      }
    } else {
      // Use regular range mapping
      const xRange = xMax - xMin;
      barXStart = originX + ((item.xStart - xMin) / xRange) * chartAreaWidth;
      barXEnd = originX + ((item.xEnd - xMin) / xRange) * chartAreaWidth;
    }
    
    // If xStart equals xEnd, use a minimum bar width
    const groupWidth = Math.max(barXEnd - barXStart, minBarWidth);
    if (item.xStart === item.xEnd) {
      // Center the bar at the position
      const centerX = barXStart;
      barXStart = centerX - groupWidth / 2;
    }

    // Handle grouped/stacked/waterfall vs standard charts
    if ((chartType === 'grouped' || chartType === 'stacked' || chartType === 'waterfall') && item.values && item.values.length > 0) {
      // Grouped, stacked, or waterfall chart
      const segments = item.values;
      const numSegments = segments.length;
      
      if (chartType === 'grouped') {
        // Grouped: bars side-by-side
        const segmentWidth = (groupWidth - (groupSpacing * (numSegments - 1))) / numSegments;
        
        // Track the highest value label Y position for this grouped bar
        let highestValueLabelY: number | null = null;
        
        segments.forEach((segment, segIndex) => {
          const segXStart = barXStart + (segIndex * (segmentWidth + groupSpacing));
          
          // Calculate bar position relative to baseline
          let barY: number, barHeight: number;
          if (segment.value >= baseline) {
            // Bar extends above baseline
            const positiveRatio = (segment.value - baseline) / (maxValue - minValue);
            barHeight = positiveRatio * chartAreaHeight;
            barY = baselineY - barHeight;
          } else {
            // Bar extends below baseline
            const negativeRatio = (baseline - segment.value) / (maxValue - minValue);
            barHeight = negativeRatio * chartAreaHeight;
            barY = baselineY;
          }
          
          // Draw segment bar with gradient, opacity, shadow, and stroke
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
          
          // Store value label for later drawing
          const shouldShowValue = segment.showValue !== undefined ? segment.showValue : showValues;
          if (shouldShowValue) {
            const valueLabelY = barY - 5;
            // Track the highest (smallest Y value = highest on screen) value label
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
        
        // Store the highest value label position for this grouped bar (for adjusting bar label position)
        if (highestValueLabelY !== null) {
          valueLabelPositions.set(data.indexOf(item), { y: highestValueLabelY, fontSize: valueFontSize, baseline: 'bottom' });
        }
      } else if (chartType === 'waterfall') {
        // Waterfall: each bar starts from cumulative total of previous bars
        // Calculate cumulative value up to this point
        let cumulativeValue = initialValue;
        const currentIndex = data.indexOf(item);
        for (let i = 0; i < currentIndex; i++) {
          const prevItem = data[i];
          if (prevItem.values && prevItem.values.length > 0) {
            // Sum all segments for previous item
            const prevTotal = prevItem.values.reduce((sum, seg) => sum + seg.value, 0);
            cumulativeValue += prevTotal;
          } else if (prevItem.value !== undefined) {
            cumulativeValue += prevItem.value;
          }
        }
        
        // Calculate baseline Y position for this cumulative value
        const cumulativeBaselineY = originY - ((cumulativeValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
        
        // Separate positive and negative segments
        const positiveSegments: typeof segments = [];
        const negativeSegments: typeof segments = [];
        
        segments.forEach(seg => {
          if (seg.value >= 0) {
            positiveSegments.push(seg);
          } else {
            negativeSegments.push(seg);
          }
        });
        
        // Draw positive segments (stacked upward from cumulative baseline)
        let accumulatedPositiveHeight = 0;
        positiveSegments.forEach((segment) => {
          const positiveRatio = segment.value / (maxValue - minValue);
          const segmentHeight = positiveRatio * chartAreaHeight;
          const barY = cumulativeBaselineY - accumulatedPositiveHeight - segmentHeight;
          
          // Ensure bar stays within chart area bounds
          const clampedBarY = Math.max(axisEndY, barY);
          const clampedBarHeight = Math.min(segmentHeight, cumulativeBaselineY - accumulatedPositiveHeight - clampedBarY);
          
          if (clampedBarHeight > 0) {
            // Ensure bar doesn't exceed X-axis bounds
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
        
        // Draw negative segments (stacked downward from cumulative baseline)
        let accumulatedNegativeHeight = 0;
        negativeSegments.forEach((segment) => {
          const negativeRatio = Math.abs(segment.value) / (maxValue - minValue);
          const segmentHeight = negativeRatio * chartAreaHeight;
          const barY = cumulativeBaselineY + accumulatedNegativeHeight;
          
          // Ensure bar stays within chart area bounds
          const clampedBarY = Math.max(barY, axisEndY);
          const clampedBarHeight = Math.min(segmentHeight, originY - clampedBarY);
          
          if (clampedBarHeight > 0) {
            // Ensure bar doesn't exceed X-axis bounds
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
        // Stacked: bars on top of each other
        // For stacked with negatives, we need to separate positive and negative segments
        const positiveSegments: typeof segments = [];
        const negativeSegments: typeof segments = [];
        
        segments.forEach(seg => {
          if (seg.value >= baseline) {
            positiveSegments.push(seg);
          } else {
            negativeSegments.push(seg);
          }
        });
        
        // Draw positive segments (stacked upward from baseline)
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
        
        // Draw negative segments (stacked downward from baseline)
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
        
        // Store total value label for later drawing
        const totalValue = segments.reduce((sum, seg) => sum + seg.value, 0);
        const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
        if (shouldShowValue) {
          const totalValueY = totalValue >= baseline ? baselineY - accumulatedPositiveHeight - 5 : baselineY + accumulatedNegativeHeight + 5;
          const totalValueBaseline = totalValue >= baseline ? 'bottom' : 'top';
          
          // Store value label position for this bar (for adjusting bar label position)
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
      // Lollipop chart: line with dot at end
      const barCenterX = barXStart + groupWidth / 2;
      const value = item.value ?? baseline;
      
      // Calculate value Y position
      let valueY: number;
      if (value >= baseline) {
        // Value above baseline
        const positiveRatio = (value - baseline) / (maxValue - minValue);
        valueY = baselineY - positiveRatio * chartAreaHeight;
      } else {
        // Value below baseline
        const negativeRatio = (baseline - value) / (maxValue - minValue);
        valueY = baselineY + negativeRatio * chartAreaHeight;
      }

      // Draw line from baseline to value position
      ctx.save();
      ctx.strokeStyle = item.color || '#4A90E2';
      ctx.lineWidth = lollipopLineWidth;
      ctx.beginPath();
      ctx.moveTo(barCenterX, baselineY);
      ctx.lineTo(barCenterX, valueY);
      ctx.stroke();
      
      // Draw dot/circle at value position with opacity, shadow, and stroke
      ctx.save();
      const dotOpacity = item.opacity ?? globalBarOpacity;
      if (dotOpacity !== undefined) {
        ctx.globalAlpha = dotOpacity;
      }
      
      // Apply shadow
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
      
      // Reset shadow before stroke
      if (dotShadow) {
        ctx.shadowColor = 'transparent';
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowBlur = 0;
      }
      
      // Draw dot border/stroke
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
        // Default border for better visibility if no stroke specified
        ctx.strokeStyle = item.color || '#4A90E2';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.restore();

      // Store value label for later drawing
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
      // Standard chart: single bar
      const barWidth = groupWidth;
      const value = item.value ?? baseline;
      
      // Calculate bar height and position based on value relative to baseline
      let barHeight: number;
      let barY: number;
      
      if (value >= baseline) {
        // Value above baseline: bar goes up from baseline
        const positiveRatio = (value - baseline) / (maxValue - minValue);
        barHeight = positiveRatio * chartAreaHeight;
        barY = baselineY - barHeight;
      } else {
        // Value below baseline: bar goes down from baseline
        const negativeRatio = (baseline - value) / (maxValue - minValue);
        barHeight = negativeRatio * chartAreaHeight;
        barY = baselineY;
      }

      // Draw bar with gradient, opacity, shadow, and stroke
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

      // Store value label for later drawing
      const shouldShowValue = item.showValue !== undefined ? item.showValue : showValues;
      if (shouldShowValue) {
        const valueLabelY = value >= baseline ? barY - 5 : barY + barHeight + 5;
        const valueLabelBaseline = value >= baseline ? 'bottom' : 'top';
        
        // Store value label position for this bar (for adjusting bar label position)
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

    // Store bar label information for later drawing
    if (showBarLabels) {
      ctx.save();
      ctx.fillStyle = item.labelColor || '#000000';
      ctx.font = `${axisLabelFontSize}px Arial`;
      
      let labelX: number, labelY: number;
      let textAlign: CanvasTextAlign = 'center';
      let textBaseline: CanvasTextBaseline = 'middle';
      
      // Calculate bar center - use groupWidth for all chart types
      const barCenterX = barXStart + groupWidth / 2;
      // For grouped/stacked, calculate appropriate center Y
      let barCenterY: number;
      if ((chartType === 'grouped' || chartType === 'stacked') && item.values && item.values.length > 0) {
        if (chartType === 'stacked') {
          // For stacked, use the total height
          const totalValue = item.values.reduce((sum, seg) => sum + seg.value, 0);
          const totalHeight = ((totalValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          barCenterY = originY - totalHeight / 2;
        } else {
          // For grouped, use the max value height
          const maxSegValue = Math.max(...item.values.map(seg => seg.value));
          const maxHeight = ((maxSegValue - minValue) / (maxValue - minValue)) * chartAreaHeight;
          barCenterY = originY - maxHeight / 2;
        }
      } else {
        // Standard chart
        const value = item.value ?? 0;
        const barHeight = ((value - minValue) / (maxValue - minValue)) * chartAreaHeight;
        barCenterY = originY - barHeight / 2;
      }
      
      // Use individual bar label position if provided, otherwise use global setting
      const currentLabelPosition = item.labelPosition ?? barLabelPosition;
      
      // Calculate top Y position for label
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
          // Check if there's a value label at the top - if so, position bar label below it
          const valueLabelInfo = valueLabelPositions.get(data.indexOf(item));
          if (valueLabelInfo && valueLabelInfo.baseline === 'bottom') {
            // Value label is at top, so position bar label below it
            // Value label uses 'bottom' baseline, so its top is at valueLabelInfo.y
            // Bar label uses 'bottom' baseline, so position it below the value label
            const spacing = 5; // Gap between value and bar label
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
          // Use white or black text based on bar color for better visibility
          const barColor = item.color || '#4A90E2';
          // Simple brightness check - if bar is dark, use white text
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
      
      // Calculate label color (for 'inside' position, check if bar is dark)
      let labelColor = item.labelColor || '#000000';
      if (currentLabelPosition === 'inside') {
        const barColor = item.color || '#4A90E2';
        const isDark = barColor === '#000000' || barColor.toLowerCase().includes('dark') || 
                       (barColor.startsWith('#') && parseInt(barColor.slice(1, 3), 16) < 128);
        labelColor = isDark ? '#FFFFFF' : (item.labelColor || '#000000');
      }
      
      // Store bar label for later drawing
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


// Example usage with organized, categorized configuration:
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
    // Chart Type
    type: 'standard', // 'standard' | 'grouped' | 'stacked' | 'horizontal'
    
    // Dimensions
    dimensions: {
      height: 600,
      padding: {
        top: 60,
        right: 80,
        bottom: 80,
        left: 100
      }
    },
    
    // Appearance
    appearance: {
      backgroundColor: 'white',
      // backgroundImage: './path/to/background.png', // Optional
      axisColor: '#000000',
      axisWidth: 2,
      arrowSize: 10
    },
    
    // Axes Configuration
    axes: {
      x: {
        label: 'Day',
        labelColor: 'black',
        values: [24, 25, 26, 27, 28, 29, 30, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
        // OR use range: { min: 0, max: 100, step: 20 }
        tickFontSize: 10,
        valueSpacing: 5 // Pixel spacing between each tick value (e.g., 5px gap between value 1 and 2)
      },
      y: {
        label: 'Count',
        labelColor: 'black',
        values: [0, 2, 4, 6, 8, 10, 12, 14],
        // OR use range: { min: 0, max: 14, step: 2 }
        tickFontSize: 10,
        valueSpacing: 3 // Pixel spacing between each tick value (e.g., 3px gap between value 0 and 2)
      }
    },
    
    // Labels & Text
    labels: {
      title: {
        text: 'Joined Members',
        fontSize: 18,
        color: '#000000'
      },
      barLabelDefaults: {
        show: true, // Global show/hide - each bar's label is defined in data
        defaultPosition: 'bottom', // Default when bar doesn't specify labelPosition
        fontSize: 12,
        defaultColor: '#000000' // Default when bar doesn't specify labelColor
      },
      valueLabelDefaults: {
        show: true, // Global show/hide - each bar can override with showValue
        fontSize: 11,
        defaultColor: '#000000' // Default when bar doesn't specify valueColor
      }
    },
    
    // Legend (always positioned at top)
    legend: {
      show: true,
      entries: [
        { color: '#50C878', label: 'Members' },
        { color: '#4A90E2', label: 'Bots' }
      ]
    },
    
    // Grid
    grid: {
      show: true,
      color: '#E0E0E0',
      width: 1
    }
  });

  fs.writeFileSync('./chart.png', chart);
})();
