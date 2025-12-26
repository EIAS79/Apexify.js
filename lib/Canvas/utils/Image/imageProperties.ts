import type { SKRSContext2D } from "@napi-rs/canvas";
import { createCanvas } from "@napi-rs/canvas";
import type { borderPosition, gradient as GradientType } from "../types";

export function buildPath(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  radius: number | "circular" = 0,
  borderPos: borderPosition = "all"
): void {
  ctx.beginPath();

  if (radius === "circular") {
    const r = Math.min(w, h) / 2;
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  if (!radius || radius <= 0) {
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }

  const br = Math.min(radius, w / 2, h / 2);
  const sel = new Set(borderPos.toLowerCase().split(",").map(s => s.trim()));

  const has = (name: string) =>
    sel.has("all") || sel.has(name) ||
    (name === "top-left"     && (sel.has("top") || sel.has("left"))) ||
    (name === "top-right"    && (sel.has("top") || sel.has("right"))) ||
    (name === "bottom-right" && (sel.has("bottom") || sel.has("right"))) ||
    (name === "bottom-left"  && (sel.has("bottom") || sel.has("left")));

  const tl = has("top-left")     ? br : 0;
  const tr = has("top-right")    ? br : 0;
  const brR= has("bottom-right") ? br : 0;
  const bl = has("bottom-left")  ? br : 0;

  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - brR);
  if (brR) ctx.arcTo(x + w, y + h, x + w - brR, y + h, brR);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);

  ctx.closePath();
}

export function applyRotation(
  ctx: SKRSContext2D,
  deg: number | undefined,
  x: number, y: number, w: number, h: number
) {
  if (!deg) return;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}


function rotatePoint(
  x: number, y: number, px: number, py: number, deg = 0
): [number, number] {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const dx = x - px, dy = y - py;
  return [px + dx * Math.cos(a) - dy * Math.sin(a),
          py + dx * Math.sin(a) + dy * Math.cos(a)];
}

/**
 * Build a gradient in **rect-local coordinates**:
 * - Defaults for coords use rect {w,h}
 * - Rotation pivot defaults to rect center
 * - Offsets are applied by adding rect.x/rect.y to all points
 */
export function createGradientFill(
  ctx: SKRSContext2D,
  g: GradientType,
  rect: { x: number; y: number; w: number; h: number }
): CanvasGradient | CanvasPattern {
  const { x, y, w, h } = rect;

  if (g.type === "linear") {
    const {
      startX = 0, startY = 0,
      endX = w,  endY = 0,
      rotate = 0,
      pivotX = w / 2, pivotY = h / 2,
      repeat = 'no-repeat',
      colors
    } = g;

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX,   endY,   pivotX, pivotY, rotate);

    const grad = ctx.createLinearGradient(x + sx, y + sy, x + ex, y + ey);
    colors.forEach(cs => grad.addColorStop(cs.stop, cs.color));
    
    // Handle repeat mode for linear gradients
    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, grad, repeat, w, h);
    }
    
    return grad;
  }

  if (g.type === "radial") {
    const {
      startX = w / 2, startY = h / 2, startRadius = 0,
      endX = w / 2,   endY = h / 2,   endRadius   = Math.max(w, h) / 2,
      rotate = 0,
      pivotX = w / 2, pivotY = h / 2,
      repeat = 'no-repeat',
      colors
    } = g;

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX,   endY,   pivotX, pivotY, rotate);

    const grad = ctx.createRadialGradient(
      x + sx, y + sy, startRadius,
      x + ex, y + ey, endRadius
    );
    colors.forEach(cs => grad.addColorStop(cs.stop, cs.color));
    
    // Handle repeat mode for radial gradients
    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, grad, repeat, w, h);
    }
    
    return grad;
  }

  // conic
  const {
    centerX = w / 2,
    centerY = h / 2,
    startAngle = 0,
    rotate: conicRotate = 0,
    pivotX = w / 2,
    pivotY = h / 2,
    colors
  } = g;

  const [cx, cy] = rotatePoint(centerX, centerY, pivotX, pivotY, conicRotate);
  const angleRad = ((startAngle + conicRotate) * Math.PI) / 180;

  const grad = ctx.createConicGradient(angleRad, x + cx, y + cy);
  colors.forEach(cs => grad.addColorStop(cs.stop, cs.color));
  return grad;
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
  // Create a temporary canvas for the pattern
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

// utils/imageMath.ts
import type { AlignMode, FitMode } from "../types";

