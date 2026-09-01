import { createCanvas, type Image } from "@napi-rs/canvas";
import type { CanvasResults, CustomOptions } from "../types";
import { customLines } from "../path/custom-lines";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "../image/image-properties";
import { validateSceneCustomLinesOptions } from "../scene/scene-normalizer";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";

function extractBuffer(buffer: CanvasResults | Buffer): Buffer {
  if (Buffer.isBuffer(buffer)) {
    if (buffer.length === 0) throw new ApexifyInputError("path2d.custom.buffer must be non-empty.");
    return buffer;
  }
  if (buffer && Buffer.isBuffer(buffer.buffer) && buffer.buffer.length > 0) return buffer.buffer;
  throw new ApexifyInputError("path2d.custom.buffer must be a non-empty Buffer or CanvasResults.");
}

/** Path2D “custom” connector lines drawn on top of an existing canvas buffer. */
export async function runDrawCustomLines(
  options: CustomOptions | CustomOptions[],
  buffer: CanvasResults | Buffer
): Promise<Buffer> {
  const opts = Array.isArray(options) ? options : [options];
  validateSceneCustomLinesOptions(opts);
  try {
    const existingImage: Image = await loadImageCached(extractBuffer(buffer));
    assertCanvasResourceLimits(existingImage.width, existingImage.height);
    const canvas = createCanvas(existingImage.width, existingImage.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(existingImage, 0, 0);
    await customLines(ctx, opts);
    return canvas.toBuffer("image/png");
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Custom-line drawing failed.", { cause: error });
  }
}
