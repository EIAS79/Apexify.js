import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import { CanvasConfig, gradient } from "../types";
import path from "path";

export type AlignMode =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type FitMode = 'fill' | 'contain' | 'cover';

/**
 * Draws a gradient background on the canvas with optional zoom support.
 * @param ctx The canvas rendering context.
 * @param canvas The canvas configuration object.
 * @param zoom Optional zoom configuration.
 */
export async function drawBackgroundGradient(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
) {
  if (!canvas.gradientBg) return;
  const width = canvas.width ?? 500;
  const height = canvas.height ?? 500;

  const grad = buildCanvasGradient(ctx, {
    gradient: canvas.gradientBg,
    width, height
  });

  if (canvas.blur) ctx.filter = `blur(${canvas.blur}px)`;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.filter = 'none';
}

/**
 * Draws a solid background color on the canvas with optional zoom effect.
 * @param ctx The canvas rendering context.
 * @param canvas The canvas configuration object.
 * @param zoom Optional zoom configuration.
 */
export async function drawBackgroundColor(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const W = canvas.width ?? 500;
  const H = canvas.height ?? 500;

  if (canvas.blur) ctx.filter = `blur(${canvas.blur}px)`;
  if (canvas.colorBg !== 'transparent') {
    ctx.fillStyle = (canvas.colorBg ?? '#000') as string;
    ctx.fillRect(0, 0, W, H);
  }
  ctx.filter = 'none';
}

/**
 * Draws a custom background image on the canvas with optional zoom functionality.
 * @param ctx The canvas rendering context.
 * @param canvas The canvas configuration object.
 * @param zoom Optional zoom configuration.
 */
export async function customBackground(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const cfg = canvas.customBg;
  if (!cfg) return;

  let imagePath = cfg.source;
  if (!/^https?:\/\//i.test(imagePath)) {
    imagePath = path.join(process.cwd(), imagePath);
  }

  try {
    const img = await loadImage(imagePath);
    // Canvas size (createCanvas may have overridden via inherit)
    const W = canvas.width ?? img.width;
    const H = canvas.height ?? img.height;

    if (canvas.blur) ctx.filter = `blur(${canvas.blur}px)`;

    if (cfg.inherit) {
      // Canvas was resized to image size in createCanvas; just draw 1:1
      ctx.drawImage(img, 0, 0);
    } else {
      // scale by fit + align
      const fit: FitMode = cfg.fit ?? 'fill';
      let dx = 0, dy = 0, dw = W, dh = H;

      if (fit === 'contain' || fit === 'cover') {
        const s = fit === 'contain'
          ? Math.min(W / img.width, H / img.height)
          : Math.max(W / img.width, H / img.height);
        dw = img.width * s;
        dh = img.height * s;
        // alignment
        const align: AlignMode = cfg.align ?? 'center';
        ({ dx, dy } = alignInto(W, H, dw, dh, align));
      } else {
        // 'fill' stretches image to exactly W x H (may distort)
        dx = 0; dy = 0; dw = W; dh = H;
      }

      ctx.drawImage(img, dx, dy, dw, dh);
    }

    ctx.filter = 'none';
  } catch (e: any) {
    console.error('customBackground: failed to load', e?.message ?? e);
  }
}

// helper to place the fitted rect inside canvas by alignment keyword
function alignInto(
  W: number, H: number, w: number, h: number, align: AlignMode
): { dx: number; dy: number } {
  const cx = (W - w) / 2;
  const cy = (H - h) / 2;
  switch (align) {
    case 'top-left':     return { dx: 0,   dy: 0 };
    case 'top':          return { dx: cx,  dy: 0 };
    case 'top-right':    return { dx: W-w, dy: 0 };
    case 'left':         return { dx: 0,   dy: cy };
    case 'center':       return { dx: cx,  dy: cy };
    case 'right':        return { dx: W-w, dy: cy };
    case 'bottom-left':  return { dx: 0,   dy: H-h };
    case 'bottom':       return { dx: cx,  dy: H-h };
    case 'bottom-right': return { dx: W-w, dy: H-h };
    default:             return { dx: cx,  dy: cy };
  }
}
 


