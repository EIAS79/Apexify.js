import { createCanvas, type Image } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { CanvasResults, PixelData, PixelManipulationOptions } from "../types";
import { loadImageCached } from "../image/image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import {
  assertFiniteNumber,
  assertOptionalFiniteNumber,
  assertRecord,
} from "../runtime/validation";

function extractCanvasBuffer(input: CanvasResults | Buffer, name: string): Buffer {
  if (Buffer.isBuffer(input)) {
    if (input.length === 0) throw new ApexifyInputError(`${name} must be a non-empty Buffer.`);
    return input;
  }
  if (input && typeof input === "object" && Buffer.isBuffer(input.buffer) && input.buffer.length > 0) {
    return input.buffer;
  }
  throw new ApexifyInputError(`${name} must be a non-empty Buffer or CanvasResults.`);
}

async function loadGuardedCanvasImage(input: CanvasResults | Buffer, name: string): Promise<Image> {
  const image = await loadImageCached(extractCanvasBuffer(input, name));
  assertCanvasResourceLimits(image.width, image.height);
  return image;
}

function validateRegionShape(
  region: { x?: number; y?: number; width?: number; height?: number } | undefined,
  name: string
): void {
  if (region === undefined) return;
  assertRecord(region, name);
  assertOptionalFiniteNumber(region.x, `${name}.x`, { min: 0, integer: true });
  assertOptionalFiniteNumber(region.y, `${name}.y`, { min: 0, integer: true });
  assertOptionalFiniteNumber(region.width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(region.height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
  if (region.width !== undefined && region.height !== undefined) {
    assertCanvasResourceLimits(region.width, region.height);
  }
}

function validatePixelData(pixelData: PixelData): void {
  assertRecord(pixelData, "pixels.pixelData");
  assertFiniteNumber(pixelData.width, "pixels.pixelData.width", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(pixelData.height, "pixels.pixelData.height", { min: 0, exclusiveMin: true, integer: true });
  assertCanvasResourceLimits(pixelData.width, pixelData.height);
  if (!(pixelData.data instanceof Uint8ClampedArray)) {
    throw new ApexifyInputError("pixels.pixelData.data must be a Uint8ClampedArray.");
  }
  const expected = pixelData.width * pixelData.height * 4;
  if (pixelData.data.length !== expected) {
    throw new ApexifyInputError(`pixels.pixelData.data length must equal width * height * 4 (${expected}).`);
  }
}

function validateSetOptions(options: {
  x?: number;
  y?: number;
  dirtyX?: number;
  dirtyY?: number;
  dirtyWidth?: number;
  dirtyHeight?: number;
} | undefined): void {
  if (options === undefined) return;
  assertRecord(options, "pixels.setData.options");
  assertOptionalFiniteNumber(options.x, "pixels.setData.options.x", { min: 0, integer: true });
  assertOptionalFiniteNumber(options.y, "pixels.setData.options.y", { min: 0, integer: true });
  assertOptionalFiniteNumber(options.dirtyX, "pixels.setData.options.dirtyX", { min: 0, integer: true });
  assertOptionalFiniteNumber(options.dirtyY, "pixels.setData.options.dirtyY", { min: 0, integer: true });
  assertOptionalFiniteNumber(options.dirtyWidth, "pixels.setData.options.dirtyWidth", { min: 0, exclusiveMin: true, integer: true });
  assertOptionalFiniteNumber(options.dirtyHeight, "pixels.setData.options.dirtyHeight", { min: 0, exclusiveMin: true, integer: true });
  const hasDirty = options.dirtyX !== undefined || options.dirtyY !== undefined || options.dirtyWidth !== undefined || options.dirtyHeight !== undefined;
  if (hasDirty && (options.dirtyX === undefined || options.dirtyY === undefined)) {
    throw new ApexifyInputError("pixels.setData.options.dirtyX and dirtyY are required together for dirty-region updates.");
  }
}

function rethrowPixelError(error: unknown, message: string): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyDecodeError(message, { cause: error });
}

export class PixelDataCreator {
  async getPixelData(
    canvasBuffer: CanvasResults | Buffer,
    options?: { x?: number; y?: number; width?: number; height?: number }
  ): Promise<PixelData> {
    validateRegionShape(options, "pixels.getData.options");
    try {
      const image = await loadGuardedCanvasImage(canvasBuffer, "pixels.getData.canvasBuffer");
      const x = options?.x ?? 0;
      const y = options?.y ?? 0;
      const width = options?.width ?? image.width;
      const height = options?.height ?? image.height;
      assertCanvasResourceLimits(width, height);
      if (x + width > image.width || y + height > image.height) {
        throw new ApexifyInputError(
          `pixels.getData region is out of bounds for ${image.width}x${image.height}: ${x},${y} ${width}x${height}.`
        );
      }

      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.getImageData(x, y, width, height);
      return { data: imageData.data, width: imageData.width, height: imageData.height, colorSpace: "srgb" };
    } catch (error) {
      rethrowPixelError(error, "Pixel data could not be read.");
    }
  }

  async setPixelData(
    canvasBuffer: CanvasResults | Buffer,
    pixelData: PixelData,
    options?: { x?: number; y?: number; dirtyX?: number; dirtyY?: number; dirtyWidth?: number; dirtyHeight?: number }
  ): Promise<Buffer> {
    validatePixelData(pixelData);
    validateSetOptions(options);
    try {
      const image = await loadGuardedCanvasImage(canvasBuffer, "pixels.setData.canvasBuffer");
      const x = options?.x ?? 0;
      const y = options?.y ?? 0;
      if (x + pixelData.width > image.width || y + pixelData.height > image.height) {
        throw new ApexifyInputError("pixels.setData pixelData exceeds the destination canvas bounds.");
      }

      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);
      const imageData = ctx.createImageData(pixelData.width, pixelData.height);
      imageData.data.set(pixelData.data);

      if (options?.dirtyX !== undefined && options.dirtyY !== undefined) {
        ctx.putImageData(
          imageData,
          x,
          y,
          options.dirtyX,
          options.dirtyY,
          options.dirtyWidth ?? pixelData.width,
          options.dirtyHeight ?? pixelData.height
        );
      } else {
        ctx.putImageData(imageData, x, y);
      }
      return canvas.toBuffer("image/png");
    } catch (error) {
      rethrowPixelError(error, "Pixel data could not be written.");
    }
  }

  async manipulatePixels(canvasBuffer: CanvasResults | Buffer, options: PixelManipulationOptions): Promise<Buffer> {
    assertRecord(options, "pixels.manipulate.options");
    validateRegionShape(options.region, "pixels.manipulate.options.region");
    if (options.processor !== undefined && typeof options.processor !== "function") {
      throw new ApexifyInputError("pixels.manipulate.options.processor must be a function.");
    }
    if (options.filter !== undefined && !["grayscale", "invert", "sepia", "brightness", "contrast", "saturate"].includes(options.filter)) {
      throw new ApexifyInputError("pixels.manipulate.options.filter is unsupported.");
    }
    if (options.processor !== undefined && options.filter !== undefined) {
      throw new ApexifyInputError("pixels.manipulate accepts processor or filter, not both.");
    }
    assertOptionalFiniteNumber(options.intensity, "pixels.manipulate.options.intensity");

    try {
      const pixelData = await this.getPixelData(canvasBuffer, options.region);
      const processedData = new Uint8ClampedArray(pixelData.data);

      if (options.processor) {
        for (let y = 0; y < pixelData.height; y++) {
          for (let x = 0; x < pixelData.width; x++) {
            const idx = (y * pixelData.width + x) * 4;
            const output = options.processor(
              pixelData.data[idx]!, pixelData.data[idx + 1]!, pixelData.data[idx + 2]!, pixelData.data[idx + 3]!, x, y
            );
            if (!Array.isArray(output) || output.length !== 4 || output.some((value) => !Number.isFinite(value))) {
              throw new ApexifyInputError("pixels.manipulate processor must return four finite channel values.");
            }
            processedData[idx] = Math.max(0, Math.min(255, output[0]));
            processedData[idx + 1] = Math.max(0, Math.min(255, output[1]));
            processedData[idx + 2] = Math.max(0, Math.min(255, output[2]));
            processedData[idx + 3] = Math.max(0, Math.min(255, output[3]));
          }
        }
      } else if (options.filter) {
        const intensity = options.intensity ?? 1;
        for (let y = 0; y < pixelData.height; y++) {
          for (let x = 0; x < pixelData.width; x++) {
            const idx = (y * pixelData.width + x) * 4;
            let r = pixelData.data[idx]!;
            let g = pixelData.data[idx + 1]!;
            let b = pixelData.data[idx + 2]!;
            const a = pixelData.data[idx + 3]!;
            switch (options.filter) {
              case "grayscale": { const gray = r * 0.299 + g * 0.587 + b * 0.114; r = g = b = gray; break; }
              case "invert": r = 255 - r; g = 255 - g; b = 255 - b; break;
              case "sepia": {
                const r0 = r, g0 = g, b0 = b;
                r = Math.min(255, r0 * 0.393 + g0 * 0.769 + b0 * 0.189);
                g = Math.min(255, r0 * 0.349 + g0 * 0.686 + b0 * 0.168);
                b = Math.min(255, r0 * 0.272 + g0 * 0.534 + b0 * 0.131);
                break;
              }
              case "brightness": {
                const delta = (intensity - 0.5) * 255;
                r = Math.max(0, Math.min(255, r + delta));
                g = Math.max(0, Math.min(255, g + delta));
                b = Math.max(0, Math.min(255, b + delta));
                break;
              }
              case "contrast": {
                const contrast = intensity * 2;
                const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
                r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
                g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
                b = Math.max(0, Math.min(255, factor * (b - 128) + 128));
                break;
              }
              case "saturate": {
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                r = Math.max(0, Math.min(255, gray + (r - gray) * intensity));
                g = Math.max(0, Math.min(255, gray + (g - gray) * intensity));
                b = Math.max(0, Math.min(255, gray + (b - gray) * intensity));
                break;
              }
            }
            processedData[idx] = r;
            processedData[idx + 1] = g;
            processedData[idx + 2] = b;
            processedData[idx + 3] = a;
          }
        }
      }

      const newPixelData: PixelData = { data: processedData, width: pixelData.width, height: pixelData.height, colorSpace: pixelData.colorSpace };
      if (options.region) {
        const image = await loadGuardedCanvasImage(canvasBuffer, "pixels.manipulate.canvasBuffer");
        const canvas = createCanvas(image.width, image.height);
        const ctx = getCanvasContext(canvas);
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.createImageData(newPixelData.width, newPixelData.height);
        imageData.data.set(newPixelData.data);
        ctx.putImageData(imageData, options.region.x, options.region.y);
        return canvas.toBuffer("image/png");
      }
      return this.setPixelData(canvasBuffer, newPixelData);
    } catch (error) {
      rethrowPixelError(error, "Pixel manipulation failed.");
    }
  }

  async getPixelColor(canvasBuffer: CanvasResults | Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a: number }> {
    assertFiniteNumber(x, "pixels.getColor.x", { min: 0, integer: true });
    assertFiniteNumber(y, "pixels.getColor.y", { min: 0, integer: true });
    const pixelData = await this.getPixelData(canvasBuffer, { x, y, width: 1, height: 1 });
    return { r: pixelData.data[0]!, g: pixelData.data[1]!, b: pixelData.data[2]!, a: pixelData.data[3]! };
  }

  async setPixelColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number,
    color: { r: number; g: number; b: number; a?: number }
  ): Promise<Buffer> {
    assertFiniteNumber(x, "pixels.setColor.x", { min: 0, integer: true });
    assertFiniteNumber(y, "pixels.setColor.y", { min: 0, integer: true });
    assertRecord(color, "pixels.setColor.color");
    assertFiniteNumber(color.r, "pixels.setColor.color.r", { min: 0, max: 255 });
    assertFiniteNumber(color.g, "pixels.setColor.color.g", { min: 0, max: 255 });
    assertFiniteNumber(color.b, "pixels.setColor.color.b", { min: 0, max: 255 });
    assertOptionalFiniteNumber(color.a, "pixels.setColor.color.a", { min: 0, max: 255 });
    const pixelData = await this.getPixelData(canvasBuffer, { x, y, width: 1, height: 1 });
    pixelData.data[0] = color.r;
    pixelData.data[1] = color.g;
    pixelData.data[2] = color.b;
    pixelData.data[3] = color.a ?? 255;
    return this.setPixelData(canvasBuffer, pixelData, { x, y });
  }
}

export { PixelDataCreator as PixelService };
