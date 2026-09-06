import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { CanvasResults, PixelData, PixelManipulationOptions } from "../types";
import { loadImageCached } from "../image/image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { assertFiniteNumber, assertOptionalFiniteNumber, assertRecord } from "../runtime/validation";

type PixelRegion = { x?: number; y?: number; width?: number; height?: number };
type SetOptions = { x?: number; y?: number; dirtyX?: number; dirtyY?: number; dirtyWidth?: number; dirtyHeight?: number };
type LoadedCanvas = { image: Image; ctx: SKRSContext2D; width: number; height: number };

function extractCanvasBuffer(input: CanvasResults | Buffer, name: string): Buffer {
  if (Buffer.isBuffer(input) && input.length > 0) return input;
  if (input && typeof input === "object" && Buffer.isBuffer(input.buffer) && input.buffer.length > 0) return input.buffer;
  throw new ApexifyInputError(`${name} must be a non-empty Buffer or CanvasResults.`);
}

async function loadCanvas(input: CanvasResults | Buffer, name: string): Promise<LoadedCanvas> {
  const image = await loadImageCached(extractCanvasBuffer(input, name));
  assertCanvasResourceLimits(image.width, image.height);
  const canvas = createCanvas(image.width, image.height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0);
  return { image, ctx, width: image.width, height: image.height };
}

function validateRegionShape(region: PixelRegion | undefined, name: string): void {
  if (region === undefined) return;
  assertRecord(region, name);
  assertOptionalFiniteNumber(region.x, `${name}.x`, { min: 0, integer: true });
  assertOptionalFiniteNumber(region.y, `${name}.y`, { min: 0, integer: true });
  assertOptionalFiniteNumber(region.width, `${name}.width`, { min: 1, integer: true });
  assertOptionalFiniteNumber(region.height, `${name}.height`, { min: 1, integer: true });
  if (region.width !== undefined && region.height !== undefined) assertCanvasResourceLimits(region.width, region.height);
}

function resolveRegion(region: PixelRegion | undefined, width: number, height: number, name: string): Required<PixelRegion> {
  const x = region?.x ?? 0;
  const y = region?.y ?? 0;
  const w = region?.width ?? width;
  const h = region?.height ?? height;
  if (x + w > width || y + h > height) {
    throw new ApexifyInputError(`${name} is out of bounds for ${width}x${height}: ${x},${y} ${w}x${h}.`);
  }
  return { x, y, width: w, height: h };
}

function validatePixelData(pixelData: PixelData): void {
  assertRecord(pixelData, "pixels.pixelData");
  assertFiniteNumber(pixelData.width, "pixels.pixelData.width", { min: 1, integer: true });
  assertFiniteNumber(pixelData.height, "pixels.pixelData.height", { min: 1, integer: true });
  assertCanvasResourceLimits(pixelData.width, pixelData.height);
  if (!(pixelData.data instanceof Uint8ClampedArray)) throw new ApexifyInputError("pixels.pixelData.data must be a Uint8ClampedArray.");
  const expected = pixelData.width * pixelData.height * 4;
  if (pixelData.data.length !== expected) throw new ApexifyInputError(`pixels.pixelData.data length must equal width * height * 4 (${expected}).`);
}

function validateSetOptions(options: SetOptions | undefined): void {
  if (options === undefined) return;
  assertRecord(options, "pixels.setData.options");
  for (const key of ["x", "y", "dirtyX", "dirtyY"] as const) assertOptionalFiniteNumber(options[key], `pixels.setData.options.${key}`, { min: 0, integer: true });
  for (const key of ["dirtyWidth", "dirtyHeight"] as const) assertOptionalFiniteNumber(options[key], `pixels.setData.options.${key}`, { min: 1, integer: true });
  const dirtyValues = [options.dirtyX, options.dirtyY, options.dirtyWidth, options.dirtyHeight];
  if (dirtyValues.some((value) => value !== undefined) && (options.dirtyX === undefined || options.dirtyY === undefined)) {
    throw new ApexifyInputError("pixels.setData dirtyX and dirtyY are required when a dirty region is used.");
  }
}

