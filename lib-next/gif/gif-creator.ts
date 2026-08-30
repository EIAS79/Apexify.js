import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { GifEncoder } from "@skyra/gifenc";
import { Readable } from "node:stream";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import type {
  GIFOptions,
  GIFResults,
  GIFInputFrame,
  GIFEncodedFrame,
  GIFWatermarkSpec,
  GIFDisposalMethod,
} from "../types";
import { getCanvasContext } from "../core/errors";
import { currentApexifyRuntime } from "../runtime/context";
import { ApexifyError, ApexifyInputError, ApexifyResourceLimitError } from "../runtime/errors";
import { assertCanvasWithinLimits } from "../runtime/limits";
import { resolveImageInput, resolveMediaBuffer } from "../media/source";

interface GIFCanonicalFrame {
  buffer: Buffer;
  duration: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export class GIFCreator {
  private painter?: unknown;

  setPainter(painter: unknown): void {
    this.painter = painter;
  }

  private validateOutputOptions(options: GIFOptions): void {
    if (options.outputFormat === "file" && !options.outputFile) {
      throw new ApexifyInputError("createGIF: outputFile is required when outputFormat is 'file'.");
    }
    if (options.repeat !== undefined && (!Number.isInteger(options.repeat) || options.repeat < 0)) {
      throw new ApexifyInputError("createGIF: repeat must be a non-negative integer.");
    }
    if (options.quality !== undefined && (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 20)) {
      throw new ApexifyInputError("createGIF: quality must be between 1 and 20.");
    }
    if (options.delay !== undefined && (!Number.isFinite(options.delay) || options.delay < 0)) {
      throw new ApexifyInputError("createGIF: delay must be a finite non-negative number.");
    }
  }

  private validateDimensions(width: number, height: number): void {
    const limits = currentApexifyRuntime().config.limits;
    if (width > limits.maxGifDimension || height > limits.maxGifDimension) {
      throw new ApexifyResourceLimitError(
        `createGIF: dimensions ${width}x${height} exceed maxGifDimension ${limits.maxGifDimension}.`,
        { limit: "maxGifDimension", maximum: limits.maxGifDimension, actual: Math.max(width, height) }
      );
    }
    assertCanvasWithinLimits(width, height, limits, "createGIF");
  }

  private validateFrameCount(count: number, width: number, height: number): void {
    const limits = currentApexifyRuntime().config.limits;
    if (count > limits.maxGifFrames) {
      throw new ApexifyResourceLimitError(
        `createGIF: frame count ${count} exceeds maxGifFrames ${limits.maxGifFrames}.`,
        { limit: "maxGifFrames", maximum: limits.maxGifFrames, actual: count }
      );
    }
    const pixelWork = count * width * height;
    if (!Number.isSafeInteger(pixelWork) || pixelWork > limits.maxGifPixelWork) {
      throw new ApexifyResourceLimitError(
        `createGIF: accumulated frame pixel work ${pixelWork} exceeds maxGifPixelWork ${limits.maxGifPixelWork}.`,
        { limit: "maxGifPixelWork", maximum: limits.maxGifPixelWork, actual: pixelWork }
      );
    }
  }

  private validateInputFrames(gifFrames: GIFInputFrame[] | undefined, options: GIFOptions): void {
    if (options.onStart) return;
    if (!gifFrames?.length) {
      throw new ApexifyInputError("createGIF: at least one frame is required when onStart is not provided.");
    }
    for (const frame of gifFrames) {
      const hasBuffer = Buffer.isBuffer(frame.buffer);
      const hasBackground = Buffer.isBuffer(frame.background) ||
        (typeof frame.background === "string" && frame.background.trim().length > 0);
      if (!hasBuffer && !hasBackground) {
        throw new ApexifyInputError("createGIF: each frame requires buffer and/or background.");
      }
      if (!Number.isFinite(frame.duration) || frame.duration < 0) {
        throw new ApexifyInputError("createGIF: each frame duration must be a finite non-negative number.");
      }
    }
  }

  private async resolveFrameToBuffer(frame: GIFInputFrame): Promise<Buffer> {
    if (Buffer.isBuffer(frame.buffer)) return frame.buffer;
    if (Buffer.isBuffer(frame.background)) return frame.background;
    if (typeof frame.background === "string") {
      return resolveMediaBuffer(frame.background, "image");
    }
    throw new ApexifyInputError("createGIF: frame is missing image data.");
  }

  private async loadRasterSource(source: string): Promise<Image> {
    return loadImage(await resolveImageInput(source));
  }

  private async drawFrameOntoEncoderCanvas(
    ctx: SKRSContext2D,
    frameBuffer: Buffer,
    targetWidth: number,
    targetHeight: number,
    skipResizeWhenDimensionsMatch: boolean
  ): Promise<void> {
    const imageInput = await resolveImageInput(frameBuffer);
    const image = await loadImage(imageInput);
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    if (skipResizeWhenDimensionsMatch && image.width === targetWidth && image.height === targetHeight) {
      ctx.drawImage(image, 0, 0);
      return;
    }
    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
  }

  private parseTransparentForEncoder(color: number | string | null): number | null {
    if (color === null) return null;
    if (typeof color === "number") return color >>> 0;
    const normalized = String(color).trim().replace(/^#/, "");
    if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(normalized)) {
      throw new ApexifyInputError(`createGIF: invalid transparentColor "${color}".`);
    }
    return Number.parseInt(normalized.slice(0, 6), 16);
  }

  private normalizeEncodedFrame(frame: GIFEncodedFrame, options: GIFOptions): GIFCanonicalFrame {
    if (!Buffer.isBuffer(frame.buffer) || frame.buffer.length === 0) {
      throw new ApexifyInputError("createGIF: generated frame buffer must be non-empty.");
    }
    const duration = frame.duration ?? options.delay ?? 100;
    if (!Number.isFinite(duration) || duration < 0) {
      throw new ApexifyInputError("createGIF: generated frame duration must be finite and non-negative.");
    }
    return {
      buffer: frame.buffer,
      duration,
      dispose: frame.dispose,
      transparentColor: frame.transparentColor,
      watermark: frame.watermark,
    };
  }

  private static isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
    return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
  }

