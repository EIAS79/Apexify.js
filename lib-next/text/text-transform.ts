import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { TextGroupTransformOptions, TextPerspectiveOptions } from "../types";
import { getCanvasContext } from "../core/errors";
import { createDistortedRaster } from "../image/image-warp";

export interface TextRasterSurface {
  canvas: Canvas;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cropTransparentTextRaster(canvas: Canvas): TextRasterSurface | null {
  const ctx = getCanvasContext(canvas);
  const width = canvas.width;
  const height = canvas.height;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const cropped = createCanvas(cropWidth, cropHeight);
  getCanvasContext(cropped).drawImage(
    canvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight
  );
  return { canvas: cropped, x: minX, y: minY, width: cropWidth, height: cropHeight };
}

export function applyTextPerspective(
  surface: TextRasterSurface,
  perspective: TextPerspectiveOptions
): TextRasterSurface {
  return createDistortedRaster(
    getCanvasContext(surface.canvas),
    surface.width,
    surface.height,
    {
      type: "perspective",
      points: perspective.points,
      interpolation: perspective.interpolation,
      edgeMode: perspective.edgeMode,
    },
    surface.x,
    surface.y
  );
}

export function drawTextGroupSurface(
  ctx: SKRSContext2D,
  surface: TextRasterSurface,
  transform: TextGroupTransformOptions
): void {
  const pivotX = transform.pivotX ?? surface.x + surface.width / 2;
  const pivotY = transform.pivotY ?? surface.y + surface.height / 2;
  const rotation = ((transform.rotation ?? 0) * Math.PI) / 180;
  const skewX = ((transform.skewX ?? 0) * Math.PI) / 180;
  const skewY = ((transform.skewY ?? 0) * Math.PI) / 180;

  ctx.save();
  try {
    if (transform.blendMode) ctx.globalCompositeOperation = transform.blendMode;
    ctx.globalAlpha = transform.opacity ?? 1;
    ctx.translate(transform.translateX ?? 0, transform.translateY ?? 0);
    ctx.translate(pivotX, pivotY);
    if (rotation !== 0) ctx.rotate(rotation);
    if (skewX !== 0 || skewY !== 0) {
      ctx.transform(1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0);
    }
    ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    ctx.translate(-pivotX, -pivotY);
    ctx.drawImage(surface.canvas, surface.x, surface.y);
  } finally {
    ctx.restore();
  }
}