export function buildPathbg(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number | "circular" = 0,
  borderPosition: string = "all"
): void {
  ctx.beginPath();

  if (borderRadius === "circular") {
    const r = Math.min(width, height) / 2;
    ctx.arc(x + width / 2, y + height / 2, r, 0, 2 * Math.PI);
  } else if (typeof borderRadius === "number" && borderRadius > 0) {
    const br = Math.min(borderRadius, width / 2, height / 2);
    const selected = new Set(borderPosition.toLowerCase().split(",").map(s => s.trim()));

    const roundTL = selected.has("all") || selected.has("top-left") || (selected.has("top") && selected.has("left"));
    const roundTR = selected.has("all") || selected.has("top-right") || (selected.has("top") && selected.has("right"));
    const roundBR = selected.has("all") || selected.has("bottom-right") || (selected.has("bottom") && selected.has("right"));
    const roundBL = selected.has("all") || selected.has("bottom-left") || (selected.has("bottom") && selected.has("left"));

    const tl = roundTL ? br : 0;
    const tr = roundTR ? br : 0;
    const brR = roundBR ? br : 0;
    const bl = roundBL ? br : 0;

    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + width - tr, y);
    if (tr) ctx.arcTo(x + width, y, x + width, y + tr, tr);
    ctx.lineTo(x + width, y + height - brR);
    if (brR) ctx.arcTo(x + width, y + height, x + width - brR, y + height, brR);
    ctx.lineTo(x + bl, y + height);
    if (bl) ctx.arcTo(x, y + height, x, y + height - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  } else {
    ctx.rect(x, y, width, height);
  }

  ctx.closePath();
}



export function applyNoise(ctx: SKRSContext2D, width: number, height: number, intensity = 0.05) {
  const noiseCanvas = createCanvas(width, height);
  const nctx = noiseCanvas.getContext("2d");
  const imageData = nctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    imageData.data[i]   = v;
    imageData.data[i+1] = v;
    imageData.data[i+2] = v;
    imageData.data[i+3] = 255 * intensity;
  }
  nctx.putImageData(imageData, 0, 0);
  ctx.drawImage(noiseCanvas, 0, 0);
}

export async function drawPattern(
  ctx: SKRSContext2D,
  { source, repeat = "repeat", opacity = 1 }: { source: string; repeat?: 'repeat'|'repeat-x'|'repeat-y'|'no-repeat'; opacity?: number },
  width: number,
  height: number
) {
  const img = await loadImage(source);
  const pattern = ctx.createPattern(img, repeat);
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = pattern as any;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function rotatePoint(
  x: number, y: number,
  pivotX: number, pivotY: number,
  deg: number
): [number, number] {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const dx = x - pivotX, dy = y - pivotY;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return [pivotX + rx, pivotY + ry];
}

export function applyCanvasZoom(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  zoom?: { scale?: number; centerX?: number; centerY?: number }
) {
  if (!zoom) return;

  const scale = zoom.scale ?? 1;
  if (scale === 1) return; // nothing to do

  const cx = zoom.centerX ?? width / 2;
  const cy = zoom.centerY ?? height / 2;

  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}


export function buildCanvasGradient(
  ctx: SKRSContext2D,
  cfg: { gradient: gradient; width: number; height: number }
): CanvasGradient | CanvasPattern {
  const { gradient, width, height } = cfg;

  if (gradient.type === 'linear') {
    const {
      startX = 0, startY = 0,
      endX   = width, endY   = 0,
      rotate = 0,
      pivotX = width/2, pivotY = height/2,
      repeat = 'no-repeat',
      colors
    } = gradient;

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX,   endY,   pivotX, pivotY, rotate);

    const g = ctx.createLinearGradient(sx, sy, ex, ey);
    for (const { stop, color } of colors) g.addColorStop(stop, color);
    
    // Handle repeat mode for linear gradients
    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, g, repeat, width, height);
    }
    
    return g;
  }

  if (gradient.type === 'radial') {
    const {
      startX = width/2,  startY = height/2,  startRadius = 0,
      endX   = width/2,  endY   = height/2,  endRadius   = Math.max(width, height)/2,
      rotate = 0,
      pivotX = width/2,  pivotY = height/2,
      repeat = 'no-repeat',
      colors
    } = gradient;

    // If centers differ, rotation will rotate both centers around pivot.
    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX,   endY,   pivotX, pivotY, rotate);

    const g = ctx.createRadialGradient(sx, sy, startRadius, ex, ey, endRadius);
    for (const { stop, color } of colors) g.addColorStop(stop, color);
    
    // Handle repeat mode for radial gradients
    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, g, repeat, width, height);
    }
    
    return g;
  }

  // conic
  const {
    centerX = width / 2,
    centerY = height / 2,
    startAngle = 0,
    rotate: conicRotate = 0,
    pivotX = width / 2,
    pivotY = height / 2,
    colors
  } = gradient;

  const [cx, cy] = rotatePoint(centerX, centerY, pivotX, pivotY, conicRotate);
  const angleRad = ((startAngle + conicRotate) * Math.PI) / 180;

  const g = ctx.createConicGradient(angleRad, cx, cy);
  for (const { stop, color } of colors) g.addColorStop(stop, color);
  return g;
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
