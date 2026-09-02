import type { SKRSContext2D } from "@napi-rs/canvas";
import type { gradient as GradientType } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { createRepeatingGradientPattern } from "./repeating-gradient-pattern";

function rotatePoint(x: number, y: number, px: number, py: number, deg = 0): [number, number] {
  if (!deg) return [x, y];
  const a = (deg * Math.PI) / 180;
  const dx = x - px;
  const dy = y - py;
  return [px + dx * Math.cos(a) - dy * Math.sin(a), py + dx * Math.sin(a) + dy * Math.cos(a)];
}

function addStops(grad: CanvasGradient, colors: GradientType["colors"]): void {
  for (const cs of colors) grad.addColorStop(cs.stop, cs.color);
}

function assertLinearGeometry(sx: number, sy: number, ex: number, ey: number): void {
  if (sx === ex && sy === ey) {
    throw new ApexifyInputError("Linear gradient start and end points must not be identical.");
  }
}

function assertRadialGeometry(sx: number, sy: number, sr: number, ex: number, ey: number, er: number): void {
  if (sr < 0 || er < 0) throw new ApexifyInputError("Radial gradient radii must be non-negative.");
  if (sx === ex && sy === ey && sr === er) {
    throw new ApexifyInputError("Radial gradient start and end circles must not be identical.");
  }
}

/** Build a gradient in rect-local coordinates. Explicit zero coordinates are preserved. */
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
    assertLinearGeometry(sx, sy, ex, ey);

    const grad = ctx.createLinearGradient(x + sx, y + sy, x + ex, y + ey);
    addStops(grad, colors);
    return repeat === "no-repeat" ? grad : createRepeatingGradientPattern(ctx, grad, repeat, w, h);
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
    assertRadialGeometry(sx, sy, startRadius, ex, ey, endRadius);

    const grad = ctx.createRadialGradient(x + sx, y + sy, startRadius, x + ex, y + ey, endRadius);
    addStops(grad, colors);
    return repeat === "no-repeat" ? grad : createRepeatingGradientPattern(ctx, grad, repeat, w, h);
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
    addStops(grad, colors);
    return grad;
  }

  throw new ApexifyInputError(`Unsupported gradient type ${(g as { type?: string }).type ?? "unknown"}.`);
}
