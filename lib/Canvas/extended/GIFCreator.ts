import { createCanvas, loadImage, SKRSContext2D, Image } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import { PassThrough } from "stream";
import fs from "fs";
import type { GIFOptions, GIFResults } from "../utils/utils";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import type { ApexPainter } from "../ApexPainter";

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
  private validateGIFOptions(gifFrames: { background: string; duration: number }[] | undefined, options: GIFOptions): void {
    // Skip validation if onStart callback is provided (frames will be generated)
    if (options.onStart) {
      return;
    }

    if (!gifFrames || gifFrames.length === 0) {
      throw new Error("createGIF: At least one frame is required when onStart callback is not provided.");
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
   * ApexPainter instance reference (will be set by ApexPainter)
   */
  private painter?: ApexPainter;

  /**
   * Sets the ApexPainter instance (for use in callbacks)
   */
  setPainter(painter: ApexPainter): void {
    this.painter = painter;
  }

  /**
   * Creates a GIF from frames
   *
   * @param gifFrames - Array of frames with background and duration (optional if onStart is provided)
   * @param options - GIF creation options
   * @returns Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | undefined>
   */
  async createGIF(
    gifFrames: { background: string; duration: number }[] | undefined,
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | { gif: Buffer | string; static: Buffer } | undefined> {
    try {
      let finalFrames: Array<{ buffer: Buffer; duration: number }> = [];
      let generatedFrames = false;

      if (options.onStart && this.painter) {

        let frameCount: number;
        if (options.frameCount) {
          frameCount = options.frameCount;
        } else if (options.duration && options.delay) {

          frameCount = Math.floor(options.duration / options.delay);
        } else if (options.duration) {
          // Estimate from duration (default 30 fps)
          frameCount = Math.floor((options.duration / 1000) * 30);
        } else {

          frameCount = 30;
        }

        const generated = await options.onStart(frameCount, this.painter);

        if (!generated || generated.length === 0) {
          throw new Error("createGIF: onStart callback must return at least one frame.");
        }

        finalFrames = generated.map(f => ({
          buffer: f.buffer,
          duration: f.duration || options.delay || 100
        }));
        generatedFrames = true;
      } else {
        // Use provided frames
        if (!gifFrames || gifFrames.length === 0) {
          throw new Error("createGIF: Either gifFrames array or onStart callback is required.");
        }
        this.validateGIFOptions(gifFrames, options);

        finalFrames = await Promise.all(
          gifFrames.map(async (frame) => {
            let buffer: Buffer;
            if (Buffer.isBuffer(frame.background)) {
              buffer = frame.background;
            } else if (typeof frame.background === 'string') {
              if (frame.background.startsWith('http')) {
                const axios = require('axios');
                const response = await axios.get(frame.background, { responseType: 'arraybuffer' });
                buffer = Buffer.from(response.data);
              } else {
                buffer = fs.readFileSync(frame.background);
              }
            } else {
              throw new Error(`createGIF: Invalid frame background type: ${typeof frame.background}`);
            }
            return {
              buffer,
              duration: frame.duration
            };
          })
        );
      }

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

      let finalFrameBuffer: Buffer | undefined;

      for (let i = 0; i < finalFrames.length; i++) {
        const frame = finalFrames[i];
        const image = await loadImage(frame.buffer);
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

        // Store final frame buffer
        if (i === finalFrames.length - 1) {
          finalFrameBuffer = canvas.toBuffer('image/png');
        }
      }

      encoder.finish();

      let gifResult: Buffer | string | undefined;


      if (options.outputFormat === "file") {
        outputStream.end();
        await new Promise<void>((resolve) => outputStream.on("finish", () => resolve()));
gifResult = undefined;
      } else if (options.outputFormat === "base64") {
        await new Promise<void>((resolve) => {
          outputStream.on("end", () => resolve());
          outputStream.end();
        });
        if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
          gifResult = outputStream.getBuffer().toString("base64");
        } else {
          throw new Error("createGIF: Unable to get buffer for base64 output.");
        }
      } else if (options.outputFormat === "attachment") {
        const gifStream = encoder.createReadStream();
        return [{ attachment: gifStream, name: "gif.js" }];
      } else if (options.outputFormat === "buffer") {
        await new Promise<void>((resolve) => {
          outputStream.on("end", () => resolve());
          outputStream.end();
        });
        if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
          gifResult = outputStream.getBuffer();
        } else {
          throw new Error("createGIF: Unable to get buffer for buffer output.");
        }
      } else {
        throw new Error("Invalid output format. Supported formats are 'file', 'base64', 'attachment', and 'buffer'.");
      }

      // Call onEnd callback if provided
      let staticImage: Buffer | undefined;
      if (options.onEnd && finalFrameBuffer && this.painter) {
        staticImage = await options.onEnd(finalFrameBuffer, this.painter);
      }

      if (staticImage && gifResult !== undefined) {
        return {
          gif: gifResult,
          static: staticImage
        };
      }

      if (staticImage && gifResult === undefined) {
        return staticImage;
      }

      // Otherwise return just GIF
      return gifResult;
    } catch (error) {
      throw new Error(`createGIF failed: ${getErrorMessage(error)}`);
    }
  }
}

