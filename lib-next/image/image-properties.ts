import type { Image, SKRSContext2D } from "@napi-rs/canvas";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AlignMode, FitMode, BoxBackground } from "../types";
import { buildPath } from "../render/clip-path";
import { createGradientFill } from "../render/gradient-fill";
import type { MediaSource } from "../media/source";
import { BoundedCache } from "../media/cache";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { decodeImageSource } from "./image-source-validation";

let imageCache: BoundedCache<string, Image> | undefined;
let imageCacheSignature = "";
const inFlightDecodes = new Map<string, Promise<Image>>();

function getImageCache(): BoundedCache<string, Image> {
  const runtime = getDefaultApexifyRuntimeConfig();
  const config = runtime.cache;
  const signature = JSON.stringify({
    cache: [config.enabled, config.ttlMs, config.maxEntries, config.maxBytes],
    network: [runtime.network.allowedProtocols, runtime.network.trustedNetworkAccess, runtime.network.allowedHosts],
    limits: [
      runtime.limits.maxRemoteImageBytes,
      runtime.limits.maxImageSourceBytes,
      runtime.limits.maxDecodedImagePixels,
      runtime.limits.maxDecodedImageFrames,
      runtime.limits.maxSvgElements,
    ],
  });
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

function digestCacheKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function sourceCacheKey(src: MediaSource): Promise<string | undefined> {
  const raw = src instanceof URL ? src.toString() : src;
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return `remote:${digestCacheKey(trimmed)}`;
  if (/^data:/i.test(trimmed)) return `data:${digestCacheKey(trimmed)}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `url:${digestCacheKey(trimmed)}`;

  const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  try {
    const stat = await fs.stat(absolute);
    return `file:${digestCacheKey(`${absolute}\0${stat.size}\0${stat.mtimeMs}`)}`;
  } catch {
    return `file:${digestCacheKey(absolute)}`;
  }
}

export function clearDecodedImageCache(): void {
  imageCache?.clear();
  inFlightDecodes.clear();
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

/** Authoritative canvas-image decoder with bounded global LRU/TTL caching and in-flight deduplication. */
export async function loadImageCached(src: MediaSource): Promise<Image> {
  const key = await sourceCacheKey(src);
  if (key === undefined) return decodeImageSource(src, { label: "image source" });

  const cache = getImageCache();
  const cached = cache.get(key);
  if (cached) return cached;

  const existing = inFlightDecodes.get(key);
  if (existing) return existing;

  const decode = decodeImageSource(src, { label: "image source" })
    .then((image) => {
      cache.set(key, image);
      return image;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    })
    .finally(() => {
      inFlightDecodes.delete(key);
    });

  inFlightDecodes.set(key, decode);
  return decode;
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
