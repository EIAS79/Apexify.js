import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  TextGlowStyle,
  TextHighlightStyle,
  TextLineDecoration,
  TextProperties,
  TextShadowStyle,
} from "../types/text";
import { resolveTextDecorations, resolveTextEffects, resolveTextFill } from "../types/text";
import type { gradient } from "../types/gradient";
import { TEXT_MIDDLE_TO_ALPHABETIC } from "./text-layout";

export function createTextGradient(
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

  let grad: CanvasGradient;
  const width = Math.abs(endX - startX) || 100;
  const height = Math.abs(endY - startY) || 100;

  if (gradientOptions.type === "linear") {
    grad = ctx.createLinearGradient(startX, startY, endX, endY);
    for (const colorStop of gradientOptions.colors) {
      grad.addColorStop(colorStop.stop, colorStop.color);
    }

    if (gradientOptions.repeat && gradientOptions.repeat !== "no-repeat") {
      return createTextRepeatingGradientPattern(ctx, grad, gradientOptions.repeat, width, height);
    }

    return grad;
  }

  if (gradientOptions.type === "radial") {
    grad = ctx.createRadialGradient(
      gradientOptions.startX || startX,
      gradientOptions.startY || startY,
      gradientOptions.startRadius || 0,
      gradientOptions.endX || endX,
      gradientOptions.endY || endY,
      gradientOptions.endRadius || 0
    );
    for (const colorStop of gradientOptions.colors) {
      grad.addColorStop(colorStop.stop, colorStop.color);
    }

    if (gradientOptions.repeat && gradientOptions.repeat !== "no-repeat") {
      return createTextRepeatingGradientPattern(ctx, grad, gradientOptions.repeat, width, height);
    }

    return grad;
  }

  if (gradientOptions.type === "conic") {
    const centerX = gradientOptions.centerX ?? (startX + endX) / 2;
    const centerY = gradientOptions.centerY ?? (startY + endY) / 2;
    const startAngle = gradientOptions.startAngle ?? 0;
    const angleRad = (startAngle * Math.PI) / 180;

    grad = ctx.createConicGradient(angleRad, centerX, centerY);
    for (const colorStop of gradientOptions.colors) {
      grad.addColorStop(colorStop.stop, colorStop.color);
    }

    return grad;
  }

  throw new Error('Unsupported gradient type. Use "linear", "radial", or "conic".');
}

export function createTextRepeatingGradientPattern(
  ctx: SKRSContext2D,
  grad: CanvasGradient,
  repeat: "repeat" | "reflect",
  width: number,
  height: number
): CanvasPattern {
  const patternCanvas = createCanvas(width, height);
  const patternCtx = patternCanvas.getContext("2d") as SKRSContext2D;

  patternCtx.fillStyle = grad;
  patternCtx.fillRect(0, 0, width, height);

  const pattern = ctx.createPattern(patternCanvas, repeat === "reflect" ? "repeat" : "repeat");
  if (!pattern) {
    throw new Error("Failed to create repeating gradient pattern");
  }

  return pattern;
}

export function darkenTextColor(color: string, factor: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00ff) * (1 - factor)));
    const b = Math.max(0, Math.floor((num & 0x0000ff) * (1 - factor)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }
  return color;
}

export function lightenTextColor(color: string, factor: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * factor));
    const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * factor));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }
  return color;
}

export function applyTextStrokeDashStyle(
  ctx: SKRSContext2D,
  style: "solid" | "dashed" | "dotted" | "groove" | "ridge" | "double",
  width: number
): void {
  switch (style) {
    case "solid":
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;

    case "dashed":
      ctx.setLineDash([width * 3, width * 2]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;

    case "dotted":
      ctx.setLineDash([width, width]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      break;

    case "groove":
    case "ridge":
    case "double":
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;

    default:
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;
  }
}

export function renderComplexTextStroke(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  style: "groove" | "ridge" | "double",
  width: number,
  color?: string,
  grad?: gradient,
  centerGlyph?: boolean
): void {
  const halfWidth = width / 2;
  const textWidth = ctx.measureText(text).width;
  const gx0 = centerGlyph ? x - textWidth / 2 : x;
  const gx1 = centerGlyph ? x + textWidth / 2 : x + textWidth;

  switch (style) {
    case "groove":
      ctx.lineWidth = halfWidth;

      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = darkenTextColor(color || "#000000", 0.3);
      }
      ctx.strokeText(text, x, y);

      ctx.lineWidth = halfWidth;
      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = lightenTextColor(color || "#000000", 0.3);
      }
      ctx.strokeText(text, x, y);
      break;

    case "ridge":
      ctx.lineWidth = halfWidth;

      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = lightenTextColor(color || "#000000", 0.3);
      }
      ctx.strokeText(text, x, y);

      ctx.lineWidth = halfWidth;
      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = darkenTextColor(color || "#000000", 0.3);
      }
      ctx.strokeText(text, x, y);
      break;

    case "double":
      ctx.lineWidth = halfWidth;

      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = color || "#000000";
      }
      ctx.strokeText(text, x, y);

      ctx.lineWidth = halfWidth;
      if (grad) {
        ctx.strokeStyle = createTextGradient(ctx, grad, gx0, y, gx1, y);
      } else {
        ctx.strokeStyle = color || "#000000";
      }
      ctx.strokeText(text, x, y);
      break;
  }
}

