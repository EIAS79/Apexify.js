import type { SKRSContext2D } from "@napi-rs/canvas";
import type { borderPosition, ShadowOptions } from "../types/common";
import { buildPath } from "./clip-path";
import { createGradientFill } from "./gradient-fill";

type Rect = { x: number; y: number; w: number; h: number };

/** Shadow pass — supports both `(ctx, rect, shadow?)` and `(ctx, shadow, x, y, w, h, …)` call shapes. */
export function applyShadow(
  ctx: SKRSContext2D,
  a: Rect | ShadowOptions,
  b?: ShadowOptions | number,
  c?: number,
  d?: number,
  e?: number,
  f?: number | "circular",
  g?: borderPosition
): void {
  let rect: Rect;
  let shadow: ShadowOptions | undefined;
  let radius: number | "circular" | undefined;
  let borderPos: borderPosition | undefined;

  if (typeof a === "object" && a !== null && "x" in a && "w" in a) {
    rect = a as Rect;
    shadow = b as ShadowOptions | undefined;
    radius = shadow?.borderRadius ?? 0;
    borderPos = shadow?.roundedCorners ?? shadow?.borderPosition ?? "all";
  } else {
    shadow = a as ShadowOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? shadow?.borderRadius ?? 0;
    borderPos = shadow?.roundedCorners ?? (g as borderPosition | undefined) ?? shadow?.borderPosition ?? "all";
  }

  if (!shadow) return;

  const {
    color = "rgba(0,0,0,1)",
    gradient,
    opacity = 0.4,
    offsetX = 0,
    offsetY = 0,
    blur = 20,
  } = shadow;

  const r = { x: rect.x + offsetX, y: rect.y + offsetY, w: rect.w, h: rect.h };

  ctx.save();
  ctx.globalAlpha = opacity;
  if (blur > 0) ctx.filter = `blur(${blur}px)`;

  buildPath(ctx, r.x, r.y, r.w, r.h, radius!, borderPos!);

  if (gradient) {
    const gfill = createGradientFill(ctx, gradient, r);
    (ctx as unknown as { fillStyle: typeof gfill }).fillStyle = gfill;
  } else {
    ctx.fillStyle = color;
  }
  ctx.fill();

  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}