export function fitInto(
  boxX: number, boxY: number, boxW: number, boxH: number,
  imgW: number, imgH: number,
  fit: FitMode = "fill",
  align: AlignMode = "center"
) {
  let dx = boxX, dy = boxY, dw = boxW, dh = boxH, sx = 0, sy = 0, sw = imgW, sh = imgH;

  if (fit === "fill") {
    return { dx, dy, dw, dh, sx, sy, sw, sh };
  }

  const s = fit === "contain"
    ? Math.min(boxW / imgW, boxH / imgH)
    : Math.max(boxW / imgW, boxH / imgH);

  dw = imgW * s;
  dh = imgH * s;

  const cx = boxX + (boxW - dw) / 2;
  const cy = boxY + (boxH - dh) / 2;

  switch (align) {
    case "top-left":     dx = boxX;         dy = boxY;          break;
    case "top":          dx = cx;           dy = boxY;          break;
    case "top-right":    dx = boxX + boxW - dw; dy = boxY;      break;
    case "left":         dx = boxX;         dy = cy;            break;
    case "center":       dx = cx;           dy = cy;            break;
    case "right":        dx = boxX + boxW - dw; dy = cy;        break;
    case "bottom-left":  dx = boxX;         dy = boxY + boxH - dh; break;
    case "bottom":       dx = cx;           dy = boxY + boxH - dh; break;
    case "bottom-right": dx = boxX + boxW - dw; dy = boxY + boxH - dh; break;
    default:             dx = cx;           dy = cy;            break;
  }

  return { dx, dy, dw, dh, sx, sy, sw, sh };
}


// utils/imageCache.ts
import { loadImage, type Image } from "@napi-rs/canvas";
import path from "path";

const cache = new Map<string, Promise<Image>>();

export function loadImageCached(src: string | Buffer): Promise<Image> {
  if (Buffer.isBuffer(src)) return loadImage(src);
  const key = src.startsWith("http") ? src : path.resolve(process.cwd(), src);
  if (!cache.has(key)) cache.set(key, loadImage(key));
  return cache.get(key)!;
}


// utils/drawPasses.ts

import type { BoxBackground, ShadowOptions, StrokeOptions, gradient } from "../types";

/** Shadow pass (independent) — supports solid color or gradient fill */
// Shared rect type
type Rect = { x: number; y: number; w: number; h: number };

/* ---------------------------------------------
   SHADOW — overloaded to support both call styles
   --------------------------------------------- */

// Overload 1: rect-first (new style)
export function applyShadow(
  ctx: SKRSContext2D,
  rect: Rect,
  shadow?: ShadowOptions
): void;

// Overload 2: positional (legacy createCanvas style)
export function applyShadow(
  ctx: SKRSContext2D,
  shadow: ShadowOptions | undefined,
  x: number, y: number, width: number, height: number,
  borderRadius?: number | "circular",
  borderPosition?: borderPosition
): void;