function putPixelData(ctx: SKRSContext2D, pixelData: PixelData, options?: SetOptions): void {
  const imageData = ctx.createImageData(pixelData.width, pixelData.height);
  imageData.data.set(pixelData.data);
  const x = options?.x ?? 0;
  const y = options?.y ?? 0;
  if (options?.dirtyX !== undefined && options.dirtyY !== undefined) {
    const dirtyWidth = options.dirtyWidth ?? pixelData.width - options.dirtyX;
    const dirtyHeight = options.dirtyHeight ?? pixelData.height - options.dirtyY;
    if (options.dirtyX + dirtyWidth > pixelData.width || options.dirtyY + dirtyHeight > pixelData.height) {
      throw new ApexifyInputError("pixels.setData dirty region exceeds pixelData bounds.");
    }
    ctx.putImageData(imageData, x, y, options.dirtyX, options.dirtyY, dirtyWidth, dirtyHeight);
  } else {
    ctx.putImageData(imageData, x, y);
  }
}

function rethrowPixelError(error: unknown, message: string): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyDecodeError(message, { cause: error });
}

function blend(original: number, transformed: number, intensity: number): number {
  return original + (transformed - original) * intensity;
}

function filteredPixel(filter: NonNullable<PixelManipulationOptions["filter"]>, r: number, g: number, b: number): [number, number, number] {
  switch (filter) {
    case "grayscale": {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      return [gray, gray, gray];
    }
    case "invert": return [255 - r, 255 - g, 255 - b];
    case "sepia": return [
      Math.min(255, r * 0.393 + g * 0.769 + b * 0.189),
      Math.min(255, r * 0.349 + g * 0.686 + b * 0.168),
      Math.min(255, r * 0.272 + g * 0.534 + b * 0.131),
    ];
    case "brightness": return [Math.min(255, r + 128), Math.min(255, g + 128), Math.min(255, b + 128)];
    case "contrast": {
      const factor = 2;
      return [Math.max(0, Math.min(255, factor * (r - 128) + 128)), Math.max(0, Math.min(255, factor * (g - 128) + 128)), Math.max(0, Math.min(255, factor * (b - 128) + 128))];
    }
    case "saturate": {
      const gray = r * 0.299 + g * 0.587 + b * 0.114;
      return [Math.max(0, Math.min(255, gray + (r - gray) * 2)), Math.max(0, Math.min(255, gray + (g - gray) * 2)), Math.max(0, Math.min(255, gray + (b - gray) * 2))];
    }
  }
}

export class PixelDataCreator {
  async getPixelData(canvasBuffer: CanvasResults | Buffer, options?: PixelRegion): Promise<PixelData> {
    validateRegionShape(options, "pixels.getData.options");
    try {
      const loaded = await loadCanvas(canvasBuffer, "pixels.getData.canvasBuffer");
      const region = resolveRegion(options, loaded.width, loaded.height, "pixels.getData region");
      const imageData = loaded.ctx.getImageData(region.x, region.y, region.width, region.height);
      return { data: imageData.data, width: imageData.width, height: imageData.height, colorSpace: "srgb" };
    } catch (error) {
      rethrowPixelError(error, "Pixel data could not be read.");
    }
  }

  async setPixelData(canvasBuffer: CanvasResults | Buffer, pixelData: PixelData, options?: SetOptions): Promise<Buffer> {
    validatePixelData(pixelData);
    validateSetOptions(options);
    try {
      const loaded = await loadCanvas(canvasBuffer, "pixels.setData.canvasBuffer");
      const x = options?.x ?? 0, y = options?.y ?? 0;
      if (x + pixelData.width > loaded.width || y + pixelData.height > loaded.height) {
        throw new ApexifyInputError("pixels.setData pixelData exceeds destination bounds.");
      }
      putPixelData(loaded.ctx, pixelData, options);
      return loaded.ctx.canvas.toBuffer("image/png");
    } catch (error) {
      rethrowPixelError(error, "Pixel data could not be written.");
    }
  }

