import type { SKRSContext2D } from "@napi-rs/canvas";
import { loadImage, type Image } from "@napi-rs/canvas";
import path from "path";
import sharp from "sharp";
import type { AlignMode, FitMode, BoxBackground } from "../types/common";
import { buildPath } from "../render/clip-path";
import { createGradientFill } from "../render/gradient-fill";

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

export function loadImageCached(src: string | Buffer): Promise<Image> {
  if (Buffer.isBuffer(src)) return loadImage(src);
  const key = src.startsWith("http") ? src : path.resolve(process.cwd(), src);
  if (!cache.has(key)) cache.set(key, loadImage(key));
  return cache.get(key)!;
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

/** Load a raster via Sharp from a URL or filesystem path (cwd-relative when not http). */
export async function loadImages(imagePath: string) {
  try {
    if (!imagePath) {
      throw new Error("Image path is required.");
    }

    if (imagePath.startsWith("http")) {
      const response = await fetch(imagePath);
      if (!response.ok) {
        throw new Error("Failed to fetch image.");
      }
      const buffer = await response.arrayBuffer();
      return sharp(Buffer.from(buffer));
    }
    const absolutePath = path.join(process.cwd(), imagePath);
    return sharp(absolutePath);
  } catch (error) {
    console.error("Error loading image:", error);
    throw new Error("Failed to load image");
  }
}
