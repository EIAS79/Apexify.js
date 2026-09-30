import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { loadImageCached } from "./image-properties";

export type ImageMaskMode = "alpha" | "luminance" | "inverse";

export async function applyRasterImageMask(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  maskSource: string | Buffer,
  mode: ImageMaskMode = "alpha"
): Promise<void> {
  try {
    assertCanvasResourceLimits(width, height);
    const maskImage = await loadImageCached(maskSource);
    const maskCanvas = createCanvas(width, height);
    const maskCtx = getCanvasContext(maskCanvas);
    maskCtx.drawImage(maskImage, 0, 0, width, height);

    const maskPixels = maskCtx.getImageData(0, 0, width, height).data;
    const sourceData = ctx.getImageData(0, 0, width, height);
    const sourcePixels = sourceData.data;

    for (let index = 0; index < sourcePixels.length; index += 4) {
      let alpha = maskPixels[index + 3] / 255;
      if (mode === "luminance") {
        alpha =
          (maskPixels[index] * 0.299 +
            maskPixels[index + 1] * 0.587 +
            maskPixels[index + 2] * 0.114) /
          255;
      } else if (mode === "inverse") {
        alpha = 1 - alpha;
      }
      sourcePixels[index + 3] = Math.round(sourcePixels[index + 3] * alpha);
    }
    ctx.putImageData(sourceData, 0, 0);
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Failed to apply image mask.", { cause: error });
  }
}

export async function applyImageMask(
  ctx: SKRSContext2D,
  image: Image,
  maskSource: string | Buffer,
  mode: ImageMaskMode = "alpha",
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  assertCanvasResourceLimits(width, height);
  const sourceCanvas = createCanvas(width, height);
  const sourceCtx = getCanvasContext(sourceCanvas);
  sourceCtx.drawImage(image, 0, 0, width, height);
  await applyRasterImageMask(sourceCtx, width, height, maskSource, mode);
  ctx.drawImage(sourceCanvas, x, y);
}

export function applyClipPath(
  ctx: SKRSContext2D,
  clipPath: Array<{ x: number; y: number }>
): void {
  if (!clipPath || clipPath.length < 3) {
    throw new ApexifyInputError("Clip path must have at least 3 points");
  }
  ctx.beginPath();
  ctx.moveTo(clipPath[0].x, clipPath[0].y);
  for (let index = 1; index < clipPath.length; index += 1) {
    ctx.lineTo(clipPath[index].x, clipPath[index].y);
  }
  ctx.closePath();
  ctx.clip();
}
