import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { GifEncoder } from "@skyra/gifenc";
import fs from "node:fs";
import type { Frame } from "../types";
import { loadImageCached } from "../image/image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
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
};

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
  assertFiniteNumber(defaultDuration, "animate.defaultDuration", { min: 0 });
  assertFiniteNumber(defaultWidth, "animate.defaultWidth", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(defaultHeight, "animate.defaultHeight", { min: 0, exclusiveMin: true, integer: true });
  assertCanvasResourceLimits(defaultWidth, defaultHeight);

  if (options !== undefined) {
    assertRecord(options, "animate.options");
    if (options.gif !== undefined && typeof options.gif !== "boolean") {
      throw new ApexifyInputError("animate.options.gif must be boolean.");
    }
    if (options.gif && (!options.gifPath || typeof options.gifPath !== "string" || !options.gifPath.trim())) {
      throw new ApexifyInputError("animate: gifPath is required when gif is enabled.");
    }
    for (const callback of ["onStart", "onFrame", "onEnd"] as const) {
      if (options[callback] !== undefined && typeof options[callback] !== "function") {
        throw new ApexifyInputError(`animate.options.${callback} must be a function.`);
      }
    }
  }

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const name = `animate.frames[${i}]`;
    assertRecord(frame, name);
    assertFiniteNumericLeaves(frame, name);
    assertOptionalFiniteNumber(frame.duration, `${name}.duration`, { min: 0 });
    assertOptionalFiniteNumber(frame.width, `${name}.width`, { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(frame.height, `${name}.height`, { min: 0, exclusiveMin: true, integer: true });
    const width = frame.width ?? defaultWidth;
    const height = frame.height ?? defaultHeight;
    assertCanvasResourceLimits(width, height);
    if (options?.gif) assertGifResourceLimits(width, height, frames.length);
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

async function loadAnimationImage(source: string | Buffer) {
  return loadImageCached(source);
}

/** Renders frame-by-frame animation; optionally encodes an animated GIF to `gifPath`. */
export async function animateFrames(
  frames: Frame[],
  defaultDuration: number,
  defaultWidth: number = 800,
  defaultHeight: number = 600,
  options?: AnimateOptions
): Promise<Buffer[] | undefined> {
  try {
    validateAnimateInputs(frames, defaultDuration, defaultWidth, defaultHeight, options);
    const buffers: Buffer[] = [];
    const isNode = typeof process !== "undefined" && process.versions != null && process.versions.node != null;
    if (options?.onStart) options.onStart();

    let encoder: GifEncoder | null = null;
    let gifStream: fs.WriteStream | null = null;
    if (options?.gif) {
      if (!options.gifPath) throw new ApexifyInputError("animate: gifPath is required when gif is enabled.");
      encoder = new GifEncoder(defaultWidth, defaultHeight);
      gifStream = fs.createWriteStream(options.gifPath);
      encoder.createReadStream().pipe(gifStream);
      encoder.start();
      encoder.setRepeat(0);
      encoder.setQuality(10);
    }

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const width = frame.width ?? defaultWidth;
      const height = frame.height ?? defaultHeight;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d") as SKRSContext2D;

      if (!isNode) {
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
        const patternImage = await loadAnimationImage(frame.pattern.source);
        fillStyle = ctx.createPattern(patternImage, frame.pattern.repeat ?? "repeat");
      }
      if (!fillStyle && frame.backgroundColor) fillStyle = frame.backgroundColor;
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, width, height);
      }
      if (frame.source) {
        const image = await loadAnimationImage(frame.source);
        ctx.globalCompositeOperation = frame.blendMode ?? "source-over";
        ctx.drawImage(image, 0, 0, width, height);
      }
      if (frame.onDrawCustom) frame.onDrawCustom(ctx, canvas);
      if (frame.transformations) ctx.restore();

      const buffer = canvas.toBuffer("image/png");
      buffers.push(buffer);
      if (encoder) {
        encoder.setDelay(frame.duration ?? defaultDuration);
        encoder.addFrame(ctx as unknown as Pick<CanvasRenderingContext2D, "getImageData">);
      }
      if (options?.onFrame) options.onFrame(i);
      await new Promise((resolve) => setTimeout(resolve, frame.duration ?? defaultDuration));
    }

    if (encoder) encoder.finish();
    if (options?.onEnd) options.onEnd();
    return options?.gif ? undefined : buffers;
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Animation rendering failed.", { cause: error });
  }
}