  private async collectFramesFromOnStart(options: GIFOptions, frameCountHint: number): Promise<GIFCanonicalFrame[]> {
    const generated = await options.onStart!(frameCountHint, this.painter);
    const limit = currentApexifyRuntime().config.limits.maxGifFrames;
    if (GIFCreator.isAsyncIterable<GIFEncodedFrame>(generated)) {
      const frames: GIFCanonicalFrame[] = [];
      for await (const raw of generated) {
        frames.push(this.normalizeEncodedFrame(raw, options));
        if (frames.length > limit) {
          throw new ApexifyResourceLimitError("createGIF: generated frame stream exceeded maxGifFrames.", {
            limit: "maxGifFrames",
            maximum: limit,
            actual: frames.length,
          });
        }
      }
      if (frames.length === 0) throw new ApexifyInputError("createGIF: AsyncIterable yielded no frames.");
      return frames;
    }
    const array = generated as GIFEncodedFrame[];
    if (!array?.length) throw new ApexifyInputError("createGIF: onStart must return at least one frame.");
    if (array.length > limit) {
      throw new ApexifyResourceLimitError("createGIF: generated frame array exceeded maxGifFrames.", {
        limit: "maxGifFrames",
        maximum: limit,
        actual: array.length,
      });
    }
    return array.map((frame) => this.normalizeEncodedFrame(frame, options));
  }

  private async drawWatermarkOverlay(
    ctx: SKRSContext2D,
    canvasHeight: number,
    frame: GIFCanonicalFrame,
    options: GIFOptions
  ): Promise<void> {
    const frameWatermark = frame.watermark;
    if (frameWatermark?.enable === false) return;
    const source = frameWatermark?.url ?? (options.watermark?.enable ? options.watermark.url : undefined);
    if (!source) return;
    const image = await this.loadRasterSource(source);
    const x = frameWatermark?.x ?? options.watermark?.x ?? 10;
    const y = frameWatermark?.y ?? options.watermark?.y ?? canvasHeight - image.height - 10;
    ctx.drawImage(image, x, y);
  }

