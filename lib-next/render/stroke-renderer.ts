import type { SKRSContext2D } from "@napi-rs/canvas";
import type { borderPosition, StrokeOptions } from "../types/common";
import type { gradient } from "../types/gradient";
import { buildPath, buildPartialRectStrokeEdges, parseStrokeSideSet } from "./clip-path";
import { createGradientFill } from "./gradient-fill";

type Rect = { x: number; y: number; w: number; h: number };

function setStrokePaint(ctx: SKRSContext2D, paint: CanvasGradient | CanvasPattern | string): void {
  (ctx as unknown as { strokeStyle: typeof paint }).strokeStyle = paint;
}

function darkenColor(color: string, factor: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
    const g = Math.max(0, Math.floor(((num >> 8) & 0x00ff) * (1 - factor)));
    const b = Math.max(0, Math.floor((num & 0x0000ff) * (1 - factor)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }
  return color;
}

function lightenColor(color: string, factor: number): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const num = parseInt(hex, 16);
    const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
    const g = Math.min(255, Math.floor(((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * factor));
    const b = Math.min(255, Math.floor((num & 0x0000ff) + (255 - (num & 0x0000ff)) * factor));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }
  return color;
}

function applyStrokeStyle(
  ctx: SKRSContext2D,
  style: NonNullable<StrokeOptions["style"]>,
  width: number
): void {
  switch (style) {
    case "solid":
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;
    case "dashed":
      ctx.setLineDash([width * 3, width * 2]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;
    case "dotted":
      ctx.setLineDash([width, width]);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      break;
    case "groove":
    case "ridge":
    case "double":
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
      break;
    default:
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      ctx.lineJoin = "miter";
  }
}

function applyComplexStrokeStyle(
  ctx: SKRSContext2D,
  style: "groove" | "ridge" | "double",
  width: number,
  color: string,
  grad: gradient | undefined,
  rect: { x: number; y: number; w: number; h: number }
): void {
  const halfWidth = width / 2;

  switch (style) {
    case "groove":
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = darkenColor(color, 0.3);
      }
      ctx.stroke();
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = lightenColor(color, 0.3);
      }
      ctx.stroke();
      break;
    case "ridge":
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = lightenColor(color, 0.3);
      }
      ctx.stroke();
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = darkenColor(color, 0.3);
      }
      ctx.stroke();
      break;
    case "double":
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = color;
      }
      ctx.stroke();
      ctx.lineWidth = halfWidth;
      if (grad) {
        setStrokePaint(ctx, createGradientFill(ctx, grad, rect));
      } else {
        ctx.strokeStyle = color;
      }
      ctx.stroke();
      break;
  }
}

export function applyStroke(
  ctx: SKRSContext2D,
  a: Rect | StrokeOptions | undefined,
  b?: StrokeOptions | number,
  c?: number,
  d?: number,
  e?: number,
  f?: number | "circular",
  g?: borderPosition
): void {
  let rect: Rect;
  let stroke: StrokeOptions | undefined;
  let radius: number | "circular" | undefined;
  let roundedCornersMask: borderPosition;

  if (typeof a === "object" && a !== null && "x" in a && "w" in a) {
    rect = a as Rect;
    stroke = b as StrokeOptions | undefined;
    radius = stroke?.borderRadius ?? 0;
    roundedCornersMask = stroke?.roundedCorners ?? "all";
  } else {
    stroke = a as StrokeOptions | undefined;
    rect = { x: b as number, y: c as number, w: d as number, h: e as number };
    radius = (f as number | "circular") ?? stroke?.borderRadius ?? 0;
    roundedCornersMask = stroke?.roundedCorners ?? (g as borderPosition | undefined) ?? "all";
  }

  if (!stroke) return;

  const {
    color = "#000",
    gradient,
    width: lineWidth = 2,
    position = 0,
    blur = 0,
    opacity = 1,
    style = "solid",
  } = stroke;

  const r = {
    x: rect.x - position,
    y: rect.y - position,
    w: rect.w + position * 2,
    h: rect.h + position * 2,
  };

  const strokeSides = parseStrokeSideSet(stroke.borderPosition);

  const buildStrokePath = (): void => {
    if (radius === "circular") {
      buildPath(ctx, r.x, r.y, r.w, r.h, radius, roundedCornersMask);
    } else if (strokeSides === "all") {
      buildPath(ctx, r.x, r.y, r.w, r.h, radius!, roundedCornersMask);
    } else {
      const n = typeof radius === "number" && radius > 0 ? radius : 0;
      buildPartialRectStrokeEdges(ctx, r.x, r.y, r.w, r.h, n, roundedCornersMask, strokeSides);
    }
  };

  ctx.save();
  if (blur > 0) ctx.filter = `blur(${blur}px)`;
  ctx.globalAlpha = opacity;

  buildStrokePath();

  ctx.lineWidth = lineWidth;

  if (gradient) {
    setStrokePaint(ctx, createGradientFill(ctx, gradient, r));
  } else {
    ctx.strokeStyle = color;
  }

  applyStrokeStyle(ctx, style, lineWidth);

  if (style === "groove" || style === "ridge" || style === "double") {
    applyComplexStrokeStyle(ctx, style, lineWidth, color, gradient, r);
  } else {
    ctx.stroke();
  }

  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();
}
