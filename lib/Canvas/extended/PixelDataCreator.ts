import { createCanvas, loadImage, SKRSContext2D, Image } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import type { CanvasResults } from "./CanvasCreator";
import type { PixelData, PixelManipulationOptions } from "../utils/types";

/**
 * Extended class for pixel data functionality
 */
export class PixelDataCreator {
  /**
   * Gets pixel data from a canvas buffer
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param options - Options for pixel data extraction
   * @returns Pixel data with RGBA values
   */
  async getPixelData(
    canvasBuffer: CanvasResults | Buffer,
    options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }
  ): Promise<PixelData> {
    try {
      if (!canvasBuffer) {
        throw new Error("getPixelData: canvasBuffer is required.");
      }

      const image: Image = Buffer.isBuffer(canvasBuffer)
        ? await loadImage(canvasBuffer)
        : await loadImage((canvasBuffer as CanvasResults).buffer);

      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);

      const x = options?.x ?? 0;
      const y = options?.y ?? 0;
      const width = options?.width ?? image.width;
      const height = options?.height ?? image.height;


      if (x < 0 || y < 0 || x + width > image.width || y + height > image.height) {
        throw new Error(`getPixelData: Region out of bounds. Image: ${image.width}x${image.height}, Region: ${x},${y} ${width}x${height}`);
      }

      const imageData = ctx.getImageData(x, y, width, height);

      return {
        data: imageData.data,
        width: imageData.width,
        height: imageData.height,
        colorSpace: 'srgb'
      };
    } catch (error) {
      throw new Error(`getPixelData failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Sets pixel data to a canvas buffer
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param pixelData - Pixel data to set
   * @param options - Options for setting pixel data
   * @returns New canvas buffer with updated pixels
   */
  async setPixelData(
    canvasBuffer: CanvasResults | Buffer,
    pixelData: PixelData,
    options?: {
      x?: number;
      y?: number;
      dirtyX?: number;
      dirtyY?: number;
      dirtyWidth?: number;
      dirtyHeight?: number;
    }
  ): Promise<Buffer> {
    try {
      if (!canvasBuffer || !pixelData) {
        throw new Error("setPixelData: canvasBuffer and pixelData are required.");
      }

      const image: Image = Buffer.isBuffer(canvasBuffer)
        ? await loadImage(canvasBuffer)
        : await loadImage((canvasBuffer as CanvasResults).buffer);

      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);

      const x = options?.x ?? 0;
      const y = options?.y ?? 0;


      // ImageData constructor accepts Uint8ClampedArray directly
      const imageData = ctx.createImageData(pixelData.width, pixelData.height);
      imageData.data.set(pixelData.data);


      if (options?.dirtyX !== undefined && options?.dirtyY !== undefined) {
        ctx.putImageData(
          imageData,
          x, y,
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
      throw new Error(`setPixelData failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Manipulates pixels using a custom processor function
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param options - Manipulation options
   * @returns New canvas buffer with manipulated pixels
   */
  async manipulatePixels(
    canvasBuffer: CanvasResults | Buffer,
    options: PixelManipulationOptions
  ): Promise<Buffer> {
    try {
      if (!canvasBuffer) {
        throw new Error("manipulatePixels: canvasBuffer is required.");
      }


      const pixelData = await this.getPixelData(
        canvasBuffer,
        options.region
      );


      const processedData = new Uint8ClampedArray(pixelData.data);

      if (options.processor) {

        for (let y = 0; y < pixelData.height; y++) {
          for (let x = 0; x < pixelData.width; x++) {
            const idx = (y * pixelData.width + x) * 4;
            const r = pixelData.data[idx];
            const g = pixelData.data[idx + 1];
            const b = pixelData.data[idx + 2];
            const a = pixelData.data[idx + 3];

            const [newR, newG, newB, newA] = options.processor(r, g, b, a, x, y);

            processedData[idx] = Math.max(0, Math.min(255, newR));
            processedData[idx + 1] = Math.max(0, Math.min(255, newG));
            processedData[idx + 2] = Math.max(0, Math.min(255, newB));
            processedData[idx + 3] = Math.max(0, Math.min(255, newA));
          }
        }
      } else if (options.filter) {
        // Built-in filters
        const intensity = options.intensity ?? 1;
        for (let y = 0; y < pixelData.height; y++) {
          for (let x = 0; x < pixelData.width; x++) {
            const idx = (y * pixelData.width + x) * 4;
            let r = pixelData.data[idx];
            let g = pixelData.data[idx + 1];
            let b = pixelData.data[idx + 2];
            const a = pixelData.data[idx + 3];

            switch (options.filter) {
              case 'grayscale':
                const gray = r * 0.299 + g * 0.587 + b * 0.114;
                r = g = b = gray;
                break;
              case 'invert':
                r = 255 - r;
                g = 255 - g;
                b = 255 - b;
                break;
              case 'sepia':
                r = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
                g = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
                b = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
                break;
              case 'brightness':
                const brightness = (intensity - 0.5) * 255;
                r = Math.max(0, Math.min(255, r + brightness));
                g = Math.max(0, Math.min(255, g + brightness));
                b = Math.max(0, Math.min(255, b + brightness));
                break;
              case 'contrast':
                const contrast = intensity * 2;
                const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
                r = Math.max(0, Math.min(255, factor * (r - 128) + 128));
                g = Math.max(0, Math.min(255, factor * (g - 128) + 128));
                b = Math.max(0, Math.min(255, factor * (b - 128) + 128));
                break;
              case 'saturate':
                const gray2 = r * 0.299 + g * 0.587 + b * 0.114;
                r = Math.max(0, Math.min(255, gray2 + (r - gray2) * intensity));
                g = Math.max(0, Math.min(255, gray2 + (g - gray2) * intensity));
                b = Math.max(0, Math.min(255, gray2 + (b - gray2) * intensity));
                break;
            }

            processedData[idx] = r;
            processedData[idx + 1] = g;
            processedData[idx + 2] = b;
            processedData[idx + 3] = a;
          }
        }
      }


      const newPixelData: PixelData = {
        data: processedData,
        width: pixelData.width,
        height: pixelData.height,
        colorSpace: pixelData.colorSpace
      };


      if (options.region) {
        const image: Image = Buffer.isBuffer(canvasBuffer)
          ? await loadImage(canvasBuffer)
          : await loadImage((canvasBuffer as CanvasResults).buffer);

        const canvas = createCanvas(image.width, image.height);
        const ctx = getCanvasContext(canvas);
        ctx.drawImage(image, 0, 0);

        const imageData = ctx.createImageData(newPixelData.width, newPixelData.height);
        imageData.data.set(newPixelData.data);
        ctx.putImageData(imageData, options.region.x, options.region.y);

        return canvas.toBuffer("image/png");
      } else {

        return await this.setPixelData(canvasBuffer, newPixelData);
      }
    } catch (error) {
      throw new Error(`manipulatePixels failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Gets pixel color at specific coordinates
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns RGBA color values
   */
  async getPixelColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number
  ): Promise<{ r: number; g: number; b: number; a: number }> {
    try {
      const pixelData = await this.getPixelData(canvasBuffer, { x, y, width: 1, height: 1 });
      return {
        r: pixelData.data[0],
        g: pixelData.data[1],
        b: pixelData.data[2],
        a: pixelData.data[3]
      };
    } catch (error) {
      throw new Error(`getPixelColor failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Sets pixel color at specific coordinates
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param color - RGBA color values
   * @returns New canvas buffer
   */
  async setPixelColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number,
    color: { r: number; g: number; b: number; a?: number }
  ): Promise<Buffer> {
    try {
      const pixelData = await this.getPixelData(canvasBuffer, { x, y, width: 1, height: 1 });
      pixelData.data[0] = Math.max(0, Math.min(255, color.r));
      pixelData.data[1] = Math.max(0, Math.min(255, color.g));
      pixelData.data[2] = Math.max(0, Math.min(255, color.b));
      pixelData.data[3] = Math.max(0, Math.min(255, color.a ?? 255));
      return await this.setPixelData(canvasBuffer, pixelData, { x, y });
    } catch (error) {
      throw new Error(`setPixelColor failed: ${getErrorMessage(error)}`);
    }
  }
}

