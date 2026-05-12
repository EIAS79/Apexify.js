import { SKRSContext2D } from '@napi-rs/canvas';
import { TextProperties, gradient } from '../types';
import { GlobalFonts } from '@napi-rs/canvas';
import path from 'path';
import { computeCircularArcPlacements } from '../text/curvedTextLayout';

/**
 * Enhanced text renderer with comprehensive styling options
 */
export class EnhancedTextRenderer {
  /** Vertical offset from `textBaseline: 'middle'` to alphabetic baseline (em-relative, Latin text). */
  private static readonly MIDDLE_TO_ALPHABETIC = 0.38;
  /**
   * Renders text with all enhanced features
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties configuration
   */
  static async renderText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    ctx.save();

    try {

      const fontPath = textProps.font?.path || textProps.fontPath;
      const fontName = textProps.font?.name || textProps.fontName;

      if (fontPath) {
        await this.registerCustomFont(fontPath, fontName || 'customFont');
      }

      this.applyTransformations(ctx, textProps);

      this.setupFont(ctx, textProps);

      this.setupAlignment(ctx, textProps);

      if (textProps.textOnCurve) {
        await this.renderCurvedLines(ctx, textProps);
      } else if (textProps.maxWidth) {
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
      const fullPath = path.isAbsolute(fontPath) ? fontPath : path.join(process.cwd(), fontPath);
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

    if (textProps.rotation && textProps.rotation !== 0) {
      ctx.translate(textProps.x, textProps.y);
      ctx.rotate((textProps.rotation * Math.PI) / 180);
      ctx.translate(-textProps.x, -textProps.y);
    }

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

    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const fontFamily = textProps.font?.name || textProps.fontName || textProps.font?.family || textProps.fontFamily || 'Arial';

    let fontString = '';

    if (textProps.bold) fontString += 'bold ';
    if (textProps.italic) fontString += 'italic ';

    fontString += `${fontSize}px "${fontFamily}"`;

    ctx.font = fontString;

    if (textProps.letterSpacing !== undefined) {
      ctx.letterSpacing = `${textProps.letterSpacing}px`;
    }

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
   * One or more lines, each drawn on its own circular arc (stacked vertically by line height).
   */
  private static async renderCurvedLines(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (textProps.lineHeight || 1.4) * fontSize;
    const lines = textProps.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = textProps.y + i * lineHeight;
      await this.renderCurvedLine(ctx, line, { ...textProps, y }, textProps.textOnCurve!);
    }
  }

  /**
   * Renders a single string on a circular arc. Anchor `(x, y)` is the **mid-string** point on the arc
   * (see `computeCircularArcPlacements` in `curvedTextLayout.ts`).
   */
  private static async renderCurvedLine(
    ctx: SKRSContext2D,
    line: string,
    textProps: TextProperties,
    curve: NonNullable<TextProperties['textOnCurve']>
  ): Promise<void> {
    const sweepDeg = curve.sweepAngle;
    if (!line || sweepDeg <= 0 || sweepDeg >= 360) {
      await this.renderTextLine(ctx, line, textProps.x, textProps.y, textProps);
      return;
    }

    const placements = computeCircularArcPlacements(ctx, line, textProps.x, textProps.y, {
      sweepDegrees: sweepDeg,
      radius: curve.radius,
      up: curve.up !== false,
      layoutMode: curve.layoutMode,
      baselineOffset: curve.baselineOffset,
      startAngleDeg: curve.startAngleDeg,
    });
    if (!placements || placements.length === 0) {
      await this.renderTextLine(ctx, line, textProps.x, textProps.y, textProps);
      return;
    }

    for (const p of placements) {
      this.renderRotatedGlyph(ctx, p.grapheme, p.x, p.y, p.rotationRad, textProps);
    }
  }

  /**
   * Single glyph with glow, shadow, stroke, fill; gradient uses local horizontal span of the glyph.
   */
  private static renderRotatedGlyph(
    ctx: SKRSContext2D,
    char: string,
    x: number,
    y: number,
    rotation: number,
    textProps: TextProperties
  ): void {
    const w = ctx.measureText(char).width;
    const fontSize = textProps.font?.size || textProps.fontSize || 16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // With textAlign 'center', (0,0) is the glyph center — same point as kerned arc math.
    // Using -w/2 here shifted every letter left by half its width and destroyed spacing on curves.
    const lx = 0;
    const ly = 0;

    if (textProps.highlight) {
      this.renderHighlightLocal(ctx, w, fontSize, textProps.highlight);
    }

    if (textProps.glow) {
      this.renderGlow(ctx, char, lx, ly, textProps.glow, true);
    }

    if (textProps.shadow) {
      this.renderShadow(ctx, char, lx, ly, textProps.shadow, true);
    }

    if (textProps.stroke) {
      this.renderStroke(ctx, char, lx, ly, textProps.stroke, true);
    }

    this.renderFill(ctx, char, lx, ly, textProps, true);

    if (textProps.underline || textProps.overline || textProps.strikethrough) {
      this.renderDecorationsLocal(ctx, w, fontSize, textProps);
    }

    ctx.restore();
  }

  /**
   * Highlight behind a single glyph in local space (origin = em middle, x along tangent).
   * Matches {@link renderHighlight} placement relative to alphabetic baseline.
   */
  private static renderHighlightLocal(
    ctx: SKRSContext2D,
    width: number,
    fontSize: number,
    highlight: NonNullable<TextProperties['highlight']>
  ): void {
    const baseline = fontSize * this.MIDDLE_TO_ALPHABETIC;
    const height = fontSize;
    const top = baseline - height * 0.8;
    const left = -width / 2;

    ctx.save();

    const opacity = highlight.opacity !== undefined ? highlight.opacity : 0.3;
    ctx.globalAlpha = opacity;

    if (highlight.gradient) {
      ctx.fillStyle = this.createGradient(ctx, highlight.gradient, left, top, left + width, top + height);
    } else {
      ctx.fillStyle = highlight.color || '#ffff00';
    }

    ctx.fillRect(left, top, width, height);

    ctx.restore();
  }

  /**
   * Underline / overline / strikethrough for one glyph in local space (same offsets as {@link renderDecorations}).
   */
  private static renderDecorationsLocal(
    ctx: SKRSContext2D,
    width: number,
    fontSize: number,
    textProps: TextProperties
  ): void {
    const hasDecorations = textProps.underline || textProps.overline || textProps.strikethrough;
    if (!hasDecorations) {
      return;
    }

    const baseline = fontSize * this.MIDDLE_TO_ALPHABETIC;
    const xLeft = -width / 2;
    const xRight = width / 2;
    const defaultColor = textProps.color || '#000000';

    ctx.save();

    const renderDecorationLine = (
      decorationY: number,
      decoration: boolean | { color?: string; gradient?: gradient; width?: number } | undefined
    ) => {
      if (!decoration) return;

      ctx.save();

      let decorationColor = defaultColor;
      let decorationWidth = Math.max(1, fontSize * 0.05);

      if (typeof decoration === 'object') {
        decorationColor = decoration.color || defaultColor;
        decorationWidth = decoration.width || decorationWidth;

        if (decoration.gradient) {
          ctx.strokeStyle = this.createGradient(ctx, decoration.gradient, xLeft, decorationY, xRight, decorationY);
        } else {
          ctx.strokeStyle = decorationColor;
        }
      } else {
        ctx.strokeStyle = decorationColor;
      }

      ctx.lineWidth = decorationWidth;

      ctx.beginPath();
      ctx.moveTo(xLeft, decorationY);
      ctx.lineTo(xRight, decorationY);
      ctx.stroke();

      ctx.restore();
    };

    if (textProps.underline) {
      const underlineY = baseline + fontSize * 0.1;
      renderDecorationLine(underlineY, textProps.underline);
    }

    if (textProps.overline) {
      const overlineY = baseline - fontSize * 0.8;
      renderDecorationLine(overlineY, textProps.overline);
    }

    if (textProps.strikethrough) {
      const strikethroughY = baseline - fontSize * 0.3;
      renderDecorationLine(strikethroughY, textProps.strikethrough);
    }

    ctx.restore();
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

    const explicitLines = textProps.text.split('\n');
    const allLines: string[] = [];

    for (const explicitLine of explicitLines) {
      if (!explicitLine.trim() && explicitLines.length > 1) {

        allLines.push('');
        continue;
      }

      const words = explicitLine.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? currentLine + ' ' + word : word;
        const testWidth = ctx.measureText(testLine).width;

        if (testWidth > (textProps.maxWidth || Infinity) && currentLine) {
          allLines.push(currentLine);
          currentLine = word;

          if (allLines.length >= maxLines) {
            currentLine = '...';
            break;
          }
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine && allLines.length < maxLines) {
        allLines.push(currentLine);
      }

      if (allLines.length >= maxLines) {
        break;
      }
    }

    for (let i = 0; i < allLines.length; i++) {
      const y = textProps.y + (i * lineHeight);
      await this.renderTextLine(ctx, allLines[i], textProps.x, y, textProps);
    }
  }

  /**
   * Renders single line text with all effects (handles \n line breaks)
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private static async renderSingleLine(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (textProps.lineHeight || 1.4) * fontSize;

    const lines = textProps.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const y = textProps.y + (i * lineHeight);
      await this.renderTextLine(ctx, lines[i], textProps.x, y, textProps);
    }
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

    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const textHeight = fontSize;

    if (textProps.highlight) {
      this.renderHighlight(ctx, x, y, textWidth, textHeight, textProps.highlight);
    }

    if (textProps.glow) {
      this.renderGlow(ctx, text, x, y, textProps.glow);
    }

    if (textProps.shadow) {
      this.renderShadow(ctx, text, x, y, textProps.shadow);
    }

    if (textProps.stroke) {
      this.renderStroke(ctx, text, x, y, textProps.stroke);
    }

    this.renderFill(ctx, text, x, y, textProps);

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

    if (highlight.gradient) {
      ctx.fillStyle = this.createGradient(ctx, highlight.gradient, x, y, x + width, y + height);
    } else {
      ctx.fillStyle = highlight.color || '#ffff00';
    }

const highlightY = y - height * 0.8;
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
    glow: { color?: string; gradient?: gradient; intensity?: number; opacity?: number },
    /** When true, `x` is horizontal center and linear gradients span ±half advance. */
    centerGlyph?: boolean
  ): void {
    ctx.save();

    const intensity = glow.intensity || 10;
    const opacity = glow.opacity !== undefined ? glow.opacity : 0.8;
    const w = ctx.measureText(text).width;
    const gx0 = centerGlyph ? x - w / 2 : x;
    const gx1 = centerGlyph ? x + w / 2 : x + w;

    if (glow.gradient) {

ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = intensity;
      ctx.globalAlpha = opacity;
      ctx.fillText(text, x, y);

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillStyle = this.createGradient(ctx, glow.gradient, gx0, y, gx1, y);
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
    shadow: { color?: string; gradient?: gradient; offsetX?: number; offsetY?: number; blur?: number; opacity?: number },
    centerGlyph?: boolean
  ): void {
    ctx.save();

    const blur = shadow.blur || 4;
    const opacity = shadow.opacity !== undefined ? shadow.opacity : 1;
    const w = ctx.measureText(text).width;
    const gx0 = centerGlyph ? x - w / 2 : x;
    const gx1 = centerGlyph ? x + w / 2 : x + w;

    ctx.shadowOffsetX = shadow.offsetX || 2;
    ctx.shadowOffsetY = shadow.offsetY || 2;

    if (shadow.gradient) {
      const gradientFill = this.createGradient(
        ctx,
        shadow.gradient,
        gx0,
        y,
        gx1,
        y
      );

      const shadowTint = (shadow.gradient.colors && shadow.gradient.colors[0] && shadow.gradient.colors[0].color) || shadow.color || 'rgba(0, 0, 0, 0.5)';

      ctx.fillStyle = gradientFill;
      ctx.shadowColor = shadowTint;
      ctx.shadowBlur = blur;
      ctx.globalAlpha = opacity;
      ctx.fillText(text, x, y);
    } else {
      ctx.shadowColor = shadow.color || 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = blur;
      if (shadow.opacity !== undefined) {
        ctx.globalAlpha = shadow.opacity;
      }

      ctx.fillText(text, x, y);
    }

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
    stroke: { color?: string; width?: number; gradient?: gradient; opacity?: number; style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double' },
    centerGlyph?: boolean
  ): void {
    ctx.save();

    const strokeWidth = stroke.width || 1;
    const strokeStyle = stroke.style || 'solid';
    const w = ctx.measureText(text).width;
    const gx0 = centerGlyph ? x - w / 2 : x;
    const gx1 = centerGlyph ? x + w / 2 : x + w;

    ctx.lineWidth = strokeWidth;

    if (stroke.gradient) {
      ctx.strokeStyle = this.createGradient(ctx, stroke.gradient, gx0, y, gx1, y);
    } else {
      ctx.strokeStyle = stroke.color || '#000000';
    }

    if (stroke.opacity !== undefined) {
      ctx.globalAlpha = stroke.opacity;
    }

    this.applyTextStrokeStyle(ctx, strokeStyle, strokeWidth);

    if (strokeStyle === 'groove' || strokeStyle === 'ridge' || strokeStyle === 'double') {
      this.renderComplexTextStroke(ctx, text, x, y, strokeStyle, strokeWidth, stroke.color, stroke.gradient, centerGlyph);
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
    textProps: TextProperties,
    centerGlyph?: boolean
  ): void {
    ctx.save();

    const w = ctx.measureText(text).width;
    const gx0 = centerGlyph ? x - w / 2 : x;
    const gx1 = centerGlyph ? x + w / 2 : x + w;

    if (textProps.gradient) {
      ctx.fillStyle = this.createGradient(ctx, textProps.gradient, gx0, y, gx1, y);
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
    _text: string,
    x: number,
    y: number,
    width: number,
    _height: number,
    textProps: TextProperties
  ): void {
    const hasDecorations = textProps.underline || textProps.overline || textProps.strikethrough;
    if (!hasDecorations) {
      return;
    }

    ctx.save();

    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const defaultColor = textProps.color || '#000000';

    const renderDecorationLine = (
      decorationY: number,
      decoration: boolean | { color?: string; gradient?: gradient; width?: number } | undefined,
      _lineName: string
    ) => {
      if (!decoration) return;

      ctx.save();

      let decorationColor = defaultColor;
let decorationWidth = Math.max(1, fontSize * 0.05);

      if (typeof decoration === 'object') {
        decorationColor = decoration.color || defaultColor;
        decorationWidth = decoration.width || decorationWidth;

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

    if (textProps.underline) {
      const underlineY = y + fontSize * 0.1;
      renderDecorationLine(underlineY, textProps.underline, 'underline');
    }

    if (textProps.overline) {
      const overlineY = y - fontSize * 0.8;
      renderDecorationLine(overlineY, textProps.overline, 'overline');
    }

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

    patternCtx.fillStyle = gradient;
    patternCtx.fillRect(0, 0, width, height);

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
    gradient?: gradient,
    centerGlyph?: boolean
  ): void {
    const halfWidth = width / 2;
    const textWidth = ctx.measureText(text).width;
    const gx0 = centerGlyph ? x - textWidth / 2 : x;
    const gx1 = centerGlyph ? x + textWidth / 2 : x + textWidth;

    switch (style) {
      case 'groove':

        ctx.lineWidth = halfWidth;

        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
        } else {
          ctx.strokeStyle = this.darkenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);

        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
        } else {
          ctx.strokeStyle = this.lightenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        break;

      case 'ridge':

        ctx.lineWidth = halfWidth;

        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
        } else {
          ctx.strokeStyle = this.lightenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);

        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
        } else {
          ctx.strokeStyle = this.darkenColor(color || '#000000', 0.3);
        }
        ctx.strokeText(text, x, y);
        break;

      case 'double':

        ctx.lineWidth = halfWidth;

        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
        } else {
          ctx.strokeStyle = color || '#000000';
        }
        ctx.strokeText(text, x, y);

        ctx.lineWidth = halfWidth;
        if (gradient) {
          ctx.strokeStyle = this.createGradient(ctx, gradient, gx0, y, gx1, y);
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

    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
      const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - factor)));
      const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - factor)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
return color;
  }

  /**
   * Lightens a color by a factor
   * @param color - Color string
   * @param factor - Lightening factor (0-1)
   * @returns Lightened color string
   */
  private static lightenColor(color: string, factor: number): string {

    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * factor));
      const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * factor));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
return color;
  }
}
