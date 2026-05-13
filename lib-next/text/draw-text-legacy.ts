import { GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import path from "path";
import { resolveTextDecorations, resolveTextEffects, resolveTextFill, resolveTextLayout, resolveTextPlacement, type TextObject } from "../types/text";

/**
 * The main function that draws text with optional wrapping.
 * @param ctx         CanvasRenderingContext2D
 * @param textOptions TextObject
 */
export function drawText(ctx: SKRSContext2D, textOptions: TextObject) {
  ctx.save();

  const pl = resolveTextPlacement(textOptions);
  const lay = resolveTextLayout(textOptions);
  const fillOpts = resolveTextFill(textOptions);
  const dec = resolveTextDecorations(textOptions);

  if (pl.rotation && pl.rotation !== 0) {
    ctx.translate(textOptions.x || 0, textOptions.y || 0);
    ctx.rotate((pl.rotation * Math.PI) / 180);
  }

  const fontPath = textOptions.font?.path ?? textOptions.fontPath;
  const fontName = textOptions.font?.name ?? textOptions.fontName;
  if (fontPath) {
    try {
      const fullPath = path.isAbsolute(fontPath) ? fontPath : path.join(process.cwd(), fontPath);
      GlobalFonts.registerFromPath(fullPath, fontName || "customFont");
    } catch (err) {
      console.warn(`drawText: failed to register font from path: ${fontPath}`, err);
    }
  }

  const fontSize = textOptions.font?.size ?? textOptions.fontSize ?? 16;
  let prefix = "";
  if (dec.bold || textOptions.isBold) prefix += "bold ";
  if (dec.italic) prefix += "italic ";
  const fontFamily =
    textOptions.font?.name ??
    textOptions.fontName ??
    textOptions.font?.family ??
    textOptions.fontFamily ??
    (fontPath ? "customFont" : "Arial");
  ctx.font = `${prefix}${fontSize}px "${fontFamily}"`;

  ctx.textAlign = pl.textAlign || "left";
  ctx.textBaseline = pl.textBaseline || "alphabetic";

  const legacyEffects = resolveTextEffects(textOptions);
  if (legacyEffects.shadow) {
    const { color, offsetX, offsetY, blur, opacity } = legacyEffects.shadow;
    ctx.shadowColor = color || 'transparent';
    ctx.shadowOffsetX = offsetX || 0;
    ctx.shadowOffsetY = offsetY || 0;
    ctx.shadowBlur = blur || 0;
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  }

  if (fillOpts.opacity !== undefined) {
    if (fillOpts.opacity < 0 || fillOpts.opacity > 1) {
      throw new Error("Text opacity must be between 0 and 1.");
    }
    ctx.globalAlpha = fillOpts.opacity;
  }

  if (lay.maxWidth) {
    WrappedText(
      ctx,
      textOptions.text as string,
      textOptions.x || 0,
      textOptions.y || 0,
      lay.maxWidth,
      textOptions
    );
  } else {
    drawStrokeAndFill(ctx, textOptions.text as string, textOptions.x || 0, textOptions.y || 0, textOptions);
  }

  ctx.restore();
}

/**
 * Handles word-based wrapping. Then draws each line with stroke, fill, gradient, etc.
 */
export function WrappedText(
  ctx: SKRSContext2D,
  text: string,
  startX: number,
  startY: number,
  maxWidth: number,
  options: TextObject
) {
  const lay = resolveTextLayout(options);
  const pl = resolveTextPlacement(options);
  const fontSize = options.font?.size ?? options.fontSize ?? 16;
  const lineHeight = (lay.lineHeight || 1.4) * fontSize;
  const maxHeight = lay.maxHeight;
  const maxLines = maxHeight ? Math.floor(maxHeight / lineHeight) : Infinity;

  let currentLine = "";
  const words = text.split(" ");
  const lines: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine ? currentLine + " " + words[i] : words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = words[i];

      if (lines.length >= maxLines) {
        currentLine = "...";
        break;
      }
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  ctx.textAlign = pl.textAlign || "left";

  let offsetY = 0;
  for (const line of lines) {
    drawStrokeAndFill(ctx, line, startX, startY + offsetY, options);
    offsetY += lineHeight;
  }
}

/**
 * Actually draws stroke (if any) and fill for the given text & position.
 */
function drawStrokeAndFill(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  options: TextObject
) {
  const fontSize = options.font?.size ?? options.fontSize ?? 16;
  const textWidth = ctx.measureText(text).width;
  const textHeight = fontSize;
  const fill = resolveTextFill(options);

  if (fill.gradient) {
    const gradientFill = createGradient(
      ctx,
      fill.gradient,
      x,
      y - textHeight,
      x + textWidth,
      y
    );
    ctx.fillStyle = gradientFill;
  } else {
    ctx.fillStyle = fill.color || "darkgray";
  }

  if (options.stroke) {
    ctx.save();
    ctx.lineWidth = options.stroke.width || 1;
    if (options.stroke.gradient) {
      const gradientStroke = createGradient(
        ctx,
        options.stroke.gradient,
        x,
        y - textHeight,
        x + textWidth,
        y
      );
      ctx.strokeStyle = gradientStroke;
    } else {
      ctx.strokeStyle = options.stroke.color || fill.color || "darkgray";
    }
    ctx.strokeText(text, x, y);
    ctx.restore();
  }

  ctx.fillText(text, x, y);
}

/**
 * Creates a linear or radial gradient for fill/stroke.
 */
export function createGradient(
  ctx: SKRSContext2D,
  gradientOptions: any,
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
      return createRepeatingGradientPattern(ctx, gradient, gradientOptions.repeat, width, height);
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
      return createRepeatingGradientPattern(ctx, gradient, gradientOptions.repeat, width, height);
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
function createRepeatingGradientPattern(
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
