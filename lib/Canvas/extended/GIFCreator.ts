import { createCanvas, loadImage, SKRSContext2D, Image } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import { PassThrough } from "stream";
import fs from "fs";
import type { GIFOptions, GIFResults } from "../utils/utils";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";

/**
 * Extended class for GIF creation functionality
 */
export class GIFCreator {
  /**
   * Validates GIF options and frames.
   * @private
   * @param gifFrames - GIF frames to validate
   * @param options - GIF options to validate
   */
  private validateGIFOptions(gifFrames: { background: string; duration: number }[], options: GIFOptions): void {
    if (!gifFrames || gifFrames.length === 0) {
      throw new Error("createGIF: At least one frame is required.");
    }
    for (const frame of gifFrames) {
      if (!frame.background) {
        throw new Error("createGIF: Each frame must have a background property.");
      }
      if (typeof frame.duration !== 'number' || frame.duration < 0) {
        throw new Error("createGIF: Each frame duration must be a non-negative number.");
      }
    }
    if (options.outputFormat === "file" && !options.outputFile) {
      throw new Error("createGIF: outputFile is required when outputFormat is 'file'.");
    }
    if (options.repeat !== undefined && (typeof options.repeat !== "number" || options.repeat < 0)) {
      throw new Error("createGIF: repeat must be a non-negative number or undefined.");
    }
    if (options.quality !== undefined && (typeof options.quality !== "number" || options.quality < 1 || options.quality > 20)) {
      throw new Error("createGIF: quality must be a number between 1 and 20 or undefined.");
    }
  }

  /**
   * Resizes an image to target dimensions
   * @private
   */
  private async resizeImage(image: Image, targetWidth: number, targetHeight: number) {
    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas;
  }

  /**
   * Creates a file output stream
   * @private
   */
  private createOutputStream(outputFile: string): fs.WriteStream {
    return fs.createWriteStream(outputFile);
  }

  /**
   * Creates a buffer stream with getBuffer method
   * @private
   */
  private createBufferStream(): PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] } {
    const bufferStream = new PassThrough();
    const chunks: Buffer[] = [];

    bufferStream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    const extendedStream = bufferStream as PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] };
    extendedStream.getBuffer = function (): Buffer {
      return Buffer.concat(chunks);
    };
    extendedStream.chunks = chunks;

    return extendedStream;
  }

  /**
   * Creates a GIF from frames
   * 
   * @param gifFrames - Array of frames with background and duration
   * @param options - GIF creation options
   * @returns Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | undefined>
   */
  async createGIF(
    gifFrames: { background: string; duration: number }[], 
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | undefined> {
    try {
      this.validateGIFOptions(gifFrames, options);

      const canvasWidth = options.width || 1200;
      const canvasHeight = options.height || 1200;

      const encoder = new GIFEncoder(canvasWidth, canvasHeight);
      const useBufferStream = options.outputFormat !== "file";
      const outputStream = useBufferStream 
        ? this.createBufferStream() 
        : (options.outputFile ? this.createOutputStream(options.outputFile) : this.createBufferStream());
      
      encoder.createReadStream().pipe(outputStream);
      
      encoder.start();
      encoder.setRepeat(options.repeat || 0);
      encoder.setQuality(options.quality || 10);

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);
      
      for (const frame of gifFrames) {
        const image = await loadImage(frame.background);
        const resizedImage = await this.resizeImage(image, canvasWidth, canvasHeight);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(resizedImage, 0, 0);
        
        if (options.watermark?.enable) {
          const watermark = await loadImage(options.watermark.url);
          ctx.drawImage(watermark, 10, canvasHeight - watermark.height - 10);
        }
        
        if (options.textOverlay) {
          ctx.font = `${options.textOverlay.fontSize || 20}px Arial`;
          ctx.fillStyle = options.textOverlay.fontColor || "white";
          ctx.fillText(options.textOverlay.text, options.textOverlay.x || 10, options.textOverlay.y || 30);
        }

        encoder.setDelay(frame.duration);
        encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
      }
      
      encoder.finish();
      
      if (options.outputFormat === "file") {
        outputStream.end();
        await new Promise<void>((resolve) => outputStream.on("finish", () => resolve()));
      } else if (options.outputFormat === "base64") {
        await new Promise<void>((resolve) => {
          outputStream.on("end", () => resolve());
          outputStream.end();
        });
        if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
          return outputStream.getBuffer().toString("base64");
        }
        throw new Error("createGIF: Unable to get buffer for base64 output.");
      } else if (options.outputFormat === "attachment") {
        const gifStream = encoder.createReadStream();
        return [{ attachment: gifStream, name: "gif.js" }];
      } else if (options.outputFormat === "buffer") {
        await new Promise<void>((resolve) => {
          outputStream.on("end", () => resolve());
          outputStream.end();
        });
        if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
          return outputStream.getBuffer();
        }
        throw new Error("createGIF: Unable to get buffer for buffer output.");
      } else {
        throw new Error("Invalid output format. Supported formats are 'file', 'base64', 'attachment', and 'buffer'.");
      }
    } catch (error) {
      throw new Error(`createGIF failed: ${getErrorMessage(error)}`);
    }
  }
}

