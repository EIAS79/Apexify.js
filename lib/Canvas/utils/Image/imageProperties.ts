import type { SKRSContext2D } from "@napi-rs/canvas";
import { createCanvas } from "@napi-rs/canvas";
import type { borderPosition, gradient as GradientType } from "../types";

/** Corner radii (px) for a rounded rect from the same mask rules as clip paths. */
function computeCornerRadii(
  borderPos: borderPosition,
  br: number,
  w: number,
  h: number
): { tl: number; tr: number; brR: number; bl: number } {
  const sel = new Set(borderPos.toLowerCase().split(",").map(s => s.trim()));
  const has = (name: string) =>
    sel.has("all") || sel.has(name) ||
    (name === "top-left"     && (sel.has("top") || sel.has("left"))) ||
    (name === "top-right"    && (sel.has("top") || sel.has("right"))) ||
    (name === "bottom-right" && (sel.has("bottom") || sel.has("right"))) ||
    (name === "bottom-left"  && (sel.has("bottom") || sel.has("left")));
  const R = Math.min(br, w / 2, h / 2);
  return {
    tl: has("top-left") ? R : 0,
    tr: has("top-right") ? R : 0,
    brR: has("bottom-right") ? R : 0,
    bl: has("bottom-left") ? R : 0,
  };
}

type RectEdge = "top" | "right" | "bottom" | "left";

/** Parses `stroke.borderPosition`: which edges to stroke (not corner rounding). */
function parseStrokeSideSet(edgeSpec: borderPosition | undefined): Set<RectEdge> | "all" {
  const raw = (edgeSpec ?? "all").toString().toLowerCase().trim();
  if (!raw || raw === "all") return "all";

  const EDGE = new Set(["top", "right", "bottom", "left"]);
  const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
  const out = new Set<RectEdge>();
  for (const p of parts) {
    if (EDGE.has(p)) out.add(p as RectEdge);
    else if (p === "top-left") {
      out.add("top");
      out.add("left");
    } else if (p === "top-right") {
      out.add("top");
      out.add("right");
    } else if (p === "bottom-right") {
      out.add("bottom");
      out.add("right");
    } else if (p === "bottom-left") {
      out.add("bottom");
      out.add("left");
    }
  }
  return out.size > 0 ? out : "all";
}

const CLOCKWISE_EDGES: RectEdge[] = ["top", "right", "bottom", "left"];

/**
 * Open path(s) stroking only selected edges. Adjacent sides (e.g. left + top) share one continuous
 * subpath with the same corner arcs as {@link buildPath}; non-adjacent selections use separate subpaths.
 */
function buildPartialRectStrokeEdges(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  roundedCorners: borderPosition,
  sides: Set<RectEdge>
): void {
  const br = radius > 0 ? Math.min(radius, w / 2, h / 2) : 0;
  const { tl, tr, brR, bl } = computeCornerRadii(roundedCorners, br, w, h);
  const has = (e: RectEdge) => sides.has(e);

  if (CLOCKWISE_EDGES.every(has)) {
    buildPath(ctx, x, y, w, h, radius, roundedCorners);
    return;
  }

  ctx.beginPath();

  const starts: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (has(CLOCKWISE_EDGES[i]) && !has(CLOCKWISE_EDGES[(i + 3) % 4])) starts.push(i);
  }

  const collectRun = (startIdx: number): RectEdge[] => {
    const run: RectEdge[] = [];
    let i = startIdx;
    while (has(CLOCKWISE_EDGES[i])) {
      run.push(CLOCKWISE_EDGES[i]);
      i = (i + 1) % 4;
      if (i === startIdx) break;
      if (run.length >= 4) break;
    }
    return run;
  };

  if (starts.length === 0) return;

  for (const s of starts) {
    const run = collectRun(s);
    if (run.length === 0) continue;

    const e0 = run[0];
    switch (e0) {
      case "top":
        ctx.moveTo(x + tl, y);
        break;
      case "right":
        ctx.moveTo(x + w, y + tr);
        break;
      case "bottom":
        ctx.moveTo(x + w - brR, y + h);
        break;
      case "left":
        ctx.moveTo(x, y + h - bl);
        break;
    }

    for (let r = 0; r < run.length; r++) {
      const e = run[r];
      const next = run[r + 1];
      switch (e) {
        case "top":
          ctx.lineTo(x + w - tr, y);
          if (next === "right") {
            if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
            else ctx.lineTo(x + w, y);
          }
          break;
        case "right":
          ctx.lineTo(x + w, y + h - brR);
          if (next === "bottom") {
            if (brR > 0) ctx.arcTo(x + w, y + h, x + w - brR, y + h, brR);
            else ctx.lineTo(x + w, y + h);
          }
          break;
        case "bottom":
          ctx.lineTo(x + bl, y + h);
          if (next === "left") {
            if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
            else ctx.lineTo(x, y + h);
          }
          break;
        case "left":
          ctx.lineTo(x, y + tl);
          if (next === "top") {
            if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
            else ctx.lineTo(x, y);
          }
          break;
      }
    }
  }
}

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
  const { tl, tr, brR, bl } = computeCornerRadii(borderPos, br, w, h);

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

    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, grad, repeat, w, h);
    }

    return grad;
  }

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

