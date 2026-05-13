import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import type { CanvasResults } from "../canvas/canvas-creator";
import type { CustomOptions } from "../types/path";
import { customLines } from "../path/custom-lines";
import { getErrorMessage, getCanvasContext } from "../core/errors";

function validateCustomOptions(options: CustomOptions | CustomOptions[]): void {
  const opts = Array.isArray(options) ? options : [options];
  if (opts.length === 0) {
    throw new Error("createCustom: At least one custom option is required.");
  }
  for (const opt of opts) {
    if (
      !opt.startCoordinates ||
      typeof opt.startCoordinates.x !== "number" ||
      typeof opt.startCoordinates.y !== "number"
    ) {
      throw new Error("createCustom: startCoordinates with valid x and y are required.");
    }
    if (
      !opt.endCoordinates ||
      typeof opt.endCoordinates.x !== "number" ||
      typeof opt.endCoordinates.y !== "number"
    ) {
      throw new Error("createCustom: endCoordinates with valid x and y are required.");
    }
  }
}

/** Path2D “custom” connector lines drawn on top of an existing canvas buffer. */
export async function runDrawCustomLines(
  options: CustomOptions | CustomOptions[],
  buffer: CanvasResults | Buffer
): Promise<Buffer> {
  try {
    if (!buffer) {
      throw new Error("createCustom: buffer is required.");
    }
    validateCustomOptions(options);
    const opts = Array.isArray(options) ? options : [options];

    let existingImage: Image;
    if (Buffer.isBuffer(buffer)) {
      existingImage = await loadImage(buffer);
    } else if (buffer && buffer.buffer) {
      existingImage = await loadImage(buffer.buffer);
    } else {
      throw new Error(
        "Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer"
      );
    }

    const canvas = createCanvas(existingImage.width, existingImage.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(existingImage, 0, 0);
    await customLines(ctx, opts);
    return canvas.toBuffer("image/png");
  } catch (error) {
    throw new Error(`createCustom failed: ${getErrorMessage(error)}`);
  }
}
