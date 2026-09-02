import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";
import type { GradientConfig, ImageFilter, gradient } from "../types";
import { getCanvasContext } from "./errors";
import { fetchRemoteMedia } from "../media/remote-fetch";
import { applyContextImageFilters } from "../render/context-image-filters";
import { createGradientFill } from "../render/gradient-fill";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { emitDiagnostic } from "../runtime/diagnostics";
import { inspectImageSource } from "../image/image-source-validation";
import { loadImageCached } from "../image/image-properties";

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

/** Apply a solid color or shared gradient overlay to a preflighted image source. */
export async function applyColorFilters(
  imagePath: string,
  gradientOptions?: string | GradientConfig,
  opacity = 1
): Promise<Buffer> {
  if (typeof gradientOptions !== "string" && !gradientOptions) {
    throw new ApexifyInputError("applyColorFilters: gradientOptions must be a string or GradientConfig object.");
  }
  try {
    const inspected = await inspectImageSource(imagePath, {
      label: "color filter source",
      requireCanvasBudget: true,
    });
    const image = sharp(inspected.resolved).rotate();
    const overlay = typeof gradientOptions === "string"
      ? createSolidOverlay(inspected.width, inspected.height, gradientOptions, opacity)
      : createGradientOverlay(inspected.width, inspected.height, gradientOptions, opacity);
    return image.composite([{ input: overlay, blend: "over" }]).toBuffer();
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

/**
 * Apply image effects after resolving the source through the central image boundary.
 *
 * The legacy imperative effect names retain their historical pixel semantics while
 * the typed ImageFilter surface is delegated to the shared context-filter pipeline.
 */
export async function imgEffects(
  imagePath: string,
  filters: Array<ImageFilter | LegacyImageFilter>
): Promise<Buffer> {
  if (!Array.isArray(filters)) {
    throw new ApexifyInputError("imgEffects: filters must be an array.");
  }
  try {
    const image = await loadImageCached(imagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);

    for (const rawFilter of filters) {
      const filter = rawFilter as ImageFilter | LegacyImageFilter;
      switch (filter.type) {
        case "flip":
          flipCanvas(ctx, image.width, image.height, filter.horizontal, filter.vertical);
          break;
        case "rotate":
          rotateCanvas(ctx, canvas, filter.deg ?? 0);
          break;
        case "brightness":
          adjustBrightness(ctx, filter.value ?? 0);
          break;
        case "contrast":
          adjustContrast(ctx, filter.value ?? 0);
          break;
        case "invert":
          invertColors(ctx);
          break;
        case "greyscale":
          grayscale(ctx);
          break;
        case "sepia":
          applySepia(ctx);
          break;
        case "blur":
          await applyContextImageFilters(
            ctx,
            [{ type: "gaussianBlur", intensity: Math.min(100, Math.max(0, filter.radius ?? 0)) }],
            image.width,
            image.height
          );
          break;
        case "posterize":
          posterize(ctx, filter.levels ?? 4);
          break;
        case "pixelate": {
          const legacy = filter as LegacyImageFilter;
          pixelate(
            ctx,
            filter.size ?? 10,
            legacy.x ?? 0,
            legacy.y ?? 0,
            legacy.w ?? image.width,
            legacy.h ?? image.height
          );
          break;
        }
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
          emitDiagnostic({
            level: "warn",
            code: "IMAGE_EFFECT_UNSUPPORTED",
            message: "Unsupported image effect was ignored for backward compatibility.",
            details: { type: String((filter as { type: string }).type) },
          });
          break;
      }
    }
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("imgEffects failed.", { cause });
  }
}

function flipCanvas(ctx: SKRSContext2D, width: number, height: number, horizontal = false, vertical = false): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const newData = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const destX = horizontal ? width - x - 1 : x;
      const destY = vertical ? height - y - 1 : y;
      const destIndex = (destY * width + destX) * 4;
      newData[destIndex] = pixels[srcIndex];
      newData[destIndex + 1] = pixels[srcIndex + 1];
      newData[destIndex + 2] = pixels[srcIndex + 2];
      newData[destIndex + 3] = pixels[srcIndex + 3];
    }
  }
  const next = ctx.createImageData(width, height);
  next.data.set(newData);
  ctx.putImageData(next, 0, 0);
}

function rotateCanvas(ctx: SKRSContext2D, canvas: Canvas, degrees: number): void {
  const radians = (degrees * Math.PI) / 180;
  const rotated = createCanvas(canvas.width, canvas.height);
  const rotatedCtx = getCanvasContext(rotated);
  rotatedCtx.translate(canvas.width / 2, canvas.height / 2);
  rotatedCtx.rotate(radians);
  rotatedCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(rotated, 0, 0);
}

function adjustBrightness(ctx: SKRSContext2D, value: number): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] += 255 * value;
    pixels[i + 1] += 255 * value;
    pixels[i + 2] += 255 * value;
  }
  ctx.putImageData(imageData, 0, 0);
}

