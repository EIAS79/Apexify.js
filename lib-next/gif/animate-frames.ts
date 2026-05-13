import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import fs from "fs";
import type { Frame } from "../types/gif";
import { getErrorMessage } from "../core/errors";

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
  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    throw new Error("animate: frames array with at least one frame is required.");
  }
  if (typeof defaultDuration !== "number" || defaultDuration < 0) {
    throw new Error("animate: defaultDuration must be a non-negative number.");
  }
  if (typeof defaultWidth !== "number" || defaultWidth <= 0) {
    throw new Error("animate: defaultWidth must be a positive number.");
  }
  if (typeof defaultHeight !== "number" || defaultHeight <= 0) {
    throw new Error("animate: defaultHeight must be a positive number.");
  }
  if (options?.gif && !options.gifPath) {
    throw new Error("animate: gifPath is required when gif is enabled.");
  }
}

/**
 * Renders frame-by-frame animation; optionally encodes an animated GIF to `gifPath`.
 */
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
    const isNode =
      typeof process !== "undefined" &&
      process.versions != null &&
      process.versions.node != null;

    if (options?.onStart) options.onStart();

    let encoder: GIFEncoder | null = null;
    let gifStream: fs.WriteStream | null = null;

    if (options?.gif) {
      if (!options.gifPath) {
        throw new Error("animate: gifPath is required when gif is enabled.");
      }
      encoder = new GIFEncoder(defaultWidth, defaultHeight);
      gifStream = fs.createWriteStream(options.gifPath);
      encoder.createReadStream().pipe(gifStream);
      encoder.start();
      encoder.setRepeat(0);
      encoder.setQuality(10);
    }

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      const width = frame.width || defaultWidth;
      const height = frame.height || defaultHeight;
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d") as SKRSContext2D;

      if (!isNode) {
        canvas.width = width;
        canvas.height = height;
        const doc = (globalThis as unknown as { document?: { body: { appendChild: (n: Node) => void } } })
          .document;
        if (doc?.body) {
          doc.body.appendChild(canvas as unknown as Node);
        }
      }

      ctx.clearRect(0, 0, width, height);

      if (frame.transformations) {
        const {
          scaleX = 1,
          scaleY = 1,
          rotate = 0,
          translateX = 0,
          translateY = 0,
        } = frame.transformations;
        ctx.save();
        ctx.translate(translateX, translateY);
        ctx.rotate((rotate * Math.PI) / 180);
        ctx.scale(scaleX, scaleY);
      }

      let fillStyle: string | CanvasGradient | CanvasPattern | null = null;

      if (frame.gradient) {
        const { type, startX, startY, endX, endY, startRadius, endRadius, colors } =
          frame.gradient;
        let gradient: CanvasGradient | null = null;

        if (type === "linear") {
          gradient = ctx.createLinearGradient(
            startX || 0,
            startY || 0,
            endX || width,
            endY || height
          );
        } else if (type === "radial") {
          gradient = ctx.createRadialGradient(
            startX || width / 2,
            startY || height / 2,
            startRadius || 0,
            endX || width / 2,
            endY || height / 2,
            endRadius || Math.max(width, height)
          );
        }

        colors.forEach((colorStop) => {
          if (gradient) gradient.addColorStop(colorStop.stop, colorStop.color);
        });

        fillStyle = gradient;
      }

      if (frame.pattern) {
        const patternImage = await loadImage(frame.pattern.source);
        const pattern = ctx.createPattern(patternImage, frame.pattern.repeat || "repeat");
        fillStyle = pattern;
      }

      if (!fillStyle && frame.backgroundColor) {
        fillStyle = frame.backgroundColor;
      }

      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fillRect(0, 0, width, height);
      }

      if (frame.source) {
        const image = await loadImage(frame.source);
        ctx.globalCompositeOperation = frame.blendMode || "source-over";
        ctx.drawImage(image, 0, 0, width, height);
      }

      if (frame.onDrawCustom) {
        frame.onDrawCustom(ctx, canvas);
      }

      if (frame.transformations) {
        ctx.restore();
      }

      const buffer = canvas.toBuffer("image/png");
      buffers.push(buffer);

      if (encoder) {
        const frameDuration = frame.duration || defaultDuration;
        encoder.setDelay(frameDuration);
        encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
      }

      if (options?.onFrame) options.onFrame(i);

      await new Promise((resolve) => setTimeout(resolve, frame.duration || defaultDuration));
    }

    if (encoder) {
      encoder.finish();
    }

    if (options?.onEnd) options.onEnd();

    return options?.gif ? undefined : buffers;
  } catch (error) {
    throw new Error(`animate failed: ${getErrorMessage(error)}`);
  }
}
