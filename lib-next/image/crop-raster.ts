import { createCanvas } from "@napi-rs/canvas";
import type { cropOptions } from "../types";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "./image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { validateCropInputs } from "./image-utils-validation";

async function cropInner(options: cropOptions): Promise<Buffer> {
  const image = await loadImageCached(options.imageSource);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const coordinate of options.coordinates) {
    xs.push(coordinate.from.x, coordinate.to.x);
    ys.push(coordinate.from.y, coordinate.to.y);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ApexifyInputError("cropImage: coordinates must define a positive crop area.");
  }
  if (maxX > image.width || maxY > image.height) {
    throw new ApexifyInputError(`cropImage: crop bounds ${maxX}×${maxY} exceed source ${image.width}×${image.height}.`);
  }
  assertCanvasResourceLimits(width, height);

  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  if (options.radius === "circular") {
    const radius = Math.min(width, height) / 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
  } else if (typeof options.radius === "number" && options.radius > 0) {
    const radius = Math.min(options.radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, radius);
    ctx.clip();
  }
  ctx.drawImage(image, minX, minY, width, height, 0, 0, width, height);
  return canvas.toBuffer("image/png");
}

async function cropOuter(options: cropOptions): Promise<Buffer> {
  const image = await loadImageCached(options.imageSource);
  const maxX = Math.max(...options.coordinates.flatMap((coordinate) => [coordinate.from.x, coordinate.to.x]));
  const maxY = Math.max(...options.coordinates.flatMap((coordinate) => [coordinate.from.y, coordinate.to.y]));
  if (maxX > image.width || maxY > image.height) {
    throw new ApexifyInputError(`cropImage: crop bounds ${maxX}×${maxY} exceed source ${image.width}×${image.height}.`);
  }
  assertCanvasResourceLimits(image.width, image.height);
  const canvas = createCanvas(image.width, image.height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(options.coordinates[0].from.x, options.coordinates[0].from.y);
  for (let i = 0; i < options.coordinates.length; i += 1) {
    const coordinate = options.coordinates[i];
    const next = options.coordinates[(i + 1) % options.coordinates.length];
    const tension = coordinate.tension ?? 0;
    const cp1x = coordinate.from.x + (next.from.x - coordinate.from.x) * tension;
    const cp1y = coordinate.from.y + (next.from.y - coordinate.from.y) * tension;
    const cp2x = coordinate.to.x - (next.to.x - coordinate.to.x) * tension;
    const cp2y = coordinate.to.y - (next.to.y - coordinate.to.y) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, coordinate.to.x, coordinate.to.y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  return canvas.toBuffer("image/png");
}

/** Polygon inner/outer crop routed through shared validation and the authoritative image source/cache. */
export async function cropRasterImage(options: cropOptions): Promise<Buffer> {
  validateCropInputs(options);
  try {
    return options.crop === "outer" ? await cropOuter(options) : await cropInner(options);
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Image crop failed.", { cause: error });
  }
}
