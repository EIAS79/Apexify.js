import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { GifEncoder } from "@skyra/gifenc";
import fs from "node:fs";
import { buffer as consumeBuffer } from "node:stream/consumers";
import { finished } from "node:stream/promises";
import type {
  GIFAttachment,
  GIFDisposalMethod,
  GIFEncodedFrame,
  GIFFrameSource,
  GIFInputFrame,
  GIFOptions,
  GIFWatermarkSpec,
} from "../types";
import { getCanvasContext } from "../core/errors";
import { decodeImageDataUrl, resolveMediaInput } from "../media/source";
import { decodeImageSource } from "../image/image-source-validation";
import { EnhancedTextRenderer } from "../text/enhanced-text-renderer";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import {
  ApexifyDecodeError,
  ApexifyError,
  ApexifyInputError,
  ApexifyProcessError,
} from "../runtime/errors";
import { assertGifResourceLimits } from "../runtime/limits";
import {
  canonicalGIFTextOverlay,
  validateGeneratedGIFFrame,
  validateGIFInputFrames,
  validateGIFOptions,
} from "./gif-validation";

interface GIFCanonicalFrame {
  source: string | Buffer;
  duration: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

type PreparedFrameSource =
  | { kind: "regular"; frames: GIFInputFrame[] }
  | { kind: "generated-array"; frames: GIFEncodedFrame[]; limit: number }
  | { kind: "generated-stream"; frames: AsyncIterable<GIFEncodedFrame>; limit: number };

type GIFPrimaryResult = Buffer | string | GIFAttachment[] | undefined;

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
}

function watermarkCacheKey(source: GIFFrameSource): string | undefined {
  if (typeof source === "string") return source;
  if (source instanceof URL) return source.toString();
  return undefined;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new ApexifyProcessError("createGIF: operation aborted.", { cause: signal.reason });
  }
}

export class GIFCreator {
  private painter?: unknown;

  setPainter(painter: unknown): void {
    this.painter = painter;
  }

  private frameCountHint(options: GIFOptions): number {
    const maximum = getDefaultApexifyRuntimeConfig().limits.maxGifFrames;
    if (options.frameCount !== undefined) return Math.min(options.frameCount, maximum);
    const delay = options.delay ?? 100;
    if (options.duration !== undefined && delay > 0) {
      return Math.min(Math.max(1, Math.ceil(options.duration / delay)), maximum);
    }
    return Math.min(30, maximum);
  }

  private generatedFrameLimit(options: GIFOptions): number {
    const maximum = getDefaultApexifyRuntimeConfig().limits.maxGifFrames;
    if (options.frameCount !== undefined) return Math.min(options.frameCount, maximum);
    const delay = options.delay ?? 100;
    if (options.duration !== undefined && delay > 0) {
      return Math.min(Math.max(1, Math.ceil(options.duration / delay)), maximum);
    }
    return maximum;
  }

  private async prepareFrameSource(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions,
    signal: AbortSignal,
    width: number,
    height: number
  ): Promise<PreparedFrameSource> {
    throwIfAborted(signal);
    if (options.onStart) {
      if (gifFrames && gifFrames.length > 0) {
        throw new ApexifyInputError("createGIF: provide either gifFrames or onStart, not both.");
      }
      let generated: GIFEncodedFrame[] | AsyncIterable<GIFEncodedFrame>;
      try {
        generated = await options.onStart(this.frameCountHint(options), this.painter);
      } catch (error) {
        if (error instanceof ApexifyError) throw error;
        throw new ApexifyDecodeError("createGIF: onStart callback failed.", { cause: error });
      }
      throwIfAborted(signal);
      const limit = this.generatedFrameLimit(options);
      if (isAsyncIterable<GIFEncodedFrame>(generated)) {
        return { kind: "generated-stream", frames: generated, limit };
      }
      if (!Array.isArray(generated) || generated.length === 0) {
        throw new ApexifyInputError("createGIF: onStart callback must return at least one frame.");
      }
      if (generated.length > limit) {
        throw new ApexifyInputError(`createGIF: generated frame array exceeds the configured bound of ${limit}.`);
      }
      generated.forEach((frame, index) => validateGeneratedGIFFrame(frame, index));
      assertGifResourceLimits(width, height, generated.length);
      return { kind: "generated-array", frames: generated, limit };
    }

    if (!gifFrames || gifFrames.length === 0) {
      throw new ApexifyInputError("createGIF: either gifFrames array or onStart callback is required.");
    }
    validateGIFInputFrames(gifFrames);
    assertGifResourceLimits(width, height, gifFrames.length);
    return { kind: "regular", frames: gifFrames };
  }

