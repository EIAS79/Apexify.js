import { createCanvas, type Image, type SKRSContext2D, type Path2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { CanvasResults } from "../types";
import type { PathCommand } from "../foundation/path-cmd";
import { buildPath2DFromCommands } from "../foundation/path-cmd";
import { createGradientFill } from "../render/gradient-fill";
import type { Path2DDrawOptions } from "../types";
import { loadImageCached } from "../image/image-properties";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection,
  assertFiniteNumericLeaves,
  assertGradient,
  assertNonEmptyString,
  assertOpacity,
  assertOptionalFiniteNumber,
  assertRecord,
} from "../runtime/validation";

export type { PathCommand } from "../foundation/path-cmd";
export type { Path2DDrawOptions };

function validatePathCommands(path: Path2D | PathCommand[], name: string): void {
  if (!Array.isArray(path)) return;
  assertWithinLimit("maxCollectionItems", path.length);
  assertFiniteNumericLeaves(path, name);
}

function validateDrawOptions(options: Path2DDrawOptions | undefined): void {
  if (options === undefined) return;
  assertRecord(options, "path2d.options");
  assertFiniteNumericLeaves(options, "path2d.options");
  assertOpacity(options.opacity, "path2d.options.opacity");
  if (options.globalCompositeOperation !== undefined) {
    assertNonEmptyString(options.globalCompositeOperation, "path2d.options.globalCompositeOperation", 128);
  }
  if (options.shadow !== undefined) {
    assertRecord(options.shadow, "path2d.options.shadow");
    assertOptionalFiniteNumber(options.shadow.blur, "path2d.options.shadow.blur", { min: 0 });
    assertGradient(options.shadow.gradient, "path2d.options.shadow.gradient");
  }
  if (options.gradientBounds !== undefined) {
    assertRecord(options.gradientBounds, "path2d.options.gradientBounds");
    assertOptionalFiniteNumber(options.gradientBounds.w, "path2d.options.gradientBounds.w", { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(options.gradientBounds.h, "path2d.options.gradientBounds.h", { min: 0, exclusiveMin: true });
  }
  if (options.stroke !== undefined) {
    assertRecord(options.stroke, "path2d.options.stroke");
    assertOptionalFiniteNumber(options.stroke.width, "path2d.options.stroke.width", { min: 0 });
    assertOptionalFiniteNumber(options.stroke.miterLimit, "path2d.options.stroke.miterLimit", { min: 0 });
    assertOpacity(options.stroke.opacity, "path2d.options.stroke.opacity");
    assertGradient(options.stroke.gradient, "path2d.options.stroke.gradient");
    if (options.stroke.dashArray !== undefined) {
      assertCollection(options.stroke.dashArray, "path2d.options.stroke.dashArray", { limit: "maxCollectionItems" });
    }
  }
  if (options.fill !== undefined) {
    assertRecord(options.fill, "path2d.options.fill");
    assertOpacity(options.fill.opacity, "path2d.options.fill.opacity");
    assertGradient(options.fill.gradient, "path2d.options.fill.gradient");
  }
}

function canvasBuffer(input: CanvasResults | Buffer): Buffer {
  if (Buffer.isBuffer(input)) {
    if (input.length === 0) throw new ApexifyInputError("path2d.draw.canvasBuffer must be non-empty.");
    return input;
  }
  if (input && typeof input === "object" && Buffer.isBuffer(input.buffer) && input.buffer.length > 0) return input.buffer;
  throw new ApexifyInputError("path2d.draw.canvasBuffer must be a non-empty Buffer or CanvasResults.");
}

function clamp01(n: number): number {
  if (n == null || Number.isNaN(Number(n))) return 1;
  return Math.min(1, Math.max(0, Number(n)));
}

function applyCanvasShadow(
  ctx: SKRSContext2D,
  s: NonNullable<Path2DDrawOptions["shadow"]>,
  gradBounds: { x: number; y: number; w: number; h: number }
): void {
  if (s.gradient) {
    const paint = createGradientFill(ctx, s.gradient, gradBounds);
    (ctx as unknown as { shadowColor: typeof paint }).shadowColor = paint;
  } else if (s.color !== undefined) {
    ctx.shadowColor = s.color;
  }
  ctx.shadowBlur = s.blur ?? 0;
  ctx.shadowOffsetX = s.offsetX ?? 0;
  ctx.shadowOffsetY = s.offsetY ?? 0;
}

export class Path2DCreator {
  createPath2D(commands: PathCommand[]): Path2D {
    assertCollection(commands, "path2d.commands", { limit: "maxCollectionItems" });
    assertFiniteNumericLeaves(commands, "path2d.commands");
    try {
      return buildPath2DFromCommands(commands);
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyInputError("Path2D commands are invalid.", { cause: error });
    }
  }

  drawPathOntoContext(
    ctx: SKRSContext2D,
    path: Path2D | PathCommand[],
    canvasSize: { width: number; height: number },
    options?: Path2DDrawOptions
  ): void {
    validatePathCommands(path, "path2d.path");
    validateDrawOptions(options);
    assertCanvasResourceLimits(canvasSize.width, canvasSize.height);
    const path2D = Array.isArray(path) ? this.createPath2D(path) : path;

    ctx.save();
    if (options?.transform) {
      const { translateX, translateY, rotate, scaleX, scaleY, originX, originY } = options.transform;
      if (originX !== undefined && originY !== undefined) {
        ctx.translate(originX, originY);
        if (rotate !== undefined) ctx.rotate((rotate * Math.PI) / 180);
        if (scaleX !== undefined || scaleY !== undefined) ctx.scale(scaleX ?? 1, scaleY ?? 1);
        ctx.translate(-originX, -originY);
      } else {
        if (translateX !== undefined || translateY !== undefined) ctx.translate(translateX ?? 0, translateY ?? 0);
        if (rotate !== undefined) ctx.rotate((rotate * Math.PI) / 180);
        if (scaleX !== undefined || scaleY !== undefined) ctx.scale(scaleX ?? 1, scaleY ?? 1);
      }
    }

    const rootOpacity = clamp01(options?.opacity ?? 1);
    const gradBounds = options?.gradientBounds ?? { x: 0, y: 0, w: canvasSize.width, h: canvasSize.height };
    if (options?.globalCompositeOperation) ctx.globalCompositeOperation = options.globalCompositeOperation as GlobalCompositeOperation;
    if (options?.shadow) applyCanvasShadow(ctx, options.shadow, gradBounds);

    if (options?.stroke) {
      const stroke = options.stroke;
      if (stroke.gradient) ctx.strokeStyle = createGradientFill(ctx, stroke.gradient, gradBounds);
      else if (stroke.color) ctx.strokeStyle = stroke.color;
      if (stroke.width !== undefined) ctx.lineWidth = stroke.width;
      if (stroke.lineCap) ctx.lineCap = stroke.lineCap;
      if (stroke.lineJoin) ctx.lineJoin = stroke.lineJoin;
      if (stroke.miterLimit !== undefined) ctx.miterLimit = stroke.miterLimit;
      if (stroke.dashArray && stroke.dashArray.length > 0) ctx.setLineDash(stroke.dashArray);
      else if (stroke.style === "dashed") ctx.setLineDash([10, 6]);
      else if (stroke.style === "dotted") ctx.setLineDash([2, 5]);
      else ctx.setLineDash([]);
      if (stroke.dashOffset !== undefined) ctx.lineDashOffset = stroke.dashOffset;
      ctx.globalAlpha = rootOpacity * clamp01(stroke.opacity ?? 1);
      ctx.stroke(path2D);
      ctx.setLineDash([]);
    }

    if (options?.fill) {
      const fill = options.fill;
      if (fill.gradient) ctx.fillStyle = createGradientFill(ctx, fill.gradient, gradBounds);
      else if (fill.color) ctx.fillStyle = fill.color;
      ctx.globalAlpha = rootOpacity * clamp01(fill.opacity ?? 1);
      if (fill.rule) ctx.fill(path2D, fill.rule);
      else ctx.fill(path2D);
    }
    ctx.restore();
  }

  async drawPath(
    canvasBufferInput: CanvasResults | Buffer,
    path: Path2D | PathCommand[],
    options?: Path2DDrawOptions
  ): Promise<Buffer> {
    validatePathCommands(path, "path2d.path");
    validateDrawOptions(options);
    try {
      const image: Image = await loadImageCached(canvasBuffer(canvasBufferInput));
      assertCanvasResourceLimits(image.width, image.height);
      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);
      this.drawPathOntoContext(ctx, path, { width: image.width, height: image.height }, options);
      return canvas.toBuffer("image/png");
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("Path2D drawing failed.", { cause: error });
    }
  }
}
