import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { gradient as GradientType } from "../types/gradient";

function rotatePoint(x: number, y: number, px: number, py: number, deg = 0): [number, number] {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const dx = x - px;
  const dy = y - py;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)];
}

function createRepeatingGradientPattern(
  ctx: SKRSContext2D,
  grad: CanvasGradient,
  repeat: "repeat" | "reflect",
  width: number,
  height: number
): CanvasPattern {
  const patternCanvas = createCanvas(width, height);
  const patternCtx = patternCanvas.getContext("2d") as SKRSContext2D;
  patternCtx.fillStyle = grad;
  patternCtx.fillRect(0, 0, width, height);
  const pattern = ctx.createPattern(patternCanvas, repeat === "reflect" ? "repeat" : "repeat");
  if (!pattern) {
    throw new Error("Failed to create repeating gradient pattern");
  }
  return pattern;
}

/**
 * Build a gradient in **rect-local coordinates** (same contract as legacy `createGradientFill`).
 */
export function createGradientFill(
  ctx: SKRSContext2D,
  g: GradientType,
  rect: { x: number; y: number; w: number; h: number }
): CanvasGradient | CanvasPattern {
  const { x, y, w, h } = rect;

  if (g.type === "linear") {
    const {
      startX = 0,
      startY = 0,
      endX = w,
      endY = 0,
      rotate = 0,
      pivotX = w / 2,
      pivotY = h / 2,
      repeat = "no-repeat",
      colors,
    } = g;

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX, endY, pivotX, pivotY, rotate);

    const grad = ctx.createLinearGradient(x + sx, y + sy, x + ex, y + ey);
    colors.forEach((cs) => grad.addColorStop(cs.stop, cs.color));

    if (repeat !== "no-repeat") {
      return createRepeatingGradientPattern(ctx, grad, repeat, w, h);
    }

    return grad;
  }

  if (g.type === "radial") {
    const {
      startX = w / 2,
      startY = h / 2,
      startRadius = 0,
      endX = w / 2,
      endY = h / 2,
      endRadius = Math.max(w, h) / 2,
      rotate = 0,
      pivotX = w / 2,
      pivotY = h / 2,
      repeat = "no-repeat",
      colors,
    } = g;

    const [sx, sy] = rotatePoint(startX, startY, pivotX, pivotY, rotate);
    const [ex, ey] = rotatePoint(endX, endY, pivotX, pivotY, rotate);

    const grad = ctx.createRadialGradient(x + sx, y + sy, startRadius, x + ex, y + ey, endRadius);
    colors.forEach((cs) => grad.addColorStop(cs.stop, cs.color));

    if (repeat !== "no-repeat") {
      return createRepeatingGradientPattern(ctx, grad, repeat, w, h);
    }

    return grad;
  }

  if (g.type === "conic") {
    const {
      centerX = w / 2,
      centerY = h / 2,
      startAngle = 0,
      rotate: conicRotate = 0,
      pivotX = w / 2,
      pivotY = h / 2,
      colors,
    } = g;

    const [cx, cy] = rotatePoint(centerX, centerY, pivotX, pivotY, conicRotate);
    const angleRad = ((startAngle + conicRotate) * Math.PI) / 180;

    const grad = ctx.createConicGradient(angleRad, x + cx, y + cy);
    colors.forEach((cs) => grad.addColorStop(cs.stop, cs.color));
    return grad;
  }

  throw new Error(`createGradientFill: unsupported gradient type ${(g as { type?: string }).type}`);
}
