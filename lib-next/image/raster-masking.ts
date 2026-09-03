import { createCanvas } from "@napi-rs/canvas";
import type { PathLike } from "fs";
import type { MaskOptions } from "../types";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "./image-properties";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";
import { validateMaskInputs } from "./image-utils-validation";

/**
 * Apply a separate mask image’s alpha / luminance / chroma key to a source raster (PNG out).
 */
export async function applyRasterMask(
  source: string | Buffer | PathLike | Uint8Array,
  maskSource: string | Buffer | PathLike | Uint8Array,
  options: MaskOptions = { type: "alpha" }
): Promise<Buffer> {
  try {
    validateMaskInputs(source, maskSource, options);

    const img = await loadImageCached(source);
    const mask = await loadImageCached(maskSource);
    assertCanvasResourceLimits(img.width, img.height);

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
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("masking: raster mask could not be applied.", { cause: error });
  }
}
