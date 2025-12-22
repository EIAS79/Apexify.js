import { SKRSContext2D } from '@napi-rs/canvas';
import { TextObject } from '../types';

/**
 * The main function that draws text with optional wrapping.
 * @param ctx         CanvasRenderingContext2D
 * @param textOptions TextObject
 */
export function drawText(ctx: SKRSContext2D, textOptions: TextObject) {
  ctx.save();

  // 1) Apply rotation if any
  if (textOptions.rotation && textOptions.rotation !== 0) {
    ctx.translate(textOptions.x || 0, textOptions.y || 0);
    ctx.rotate((textOptions.rotation * Math.PI) / 180);
  }

  // 2) Setup font (for measuring and for final draw)
  const fontSize = textOptions.fontSize || 16;
  const isBold = textOptions.isBold ? 'bold ' : '';
  const fontFamily = textOptions.fontName || (textOptions.fontPath ? 'customFont' : 'Arial');
  ctx.font = `${isBold}${fontSize}px "${fontFamily}"`;

  // 3) Alignment, baseline
  ctx.textAlign = textOptions.textAlign || 'left';
  ctx.textBaseline = textOptions.textBaseline || 'alphabetic';

  // 4) Shadow
  if (textOptions.shadow) {
    const { color, offsetX, offsetY, blur, opacity } = textOptions.shadow;
    ctx.shadowColor = color || 'transparent';
    ctx.shadowOffsetX = offsetX || 0;
    ctx.shadowOffsetY = offsetY || 0;
    ctx.shadowBlur = blur || 0;
    ctx.globalAlpha = opacity !== undefined ? opacity : 1;
  }

  // 5) Opacity
  if (textOptions.opacity !== undefined) {
    if (textOptions.opacity < 0 || textOptions.opacity > 1) {
      throw new Error('Text opacity must be between 0 and 1.');
    }
    ctx.globalAlpha = textOptions.opacity;
  }

  // 6) If maxWidth is provided, we do word wrapping
  if (textOptions.maxWidth) {
    WrappedText(
      ctx,
      textOptions.text as string,
      textOptions.x || 0,
      textOptions.y || 0,
      textOptions.maxWidth,
      textOptions
    );
  } else {
    // No wrapping needed → just draw stroke + fill
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
    const fontSize = options.fontSize || 16;
    const lineHeight = options.lineHeight || fontSize * 1.4;
    const maxHeight = options.maxHeight;
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
  
    // 🔥 Ensure correct text alignment for Arabic & English
    ctx.textAlign = options.textAlign || "left";
  
    // 🎯 Draw each line with stroke & fill together
    let offsetY = 0;
    for (const line of lines) {
      drawStrokeAndFill(ctx, line, startX, startY + offsetY, options);
      offsetY += lineHeight;
    }
  }
    
/**
 * Draws a single line with correct alignment. Then uses `drawStrokeAndFill` to apply stroke, fill, etc.
 */
function drawLine(
  ctx: SKRSContext2D,
  lineText: string,
  startX: number,
  startY: number,
  maxWidth: number,
  options: TextObject
) {
  let xOffset = startX;

  // If user wants 'center' or 'right', we offset by measured width
  const measuredWidth = ctx.measureText(lineText).width;
  if (options.textAlign === 'center') {
    xOffset = startX + (maxWidth / 2) - (measuredWidth / 2);
  } else if (options.textAlign === 'right') {
    xOffset = startX + maxWidth - measuredWidth;
  }

  // Finally, draw stroke+fill for this line
  drawStrokeAndFill(ctx, lineText, xOffset, startY, options);
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
  const fontSize = options.fontSize || 16;
  const textWidth = ctx.measureText(text).width;
  const textHeight = fontSize;

  // Apply gradient fill if needed
  if (options.gradient) {
    const gradientFill = createGradient(
      ctx,
      options.gradient,
      x,
      y - textHeight,
      x + textWidth,
      y
    );
    ctx.fillStyle = gradientFill;
  } else {
    ctx.fillStyle = options.color || 'darkgray';
  }

  // Draw stroke first (if exists)
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
      ctx.strokeStyle = options.stroke.color || options.color || 'darkgray';
    }
    ctx.strokeText(text, x, y);
    ctx.restore();
  }

  // Then fill
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
) {
  if (!gradientOptions || !gradientOptions.type || !gradientOptions.colors) {
    throw new Error("Invalid gradient options. Provide a valid object with type and colors properties.");
  }

  let gradient: CanvasGradient;
  if (gradientOptions.type === "linear") {
    gradient = ctx.createLinearGradient(startX, startY, endX, endY);
  } else if (gradientOptions.type === "radial") {
    gradient = ctx.createRadialGradient(
      gradientOptions.startX || startX,
      gradientOptions.startY || startY,
      gradientOptions.startRadius || 0,
      gradientOptions.endX || endX,
      gradientOptions.endY || endY,
      gradientOptions.endRadius || 0
    );
  } else {
    throw new Error('Unsupported gradient type. Use "linear" or "radial".');
  }

  for (const colorStop of gradientOptions.colors) {
    gradient.addColorStop(colorStop.stop, colorStop.color);
  }

  return gradient;
}