  private applyGifEncoderFrameOptions(
    encoder: GifEncoder,
    frame: GIFCanonicalFrame,
    options: GIFOptions
  ): void {
    const dispose = frame.dispose ?? options.defaultDispose;
    if (dispose !== undefined) encoder.setDispose(dispose);
    const transparent = frame.transparentColor !== undefined
      ? frame.transparentColor
      : options.transparentColor;
    encoder.setTransparent(transparent !== undefined ? this.parseTransparentForEncoder(transparent) : null);
  }

  async createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream; name: string }> | { gif: Buffer | string; static: Buffer } | undefined> {
    try {
      this.validateOutputOptions(options);
      this.validateInputFrames(gifFrames, options);

      const width = options.width ?? 1200;
      const height = options.height ?? 1200;
      this.validateDimensions(width, height);

      let finalFrames: GIFCanonicalFrame[];
      if (options.onStart) {
        const frameCountHint = options.frameCount ??
          (options.duration && options.delay
            ? Math.max(1, Math.floor(options.duration / options.delay))
            : options.duration
              ? Math.max(1, Math.floor((options.duration / 1000) * 30))
              : 30);
        finalFrames = await this.collectFramesFromOnStart(options, frameCountHint);
      } else {
        finalFrames = [];
        for (const frame of gifFrames ?? []) {
          finalFrames.push({
            buffer: await this.resolveFrameToBuffer(frame),
            duration: frame.duration,
            dispose: frame.dispose,
            transparentColor: frame.transparentColor,
            watermark: frame.watermark,
          });
        }
      }
      this.validateFrameCount(finalFrames.length, width, height);

      const encoder = new GifEncoder(width, height);
      const encoderStream = encoder.createReadStream();
      const chunks: Buffer[] = [];
      let outputFileStream: ReturnType<typeof createWriteStream> | undefined;
      if (options.outputFormat === "file") {
        outputFileStream = createWriteStream(options.outputFile!);
        encoderStream.pipe(outputFileStream);
      } else {
        encoderStream.on("data", (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      }

      encoder.start();
      encoder.setRepeat(options.repeat ?? 0);
      encoder.setQuality(options.quality ?? 10);

      const canvas = createCanvas(width, height);
      const ctx = getCanvasContext(canvas);
      const skipResizeWhenDimensionsMatch = options.skipResizeWhenDimensionsMatch !== false;
      let finalFrameBuffer: Buffer | undefined;

      for (let i = 0; i < finalFrames.length; i += 1) {
        const frame = finalFrames[i];
        await this.drawFrameOntoEncoderCanvas(ctx, frame.buffer, width, height, skipResizeWhenDimensionsMatch);
        await this.drawWatermarkOverlay(ctx, height, frame, options);
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
      if (outputFileStream) {
        await once(outputFileStream, "finish");
      } else {
        await once(encoderStream, "end");
        const gifBuffer = Buffer.concat(chunks);
        if (options.outputFormat === "base64") gifResult = gifBuffer.toString("base64");
        else if (options.outputFormat === "buffer" || options.outputFormat === undefined) gifResult = gifBuffer;
        else if (options.outputFormat === "attachment") {
          return [{ attachment: Readable.from(gifBuffer), name: "apexify.gif" }];
        } else {
          throw new ApexifyInputError("createGIF: invalid output format.");
        }
      }

      const staticImage = options.onEnd && finalFrameBuffer
        ? await options.onEnd(finalFrameBuffer, this.painter)
        : undefined;
      if (staticImage && gifResult !== undefined) return { gif: gifResult, static: staticImage };
      if (staticImage && gifResult === undefined) return staticImage;
      return gifResult;
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyError("createGIF failed.", { cause: error, details: { operation: "createGIF" } });
    }
  }
}