import { loadImage, type Image } from "@napi-rs/canvas";
import path from "path";

const cache = new Map<string, Promise<Image>>();

export function loadImageCached(src: string | Buffer): Promise<Image> {
  if (Buffer.isBuffer(src)) return loadImage(src);
  const key = src.startsWith("http") ? src : path.resolve(process.cwd(), src);
  if (!cache.has(key)) cache.set(key, loadImage(key));
  return cache.get(key)!;
}

import type { BoxBackground, ShadowOptions, StrokeOptions } from "../types";

/** Shadow pass (independent) — supports solid color or gradient fill */

type Rect = { x: number; y: number; w: number; h: number };

/* ---------------------------------------------
   SHADOW — overloaded to support both call styles
   --------------------------------------------- */

export function applyShadow(
  ctx: SKRSContext2D,
  rect: Rect,
  shadow?: ShadowOptions
): void;

export function applyShadow(
  ctx: SKRSContext2D,
  shadow: ShadowOptions | undefined,
  x: number, y: number, width: number, height: number,
  borderRadius?: number | "circular",
  borderPosition?: borderPosition
): void;

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

  if (typeof a === "object" && "x" in a && "w" in a) {

    rect = a as Rect;
    shadow = b as ShadowOptions | undefined;
    radius = shadow?.borderRadius ?? 0;
    borderPos = shadow?.roundedCorners ?? shadow?.borderPosition ?? "all";
  } else {

    shadow = a as ShadowOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? shadow?.borderRadius ?? 0;
    borderPos = shadow?.roundedCorners ?? (g as borderPosition | undefined) ?? shadow?.borderPosition ?? "all";
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

export function applyStroke(
  ctx: SKRSContext2D,
  rect: Rect,
  stroke?: StrokeOptions
): void;

export function applyStroke(
  ctx: SKRSContext2D,
  stroke: StrokeOptions | undefined,
  x: number, y: number, width: number, height: number,
  borderRadius?: number | "circular",
  /** @deprecated Prefer `stroke.roundedCorners`. Optional override for which corners use `borderRadius`. */
  roundedCornersOverride?: borderPosition
): void;

export function applyStroke(
  ctx: SKRSContext2D,
  a: any,
  b?: any,
  c?: any, d?: any, e?: any, f?: any, g?: any
): void {
  let rect: Rect;
  let stroke: StrokeOptions | undefined;
  let radius: number | "circular" | undefined;
  /** Which corners use `borderRadius` on the stroke outline. */
  let roundedCornersMask: borderPosition;

  if (typeof a === "object" && "x" in a && "w" in a) {

    rect = a as Rect;
    stroke = b as StrokeOptions | undefined;
    radius = stroke?.borderRadius ?? 0;
    roundedCornersMask = stroke?.roundedCorners ?? "all";
  } else {

    stroke = a as StrokeOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? stroke?.borderRadius ?? 0;
    roundedCornersMask =
      stroke?.roundedCorners ?? (g as borderPosition | undefined) ?? "all";
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

  const r = {
    x: rect.x - position,
    y: rect.y - position,
    w: rect.w + position * 2,
    h: rect.h + position * 2
  };

  const strokeSides = parseStrokeSideSet(stroke.borderPosition);

  const buildStrokePath = (): void => {
    if (radius === "circular") {
      buildPath(ctx, r.x, r.y, r.w, r.h, radius, roundedCornersMask);
    } else if (strokeSides === "all") {
      buildPath(ctx, r.x, r.y, r.w, r.h, radius!, roundedCornersMask);
    } else {
      const n = typeof radius === "number" && radius > 0 ? radius : 0;
      buildPartialRectStrokeEdges(
        ctx,
        r.x,
        r.y,
        r.w,
        r.h,
        n,
        roundedCornersMask,
        strokeSides
      );
    }
  };

  ctx.save();
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = opacity;

  buildStrokePath();

  ctx.lineWidth = width;

  if (gradient) {
    const gstroke = createGradientFill(ctx, gradient, r);
    ctx.strokeStyle = gstroke as any;
  } else {
    ctx.strokeStyle = color;
  }

  applyStrokeStyle(ctx, style, width);

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

      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';

      break;

    case 'ridge':

      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';

      break;

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

      ctx.lineWidth = halfWidth;

      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = darkenColor(color, 0.3);
      }
      ctx.stroke();

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

      ctx.lineWidth = halfWidth;

      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = lightenColor(color, 0.3);
      }
      ctx.stroke();

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

      ctx.lineWidth = halfWidth;
      if (gradient) {
        const gstroke = createGradientFill(ctx, gradient, rect);
        ctx.strokeStyle = gstroke as any;
      } else {
        ctx.strokeStyle = color;
      }
      ctx.stroke();

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
function lightenColor(color: string, factor: number): string {

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