  private async resolveImageSource(
    source: GIFFrameSource,
    signal: AbortSignal,
    cacheRemoteBytes: boolean
  ): Promise<string | Buffer> {
    throwIfAborted(signal);
    if (Buffer.isBuffer(source)) return source;
    if (source instanceof Uint8Array) return Buffer.from(source);
    if (typeof source === "string") {
      const data = decodeImageDataUrl(source);
      if (data) return data;
    }
    return resolveMediaInput(source, { kind: "image", cache: cacheRemoteBytes, signal });
  }

  private async normalizeInputFrame(
    frame: GIFInputFrame,
    options: GIFOptions,
    signal: AbortSignal
  ): Promise<GIFCanonicalFrame> {
    const source = frame.buffer ?? frame.background;
    if (source === undefined) throw new ApexifyInputError("createGIF: frame is missing image data.");
    return {
      source: await this.resolveImageSource(source, signal, false),
      duration: frame.duration ?? options.delay ?? 100,
      dispose: frame.dispose,
      transparentColor: frame.transparentColor,
      watermark: frame.watermark,
    };
  }

  private async normalizeGeneratedFrame(
    frame: GIFEncodedFrame,
    options: GIFOptions,
    signal: AbortSignal
  ): Promise<GIFCanonicalFrame> {
    return {
      source: await this.resolveImageSource(frame.buffer, signal, false),
      duration: frame.duration ?? options.delay ?? 100,
      dispose: frame.dispose,
      transparentColor: frame.transparentColor,
      watermark: frame.watermark,
    };
  }

  /** Bounded prefetch for known arrays: at most the central batch/network limit is in flight. */
  private async *iterateRegularFrames(
    frames: GIFInputFrame[],
    options: GIFOptions,
    signal: AbortSignal
  ): AsyncGenerator<GIFCanonicalFrame> {
    const limits = getDefaultApexifyRuntimeConfig().limits;
    const concurrency = Math.max(1, Math.min(limits.maxBatchConcurrency, limits.maxConcurrentRemoteFetches, frames.length));
    const pending = new Map<number, Promise<GIFCanonicalFrame>>();
    let nextToLaunch = 0;

    const fill = () => {
      while (nextToLaunch < frames.length && pending.size < concurrency) {
        const index = nextToLaunch++;
        const promise = this.normalizeInputFrame(frames[index]!, options, signal);
        // Mark every rejection observed even if an earlier ordered frame fails first.
        void promise.catch(() => undefined);
        pending.set(index, promise);
      }
    };

    fill();
    for (let index = 0; index < frames.length; index++) {
      throwIfAborted(signal);
      const promise = pending.get(index);
      if (!promise) throw new ApexifyDecodeError("createGIF: internal bounded frame queue lost ordering state.");
      const frame = await promise;
      pending.delete(index);
      fill();
      yield frame;
    }
  }

  private async *iteratePreparedFrames(
    source: PreparedFrameSource,
    options: GIFOptions,
    signal: AbortSignal
  ): AsyncGenerator<GIFCanonicalFrame> {
    if (source.kind === "regular") {
      yield* this.iterateRegularFrames(source.frames, options, signal);
      return;
    }

    if (source.kind === "generated-array") {
      for (let index = 0; index < source.frames.length; index++) {
        throwIfAborted(signal);
        const raw = source.frames[index]!;
        validateGeneratedGIFFrame(raw, index);
        yield await this.normalizeGeneratedFrame(raw, options, signal);
      }
      return;
    }

    let index = 0;
    try {
      for await (const raw of source.frames) {
        throwIfAborted(signal);
        if (index >= source.limit) {
          throw new ApexifyInputError(`createGIF: generated AsyncIterable exceeded the configured bound of ${source.limit} frames.`);
        }
        validateGeneratedGIFFrame(raw, index);
        // No prefetch: normalization and encoding complete before the producer is asked for the next item.
        yield await this.normalizeGeneratedFrame(raw, options, signal);
        index += 1;
      }
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("createGIF: generated AsyncIterable failed.", { cause: error });
    }
  }

  private async drawFrameOntoEncoderCanvas(
    ctx: SKRSContext2D,
    frame: GIFCanonicalFrame,
    targetWidth: number,
    targetHeight: number,
    skipResizeWhenDimensionsMatch: boolean
  ): Promise<void> {
    const image = await decodeImageSource(frame.source, { label: "createGIF frame source" });
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    if (skipResizeWhenDimensionsMatch && image.width === targetWidth && image.height === targetHeight) {
      ctx.drawImage(image, 0, 0);
    } else {
      // Public GIF frame sizing is deterministic stretch-to-output. No hidden backend fit behavior.
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
    }
  }