// Single implementation handling both
export function applyShadow(
  ctx: SKRSContext2D,
  a: any,
  b?: any,
  c?: any, d?: any, e?: any, f?: any, g?: any
): void {
  let rect: Rect;
  let shadow: ShadowOptions | undefined;
  let radius: number | "circular" | undefined;
  let borderPos: borderPosition | undefined;

  // Detect which overload we’re in
  if (typeof a === "object" && "x" in a && "w" in a) {
    // (ctx, rect, shadow)
    rect = a as Rect;
    shadow = b as ShadowOptions | undefined;
    radius = shadow?.borderRadius ?? 0;
    borderPos = shadow?.borderPosition ?? "all";
  } else {
    // (ctx, shadow, x, y, w, h, radius?, borderPos?)
    shadow = a as ShadowOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? shadow?.borderRadius ?? 0;
    borderPos = (g as borderPosition) ?? shadow?.borderPosition ?? "all";
  }

  if (!shadow) return;

  const {
    color = "rgba(0,0,0,1)",
    gradient,
    opacity = 0.4,
    offsetX = 0,
    offsetY = 0,
    blur = 20
  } = shadow;

  const r = { x: rect.x + offsetX, y: rect.y + offsetY, w: rect.w, h: rect.h };

  ctx.save();
  ctx.globalAlpha = opacity;
  if (blur > 0) ctx.filter = `blur(${blur}px)`;

  buildPath(ctx, r.x, r.y, r.w, r.h, radius!, borderPos!);

  if (gradient) {
    const gfill = createGradientFill(ctx, gradient, r);
    ctx.fillStyle = gfill;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();

  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}


/* ---------------------------------------------
   STROKE — overloaded to support both call styles
   --------------------------------------------- */

// Overload 1: rect-first (new style)
export function applyStroke(
  ctx: SKRSContext2D,
  rect: Rect,
  stroke?: StrokeOptions
): void;

// Overload 2: positional (legacy createCanvas style)
export function applyStroke(
  ctx: SKRSContext2D,
  stroke: StrokeOptions | undefined,
  x: number, y: number, width: number, height: number,
  borderRadius?: number | "circular",
  borderPosition?: borderPosition
): void;

// Single implementation handling both
export function applyStroke(
  ctx: SKRSContext2D,
  a: any,
  b?: any,
  c?: any, d?: any, e?: any, f?: any, g?: any
): void {
  let rect: Rect;
  let stroke: StrokeOptions | undefined;
  let radius: number | "circular" | undefined;
  let borderPos: borderPosition | undefined;

  if (typeof a === "object" && "x" in a && "w" in a) {
    // (ctx, rect, stroke)
    rect = a as Rect;
    stroke = b as StrokeOptions | undefined;
    radius = stroke?.borderRadius ?? 0;
    borderPos = stroke?.borderPosition ?? "all";
  } else {
    // (ctx, stroke, x, y, w, h, radius?, borderPos?)
    stroke = a as StrokeOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? stroke?.borderRadius ?? 0;
    borderPos = (g as borderPosition) ?? stroke?.borderPosition ?? "all";
  }

  if (!stroke) return;

  const {
    color = "#000",
    gradient,
    width = 2,
    position = 0,
    blur = 0,
    opacity = 1,
    style = 'solid'
  } = stroke;

  // expand/shrink by `position`
  const r = {
    x: rect.x - position,
    y: rect.y - position,
    w: rect.w + position * 2,
    h: rect.h + position * 2
  };

  ctx.save();
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = opacity;

  buildPath(ctx, r.x, r.y, r.w, r.h, radius!, borderPos!);

  ctx.lineWidth = width;

  if (gradient) {
    const gstroke = createGradientFill(ctx, gradient, r);
    ctx.strokeStyle = gstroke as any;
  } else {
    ctx.strokeStyle = color;
  }

  // Apply stroke style
  applyStrokeStyle(ctx, style, width);

  // Handle complex stroke styles that require multiple passes
  if (style === 'groove' || style === 'ridge' || style === 'double') {
    applyComplexStrokeStyle(ctx, style, width, color, gradient, r);
  } else {
    ctx.stroke();
  }

  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Optional “box background” under the bitmap, inside the image clip */
export function drawBoxBackground(
  ctx: SKRSContext2D,
  rect: { x: number; y: number; w: number; h: number },
  boxBg?: BoxBackground,
  borderRadius?: number | "circular",
  borderPosition?: string
) {
  if (!boxBg) return;
  const { color, gradient } = boxBg;

  // clip to the box radius, then fill
  ctx.save();
  buildPath(ctx, rect.x, rect.y, rect.w, rect.h, borderRadius ?? 0, borderPosition ?? "all");
  ctx.clip();

  if (gradient) {
    const g = createGradientFill(ctx, gradient, rect);
    ctx.fillStyle = g as any;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (color && color !== "transparent") {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.restore();
}

/**
 * Applies stroke style to canvas context
 * @param ctx - Canvas 2D context
 * @param style - Stroke style type
 * @param width - Stroke width for calculating dash patterns
 */
function applyStrokeStyle(
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
      // Groove effect: draw multiple strokes with different colors/opacity
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      // Note: Groove effect requires multiple passes - handled in main stroke function
      break;
      
    case 'ridge':
      // Ridge effect: draw multiple strokes with different colors/opacity
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      // Note: Ridge effect requires multiple passes - handled in main stroke function
      break;
      
    case 'double':
      // Double effect: draw multiple strokes
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      // Note: Double effect requires multiple passes - handled in main stroke function
      break;
      
    default:
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      break;
  }
}

/**
 * Applies complex stroke styles that require multiple passes
 * @param ctx - Canvas 2D context
 * @param style - Complex stroke style type
 * @param width - Stroke width
 * @param color - Base stroke color
 * @param gradient - Optional gradient
 * @param rect - Rectangle dimensions
 */
function applyComplexStrokeStyle(
  ctx: SKRSContext2D,
  style: 'groove' | 'ridge' | 'double',
  width: number,
  color: string,
  gradient: any,
  rect: { x: number; y: number; w: number; h: number }
): void {
  const halfWidth = width / 2;
  
  switch (style) {
    case 'groove':
      // Groove: dark outer, light inner
      ctx.lineWidth = halfWidth;
      
      // Outer dark stroke
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = darkenColor(color, 0.3);
      }
      ctx.stroke();
      
      // Inner light stroke
      ctx.lineWidth = halfWidth;
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = lightenColor(color, 0.3);
      }
      ctx.stroke();
      break;
      
    case 'ridge':
      // Ridge: light outer, dark inner
      ctx.lineWidth = halfWidth;
      
      // Outer light stroke
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = lightenColor(color, 0.3);
      }
      ctx.stroke();
      
      // Inner dark stroke
      ctx.lineWidth = halfWidth;
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = darkenColor(color, 0.3);
      }
      ctx.stroke();
      break;
      
    case 'double':
      // Double: two parallel strokes
      const gap = Math.max(1, width / 4);
      
      // First stroke (outer)
      ctx.lineWidth = halfWidth;
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = color;
      }
      ctx.stroke();
      
      // Second stroke (inner)
      ctx.lineWidth = halfWidth;
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = color;
      }
      ctx.stroke();
      break;
  }
}

/**
 * Darkens a color by a factor
 * @param color - Color string
 * @param factor - Darkening factor (0-1)
 * @returns Darkened color string
 */
function darkenColor(color: string, factor: number): string {
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
function lightenColor(color: string, factor: number): string {
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
