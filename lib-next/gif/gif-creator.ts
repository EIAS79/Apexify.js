import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { GifEncoder } from "@skyra/gifenc";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import type {
  GIFOptions,
  GIFResults,
  GIFInputFrame,
  GIFEncodedFrame,
  GIFWatermarkSpec,
  GIFDisposalMethod,
} from "../types";
import { getCanvasContext } from "../core/errors";
import { resolveMediaBuffer } from "../media/source";
import { loadImageCached } from "../image/image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertGifResourceLimits } from "../runtime/limits";
import {
  validateGeneratedGIFFrame,
  validateGIFInputFrames,
  validateGIFOptions,
} from "./gif-validation";

interface GIFCanonicalFrame {
  buffer: Buffer;
  duration: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export class GIFCreator {
  private async resizeImage(image: Image, targetWidth: number, targetHeight: number) {
    const canvas = createCanvas(targetWidth, targetHeight);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas;
  }

  private async resolveFrameToBuffer(frame: GIFInputFrame): Promise<Buffer> {
    if (Buffer.isBuffer(frame.buffer)) return frame.buffer;
    if (Buffer.isBuffer(frame.background)) return frame.background;
    if (typeof frame.background === "string") return resolveMediaBuffer(frame.background, { kind: "image" });
    throw new ApexifyInputError("createGIF: frame is missing image data (`buffer` or `background`).");
  }

  private async drawFrameOntoEncoderCanvas(
    ctx: SKRSContext2D,
    frameBuffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    skipResizeWhenDimensionsMatch: boolean
  ): Promise<void> {
    const image = await loadImageCached(frameBuffer);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    if (skipResizeWhenDimensionsMatch && image.width === targetWidth && image.height === targetHeight) {
      ctx.drawImage(image, 0, 0);
      return;
    }
    const resized = await this.resizeImage(image, targetWidth, targetHeight);
    ctx.drawImage(resized, 0, 0);
  }

  private async loadRasterSource(src: string): Promise<Image> {
    return loadImageCached(src);
  }

  private parseTransparentForEncoder(color: number | string | null): number | null {
    if (color === null) return null;
    if (typeof color === "number") return color >>> 0;
    const s = String(color).trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(s)) {
      throw new ApexifyInputError(`createGIF: invalid transparentColor "${color}" (use #RRGGBB or 0xRRGGBB).`);
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

  private async collectFramesFromOnStart(options: GIFOptions, frameCountHint: number): Promise<GIFCanonicalFrame[]> {
    const generated = await options.onStart!(frameCountHint, this.painter);
    if (GIFCreator.isAsyncIterable<GIFEncodedFrame>(generated)) {
      const out: GIFCanonicalFrame[] = [];
      for await (const raw of generated) {
        validateGeneratedGIFFrame(raw, out.length);
        out.push(this.normalizeEncodedFrame(raw, options));
      }
      if (out.length === 0) throw new ApexifyInputError("createGIF: AsyncIterable from onStart yielded no frames.");
      return out;
    }
    const arr = generated as GIFEncodedFrame[];
    if (!arr?.length) throw new ApexifyInputError("createGIF: onStart callback must return at least one frame.");
    arr.forEach((frame, index) => validateGeneratedGIFFrame(frame, index));
    return arr.map((f) => this.normalizeEncodedFrame(f, options));
  }

  private async drawWatermarkOverlay(
    ctx: SKRSContext2D,
    canvasHeight: number,
    frame: GIFCanonicalFrame,
    options: GIFOptions
  ): Promise<void> {
    const fw = frame.watermark;
    if (fw?.enable === false) return;
    if (fw?.url) {
      const img = await this.loadRasterSource(fw.url);
      const x = fw.x ?? options.watermark?.x ?? 10;
      const y = fw.y ?? options.watermark?.y ?? canvasHeight - img.height - 10;
      ctx.drawImage(img, x, y);
      return;
    }
    if (options.watermark?.enable && options.watermark.url) {
      const img = await this.loadRasterSource(options.watermark.url);
      const x = options.watermark.x ?? 10;
      const y = options.watermark.y ?? canvasHeight - img.height - 10;
      ctx.drawImage(img, x, y);
    }
  }

  private applyGifEncoderFrameOptions(encoder: GifEncoder, frame: GIFCanonicalFrame, options: GIFOptions): void {
    const disp = frame.dispose ?? options.defaultDispose;
    if (disp !== undefined) encoder.setDispose(disp);
    const resolvedTransparent = frame.transparentColor !== undefined ? frame.transparentColor : options.transparentColor;
    encoder.setTransparent(resolvedTransparent !== undefined ? this.parseTransparentForEncoder(resolvedTransparent) : null);
  }

  private createOutputStream(outputFile: string): fs.WriteStream {
    return fs.createWriteStream(outputFile);
  }

  private createBufferStream(): PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] } {
    const bufferStream = new PassThrough();
    const chunks: Buffer[] = [];
    bufferStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    const extendedStream = bufferStream as PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] };
    extendedStream.getBuffer = () => Buffer.concat(chunks);
    extendedStream.chunks = chunks;
    return extendedStream;
  }

  private painter?: unknown;

  setPainter(painter: unknown): void {
    this.painter = painter;
  }

  async createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | { gif: Buffer | string; static: Buffer } | undefined> {
    try {
      validateGIFOptions(options, gifFrames?.length ?? 0);
      if (!options.onStart) validateGIFInputFrames(gifFrames ?? []);

      let finalFrames: GIFCanonicalFrame[] = [];
      if (options.onStart) {
        let frameCountHint: number;
        if (options.frameCount) frameCountHint = options.frameCount;
        else if (options.duration && options.delay) frameCountHint = Math.floor(options.duration / options.delay);
        else if (options.duration) frameCountHint = Math.floor((options.duration / 1000) * 30);
        else frameCountHint = 30;
        finalFrames = await this.collectFramesFromOnStart(options, frameCountHint);
      } else {
        if (!gifFrames || gifFrames.length === 0) {
          throw new ApexifyInputError("createGIF: either gifFrames array or onStart callback is required.");
        }
        for (const frame of gifFrames) {
          finalFrames.push({
            buffer: await this.resolveFrameToBuffer(frame),
            duration: frame.duration,
            dispose: frame.dispose,
            transparentColor: frame.transparentColor,
            watermark: frame.watermark,
          });
        }
      }

      const canvasWidth = options.width ?? 1200;
      const canvasHeight = options.height ?? 1200;
      assertGifResourceLimits(canvasWidth, canvasHeight, finalFrames.length);
      const skipResizeWhenDimensionsMatch = options.skipResizeWhenDimensionsMatch !== false;

      // Validation and resource accounting are complete before encoder, stream, or canvas allocation.
      const encoder = new GifEncoder(canvasWidth, canvasHeight);
      const useBufferStream = options.outputFormat !== "file";
      const outputStream = useBufferStream
        ? this.createBufferStream()
        : options.outputFile
          ? this.createOutputStream(options.outputFile)
          : this.createBufferStream();

      encoder.createReadStream().pipe(outputStream);
      encoder.start();
      encoder.setRepeat(options.repeat ?? 0);
      encoder.setQuality(options.quality ?? 10);

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);
      let finalFrameBuffer: Buffer | undefined;

      for (let i = 0; i < finalFrames.length; i++) {
        const frame = finalFrames[i];
        await this.drawFrameOntoEncoderCanvas(ctx, frame.buffer, canvasWidth, canvasHeight, skipResizeWhenDimensionsMatch);
        await this.drawWatermarkOverlay(ctx, canvasHeight, frame, options);
        if (options.textOverlay) {
          ctx.font = `${options.textOverlay.fontSize ?? 20}px Arial`;
          ctx.fillStyle = options.textOverlay.fontColor ?? "white";
          ctx.fillText(options.textOverlay.text, options.textOverlay.x ?? 10, options.textOverlay.y ?? 30);
        }
        this.applyGifEncoderFrameOptions(encoder, frame, options);
        encoder.setDelay(frame.duration);
        encoder.addFrame(ctx as unknown as Pick<CanvasRenderingContext2D, "getImageData">);
        if (i === finalFrames.length - 1) finalFrameBuffer = canvas.toBuffer("image/png");
      }

      encoder.finish();
      let gifResult: Buffer | string | undefined;
      if (options.outputFormat === "file") {
        outputStream.end();
        await new Promise<void>((resolve) => outputStream.on("finish", () => resolve()));
        gifResult = undefined;
      } else if (options.outputFormat === "base64") {
        await new Promise<void>((resolve) => { outputStream.on("end", () => resolve()); outputStream.end(); });
        if ("getBuffer" in outputStream && typeof outputStream.getBuffer === "function") gifResult = outputStream.getBuffer().toString("base64");
        else throw new ApexifyDecodeError("createGIF: unable to get buffer for base64 output.");
      } else if (options.outputFormat === "attachment") {
        const gifStream = encoder.createReadStream();
        return [{ attachment: gifStream, name: "image.gif" }];
      } else if (options.outputFormat === "buffer") {
        await new Promise<void>((resolve) => { outputStream.on("end", () => resolve()); outputStream.end(); });
        if ("getBuffer" in outputStream && typeof outputStream.getBuffer === "function") gifResult = outputStream.getBuffer();
        else throw new ApexifyDecodeError("createGIF: unable to get buffer for buffer output.");
      }

      let staticImage: Buffer | undefined;
      if (options.onEnd && finalFrameBuffer) staticImage = await options.onEnd(finalFrameBuffer, this.painter);
      if (staticImage && gifResult !== undefined) return { gif: gifResult, static: staticImage };
      if (staticImage && gifResult === undefined) return staticImage;
      return gifResult;
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("GIF creation failed.", { cause: error });
    }
  }
}