  private async watermarkImage(
    spec: GIFWatermarkSpec,
    signal: AbortSignal,
    cache: Map<string, Image>,
    cacheRemoteBytes: boolean
  ): Promise<Image> {
    const key = watermarkCacheKey(spec.url);
    if (key) {
      const hit = cache.get(key);
      if (hit) return hit;
    }
    const source = await this.resolveImageSource(spec.url, signal, cacheRemoteBytes);
    const image = await decodeImageSource(source, { label: "createGIF watermark" });
    if (key) {
      if (cache.size >= 4) {
        const oldest = cache.keys().next().value as string | undefined;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, image);
    }
    return image;
  }

  private drawResolvedWatermark(
    ctx: SKRSContext2D,
    canvasWidth: number,
    canvasHeight: number,
    image: Image,
    spec: GIFWatermarkSpec
  ): void {
    const margin = spec.margin ?? 10;
    let width = image.width;
    let height = image.height;
    if (spec.scale !== undefined) {
      width *= spec.scale;
      height *= spec.scale;
    } else if (spec.width !== undefined && spec.height !== undefined) {
      width = spec.width;
      height = spec.height;
    } else if (spec.width !== undefined) {
      width = spec.width;
      height = image.height * (spec.width / image.width);
    } else if (spec.height !== undefined) {
      height = spec.height;
      width = image.width * (spec.height / image.height);
    }

    const position = spec.position ?? "bottom-left";
    let px = margin;
    let py = canvasHeight - height - margin;
    if (position === "top-left") { px = margin; py = margin; }
    else if (position === "top-right") { px = canvasWidth - width - margin; py = margin; }
    else if (position === "bottom-right") { px = canvasWidth - width - margin; py = canvasHeight - height - margin; }
    else if (position === "center") { px = (canvasWidth - width) / 2; py = (canvasHeight - height) / 2; }

    const x = spec.x ?? px;
    const y = spec.y ?? py;
    ctx.save();
    ctx.globalAlpha = spec.opacity ?? 1;
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  }

  private async drawWatermarkOverlay(
    ctx: SKRSContext2D,
    canvasWidth: number,
    canvasHeight: number,
    frame: GIFCanonicalFrame,
    options: GIFOptions,
    signal: AbortSignal,
    cache: Map<string, Image>,
    globalImage?: Image
  ): Promise<void> {
    if (frame.watermark?.enable === false) return;
    const spec = frame.watermark ?? options.watermark;
    if (!spec || spec.enable === false) return;
    const image = frame.watermark
      ? await this.watermarkImage(spec, signal, cache, false)
      : globalImage ?? await this.watermarkImage(spec, signal, cache, true);
    this.drawResolvedWatermark(ctx, canvasWidth, canvasHeight, image, spec);
  }

  private parseTransparentForEncoder(color: number | string | null): number | null {
    if (color === null) return null;
    if (typeof color === "number") return color;
    let value = color.trim();
    if (value.startsWith("#")) value = value.slice(1);
    else if (/^0x/i.test(value)) value = value.slice(2);
    return Number.parseInt(value.slice(0, 6), 16);
  }

  private applyEncoderFrameOptions(encoder: GifEncoder, frame: GIFCanonicalFrame, options: GIFOptions): void {
    const transparent = frame.transparentColor !== undefined ? frame.transparentColor : options.transparentColor;
    const parsed = transparent === undefined ? null : this.parseTransparentForEncoder(transparent);
    encoder.setTransparent(parsed);
    // Reset disposal deterministically every frame so a frame-local override never leaks forward.
    encoder.setDispose(frame.dispose ?? options.defaultDispose ?? (parsed === null ? 2 : 0));
    encoder.setDelay(frame.duration);
  }

  private async renderTextOverlay(ctx: SKRSContext2D, options: GIFOptions): Promise<void> {
    if (!options.textOverlay) return;
    const canonical = canonicalGIFTextOverlay(options.textOverlay);
    const styled = {
      ...canonical,
      fontSize: canonical.font?.size === undefined ? canonical.fontSize ?? 20 : canonical.fontSize,
      ...(canonical.fill === undefined && canonical.color === undefined ? { color: "white" } : {}),
    };
    await EnhancedTextRenderer.renderText(ctx, styled);
  }

  private assertGifSignature(buffer: Buffer): void {
    const header = buffer.subarray(0, 6).toString("ascii");
    if (header !== "GIF87a" && header !== "GIF89a") {
      throw new ApexifyDecodeError("createGIF: encoder output does not contain a valid GIF signature.");
    }
  }

  private async assertGifFileSignature(file: string): Promise<void> {
    const handle = await fs.promises.open(file, "r");
    try {
      const header = Buffer.alloc(6);
      const { bytesRead } = await handle.read(header, 0, 6, 0);
      if (bytesRead !== 6) throw new ApexifyDecodeError("createGIF: output file is truncated.");
      this.assertGifSignature(header);
    } finally {
      await handle.close();
    }
  }