export function renderTextHighlight(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  highlight: TextHighlightStyle
): void {
  ctx.save();

  const opacity = highlight.opacity !== undefined ? highlight.opacity : 0.3;
  ctx.globalAlpha = opacity;

  if (highlight.gradient) {
    ctx.fillStyle = createTextGradient(ctx, highlight.gradient, x, y, x + width, y + height);
  } else {
    ctx.fillStyle = highlight.color || "#ffff00";
  }

  const highlightY = y - height * 0.8;
  ctx.fillRect(x, highlightY, width, height);

  ctx.restore();
}

export function renderTextGlow(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  glow: TextGlowStyle,
  centerGlyph?: boolean
): void {
  ctx.save();

  const intensity = glow.intensity || 10;
  const opacity = glow.opacity !== undefined ? glow.opacity : 0.8;
  const w = ctx.measureText(text).width;
  const gx0 = centerGlyph ? x - w / 2 : x;
  const gx1 = centerGlyph ? x + w / 2 : x + w;

  if (glow.gradient) {
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = intensity;
    ctx.globalAlpha = opacity;
    ctx.fillText(text, x, y);

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = createTextGradient(ctx, glow.gradient, gx0, y, gx1, y);
    ctx.fillText(text, x, y);
  } else {
    ctx.shadowColor = glow.color || "#ffffff";
    ctx.shadowBlur = intensity;
    ctx.globalAlpha = opacity;
    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

export function renderTextShadow(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  shadow: TextShadowStyle,
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
    const gradientFill = createTextGradient(ctx, shadow.gradient, gx0, y, gx1, y);

    const shadowTint =
      (shadow.gradient.colors && shadow.gradient.colors[0] && shadow.gradient.colors[0].color) ||
      shadow.color ||
      "rgba(0, 0, 0, 0.5)";

    ctx.fillStyle = gradientFill;
    ctx.shadowColor = shadowTint;
    ctx.shadowBlur = blur;
    ctx.globalAlpha = opacity;
    ctx.fillText(text, x, y);
  } else {
    ctx.shadowColor = shadow.color || "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = blur;
    if (shadow.opacity !== undefined) {
      ctx.globalAlpha = shadow.opacity;
    }

    ctx.fillText(text, x, y);
  }

  ctx.restore();
}

export function renderTextStroke(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  stroke: {
    color?: string;
    width?: number;
    gradient?: gradient;
    opacity?: number;
    style?: "solid" | "dashed" | "dotted" | "groove" | "ridge" | "double";
  },
  centerGlyph?: boolean
): void {
  ctx.save();

  const strokeWidth = stroke.width || 1;
  const strokeStyle = stroke.style || "solid";
  const w = ctx.measureText(text).width;
  const gx0 = centerGlyph ? x - w / 2 : x;
  const gx1 = centerGlyph ? x + w / 2 : x + w;

  ctx.lineWidth = strokeWidth;

  if (stroke.gradient) {
    ctx.strokeStyle = createTextGradient(ctx, stroke.gradient, gx0, y, gx1, y);
  } else {
    ctx.strokeStyle = stroke.color || "#000000";
  }

  if (stroke.opacity !== undefined) {
    ctx.globalAlpha = stroke.opacity;
  }

  applyTextStrokeDashStyle(ctx, strokeStyle, strokeWidth);

  if (strokeStyle === "groove" || strokeStyle === "ridge" || strokeStyle === "double") {
    renderComplexTextStroke(ctx, text, x, y, strokeStyle, strokeWidth, stroke.color, stroke.gradient, centerGlyph);
  } else {
    ctx.strokeText(text, x, y);
  }

  ctx.restore();
}

export function renderTextFill(
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

  const fill = resolveTextFill(textProps);
  if (fill.gradient) {
    ctx.fillStyle = createTextGradient(ctx, fill.gradient, gx0, y, gx1, y);
  } else {
    ctx.fillStyle = fill.color || "#000000";
  }

  ctx.fillText(text, x, y);

  ctx.restore();
}

export function renderTextDecorations(
  ctx: SKRSContext2D,
  _text: string,
  x: number,
  y: number,
  width: number,
  _height: number,
  textProps: TextProperties
): void {
  const dec = resolveTextDecorations(textProps);
  const hasDecorations = dec.underline || dec.overline || dec.strikethrough;
  if (!hasDecorations) {
    return;
  }

  ctx.save();

  const fontSize = textProps.font?.size || textProps.fontSize || 16;
  const defaultColor = resolveTextFill(textProps).color || "#000000";

  const renderDecorationLine = (
    decorationY: number,
    decoration: TextLineDecoration | undefined,
    _lineName: string
  ) => {
    if (!decoration) return;

    ctx.save();

    let decorationColor = defaultColor;
    let decorationWidth = Math.max(1, fontSize * 0.05);

    if (typeof decoration === "object") {
      decorationColor = decoration.color || defaultColor;
      decorationWidth = decoration.width || decorationWidth;

      if (decoration.gradient) {
        ctx.strokeStyle = createTextGradient(ctx, decoration.gradient, x, decorationY, x + width, decorationY);
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

  if (dec.underline) {
    const underlineY = y + fontSize * 0.1;
    renderDecorationLine(underlineY, dec.underline, "underline");
  }

  if (dec.overline) {
    const overlineY = y - fontSize * 0.8;
    renderDecorationLine(overlineY, dec.overline, "overline");
  }

  if (dec.strikethrough) {
    const strikethroughY = y - fontSize * 0.3;
    renderDecorationLine(strikethroughY, dec.strikethrough, "strikethrough");
  }

  ctx.restore();
}

export function renderTextHighlightLocal(
  ctx: SKRSContext2D,
  width: number,
  fontSize: number,
  highlight: TextHighlightStyle
): void {
  const baseline = fontSize * TEXT_MIDDLE_TO_ALPHABETIC;
  const height = fontSize;
  const top = baseline - height * 0.8;
  const left = -width / 2;

  ctx.save();

  const opacity = highlight.opacity !== undefined ? highlight.opacity : 0.3;
  ctx.globalAlpha = opacity;

  if (highlight.gradient) {
    ctx.fillStyle = createTextGradient(ctx, highlight.gradient, left, top, left + width, top + height);
  } else {
    ctx.fillStyle = highlight.color || "#ffff00";
  }

  ctx.fillRect(left, top, width, height);

  ctx.restore();
}

export function renderTextDecorationsLocal(
  ctx: SKRSContext2D,
  width: number,
  fontSize: number,
  textProps: TextProperties
): void {
  const dec = resolveTextDecorations(textProps);
  const hasDecorations = dec.underline || dec.overline || dec.strikethrough;
  if (!hasDecorations) {
    return;
  }

  const baseline = fontSize * TEXT_MIDDLE_TO_ALPHABETIC;
  const xLeft = -width / 2;
  const xRight = width / 2;
  const defaultColor = resolveTextFill(textProps).color || "#000000";

  ctx.save();

  const renderDecorationLine = (
    decorationY: number,
    decoration: TextLineDecoration | undefined
  ) => {
    if (!decoration) return;

    ctx.save();

    let decorationColor = defaultColor;
    let decorationWidth = Math.max(1, fontSize * 0.05);

    if (typeof decoration === "object") {
      decorationColor = decoration.color || defaultColor;
      decorationWidth = decoration.width || decorationWidth;

      if (decoration.gradient) {
        ctx.strokeStyle = createTextGradient(ctx, decoration.gradient, xLeft, decorationY, xRight, decorationY);
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

  if (dec.underline) {
    const underlineY = baseline + fontSize * 0.1;
    renderDecorationLine(underlineY, dec.underline);
  }

  if (dec.overline) {
    const overlineY = baseline - fontSize * 0.8;
    renderDecorationLine(overlineY, dec.overline);
  }

  if (dec.strikethrough) {
    const strikethroughY = baseline - fontSize * 0.3;
    renderDecorationLine(strikethroughY, dec.strikethrough);
  }

  ctx.restore();
}

/** One line of enhanced text: highlight → glow → shadow → stroke → fill → decorations. */
export function renderEnhancedTextLine(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  textProps: TextProperties
): void {
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const fontSize = textProps.font?.size || textProps.fontSize || 16;
  const textHeight = fontSize;
  const effects = resolveTextEffects(textProps);

  if (effects.highlight) {
    renderTextHighlight(ctx, x, y, textWidth, textHeight, effects.highlight);
  }

  if (effects.glow) {
    renderTextGlow(ctx, text, x, y, effects.glow);
  }

  if (effects.shadow) {
    renderTextShadow(ctx, text, x, y, effects.shadow);
  }

  if (textProps.stroke) {
    renderTextStroke(ctx, text, x, y, textProps.stroke);
  }

  renderTextFill(ctx, text, x, y, textProps);

  renderTextDecorations(ctx, text, x, y, textWidth, textHeight, textProps);
}