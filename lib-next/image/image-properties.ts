import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import sharp from "sharp";
import type { AlignMode, FitMode, BoxBackground } from "../types";
import { buildPath } from "../render/clip-path";
import { createGradientFill } from "../render/gradient-fill";
import { resolveMediaInput } from "../media/source";
import { BoundedCache } from "../media/cache";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyDecodeError, ApexifyResourceLimitError } from "../runtime/errors";

let imageCache: BoundedCache<string, Image> | undefined;
let imageCacheSignature = "";

function getImageCache(): BoundedCache<string, Image> {
  const config = getDefaultApexifyRuntimeConfig().cache;
  const signature = `${config.enabled}:${config.ttlMs}:${config.maxEntries}:${config.maxBytes}`;
  if (!imageCache || signature !== imageCacheSignature) {
    imageCache = new BoundedCache<string, Image>({
      enabled: config.enabled,
      ttlMs: config.ttlMs,
      maxEntries: config.maxEntries,
      maxBytes: config.maxBytes,
      sizeOf: (value) => Math.max(1, value.width * value.height * 4),
    });
    imageCacheSignature = signature;
  }
  return imageCache;
}

export function clearDecodedImageCache(): void {
  imageCache?.clear();
}

export function getDecodedImageCacheStats() {
  return imageCache?.stats() ?? { hits: 0, misses: 0, sets: 0, evictions: 0, expirations: 0, failures: 0, entries: 0, bytes: 0 };
}

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

  if (fit === "fill") return { dx, dy, dw, dh, sx, sy, sw, sh };

  const s = fit === "contain" ? Math.min(boxW / imgW, boxH / imgH) : Math.max(boxW / imgW, boxH / imgH);
  dw = imgW * s;
  dh = imgH * s;
  const cx = boxX + (boxW - dw) / 2;
  const cy = boxY + (boxH - dh) / 2;

  switch (align) {
    case "top-left": dx = boxX; dy = boxY; break;
    case "top": dx = cx; dy = boxY; break;
    case "top-right": dx = boxX + boxW - dw; dy = boxY; break;
    case "left": dx = boxX; dy = cy; break;
    case "center": dx = cx; dy = cy; break;
    case "right": dx = boxX + boxW - dw; dy = cy; break;
    case "bottom-left": dx = boxX; dy = boxY + boxH - dh; break;
    case "bottom": dx = cx; dy = boxY + boxH - dh; break;
    case "bottom-right": dx = boxX + boxW - dw; dy = boxY + boxH - dh; break;
    default: dx = cx; dy = cy; break;
  }

  return { dx, dy, dw, dh, sx, sy, sw, sh };
}

async function resolveToCanvasImage(src: string | Buffer): Promise<Image> {
  try {
    const resolved = await resolveMediaInput(src, { kind: "image" });
    const metadata = await sharp(resolved).metadata();
    const limits = getDefaultApexifyRuntimeConfig().limits;
    const pixels = (metadata.width ?? 0) * (metadata.height ?? 0);
    if (pixels > limits.maxDecodedImagePixels) {
      throw new ApexifyResourceLimitError("maxDecodedImagePixels", limits.maxDecodedImagePixels, pixels);
    }
    const png = await sharp(resolved).png().toBuffer();
    return await loadImage(png);
  } catch (cause) {
    if (cause instanceof ApexifyResourceLimitError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Image source could not be decoded.", { cause });
  }
}

export async function loadImageCached(src: string | Buffer): Promise<Image> {
  if (Buffer.isBuffer(src)) return resolveToCanvasImage(src);
  const key = /^https?:\/\//i.test(src) ? src : path.resolve(process.cwd(), src);
  const cache = getImageCache();
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const image = await resolveToCanvasImage(src);
    cache.set(key, image);
    return image;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

/** Optional “box background” under the bitmap, inside the image clip. */
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
  const resolved = await resolveMediaInput(imagePath, { kind: "image" });
  return sharp(resolved);
}