  private attachmentName(options: GIFOptions): string {
    const requested = options.attachmentName ?? "image.gif";
    return /\.gif$/i.test(requested) ? requested : `${requested}.gif`;
  }

  async createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<
    GIFPrimaryResult
    | { gif: Exclude<GIFPrimaryResult, undefined>; static: Buffer }
    | Buffer
  > {
    const operationController = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, operationController.signal])
      : operationController.signal;
    let encoderStream: ReturnType<GifEncoder["createReadStream"]> | undefined;
    let fileStream: fs.WriteStream | undefined;
    let outputPromise: Promise<Buffer | void> | undefined;
    let outputStarted = false;

    try {
      // Common/output/overlay validation is always executed before onStart or any output allocation.
      validateGIFOptions(options, gifFrames?.length ?? 0);
      throwIfAborted(signal);

      const canvasWidth = options.width ?? 1200;
      const canvasHeight = options.height ?? 1200;
      assertGifResourceLimits(canvasWidth, canvasHeight, 1);
      const prepared = await this.prepareFrameSource(gifFrames, options, signal, canvasWidth, canvasHeight);

      const watermarkCache = new Map<string, Image>();
      const globalWatermarkImage = options.watermark && options.watermark.enable !== false
        ? await this.watermarkImage(options.watermark, signal, watermarkCache, true)
        : undefined;
      throwIfAborted(signal);

      const encoder = new GifEncoder(canvasWidth, canvasHeight);
      encoderStream = encoder.createReadStream();
      if (options.outputFormat === "file") {
        fileStream = fs.createWriteStream(options.outputFile!);
        outputStarted = true;
        fileStream.once("error", (error) => operationController.abort(error));
        encoderStream.pipe(fileStream);
        outputPromise = finished(fileStream).then(() => undefined);
      } else {
        outputStarted = true;
        outputPromise = consumeBuffer(encoderStream);
      }

      encoder.setRepeat(options.repeat ?? 0).setQuality(options.quality ?? 10).start();
      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = getCanvasContext(canvas);
      const skipResizeWhenDimensionsMatch = options.skipResizeWhenDimensionsMatch !== false;
      let frameCount = 0;

      for await (const frame of this.iteratePreparedFrames(prepared, options, signal)) {
        throwIfAborted(signal);
        assertGifResourceLimits(canvasWidth, canvasHeight, frameCount + 1);
        await this.drawFrameOntoEncoderCanvas(ctx, frame, canvasWidth, canvasHeight, skipResizeWhenDimensionsMatch);
        await this.drawWatermarkOverlay(
          ctx,
          canvasWidth,
          canvasHeight,
          frame,
          options,
          signal,
          watermarkCache,
          globalWatermarkImage
        );
        await this.renderTextOverlay(ctx, options);
        throwIfAborted(signal);
        this.applyEncoderFrameOptions(encoder, frame, options);
        encoder.addFrame(ctx as unknown as Pick<CanvasRenderingContext2D, "getImageData">);
        frameCount += 1;
      }

      if (frameCount === 0) {
        throw new ApexifyInputError("createGIF: generated AsyncIterable yielded no frames.");
      }
      encoder.finish();

      let primary: GIFPrimaryResult;
      if (options.outputFormat === "file") {
        await outputPromise;
        await this.assertGifFileSignature(options.outputFile!);
        primary = undefined;
      } else {
        const encoded = await outputPromise;
        if (!Buffer.isBuffer(encoded)) throw new ApexifyDecodeError("createGIF: encoded output buffer is unavailable.");
        this.assertGifSignature(encoded);
        if (options.outputFormat === "base64") primary = encoded.toString("base64");
        else if (options.outputFormat === "attachment") {
          primary = [{ attachment: encoded, name: this.attachmentName(options), contentType: "image/gif" }];
        } else primary = encoded;
      }

      let staticImage: Buffer | undefined;
      if (options.onEnd) staticImage = await options.onEnd(canvas.toBuffer("image/png"), this.painter);
      if (staticImage && primary !== undefined) return { gif: primary, static: staticImage };
      if (staticImage) return staticImage;
      return primary;
    } catch (error) {
      operationController.abort(error);
      encoderStream?.destroy();
      fileStream?.destroy();
      if (outputPromise) await outputPromise.catch(() => undefined);
      if (outputStarted && options.outputFormat === "file" && options.outputFile) {
        await fs.promises.unlink(options.outputFile).catch(() => undefined);
      }
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("GIF creation failed.", { cause: error });
    }
  }
}
