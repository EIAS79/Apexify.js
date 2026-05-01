import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import { CanvasConfig, gradient } from "../types";
import { EnhancedPatternRenderer } from "../Patterns/enhancedPatternRenderer";
import path from "path";

/** Resolve `source` to an absolute filesystem path when it is not an http(s) URL. */
export function resolveMediaPath(source: string): string {
  if (!source) return source;
  if (/^https?:\/\//i.test(source)) return source;
  return path.join(process.cwd(), source);
}

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

  const imagePath = resolveMediaPath(cfg.source);

  try {
    const img = await loadImage(imagePath);

    const W = canvas.width ?? img.width;
    const H = canvas.height ?? img.height;

    if (canvas.blur) ctx.filter = `blur(${canvas.blur}px)`;

    if (cfg.inherit) {

      ctx.drawImage(img, 0, 0);
    } else {
      const fit: FitMode = cfg.fit ?? 'fill';
      const align: AlignMode = cfg.align ?? 'center';
      drawImageFitted(ctx, img, W, H, fit, align);
    }

    ctx.filter = 'none';
  } catch (e: any) {
    console.error('customBackground: failed to load', e?.message ?? e);
  }
}

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

/** Draw `img` into the `[0..W]×[0..H]` rect using the same rules as `customBg` (non-inherit). */
function drawImageFitted(
  ctx: SKRSContext2D,
  img: Image,
  W: number,
  H: number,
  fit: FitMode,
  align: AlignMode
): void {
  if (fit === 'contain' || fit === 'cover') {
    const s =
      fit === 'contain'
        ? Math.min(W / img.width, H / img.height)
        : Math.max(W / img.width, H / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    const { dx, dy } = alignInto(W, H, dw, dh, align);
    ctx.drawImage(img, dx, dy, dw, dh);
  } else {
    ctx.drawImage(img, 0, 0, W, H);
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
  if (!nctx) return;
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
  const img = await loadImage(resolveMediaPath(source));
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
if (scale === 1) return;

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

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX,   endY,   pivotX, pivotY, rotate);

    const g = ctx.createRadialGradient(sx, sy, startRadius, ex, ey, endRadius);
    for (const { stop, color } of colors) g.addColorStop(stop, color);

    if (repeat !== 'no-repeat') {
      return createRepeatingGradientPattern(ctx, g, repeat, width, height);
    }

    return g;
  }

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
 * Paints `bgLayers` in order (bottom → top) on the current clipped canvas area.
 * Combine with `colorBg` / `gradientBg` / `customBg` as the base, or use a color layer first in `bgLayers`.
 */
export async function drawBackgroundLayers(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const layers = canvas.bgLayers;
  if (!layers?.length) return;

  const W = canvas.width ?? 500;
  const H = canvas.height ?? 500;

  for (const layer of layers) {
    ctx.save();
    ctx.globalCompositeOperation =
      layer.blendMode ?? ('source-over' as GlobalCompositeOperation);
    try {
      switch (layer.type) {
        case 'color':
          ctx.globalAlpha = layer.opacity ?? 1;
          ctx.fillStyle = layer.value;
          ctx.fillRect(0, 0, W, H);
          break;
        case 'gradient': {
          ctx.globalAlpha = layer.opacity ?? 1;
          const grad = buildCanvasGradient(ctx, { gradient: layer.value, width: W, height: H });
          ctx.fillStyle = grad as CanvasGradient | CanvasPattern;
          ctx.fillRect(0, 0, W, H);
          break;
        }
        case 'image': {
          const img = await loadImage(resolveMediaPath(layer.source));
          ctx.globalAlpha = layer.opacity ?? 1;
          const fit = layer.fit ?? 'fill';
          const align = (layer.align ?? 'center') as AlignMode;
          drawImageFitted(ctx, img, W, H, fit, align);
          break;
        }
        case 'pattern':
          await drawPattern(
            ctx,
            {
              source: layer.source,
              repeat: layer.repeat ?? 'repeat',
              opacity: layer.opacity ?? 1,
            },
            W,
            H
          );
          break;
        case 'presetPattern':
          ctx.globalAlpha = layer.opacity ?? 1;
          await EnhancedPatternRenderer.renderPattern(
            ctx,
            { width: W, height: H },
            layer.pattern,
            { stackedInLayer: true }
          );
          break;
        case 'noise':
          applyNoise(ctx, W, H, layer.intensity ?? 0.08);
          break;
        default:
          break;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`drawBackgroundLayers: layer failed (${(layer as { type: string }).type}):`, msg);
    }
    ctx.restore();
  }
}
