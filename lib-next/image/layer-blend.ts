import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { ImageBlendLayer } from "../types/image";
import { getCanvasContext, getErrorMessage } from "../core/errors";

function validateBlendInputs(layers: ImageBlendLayer[], baseImageBuffer: Buffer): void {
  if (!baseImageBuffer || !Buffer.isBuffer(baseImageBuffer)) {
    throw new Error("blend: baseImageBuffer must be a valid Buffer.");
  }
  if (!layers || !Array.isArray(layers) || layers.length === 0) {
    throw new Error("blend: layers array with at least one layer is required.");
  }
  for (const layer of layers) {
    if (!layer.image) {
      throw new Error("blend: Each layer must have an image property.");
    }
    if (!layer.blendMode) {
      throw new Error("blend: Each layer must have a blendMode property.");
    }
    if (
      layer.opacity !== undefined &&
      (typeof layer.opacity !== "number" || layer.opacity < 0 || layer.opacity > 1)
    ) {
      throw new Error("blend: Layer opacity must be a number between 0 and 1.");
    }
  }
}

/**
 * Composite stacked images over a base buffer using per-layer blend modes and opacity.
 */
export async function blendImageLayers(
  layers: ImageBlendLayer[],
  baseImageBuffer: Buffer,
  defaultBlendMode: GlobalCompositeOperation = "source-over"
): Promise<Buffer> {
  try {
    validateBlendInputs(layers, baseImageBuffer);

    const baseImage = await loadImage(baseImageBuffer);
    const canvas = createCanvas(baseImage.width, baseImage.height);
    const ctx = getCanvasContext(canvas);

    ctx.globalCompositeOperation = defaultBlendMode;
    ctx.drawImage(baseImage, 0, 0);

    for (const layer of layers) {
      const layerImage = await loadImage(layer.image);
      ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(layerImage, layer.position?.x || 0, layer.position?.y || 0);
    }

    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = defaultBlendMode;

    return canvas.toBuffer("image/png");
  } catch (error) {
    throw new Error(`blend failed: ${getErrorMessage(error)}`);
  }
}
