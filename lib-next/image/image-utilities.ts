import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";
import type { GradientConfig, ImageFilter, gradient } from "../types";
import { getCanvasContext } from "../core/errors";
import { fetchRemoteMedia } from "../media/remote-fetch";
import { applyContextImageFilters } from "../render/context-image-filters";
import { createGradientFill } from "../render/gradient-fill";
import { ApexifyDecodeError, ApexifyError, ApexifyExternalServiceError, ApexifyInputError } from "../runtime/errors";
import { assertFiniteNumber, assertOpacity, assertRecord } from "../runtime/validation";
import { inspectImageSource } from "./image-source-validation";
import { loadImageCached } from "./image-properties";

type LegacyImageFilter = {
  type: "flip" | "rotate" | "brightness" | "contrast" | "invert" | "greyscale" | "sepia" | "blur" | "posterize" | "pixelate";
  horizontal?: boolean;
  vertical?: boolean;
  deg?: number;
  value?: number;
  radius?: number;
  levels?: number;
  size?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
};

/** Apply a solid color or authoritative Apexify gradient overlay to a preflighted image source. */
export async function applyColorFilters(imagePath: string, gradientOptions: string | GradientConfig, opacity = 1): Promise<Buffer> {
  if (typeof gradientOptions !== "string" && (!gradientOptions || typeof gradientOptions !== "object")) {
    throw new ApexifyInputError("image.colorsFilter.filterColor must be a color string or GradientConfig.");
  }
  assertOpacity(opacity, "image.colorsFilter.opacity");
  try {
    const inspected = await inspectImageSource(imagePath, { label: "color filter source", requireCanvasBudget: true });
    const overlay = typeof gradientOptions === "string"
      ? createSolidOverlay(inspected.width, inspected.height, gradientOptions, opacity)
      : createGradientOverlay(inspected.width, inspected.height, gradientOptions, opacity);
    return sharp(inspected.resolved).rotate().composite([{ input: overlay, blend: "over" }]).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("Failed to apply color filter.", { cause });
  }
}

function createSolidOverlay(width: number, height: number, color: string, opacity: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

function createGradientOverlay(width: number, height: number, options: GradientConfig, opacity: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = createGradientFill(ctx, options as gradient, { x: 0, y: 0, w: width, h: height });
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

/** Apply image effects through the image domain. Unknown effects are rejected instead of silently ignored. */
export async function imgEffects(imagePath: string, filters: Array<ImageFilter | LegacyImageFilter>): Promise<Buffer> {
  if (!Array.isArray(filters)) throw new ApexifyInputError("image.effects.filters must be an array.");
  try {
    const image = await loadImageCached(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    for (let index = 0; index < filters.length; index++) {
      const filter = filters[index]!;
      assertRecord(filter, `image.effects.filters[${index}]`);
      switch (filter.type) {
        case "flip": flipCanvas(ctx, image.width, image.height, filter.horizontal, filter.vertical); break;
        case "rotate": rotateCanvas(ctx, canvas, filter.deg ?? 0); break;
        case "brightness": adjustBrightness(ctx, filter.value ?? 0); break;
        case "contrast": adjustContrast(ctx, filter.value ?? 0); break;
        case "invert": invertColors(ctx); break;
        case "greyscale": grayscale(ctx); break;
        case "sepia": applySepia(ctx); break;
        case "blur":
          await applyContextImageFilters(ctx, [{ type: "gaussianBlur", intensity: Math.min(100, Math.max(0, filter.radius ?? 0)) }], image.width, image.height);
          break;
        case "posterize": posterize(ctx, filter.levels ?? 4); break;
        case "pixelate": pixelate(ctx, filter.size ?? 10, filter.x ?? 0, filter.y ?? 0, filter.w ?? image.width, filter.h ?? image.height); break;
        case "grayscale":
        case "gaussianBlur":
        case "motionBlur":
        case "radialBlur":
        case "sharpen":
        case "noise":
        case "grain":
        case "edgeDetection":
        case "emboss":
        case "saturation":
        case "hueShift":
          await applyContextImageFilters(ctx, [filter as ImageFilter], image.width, image.height);
          break;
        default:
          throw new ApexifyInputError(`image.effects.filters[${index}].type is unsupported.`);
      }
    }
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("image.effects failed.", { cause });
  }
}

function flipCanvas(ctx: SKRSContext2D, width: number, height: number, horizontal = false, vertical = false): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const source = imageData.data;
  const next = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const src = (y * width + x) * 4;
    const dx = horizontal ? width - x - 1 : x;
    const dy = vertical ? height - y - 1 : y;
    const dst = (dy * width + dx) * 4;
    next[dst] = source[src]!; next[dst + 1] = source[src + 1]!; next[dst + 2] = source[src + 2]!; next[dst + 3] = source[src + 3]!;
  }
  const output = ctx.createImageData(width, height);
  output.data.set(next);
  ctx.putImageData(output, 0, 0);
}

function rotateCanvas(ctx: SKRSContext2D, canvas: Canvas, degrees: number): void {
  assertFiniteNumber(degrees, "image.effects.rotate.deg");
  const rotated = createCanvas(canvas.width, canvas.height);
  const out = getCanvasContext(rotated);
  out.translate(canvas.width / 2, canvas.height / 2);
  out.rotate((degrees * Math.PI) / 180);
  out.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rotated, 0, 0);
}

function forPixels(ctx: SKRSContext2D, transform: (r: number, g: number, b: number) => [number, number, number]): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const [r, g, b] = transform(imageData.data[i]!, imageData.data[i + 1]!, imageData.data[i + 2]!);
    imageData.data[i] = r; imageData.data[i + 1] = g; imageData.data[i + 2] = b;
  }
  ctx.putImageData(imageData, 0, 0);
}