function adjustContrast(ctx: SKRSContext2D, value: number): void {
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = factor * (pixels[i] - 128) + 128;
    pixels[i + 1] = factor * (pixels[i + 1] - 128) + 128;
    pixels[i + 2] = factor * (pixels[i + 2] - 128) + 128;
  }
  ctx.putImageData(imageData, 0, 0);
}

function invertColors(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255 - pixels[i];
    pixels[i + 1] = 255 - pixels[i + 1];
    pixels[i + 2] = 255 - pixels[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

function grayscale(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    pixels[i] = avg;
    pixels[i + 1] = avg;
    pixels[i + 2] = avg;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applySepia(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    pixels[i] = r * 0.393 + g * 0.769 + b * 0.189;
    pixels[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
    pixels[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
  }
  ctx.putImageData(imageData, 0, 0);
}

function posterize(ctx: SKRSContext2D, levels: number): void {
  if (levels < 2 || levels > 255) return;
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  const factor = 255 / (levels - 1);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round(pixels[i] / factor) * factor;
    pixels[i + 1] = Math.round(pixels[i + 1] / factor) * factor;
    pixels[i + 2] = Math.round(pixels[i + 2] / factor) * factor;
  }
  ctx.putImageData(imageData, 0, 0);
}

function pixelate(
  ctx: SKRSContext2D,
  size: number,
  startX = 0,
  startY = 0,
  width = ctx.canvas.width,
  height = ctx.canvas.height
): void {
  if (size < 1) return;
  const imageData = ctx.getImageData(startX, startY, width, height);
  const pixels = imageData.data;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (x + dx < width && y + dy < height) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            r += pixels[index];
            g += pixels[index + 1];
            b += pixels[index + 2];
            count += 1;
          }
        }
      }
      r = Math.floor(r / count);
      g = Math.floor(g / count);
      b = Math.floor(b / count);
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (x + dx < width && y + dy < height) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            pixels[index] = r;
            pixels[index + 1] = g;
            pixels[index + 2] = b;
          }
        }
      }
    }
  }
  ctx.putImageData(imageData, startX, startY);
}

/**
 * Return a bounded, useful visible-color palette while retaining the historical
 * { color: "r,g,b", frequency: "N.NN" } response shape. Large inputs are
 * metadata-preflighted, downsampled before pixel access, quantized, and capped.
 */
export async function detectColors(imagePath: string): Promise<Array<{ color: string; frequency: string }>> {
  try {
    const inspected = await inspectImageSource(imagePath, { label: "color analysis source" });
    const { data } = await sharp(inspected.resolved, {
      page: 0,
      pages: 1,
      limitInputPixels: false,
      sequentialRead: true,
    })
      .rotate()
      .resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true, kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const counts = new Map<number, number>();
    const totalPixels = data.length / 4;
    let visiblePixels = 0;
    const quantize = (channel: number) => Math.min(255, Math.round(channel / 4) * 4);

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 50) continue;
      visiblePixels += 1;
      const r = quantize(data[i]);
      const g = quantize(data[i + 1]);
      const b = quantize(data[i + 2]);
      const key = (r << 16) | (g << 8) | b;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    if (visiblePixels === 0) return [];
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 16)
      .map(([key, count]) => ({
        color: `${(key >>> 16) & 0xff},${(key >>> 8) & 0xff},${key & 0xff}`,
        frequency: ((count / totalPixels) * 100).toFixed(2),
      }))
      .filter(({ frequency }) => Number(frequency) >= 0.1);
  } catch {
    emitDiagnostic({ level: "warn", code: "COLOR_ANALYSIS_FAILED", message: "Color analysis failed." });
    return [];
  }
}
/** Remove one exact RGB color from a resolved image. */
export async function removeColor(
  inputImagePath: string,
  colorToRemove: { red: number; green: number; blue: number }
): Promise<Buffer | undefined> {
  try {
    const image = await loadImageCached(inputImagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] === colorToRemove.red &&
        imageData.data[i + 1] === colorToRemove.green &&
        imageData.data[i + 2] === colorToRemove.blue
      ) {
        imageData.data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toBuffer("image/png");
  } catch {
    emitDiagnostic({ level: "warn", code: "COLOR_REMOVAL_FAILED", message: "Color removal failed." });
    return undefined;
  }
}

/** remove.bg uses the same bounded remote transport as all other network I/O. */
export async function bgRemoval(imgURL: string, API_KEY: string): Promise<Buffer | undefined> {
  if (!API_KEY) {
    emitDiagnostic({ level: "warn", code: "REMOVE_BG_API_KEY_MISSING", message: "remove.bg API key is required." });
    return undefined;
  }
  try {
    const body = JSON.stringify({ image_url: imgURL, size: "auto" });
    const result = await fetchRemoteMedia("https://api.remove.bg/v1.0/removebg", {
      kind: "image",
      method: "POST",
      attempts: 1,
      headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
      body,
    });
    return result.buffer;
  } catch {
    emitDiagnostic({ level: "warn", code: "REMOVE_BG_FAILED", message: "remove.bg request failed." });
    return undefined;
  }
}
