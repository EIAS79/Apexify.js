import { createCanvas } from "@napi-rs/canvas";
import type { ImageBlendLayer } from "../types";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "./image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import {
  assertCollection,
  assertFiniteNumber,
  assertNonEmptyString,
  assertOpacity,
  assertRecord,
  assertSource,
} from "../runtime/validation";

function validateBlendInputs(layers: ImageBlendLayer[], baseImageBuffer: Buffer): void {
  if (!Buffer.isBuffer(baseImageBuffer) || baseImageBuffer.length === 0) {
    throw new ApexifyInputError("blend.baseImageBuffer must be a non-empty Buffer.");
  }
  assertCollection(layers, "blend.layers", { min: 1, limit: "maxCollectionItems" });
  layers.forEach((layer, i) => {
    const name = `blend.layers[${i}]`;
    assertRecord(layer, name);
    assertSource(layer.image, `${name}.image`);
    assertNonEmptyString(layer.blendMode, `${name}.blendMode`, 128);
    assertOpacity(layer.opacity, `${name}.opacity`);
    if (layer.position !== undefined) {
      assertRecord(layer.position, `${name}.position`);
      assertFiniteNumber(layer.position.x, `${name}.position.x`);
      assertFiniteNumber(layer.position.y, `${name}.position.y`);
    }
  });
}

/** Composite stacked images over a base buffer using per-layer blend modes and opacity. */
export async function blendImageLayers(
  layers: ImageBlendLayer[],
  baseImageBuffer: Buffer,
  defaultBlendMode: GlobalCompositeOperation = "source-over"
): Promise<Buffer> {
  validateBlendInputs(layers, baseImageBuffer);
  try {
    const baseImage = await loadImageCached(baseImageBuffer);
    assertCanvasResourceLimits(baseImage.width, baseImage.height);
    const canvas = createCanvas(baseImage.width, baseImage.height);
    const ctx = getCanvasContext(canvas);
    ctx.globalCompositeOperation = defaultBlendMode;
    ctx.drawImage(baseImage, 0, 0);

    for (const layer of layers) {
      const layerImage = await loadImageCached(layer.image);
      ctx.globalAlpha = layer.opacity ?? 1;
      ctx.globalCompositeOperation = layer.blendMode;
      ctx.drawImage(layerImage, layer.position?.x ?? 0, layer.position?.y ?? 0);
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = defaultBlendMode;
    return canvas.toBuffer("image/png");
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Image blending failed.", { cause: error });
  }
}