  async manipulatePixels(canvasBuffer: CanvasResults | Buffer, options: PixelManipulationOptions): Promise<Buffer> {
    assertRecord(options, "pixels.manipulate.options");
    validateRegionShape(options.region, "pixels.manipulate.options.region");
    if (options.processor !== undefined && typeof options.processor !== "function") throw new ApexifyInputError("pixels.manipulate.processor must be a synchronous function.");
    if (options.filter !== undefined && !["grayscale", "invert", "sepia", "brightness", "contrast", "saturate"].includes(options.filter)) {
      throw new ApexifyInputError("pixels.manipulate.filter is unsupported.");
    }
    if (options.processor !== undefined && options.filter !== undefined) throw new ApexifyInputError("pixels.manipulate accepts processor or filter, not both.");
    if (options.processor === undefined && options.filter === undefined) throw new ApexifyInputError("pixels.manipulate requires processor or filter.");
    assertOptionalFiniteNumber(options.intensity, "pixels.manipulate.intensity", { min: 0, max: 1 });

    try {
      const loaded = await loadCanvas(canvasBuffer, "pixels.manipulate.canvasBuffer");
      const region = resolveRegion(options.region, loaded.width, loaded.height, "pixels.manipulate region");
      const imageData = loaded.ctx.getImageData(region.x, region.y, region.width, region.height);
      const original = imageData.data;
      const next = new Uint8ClampedArray(original);
      const intensity = options.intensity ?? 1;

      for (let y = 0; y < region.height; y++) {
        for (let x = 0; x < region.width; x++) {
          const idx = (y * region.width + x) * 4;
          const r = original[idx]!, g = original[idx + 1]!, b = original[idx + 2]!, a = original[idx + 3]!;
          if (options.processor) {
            const output = options.processor(r, g, b, a, x, y);
            if (!Array.isArray(output) || output.length !== 4 || output.some((value) => !Number.isFinite(value))) {
              throw new ApexifyInputError("pixels.manipulate processor must synchronously return four finite channel values.");
            }
            next[idx] = output[0]; next[idx + 1] = output[1]; next[idx + 2] = output[2]; next[idx + 3] = output[3];
          } else if (options.filter) {
            const transformed = filteredPixel(options.filter, r, g, b);
            next[idx] = blend(r, transformed[0], intensity);
            next[idx + 1] = blend(g, transformed[1], intensity);
            next[idx + 2] = blend(b, transformed[2], intensity);
            next[idx + 3] = a;
          }
        }
      }
      const replacement = loaded.ctx.createImageData(region.width, region.height);
      replacement.data.set(next);
      loaded.ctx.putImageData(replacement, region.x, region.y);
      return loaded.ctx.canvas.toBuffer("image/png");
    } catch (error) {
      rethrowPixelError(error, "Pixel manipulation failed.");
    }
  }

  async getPixelColor(canvasBuffer: CanvasResults | Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
    assertFiniteNumber(x, "pixels.getColor.x", { min: 0, integer: true });
    assertFiniteNumber(y, "pixels.getColor.y", { min: 0, integer: true });
    try {
      const loaded = await loadCanvas(canvasBuffer, "pixels.getColor.canvasBuffer");
      const region = resolveRegion({ x, y, width: 1, height: 1 }, loaded.width, loaded.height, "pixels.getColor coordinate");
      const data = loaded.ctx.getImageData(region.x, region.y, 1, 1).data;
      return { r: data[0]!, g: data[1]!, b: data[2]!, a: data[3]! };
    } catch (error) {
      rethrowPixelError(error, "Pixel color could not be read.");
    }
  }

  async setPixelColor(canvasBuffer: CanvasResults | Buffer, x: number, y: number, color: { r: number; g: number; b: number; a?: number }): Promise<Buffer> {
    assertFiniteNumber(x, "pixels.setColor.x", { min: 0, integer: true });
    assertFiniteNumber(y, "pixels.setColor.y", { min: 0, integer: true });
    assertRecord(color, "pixels.setColor.color");
    for (const key of ["r", "g", "b"] as const) assertFiniteNumber(color[key], `pixels.setColor.color.${key}`, { min: 0, max: 255, integer: true });
    assertOptionalFiniteNumber(color.a, "pixels.setColor.color.a", { min: 0, max: 255, integer: true });
    try {
      const loaded = await loadCanvas(canvasBuffer, "pixels.setColor.canvasBuffer");
      resolveRegion({ x, y, width: 1, height: 1 }, loaded.width, loaded.height, "pixels.setColor coordinate");
      const data = loaded.ctx.createImageData(1, 1);
      data.data[0] = color.r; data.data[1] = color.g; data.data[2] = color.b; data.data[3] = color.a ?? 255;
      loaded.ctx.putImageData(data, x, y);
      return loaded.ctx.canvas.toBuffer("image/png");
    } catch (error) {
      rethrowPixelError(error, "Pixel color could not be written.");
    }
  }
}

export { PixelDataCreator as PixelService };
