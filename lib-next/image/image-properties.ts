import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import path from "path";
import sharp from "sharp";
import type { AlignMode, FitMode, BoxBackground } from "../types";
import { buildPath } from "../render/clip-path";
import { createGradientFill } from "../render/gradient-fill";
import { resolveRasterInput } from "./resolvable-image-source";

const cache = new Map<string, Promise<Image>>();

export function fitInto(
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
  fit: FitMode = "fill",
  align: AlignMode = "center"
) {
  let dx = boxX,
    dy = boxY,
    dw = boxW,
    dh = boxH,
    sx = 0,
    sy = 0,
    sw = imgW,
    sh = imgH;

  if (fit === "fill") {
    return { dx, dy, dw, dh, sx, sy, sw, sh };
  }

  const s =
    fit === "contain"
      ? Math.min(boxW / imgW, boxH / imgH)
      : Math.max(boxW / imgW, boxH / imgH);

  dw = imgW * s;
  dh = imgH * s;

  const cx = boxX + (boxW - dw) / 2;
  const cy = boxY + (boxH - dh) / 2;

  switch (align) {
    case "top-left":
      dx = boxX;
      dy = boxY;
      break;
    case "top":
      dx = cx;
      dy = boxY;
      break;
    case "top-right":
      dx = boxX + boxW - dw;
      dy = boxY;
      break;
    case "left":
      dx = boxX;
      dy = cy;
      break;
    case "center":
      dx = cx;
      dy = cy;
      break;
    case "right":
      dx = boxX + boxW - dw;
      dy = cy;
      break;
    case "bottom-left":
      dx = boxX;
      dy = boxY + boxH - dh;
      break;
    case "bottom":
      dx = cx;
      dy = boxY + boxH - dh;
      break;
    case "bottom-right":
      dx = boxX + boxW - dw;
      dy = boxY + boxH - dh;
      break;
    default:
      dx = cx;
      dy = cy;
      break;
  }

  return { dx, dy, dw, dh, sx, sy, sw, sh };
}

async function resolveToCanvasImage(src: string | Buffer): Promise<Image> {
  const resolved = await resolveRasterInput(src);
  const png = await sharp(resolved).png().toBuffer();
  return loadImage(png);
}

export function loadImageCached(src: string | Buffer): Promise<Image> {
  if (Buffer.isBuffer(src)) return resolveToCanvasImage(src);

  const key = /^https?:\/\//i.test(src) ? src : path.resolve(process.cwd(), src);
  const cached = cache.get(key);
  if (cached) return cached;

  const pending = resolveToCanvasImage(src);
  cache.set(key, pending);

  pending.catch(() => {
    // A temporary network/CDN failure must not poison this source forever.
    if (cache.get(key) === pending) cache.delete(key);
  });

  return pending;
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
    ctx.fillStyle = g as CanvasGradient | CanvasPattern;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (color && color !== "transparent") {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.restore();
}

/** Load a raster via Sharp from a Buffer, URL, data URL, or cwd-relative/absolute path. */
export async function loadImages(imagePath: string) {
  try {
    const resolved = await resolveRasterInput(imagePath);
    return sharp(resolved);
  } catch (error) {
    console.error("Error loading image:", error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load image: ${message}`, { cause: error });
  }
}
