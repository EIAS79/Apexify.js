import { createCanvas, loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import { PassThrough } from "stream";
import fs from "fs";
import type {
  GIFOptions,
  GIFResults,
  GIFInputFrame,
  GIFEncodedFrame,
  GIFWatermarkSpec,
  GIFDisposalMethod,
} from "../utils/canvasUtils";
import { getErrorMessage, getCanvasContext } from "../utils/core/errorUtils";
import type { ApexPainter } from "../ApexPainter";

/** Normalized frame — everything {@link createGIF} needs per encoded GIF frame (inside library only). */
interface GIFCanonicalFrame {
  buffer: Buffer;
  duration: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

/**
 * Extended class for GIF creation functionality
 */
export class GIFCreator {
  /**
   * Validates GIF options and frames.
   * @private
   */
  private validateGIFOptions(gifFrames: GIFInputFrame[] | undefined, options: GIFOptions): void {
    if (options.onStart) {
      return;
    }

    if (!gifFrames || gifFrames.length === 0) {
      throw new Error("createGIF: At least one frame is required when onStart callback is not provided.");
    }
    for (const frame of gifFrames) {
      const hasBuffer = Buffer.isBuffer(frame.buffer);
      const hasBgBuffer = Buffer.isBuffer(frame.background);
      const hasPath =
        typeof frame.background === "string" && frame.background.trim().length > 0;
      if (!hasBuffer && !hasBgBuffer && !hasPath) {
        throw new Error(
          "createGIF: Each frame must include `buffer` and/or `background` (path, URL, or buffer)."
        );
      }
      if (typeof frame.duration !== "number" || frame.duration < 0) {
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
   * Loads `buffer` first, then Buffer `background`, then path/URL `background`.
   * @private
   */
  private async resolveFrameToBuffer(frame: GIFInputFrame): Promise<Buffer> {
    if (Buffer.isBuffer(frame.buffer)) {
      return frame.buffer;
    }
    if (Buffer.isBuffer(frame.background)) {
      return frame.background;
    }
    if (typeof frame.background === "string") {
      if (frame.background.startsWith("http")) {
        const axios = require("axios");
        const response = await axios.get(frame.background, { responseType: "arraybuffer" });
        return Buffer.from(response.data);
      }
      return fs.readFileSync(frame.background);
    }
    throw new Error("createGIF: Frame is missing image data (`buffer` or `background`).");
  }

  /**
   * Draws a decoded frame onto the encoder canvas, resizing only when needed.
   * @private
   */
  private async drawFrameOntoEncoderCanvas(
    ctx: SKRSContext2D,
    frameBuffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    skipResizeWhenDimensionsMatch: boolean
  ): Promise<void> {
    const image = await loadImage(frameBuffer);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    if (
      skipResizeWhenDimensionsMatch &&
      image.width === targetWidth &&
      image.height === targetHeight
    ) {
      ctx.drawImage(image, 0, 0);
      return;
    }
    const resized = await this.resizeImage(image, targetWidth, targetHeight);
    ctx.drawImage(resized, 0, 0);
  }

  /** `@napi-rs/canvas` loadImage — HTTP fetched when needed. */
  private async loadRasterUrl(src: string): Promise<Image> {
    if (src.startsWith("http")) {
      const axios = require("axios");
      const response = await axios.get(src, { responseType: "arraybuffer" });
      return loadImage(Buffer.from(response.data));
    }
    return loadImage(src);
  }

  /**
   * Hex / `#rgb` → `gifencoder.setTransparent` integer (`null` = none).
   * @private
   */
  private parseTransparentForEncoder(color: number | string | null): number | null {
    if (color === null) return null;
    if (typeof color === "number") return color >>> 0;
    const s = String(color).trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) {
      throw new Error(`createGIF: Invalid transparentColor "${color}" (use #RRGGBB or 0xRRGGBB).`);
    }
    return parseInt(s.slice(0, 6), 16);
  }

  private normalizeEncodedFrame(f: GIFEncodedFrame, options: GIFOptions): GIFCanonicalFrame {
    return {
      buffer: f.buffer,
      duration: f.duration ?? options.delay ?? 100,
      dispose: f.dispose,
      transparentColor: f.transparentColor,
      watermark: f.watermark,
    };
  }

  private static isAsyncIterable<T>(x: unknown): x is AsyncIterable<T> {
    return x != null && typeof (x as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
  }

  /**
   * Collects frames from `onStart` — supports arrays or async iteration (streaming).
   * @private
   */
  private async collectFramesFromOnStart(
    options: GIFOptions,
    frameCountHint: number
  ): Promise<GIFCanonicalFrame[]> {
    const generated = await options.onStart!(frameCountHint, this.painter);

    if (GIFCreator.isAsyncIterable<GIFEncodedFrame>(generated)) {
      const out: GIFCanonicalFrame[] = [];
      for await (const raw of generated) {
        out.push(this.normalizeEncodedFrame(raw, options));
      }
      if (out.length === 0) {
        throw new Error("createGIF: AsyncIterable from onStart yielded no frames.");
      }
      return out;
    }

    const arr = generated as GIFEncodedFrame[];
    if (!arr?.length) {
      throw new Error("createGIF: onStart callback must return at least one frame.");
    }
    return arr.map((f) => this.normalizeEncodedFrame(f, options));
  }

  /**
   * Applies {@link GIFWatermarkSpec} / global watermark after the raster frame is drawn.
   * @private
   */
  private async drawWatermarkOverlay(
    ctx: SKRSContext2D,
    canvasHeight: number,
    frame: GIFCanonicalFrame,
    options: GIFOptions
  ): Promise<void> {
    const fw = frame.watermark;
    if (fw?.enable === false) {
      return;
    }
    if (fw?.url) {
      const img = await this.loadRasterUrl(fw.url);
      const x = fw.x ?? options.watermark?.x ?? 10;
      const y = fw.y ?? options.watermark?.y ?? canvasHeight - img.height - 10;
      ctx.drawImage(img, x, y);
      return;
    }
    if (options.watermark?.enable && options.watermark.url) {
      const img = await this.loadRasterUrl(options.watermark.url);
      const x = options.watermark.x ?? 10;
      const y = options.watermark.y ?? canvasHeight - img.height - 10;
      ctx.drawImage(img, x, y);
    }
  }

  /**
   * Sets gifencoder transparency & disposal for the **next** `addFrame` call.
   * @private
   */
  private applyGifEncoderFrameOptions(
    encoder: InstanceType<typeof GIFEncoder>,
    frame: GIFCanonicalFrame,
    options: GIFOptions
  ): void {
    /** gifencoder has these methods — typings may be incomplete */
    const enc = encoder as InstanceType<typeof GIFEncoder> & {
      setDispose(code: number): void;
      setTransparent(color: number | null): void;
    };

    const disp = frame.dispose ?? options.defaultDispose;
    if (disp !== undefined) {
      enc.setDispose(disp);
    }

    const resolvedTransparent =
      frame.transparentColor !== undefined ? frame.transparentColor : options.transparentColor;
    enc.setTransparent(
      resolvedTransparent !== undefined
        ? this.parseTransparentForEncoder(resolvedTransparent)
        : null
    );
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

    bufferStream.on("data", (chunk: Buffer) => {
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
   * Creates a GIF from frames — supports pre-made buffers/paths, programmatic `onStart`
   * (`GIFEncodedFrame[]` **or** streaming `AsyncIterable`), per-frame watermark / disposal /
   * transparency, global defaults, and optional `skipResizeWhenDimensionsMatch`.
   */
  async createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | { gif: Buffer | string; static: Buffer } | undefined> {
    try {
      let finalFrames: GIFCanonicalFrame[] = [];

      if (options.onStart) {
        let frameCountHint: number;
        if (options.frameCount) {
          frameCountHint = options.frameCount;
        } else if (options.duration && options.delay) {
          frameCountHint = Math.floor(options.duration / options.delay);
        } else if (options.duration) {
          frameCountHint = Math.floor((options.duration / 1000) * 30);
        } else {
          frameCountHint = 30;
        }

        finalFrames = await this.collectFramesFromOnStart(options, frameCountHint);
      } else {
        if (!gifFrames || gifFrames.length === 0) {
          throw new Error("createGIF: Either gifFrames array or onStart callback is required.");
        }
        this.validateGIFOptions(gifFrames, options);

        finalFrames = await Promise.all(
          gifFrames.map(async (frame) => ({
            buffer: await this.resolveFrameToBuffer(frame),
            duration: frame.duration,
            dispose: frame.dispose,
            transparentColor: frame.transparentColor,
            watermark: frame.watermark,
          }))
        );
      }

      const canvasWidth = options.width || 1200;
      const canvasHeight = options.height || 1200;

      const skipResizeWhenDimensionsMatch = options.skipResizeWhenDimensionsMatch !== false;

      const encoder = new GIFEncoder(canvasWidth, canvasHeight);
      const useBufferStream = options.outputFormat !== "file";
      const outputStream = useBufferStream
        ? this.createBufferStream()
        : options.outputFile
          ? this.createOutputStream(options.outputFile)
          : this.createBufferStream();

      encoder.createReadStream().pipe(outputStream);

      encoder.start();
      encoder.setRepeat(options.repeat || 0);
      encoder.setQuality(options.quality || 10);

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);

      let finalFrameBuffer: Buffer | undefined;

      for (let i = 0; i < finalFrames.length; i++) {
        const frame = finalFrames[i];

        await this.drawFrameOntoEncoderCanvas(
          ctx,
          frame.buffer,
          canvasWidth,
          canvasHeight,
          skipResizeWhenDimensionsMatch
        );

        await this.drawWatermarkOverlay(ctx, canvasHeight, frame, options);

        if (options.textOverlay) {
          ctx.font = `${options.textOverlay.fontSize || 20}px Arial`;
          ctx.fillStyle = options.textOverlay.fontColor || "white";
          ctx.fillText(options.textOverlay.text, options.textOverlay.x || 10, options.textOverlay.y || 30);
        }

        this.applyGifEncoderFrameOptions(encoder, frame, options);

        encoder.setDelay(frame.duration);
        encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);

        if (i === finalFrames.length - 1) {
          finalFrameBuffer = canvas.toBuffer("image/png");
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
        if ("getBuffer" in outputStream && typeof outputStream.getBuffer === "function") {
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
        if ("getBuffer" in outputStream && typeof outputStream.getBuffer === "function") {
          gifResult = outputStream.getBuffer();
        } else {
          throw new Error("createGIF: Unable to get buffer for buffer output.");
        }
      } else {
        throw new Error("Invalid output format. Supported formats are 'file', 'base64', 'attachment', and 'buffer'.");
      }

      let staticImage: Buffer | undefined;
      if (options.onEnd && finalFrameBuffer) {
        staticImage = await options.onEnd(finalFrameBuffer, this.painter);
      }

      if (staticImage && gifResult !== undefined) {
        return {
          gif: gifResult,
          static: staticImage,
        };
      }

      if (staticImage && gifResult === undefined) {
        return staticImage;
      }

      return gifResult;
    } catch (error) {
      throw new Error(`createGIF failed: ${getErrorMessage(error)}`);
    }
  }
}
