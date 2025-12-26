import { SKRSContext2D } from '@napi-rs/canvas';
import { TextProperties, gradient } from '../types';
import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';

/**
 * Enhanced text renderer with comprehensive styling options
 */
export class EnhancedTextRenderer {
  /**
   * Renders text with all enhanced features
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties configuration
   */
  static async renderText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    ctx.save();

    try {
      // 1. Register custom font if provided (support both new and legacy properties)
      const fontPath = textProps.font?.path || textProps.fontPath;
      const fontName = textProps.font?.name || textProps.fontName;
      
      if (fontPath) {
        await this.registerCustomFont(fontPath, fontName || 'customFont');
      }

      // 2. Apply transformations
      this.applyTransformations(ctx, textProps);

      // 3. Setup font and spacing
      this.setupFont(ctx, textProps);

      // 4. Apply text alignment
      this.setupAlignment(ctx, textProps);

      // 5. Handle text wrapping or single line rendering
      if (textProps.maxWidth) {
        await this.renderWrappedText(ctx, textProps);
      } else {
        await this.renderSingleLine(ctx, textProps);
      }

    } finally {
      ctx.restore();
    }
  }

  /**
   * Registers a custom font from file path
   * @param fontPath - Path to font file
   * @param fontName - Name to register the font as
   */
  private static async registerCustomFont(fontPath: string, fontName: string): Promise<void> {
    try {
      const fullPath = path.join(process.cwd(), fontPath);
      GlobalFonts.registerFromPath(fullPath, fontName);
    } catch (error) {
      console.warn(`Failed to register font from path: ${fontPath}`, error);
    }
  }

  /**
   * Applies transformations (rotation, opacity)
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static applyTransformations(ctx: SKRSContext2D, textProps: TextProperties): void {
    // Apply rotation
    if (textProps.rotation && textProps.rotation !== 0) {
      ctx.translate(textProps.x, textProps.y);
      ctx.rotate((textProps.rotation * Math.PI) / 180);
      ctx.translate(-textProps.x, -textProps.y);
    }

    // Apply global opacity
    if (textProps.opacity !== undefined) {
      ctx.globalAlpha = Math.max(0, Math.min(1, textProps.opacity));
    }
  }

  /**
   * Sets up font properties and spacing
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static setupFont(ctx: SKRSContext2D, textProps: TextProperties): void {
    // Support both new font object and legacy properties
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const fontFamily = textProps.font?.name || textProps.fontName || textProps.font?.family || textProps.fontFamily || 'Arial';
    
    // Build font string with decorations
    let fontString = '';
    
    if (textProps.bold) fontString += 'bold ';
    if (textProps.italic) fontString += 'italic ';
    
    fontString += `${fontSize}px "${fontFamily}"`;
    
    ctx.font = fontString;

    // Apply letter spacing
    if (textProps.letterSpacing !== undefined) {
      ctx.letterSpacing = `${textProps.letterSpacing}px`;
    }

    // Apply word spacing
    if (textProps.wordSpacing !== undefined) {
      ctx.wordSpacing = `${textProps.wordSpacing}px`;
    }
  }

  /**
   * Sets up text alignment
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static setupAlignment(ctx: SKRSContext2D, textProps: TextProperties): void {
    ctx.textAlign = textProps.textAlign || 'left';
    ctx.textBaseline = textProps.textBaseline || 'alphabetic';
  }

  /**
   * Renders wrapped text with all effects
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static async renderWrappedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (textProps.lineHeight || 1.4) * fontSize;
    const maxHeight = textProps.maxHeight;
    const maxLines = maxHeight ? Math.floor(maxHeight / lineHeight) : Infinity;

    // Split text into words and wrap
    const words = textProps.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > (textProps.maxWidth || Infinity) && currentLine) {
        lines.push(currentLine);
        currentLine = word;

        if (lines.length >= maxLines) {
          currentLine = '...';
          break;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine && lines.length < maxLines) {
      lines.push(currentLine);
    }

    // Render each line
    for (let i = 0; i < lines.length; i++) {
      const y = textProps.y + (i * lineHeight);
      await this.renderTextLine(ctx, lines[i], textProps.x, y, textProps);
    }
  }

  /**
   * Renders single line text with all effects
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static async renderSingleLine(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    await this.renderTextLine(ctx, textProps.text, textProps.x, textProps.y, textProps);
  }

  /**
   * Renders a single line of text with all effects applied
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param textProps - Text properties
   */
  private static async renderTextLine(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    textProps: TextProperties
  ): Promise<void> {
    // Calculate text dimensions
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const textHeight = fontSize;

    // Apply highlight background
    if (textProps.highlight) {
      this.renderHighlight(ctx, x, y, textWidth, textHeight, textProps.highlight);
    }

    // Apply glow effect
    if (textProps.glow) {
      this.renderGlow(ctx, text, x, y, textProps.glow);
    }

    // Apply shadow effect
    if (textProps.shadow) {
      this.renderShadow(ctx, text, x, y, textProps.shadow);
    }

    // Apply stroke
    if (textProps.stroke) {
      this.renderStroke(ctx, text, x, y, textProps.stroke);
    }

    // Apply fill
    this.renderFill(ctx, text, x, y, textProps);

    // Apply text decorations
    this.renderDecorations(ctx, text, x, y, textWidth, textHeight, textProps);
  }

  /**
   * Renders highlight background
   * @param ctx - Canvas 2D context
   * @param x - X position
   * @param y - Y position
   * @param width - Text width
   * @param height - Text height
   * @param highlight - Highlight options
   */
  private static renderHighlight(
    ctx: SKRSContext2D, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    highlight: { color?: string; gradient?: gradient; opacity?: number }
  ): void {
    ctx.save();
    
    const opacity = highlight.opacity !== undefined ? highlight.opacity : 0.3;
    ctx.globalAlpha = opacity;
    
    // Set fill style (gradient or color)
    if (highlight.gradient) {
      ctx.fillStyle = this.createGradient(ctx, highlight.gradient, x, y, x + width, y + height);
    } else {
      ctx.fillStyle = highlight.color || '#ffff00';
    }
    
    // Adjust highlight position based on text baseline
    const highlightY = y - height * 0.8; // Adjust for different baselines
    ctx.fillRect(x, highlightY, width, height);
    
    ctx.restore();
  }

  /**
   * Renders glow effect
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param glow - Glow options
   */
  private static renderGlow(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    glow: { color?: string; gradient?: gradient; intensity?: number; opacity?: number }
  ): void {
    ctx.save();
    
    const intensity = glow.intensity || 10;
    const opacity = glow.opacity !== undefined ? glow.opacity : 0.8;
    
    // For glow, we need to use shadowColor which only supports solid colors
    // So we'll render the glow with the base color and then overlay with gradient if needed
    if (glow.gradient) {
      // First render with shadow for glow effect
      ctx.shadowColor = '#ffffff'; // Use white as base for glow
      ctx.shadowBlur = intensity;
      ctx.globalAlpha = opacity;
      ctx.fillText(text, x, y);
      
      // Then overlay with gradient
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.createGradient(ctx, glow.gradient, x, y, x + ctx.measureText(text).width, y);
      ctx.fillText(text, x, y);
    } else {
      ctx.shadowColor = glow.color || '#ffffff';
      ctx.shadowBlur = intensity;
      ctx.globalAlpha = opacity;
      ctx.fillText(text, x, y);
    }
    
    ctx.restore();
  }

  /**
   * Renders shadow effect
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param shadow - Shadow options
   */
  private static renderShadow(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    shadow: { color?: string; offsetX?: number; offsetY?: number; blur?: number; opacity?: number }
  ): void {
    ctx.save();
    
    ctx.shadowColor = shadow.color || 'rgba(0, 0, 0, 0.5)';
    ctx.shadowOffsetX = shadow.offsetX || 2;
    ctx.shadowOffsetY = shadow.offsetY || 2;
    ctx.shadowBlur = shadow.blur || 4;
    
    if (shadow.opacity !== undefined) {
      ctx.globalAlpha = shadow.opacity;
    }
    
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }

  /**
   * Renders stroke/outline
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param stroke - Stroke options
   */
  private static renderStroke(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    stroke: { color?: string; width?: number; gradient?: gradient; opacity?: number; style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double' }
  ): void {
    ctx.save();
    
    const strokeWidth = stroke.width || 1;
    const strokeStyle = stroke.style || 'solid';
    
    ctx.lineWidth = strokeWidth;
    
    if (stroke.gradient) {
      ctx.strokeStyle = this.createGradient(ctx, stroke.gradient, x, y, x + ctx.measureText(text).width, y);
    } else {
      ctx.strokeStyle = stroke.color || '#000000';
    }
    
    if (stroke.opacity !== undefined) {
      ctx.globalAlpha = stroke.opacity;
    }
    
    // Apply stroke style
    this.applyTextStrokeStyle(ctx, strokeStyle, strokeWidth);
    
    // Handle complex stroke styles
    if (strokeStyle === 'groove' || strokeStyle === 'ridge' || strokeStyle === 'double') {
      this.renderComplexTextStroke(ctx, text, x, y, strokeStyle, strokeWidth, stroke.color, stroke.gradient);
    } else {
      ctx.strokeText(text, x, y);
    }
    
    ctx.restore();
  }

  /**
   * Renders text fill
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param textProps - Text properties
   */
  private static renderFill(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    textProps: TextProperties
  ): void {
    ctx.save();
    
    if (textProps.gradient) {
      ctx.fillStyle = this.createGradient(ctx, textProps.gradient, x, y, x + ctx.measureText(text).width, y);
    } else {
      ctx.fillStyle = textProps.color || '#000000';
    }
    
    ctx.fillText(text, x, y);
    
    ctx.restore();
  }

  /**
   * Renders text decorations (underline, overline, strikethrough)
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param width - Text width
   * @param height - Text height
   * @param textProps - Text properties
   */
  private static renderDecorations(
    ctx: SKRSContext2D, 
    text: string, 
    x: number, 
    y: number, 
    width: number, 
    height: number, 
    textProps: TextProperties
  ): void {
    const hasDecorations = textProps.underline || textProps.overline || textProps.strikethrough;
    if (!hasDecorations) {
      return;
    }

    ctx.save();
    
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const defaultColor = textProps.color || '#000000';
    
    // Helper function to render a decoration line
    const renderDecorationLine = (
      decorationY: number,
      decoration: boolean | { color?: string; gradient?: gradient; width?: number } | undefined,
      lineName: string
    ) => {
      if (!decoration) return;
      
      ctx.save();
      
      let decorationColor = defaultColor;
      let decorationWidth = Math.max(1, fontSize * 0.05); // 5% of font size
      
      if (typeof decoration === 'object') {
        decorationColor = decoration.color || defaultColor;
        decorationWidth = decoration.width || decorationWidth;
        
        // Set stroke style (gradient or color)
        if (decoration.gradient) {
          ctx.strokeStyle = this.createGradient(ctx, decoration.gradient, x, decorationY, x + width, decorationY);
        } else {
          ctx.strokeStyle = decorationColor;
        }
      } else {
        ctx.strokeStyle = decorationColor;
      }
      
      ctx.lineWidth = decorationWidth;
      
      ctx.beginPath();
      ctx.moveTo(x, decorationY);
      ctx.lineTo(x + width, decorationY);
      ctx.stroke();
      
      ctx.restore();
    };
    
    // Underline
    if (textProps.underline) {
      const underlineY = y + fontSize * 0.1;
      renderDecorationLine(underlineY, textProps.underline, 'underline');
    }
    
    // Overline
    if (textProps.overline) {
      const overlineY = y - fontSize * 0.8;
      renderDecorationLine(overlineY, textProps.overline, 'overline');
    }
    
    // Strikethrough
    if (textProps.strikethrough) {
      const strikethroughY = y - fontSize * 0.3;
      renderDecorationLine(strikethroughY, textProps.strikethrough, 'strikethrough');
    }
    
    ctx.restore();
  }

  /**
   * Creates a gradient for text fill or stroke
   * @param ctx - Canvas 2D context
   * @param gradientOptions - Gradient configuration
   * @param startX - Start X position
   * @param startY - Start Y position
   * @param endX - End X position
   * @param endY - End Y position
   * @returns Canvas gradient
   */
  private static createGradient(
    ctx: SKRSContext2D,
    gradientOptions: gradient,
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): CanvasGradient | CanvasPattern {
    if (!gradientOptions || !gradientOptions.type || !gradientOptions.colors) {
      throw new Error("Invalid gradient options. Provide a valid object with type and colors properties.");
    }

    let gradient: CanvasGradient;
    const width = Math.abs(endX - startX) || 100;
    const height = Math.abs(endY - startY) || 100;
    
    if (gradientOptions.type === "linear") {
      gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      for (const colorStop of gradientOptions.colors) {
        gradient.addColorStop(colorStop.stop, colorStop.color);
      }
      
      // Handle repeat mode for linear gradients
      if (gradientOptions.repeat && gradientOptions.repeat !== 'no-repeat') {
        return this.createRepeatingGradientPattern(ctx, gradient, gradientOptions.repeat, width, height);
      }
      
      return gradient;
    } else if (gradientOptions.type === "radial") {
      gradient = ctx.createRadialGradient(
        gradientOptions.startX || startX,
        gradientOptions.startY || startY,
        gradientOptions.startRadius || 0,
        gradientOptions.endX || endX,
        gradientOptions.endY || endY,
        gradientOptions.endRadius || 0
      );
      for (const colorStop of gradientOptions.colors) {
        gradient.addColorStop(colorStop.stop, colorStop.color);
      }
      
      // Handle repeat mode for radial gradients
      if (gradientOptions.repeat && gradientOptions.repeat !== 'no-repeat') {
        return this.createRepeatingGradientPattern(ctx, gradient, gradientOptions.repeat, width, height);
      }
      
      return gradient;
    } else if (gradientOptions.type === "conic") {
      const centerX = gradientOptions.centerX ?? (startX + endX) / 2;
      const centerY = gradientOptions.centerY ?? (startY + endY) / 2;
      const startAngle = gradientOptions.startAngle ?? 0;
      const angleRad = (startAngle * Math.PI) / 180;
      
      gradient = ctx.createConicGradient(angleRad, centerX, centerY);
      for (const colorStop of gradientOptions.colors) {
        gradient.addColorStop(colorStop.stop, colorStop.color);
      }
      
      return gradient;
    } else {
      throw new Error('Unsupported gradient type. Use "linear", "radial", or "conic".');
    }
  }

  /**
   * Creates a repeating gradient pattern for linear and radial gradients
   * @private
   */
  private static createRepeatingGradientPattern(
    ctx: SKRSContext2D,
    gradient: CanvasGradient,
    repeat: 'repeat' | 'reflect',
    width: number,
    height: number
  ): CanvasPattern {
    const { createCanvas } = require('@napi-rs/canvas');
    const patternCanvas = createCanvas(width, height);
    const patternCtx = patternCanvas.getContext('2d') as SKRSContext2D;
    
    // Draw the gradient on the pattern canvas
    patternCtx.fillStyle = gradient;
    patternCtx.fillRect(0, 0, width, height);
    
    // Create pattern from the canvas
    const pattern = ctx.createPattern(patternCanvas, repeat === 'reflect' ? 'repeat' : 'repeat');
    if (!pattern) {
      throw new Error('Failed to create repeating gradient pattern');
    }
    
    return pattern;
  }

  /**
   * Applies stroke style to text context
   * @param ctx - Canvas 2D context
   * @param style - Stroke style type
   * @param width - Stroke width for calculating dash patterns
   */
  private static applyTextStrokeStyle(
    ctx: SKRSContext2D,
    style: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double',
    width: number
  ): void {
    switch (style) {
      case 'solid':
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      case 'dashed':
        ctx.setLineDash([width * 3, width * 2]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      case 'dotted':
        ctx.setLineDash([width, width]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        break;
        
      case 'groove':
      case 'ridge':
      case 'double':
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      default:
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
    }
  }

  /**
   * Renders complex text stroke styles that require multiple passes
   * @param ctx - Canvas 2D context
   * @param text - Text to render
   * @param x - X position
   * @param y - Y position
   * @param style - Complex stroke style type
   * @param width - Stroke width
   * @param color - Base stroke color
   * @param gradient - Optional gradient
   */
  private static renderComplexTextStroke(
    ctx: SKRSContext2D,
    text: string,
    x: number,
    y: number,
    style: 'groove' | 'ridge' | 'double',
    width: number,
    color?: string,
    gradient?: gradient
  ): void {
    const halfWidth = width / 2;
    const textWidth = ctx.measureText(text).width;
    
    switch (style) {
      case 'groove':
        // Groove: dark outer, light inner
        ctx.lineWidth = halfWidth;
        
        // Outer dark stroke
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = this.darkenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        
        // Inner light stroke
        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = this.lightenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        break;
        
      case 'ridge':
        // Ridge: light outer, dark inner
        ctx.lineWidth = halfWidth;
        
        // Outer light stroke
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = this.lightenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        
        // Inner dark stroke
        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = this.darkenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        break;
        
      case 'double':
        // Double: two parallel strokes
        ctx.lineWidth = halfWidth;
        
        // First stroke (outer)
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = color || '#000000';
        }
        ctx.strokeText(text, x, y);
        
        // Second stroke (inner)
        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, x, y, x + textWidth, y);
        } else {
          ctx.strokeStyle = color || '#000000';
        }
        ctx.strokeText(text, x, y);
        break;
    }
  }

  /**
   * Darkens a color by a factor
   * @param color - Color string
   * @param factor - Darkening factor (0-1)
   * @returns Darkened color string
   */
  private static darkenColor(color: string, factor: number): string {
    // Simple darkening for hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
      const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - factor)));
      const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - factor)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color; // Return original for non-hex colors
  }

  /**
   * Lightens a color by a factor
   * @param color - Color string
   * @param factor - Lightening factor (0-1)
   * @returns Lightened color string
   */
  private static lightenColor(color: string, factor: number): string {
    // Simple lightening for hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * factor));
      const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * factor));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color; // Return original for non-hex colors
  }
}
