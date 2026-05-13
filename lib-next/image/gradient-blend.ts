import { createCanvas, loadImage, type CanvasGradient } from "@napi-rs/canvas";
import type { PathLike } from "fs";
import type { BlendOptions } from "../types/image";
import { getCanvasContext, getErrorMessage } from "../core/errors";

function validateGradientBlendInputs(
  source: string | Buffer | PathLike | Uint8Array,
  options: BlendOptions
): void {
  if (!source) {
    throw new Error("gradientBlend: source is required.");
  }
  if (!options || typeof options !== "object") {
    throw new Error("gradientBlend: options object is required.");
  }
  if (!options.colors || !Array.isArray(options.colors) || options.colors.length === 0) {
    throw new Error("gradientBlend: options.colors array with at least one color stop is required.");
  }
  if (options.type && !["linear", "radial", "conic"].includes(options.type)) {
    throw new Error("gradientBlend: type must be 'linear', 'radial', or 'conic'.");
  }
  for (const colorStop of options.colors) {
    if (typeof colorStop.stop !== "number" || colorStop.stop < 0 || colorStop.stop > 1) {
      throw new Error("gradientBlend: Each color stop must have a stop value between 0 and 1.");
    }
    if (!colorStop.color || typeof colorStop.color !== "string") {
      throw new Error("gradientBlend: Each color stop must have a valid color string.");
    }
  }
}

/**
 * Blend a gradient over a source image, optionally masked by a second image.
 */
export async function blendGradientOverImage(
  source: string | Buffer | PathLike | Uint8Array,
  options: BlendOptions
): Promise<Buffer> {
  try {
    validateGradientBlendInputs(source, options);

    const img = await loadImage(source as string | Buffer | URL);
    const canvas = createCanvas(img.width, img.height);
    const ctx = getCanvasContext(canvas);

    ctx.drawImage(img, 0, 0, img.width, img.height);

    let gradient: CanvasGradient;
    if (options.type === "linear") {
      const angle = options.angle ?? 0;
      const radians = (angle * Math.PI) / 180;
      const x1 = img.width / 2 - (Math.cos(radians) * img.width) / 2;
      const y1 = img.height / 2 - (Math.sin(radians) * img.height) / 2;
      const x2 = img.width / 2 + (Math.cos(radians) * img.width) / 2;
      const y2 = img.height / 2 + (Math.sin(radians) * img.height) / 2;
      gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    } else if (options.type === "radial") {
      gradient = ctx.createRadialGradient(
        img.width / 2,
        img.height / 2,
        0,
        img.width / 2,
        img.height / 2,
        Math.max(img.width, img.height)
      );
    } else {
      gradient = ctx.createConicGradient(Math.PI, img.width / 2, img.height / 2);
    }

    for (const { stop, color } of options.colors) {
      gradient.addColorStop(stop, color);
    }
    ctx.fillStyle = gradient;

    ctx.globalCompositeOperation = options.blendMode ?? "multiply";
    ctx.fillRect(0, 0, img.width, img.height);

    if (options.maskSource) {
      const mask = await loadImage(options.maskSource as string | Buffer | URL);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, img.width, img.height);
    }

    ctx.globalCompositeOperation = "source-over";
    return canvas.toBuffer("image/png");
  } catch (error) {
    throw new Error(`gradientBlend failed: ${getErrorMessage(error)}`);
  }
}
