import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { PathLike } from "fs";
import type { MaskOptions } from "../types/image";
import { getCanvasContext, getErrorMessage } from "../core/errors";

function validateMaskingInputs(
  source: string | Buffer | PathLike | Uint8Array,
  maskSource: string | Buffer | PathLike | Uint8Array,
  options: MaskOptions
): void {
  if (!source) {
    throw new Error("masking: source is required.");
  }
  if (!maskSource) {
    throw new Error("masking: maskSource is required.");
  }
  if (options.type && !["alpha", "grayscale", "color"].includes(options.type)) {
    throw new Error("masking: type must be 'alpha', 'grayscale', or 'color'.");
  }
  if (options.type === "color" && !options.colorKey) {
    throw new Error("masking: colorKey is required when type is 'color'.");
  }
  if (
    options.threshold !== undefined &&
    (typeof options.threshold !== "number" || options.threshold < 0 || options.threshold > 255)
  ) {
    throw new Error("masking: threshold must be a number between 0 and 255.");
  }
}

/**
 * Apply a separate mask image’s alpha / luminance / chroma key to a source raster (PNG out).
 */
export async function applyRasterMask(
  source: string | Buffer | PathLike | Uint8Array,
  maskSource: string | Buffer | PathLike | Uint8Array,
  options: MaskOptions = { type: "alpha" }
): Promise<Buffer> {
  try {
    validateMaskingInputs(source, maskSource, options);

    const img = await loadImage(source as string | Buffer | URL);
    const mask = await loadImage(maskSource as string | Buffer | URL);

    const canvas = createCanvas(img.width, img.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(img, 0, 0, img.width, img.height);

    const maskCanvas = createCanvas(img.width, img.height);
    const maskCtx = getCanvasContext(maskCanvas);
    maskCtx.drawImage(mask, 0, 0, img.width, img.height);

    const maskData = maskCtx.getImageData(0, 0, img.width, img.height);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);

    for (let i = 0; i < maskData.data.length; i += 4) {
      let alphaValue = 255;

      if (options.type === "grayscale") {
        const grayscale =
          maskData.data[i] * 0.3 + maskData.data[i + 1] * 0.59 + maskData.data[i + 2] * 0.11;
        alphaValue = grayscale >= (options.threshold ?? 128) ? 255 : 0;
      } else if (options.type === "alpha") {
        alphaValue = maskData.data[i + 3];
      } else if (options.type === "color" && options.colorKey) {
        const colorMatch =
          maskData.data[i] === parseInt(options.colorKey.slice(1, 3), 16) &&
          maskData.data[i + 1] === parseInt(options.colorKey.slice(3, 5), 16) &&
          maskData.data[i + 2] === parseInt(options.colorKey.slice(5, 7), 16);
        alphaValue = colorMatch ? 0 : 255;
      }

      if (options.invert) alphaValue = 255 - alphaValue;

      imgData.data[i + 3] = alphaValue;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas.toBuffer("image/png");
  } catch (error) {
    throw new Error(`masking failed: ${getErrorMessage(error)}`);
  }
}