function adjustBrightness(ctx: SKRSContext2D, value: number): void {
  assertFiniteNumber(value, "image.effects.brightness.value", { min: -1, max: 1 });
  forPixels(ctx, (r, g, b) => [r + 255 * value, g + 255 * value, b + 255 * value]);
}
function adjustContrast(ctx: SKRSContext2D, value: number): void {
  assertFiniteNumber(value, "image.effects.contrast.value", { min: -255, max: 254 });
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  forPixels(ctx, (r, g, b) => [factor * (r - 128) + 128, factor * (g - 128) + 128, factor * (b - 128) + 128]);
}
function invertColors(ctx: SKRSContext2D): void { forPixels(ctx, (r, g, b) => [255 - r, 255 - g, 255 - b]); }
function grayscale(ctx: SKRSContext2D): void { forPixels(ctx, (r, g, b) => { const value = r * 0.299 + g * 0.587 + b * 0.114; return [value, value, value]; }); }
function applySepia(ctx: SKRSContext2D): void { forPixels(ctx, (r, g, b) => [r * 0.393 + g * 0.769 + b * 0.189, r * 0.349 + g * 0.686 + b * 0.168, r * 0.272 + g * 0.534 + b * 0.131]); }
function posterize(ctx: SKRSContext2D, levels: number): void {
  assertFiniteNumber(levels, "image.effects.posterize.levels", { min: 2, max: 255, integer: true });
  const factor = 255 / (levels - 1);
  forPixels(ctx, (r, g, b) => [Math.round(r / factor) * factor, Math.round(g / factor) * factor, Math.round(b / factor) * factor]);
}
function pixelate(ctx: SKRSContext2D, size: number, startX: number, startY: number, width: number, height: number): void {
  for (const [name, value, min] of [["size", size, 1], ["x", startX, 0], ["y", startY, 0], ["width", width, 1], ["height", height, 1]] as const) {
    assertFiniteNumber(value, `image.effects.pixelate.${name}`, { min, integer: true });
  }
  if (startX + width > ctx.canvas.width || startY + height > ctx.canvas.height) throw new ApexifyInputError("image.effects.pixelate region exceeds image bounds.");
  const imageData = ctx.getImageData(startX, startY, width, height);
  const pixels = imageData.data;
  for (let y = 0; y < height; y += size) for (let x = 0; x < width; x += size) {
    let r = 0, g = 0, b = 0, count = 0;
    for (let dy = 0; dy < size && y + dy < height; dy++) for (let dx = 0; dx < size && x + dx < width; dx++) {
      const index = ((y + dy) * width + x + dx) * 4;
      r += pixels[index]!; g += pixels[index + 1]!; b += pixels[index + 2]!; count++;
    }
    r /= count; g /= count; b /= count;
    for (let dy = 0; dy < size && y + dy < height; dy++) for (let dx = 0; dx < size && x + dx < width; dx++) {
      const index = ((y + dy) * width + x + dx) * 4;
      pixels[index] = r; pixels[index + 1] = g; pixels[index + 2] = b;
    }
  }
  ctx.putImageData(imageData, startX, startY);
}

/** Return the 16 most frequent visible quantized colors from a bounded 160x160 sample. */
export async function detectColors(imagePath: string): Promise<Array<{ color: string; frequency: string }>> {
  try {
    const inspected = await inspectImageSource(imagePath, { label: "color analysis source" });
    const { data } = await sharp(inspected.resolved, { page: 0, pages: 1, limitInputPixels: false, sequentialRead: true })
      .rotate().resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const counts = new Map<number, number>();
    let visible = 0;
    const quantize = (channel: number) => Math.min(255, Math.round(channel / 4) * 4);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 50) continue;
      visible++;
      const r = quantize(data[i]!), g = quantize(data[i + 1]!), b = quantize(data[i + 2]!);
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (visible === 0) return [];
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 16).map(([key, count]) => ({
      color: `${(key >>> 16) & 0xff},${(key >>> 8) & 0xff},${key & 0xff}`,
      frequency: ((count / visible) * 100).toFixed(2),
    }));
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("Color analysis failed.", { cause });
  }
}

/** Remove one exact RGB color, returning PNG bytes or throwing a structured error. */
export async function removeColor(inputImagePath: string, colorToRemove: { red: number; green: number; blue: number }): Promise<Buffer> {
  assertRecord(colorToRemove, "image.colorsRemover.color");
  for (const key of ["red", "green", "blue"] as const) assertFiniteNumber(colorToRemove[key], `image.colorsRemover.color.${key}`, { min: 0, max: 255, integer: true });
  try {
    const image = await loadImageCached(inputImagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (imageData.data[i] === colorToRemove.red && imageData.data[i + 1] === colorToRemove.green && imageData.data[i + 2] === colorToRemove.blue) imageData.data[i + 3] = 0;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("Color removal failed.", { cause });
  }
}

/** remove.bg integration using shared bounded transport and caller-provided credentials only. */
export async function bgRemoval(imgURL: string, API_KEY: string): Promise<Buffer> {
  if (typeof API_KEY !== "string" || API_KEY.length === 0) throw new ApexifyInputError("image.removeBackground apiKey is required.");
  try {
    const result = await fetchRemoteMedia("https://api.remove.bg/v1.0/removebg", {
      kind: "image",
      method: "POST",
      attempts: 1,
      headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imgURL, size: "auto" }),
    });
    return result.buffer;
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyExternalServiceError("remove.bg request failed.", { cause });
  }
}
