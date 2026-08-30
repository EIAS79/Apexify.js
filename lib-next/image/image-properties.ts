import { loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import sharp from "sharp";
import type { AlignMode, FitMode, BoxBackground } from "../types";
import { buildPath } from "../render/clip-path";
import { createGradientFill } from "../render/gradient-fill";
import type { ApexifyRuntime } from "../runtime/context";
import { currentApexifyRuntime } from "../runtime/context";
import { ApexifyDecodeError } from "../runtime/errors";
import { resolveImageInput } from "../media/source";

export function fitInto(
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  imgW: number,
  imgH: number,
  fit: FitMode = "fill",
  align: AlignMode = "center"
) {
  let dx = boxX,
    dy = boxY,
    dw = boxW,
    dh = boxH,
    sx = 0,
    sy = 0,
    sw = imgW,
    sh = imgH;

  if (fit === "fill") return { dx, dy, dw, dh, sx, sy, sw, sh };

  const scale = fit === "contain"
    ? Math.min(boxW / imgW, boxH / imgH)
    : Math.max(boxW / imgW, boxH / imgH);
  dw = imgW * scale;
  dh = imgH * scale;
  const cx = boxX + (boxW - dw) / 2;
  const cy = boxY + (boxH - dh) / 2;

  switch (align) {
    case "top-left": dx = boxX; dy = boxY; break;
    case "top": dx = cx; dy = boxY; break;
    case "top-right": dx = boxX + boxW - dw; dy = boxY; break;
    case "left": dx = boxX; dy = cy; break;
    case "center": dx = cx; dy = cy; break;
    case "right": dx = boxX + boxW - dw; dy = cy; break;
    case "bottom-left": dx = boxX; dy = boxY + boxH - dh; break;
    case "bottom": dx = cx; dy = boxY + boxH - dh; break;
    case "bottom-right": dx = boxX + boxW - dw; dy = boxY + boxH - dh; break;
    default: dx = cx; dy = cy; break;
  }
  return { dx, dy, dw, dh, sx, sy, sw, sh };
}

async function resolveToCanvasImage(src: string | Buffer, runtime: ApexifyRuntime): Promise<Image> {
  try {
    const resolved = await resolveImageInput(src, runtime);
    const png = await sharp(resolved).png().toBuffer();
    return await loadImage(png);
  } catch (error) {
    if (error instanceof ApexifyDecodeError) throw error;
    throw new ApexifyDecodeError("Failed to decode image source.", { cause: error });
  }
}

/**
 * Historical name retained for internal compatibility. The old permanent decoded-image Map was
 * removed; remote/source bytes now flow through the single bounded runtime cache instead.
 */
export function loadImageCached(
  src: string | Buffer,
  runtime: ApexifyRuntime = currentApexifyRuntime()
): Promise<Image> {
  return resolveToCanvasImage(src, runtime);
}

export function drawBoxBackground(
  ctx: SKRSContext2D,
  rect: { x: number; y: number; w: number; h: number },
  boxBg?: BoxBackground,
  borderRadius?: number | "circular",
  borderPosition?: string
): void {
  if (!boxBg) return;
  const { color, gradient } = boxBg;
  ctx.save();
  buildPath(ctx, rect.x, rect.y, rect.w, rect.h, borderRadius ?? 0, borderPosition ?? "all");
  ctx.clip();
  if (gradient) {
    const gradientFill = createGradientFill(ctx, gradient, rect);
    ctx.fillStyle = gradientFill as CanvasGradient | CanvasPattern;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  } else if (color && color !== "transparent") {
    ctx.fillStyle = color;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }
  ctx.restore();
}

export async function loadImages(
  imageSource: string | Buffer,
  runtime: ApexifyRuntime = currentApexifyRuntime()
) {
  const resolved = await resolveImageInput(imageSource, runtime);
  return sharp(resolved);
}
