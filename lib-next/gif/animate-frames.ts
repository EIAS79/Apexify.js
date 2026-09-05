import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { GifEncoder } from "@skyra/gifenc";
import fs from "node:fs";
import { finished } from "node:stream/promises";
import type { Frame } from "../types";
import { decodeImageDataUrl, resolveMediaInput } from "../media/source";
import { decodeImageSource } from "../image/image-source-validation";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError, ApexifyProcessError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertGifResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertFiniteNumber,
  assertFiniteNumericLeaves,
  assertGradient,
  assertOptionalFiniteNumber,
  assertRecord,
  assertSource,
} from "../runtime/validation";

export type AnimateOptions = {
  gif?: boolean;
  gifPath?: string;
  onStart?: () => void;
  onFrame?: (index: number) => void;
  onEnd?: () => void;
  signal?: AbortSignal;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ApexifyProcessError("animate: operation aborted.", { cause: signal.reason });
}

export function validateAnimateInputs(
  frames: Frame[],
  defaultDuration: number,
  defaultWidth: number,
  defaultHeight: number,
  options?: AnimateOptions
): void {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new ApexifyInputError("animate: frames array with at least one frame is required.");
  }
  assertWithinLimit("maxGifFrames", frames.length);
  assertFiniteNumber(defaultDuration, "animate.defaultDuration", { min: 0, max: 655_350 });
  assertFiniteNumber(defaultWidth, "animate.defaultWidth", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(defaultHeight, "animate.defaultHeight", { min: 0, exclusiveMin: true, integer: true });
  assertCanvasResourceLimits(defaultWidth, defaultHeight);

  if (options !== undefined) {
    assertRecord(options, "animate.options");
    if (options.gif !== undefined && typeof options.gif !== "boolean") {
      throw new ApexifyInputError("animate.options.gif must be boolean.");
    }
    if (options.gif && (!options.gifPath || typeof options.gifPath !== "string" || !options.gifPath.trim() || options.gifPath.includes("\0"))) {
      throw new ApexifyInputError("animate: gifPath is required when gif is enabled.");
    }
    for (const callback of ["onStart", "onFrame", "onEnd"] as const) {
      if (options[callback] !== undefined && typeof options[callback] !== "function") {
        throw new ApexifyInputError(`animate.options.${callback} must be a function.`);
      }
    }
    if (options.signal !== undefined) {
      if (typeof options.signal.aborted !== "boolean" || typeof options.signal.addEventListener !== "function") {
        throw new ApexifyInputError("animate.options.signal must be an AbortSignal.");
      }
    }
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const name = `animate.frames[${i}]`;
    assertRecord(frame, name);
    assertFiniteNumericLeaves(frame, name);
    assertOptionalFiniteNumber(frame.duration, `${name}.duration`, { min: 0, max: 655_350 });
    assertOptionalFiniteNumber(frame.width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(frame.height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
    const width = frame.width ?? defaultWidth;
    const height = frame.height ?? defaultHeight;
    assertCanvasResourceLimits(width, height);
    if (options?.gif) {
      if (width !== defaultWidth || height !== defaultHeight) {
        throw new ApexifyInputError("animate: GIF frames must use the configured GIF width and height.");
      }
      assertGifResourceLimits(width, height, frames.length);
    }
    if (frame.source !== undefined) assertSource(frame.source, `${name}.source`);
    if (frame.pattern !== undefined) {
      assertRecord(frame.pattern, `${name}.pattern`);
      assertSource(frame.pattern.source, `${name}.pattern.source`);
    }
    assertGradient(frame.gradient, `${name}.gradient`);
    if (frame.onDrawCustom !== undefined && typeof frame.onDrawCustom !== "function") {
      throw new ApexifyInputError(`${name}.onDrawCustom must be a function.`);
    }
  }

  if (options?.gif) assertGifResourceLimits(defaultWidth, defaultHeight, frames.length);
}

async function loadAnimationImage(source: string, signal?: AbortSignal) {
  throwIfAborted(signal);
  const data = decodeImageDataUrl(source);
  const resolved = data ?? await resolveMediaInput(source, { kind: "image", cache: false, signal });
  return decodeImageSource(resolved, { label: "animate image source" });
}

async function assertGifFile(path: string): Promise<void> {
  const handle = await fs.promises.open(path, "r");
  try {
    const header = Buffer.alloc(6);
    const { bytesRead } = await handle.read(header, 0, 6, 0);
    const signature = header.toString("ascii");
    if (bytesRead !== 6 || (signature !== "GIF87a" && signature !== "GIF89a")) {
      throw new ApexifyDecodeError("animate: GIF output is truncated or has an invalid signature.");
    }
  } finally {
    await handle.close();
  }
}

/** Renders frame-by-frame animation; optionally streams an animated GIF to `gifPath`. */
export async function animateFrames(
  frames: Frame[],
  defaultDuration: number,
  defaultWidth: number = 800,
  defaultHeight: number = 600,
  options?: AnimateOptions
): Promise<Buffer[] | undefined> {
  let gifStream: fs.WriteStream | undefined;
  let gifCompletion: Promise<void> | undefined;
  let gifStarted = false;
  try {
    validateAnimateInputs(frames, defaultDuration, defaultWidth, defaultHeight, options);
    throwIfAborted(options?.signal);
    const buffers: Buffer[] = [];
    const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
    if (options?.onStart) options.onStart();

    let encoder: GifEncoder | undefined;
    const gifCanvas = options?.gif ? createCanvas(defaultWidth, defaultHeight) : undefined;
    if (options?.gif) {
      encoder = new GifEncoder(defaultWidth, defaultHeight);
      const encodedStream = encoder.createReadStream();
      gifStream = fs.createWriteStream(options.gifPath!);
      gifStarted = true;
      encodedStream.pipe(gifStream);
      gifCompletion = finished(gifStream);
      encoder.setRepeat(0).setQuality(10).start();
    }

    for (let i = 0; i < frames.length; i++) {
      throwIfAborted(options?.signal);
      const frame = frames[i]!;
      const width = frame.width ?? defaultWidth;
      const height = frame.height ?? defaultHeight;
      const canvas = gifCanvas ?? createCanvas(width, height);
      const ctx = canvas.getContext("2d") as SKRSContext2D;

      if (!isNode && !gifCanvas) {
        canvas.width = width;
        canvas.height = height;
        const doc = (globalThis as unknown as { document?: { body: { appendChild: (n: Node) => void } } }).document;
        if (doc?.body) doc.body.appendChild(canvas as unknown as Node);
      }

      ctx.clearRect(0, 0, width, height);
      if (frame.transformations) {
        const { scaleX = 1, scaleY = 1, rotate = 0, translateX = 0, translateY = 0 } = frame.transformations;
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.scale(scaleX, scaleY);
      }

      let fillStyle: string | CanvasGradient | CanvasPattern | null = null;
      if (frame.gradient) {
        const { type, startX, startY, endX, endY, startRadius, endRadius, colors } = frame.gradient;
        let gradient: CanvasGradient | null = null;
        if (type === "linear") {
          gradient = ctx.createLinearGradient(startX ?? 0, startY ?? 0, endX ?? width, endY ?? height);
        } else if (type === "radial") {
          gradient = ctx.createRadialGradient(
            startX ?? width / 2,
            startY ?? height / 2,
            startRadius ?? 0,
            endX ?? width / 2,
            endY ?? height / 2,
            endRadius ?? Math.max(width, height)
          );
        }
        colors.forEach((colorStop) => { if (gradient) gradient.addColorStop(colorStop.stop, colorStop.color); });
        fillStyle = gradient;
      }

      if (frame.pattern) {
        const patternImage = await loadAnimationImage(frame.pattern.source, options?.signal);
        fillStyle = ctx.createPattern(patternImage, frame.pattern.repeat ?? "repeat");
      }
      if (!fillStyle && frame.backgroundColor) fillStyle = frame.backgroundColor;
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, width, height);
      }
      if (frame.source) {
        const image = await loadAnimationImage(frame.source, options?.signal);
        ctx.globalCompositeOperation = frame.blendMode ?? "source-over";
        ctx.drawImage(image, 0, 0, width, height);
      }
      if (frame.onDrawCustom) frame.onDrawCustom(ctx, canvas);
      if (frame.transformations) ctx.restore();

      if (encoder) {
        encoder.setDelay(frame.duration ?? defaultDuration);
        encoder.addFrame(ctx as unknown as Pick<CanvasRenderingContext2D, "getImageData">);
      } else {
        buffers.push(canvas.toBuffer("image/png"));
      }
      if (options?.onFrame) options.onFrame(i);
      if (!options?.gif && (frame.duration ?? defaultDuration) > 0) {
        await new Promise((resolve) => setTimeout(resolve, frame.duration ?? defaultDuration));
      }
    }

    if (encoder) {
      encoder.finish();
      await gifCompletion;
      await assertGifFile(options!.gifPath!);
    }
    if (options?.onEnd) options.onEnd();
    return options?.gif ? undefined : buffers;
  } catch (error) {
    gifStream?.destroy();
    if (gifCompletion) await gifCompletion.catch(() => undefined);
    if (gifStarted && options?.gifPath) await fs.promises.unlink(options.gifPath).catch(() => undefined);
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Animation rendering failed.", { cause: error });
  }
}
