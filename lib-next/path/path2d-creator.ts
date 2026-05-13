import { createCanvas, loadImage, Image, SKRSContext2D, type Path2D } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import type { CanvasResults } from "../canvas/canvas-creator";
import type { PathCommand } from "../foundation/path-cmd";
import { buildPath2DFromCommands } from "../foundation/path-cmd";
import { createGradientFill } from "../render/gradient-fill";
import type { Path2DDrawOptions } from "../types/path2d-draw";

export type { PathCommand } from "../foundation/path-cmd";
export type { Path2DDrawOptions };

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
    try {
      return buildPath2DFromCommands(commands);
    } catch (error) {
      throw new Error(`createPath2D failed: ${getErrorMessage(error)}`);
    }
  }

  drawPathOntoContext(
    ctx: SKRSContext2D,
    path: Path2D | PathCommand[],
    canvasSize: { width: number; height: number },
    options?: Path2DDrawOptions
  ): void {
    const path2D = Array.isArray(path) ? this.createPath2D(path) : path;

    ctx.save();

    if (options?.transform) {
      const { translateX, translateY, rotate, scaleX, scaleY, originX, originY } = options.transform;

      if (originX !== undefined && originY !== undefined) {
        ctx.translate(originX, originY);

        if (rotate !== undefined) {
          ctx.rotate((rotate * Math.PI) / 180);
        }

        if (scaleX !== undefined || scaleY !== undefined) {
          ctx.scale(scaleX ?? 1, scaleY ?? 1);
        }

        ctx.translate(-originX, -originY);
      } else {
        if (translateX !== undefined || translateY !== undefined) {
          ctx.translate(translateX ?? 0, translateY ?? 0);
        }

        if (rotate !== undefined) {
          ctx.rotate((rotate * Math.PI) / 180);
        }

        if (scaleX !== undefined || scaleY !== undefined) {
          ctx.scale(scaleX ?? 1, scaleY ?? 1);
        }
      }
    }

    const rootOpacity = clamp01(options?.opacity ?? 1);
    const gradBounds = options?.gradientBounds ?? {
      x: 0,
      y: 0,
      w: canvasSize.width,
      h: canvasSize.height,
    };

    if (options?.globalCompositeOperation) {
      ctx.globalCompositeOperation = options.globalCompositeOperation as GlobalCompositeOperation;
    }

    if (options?.shadow) {
      applyCanvasShadow(ctx, options.shadow, gradBounds);
    }

    if (options?.stroke) {
      const stroke = options.stroke;

      if (stroke.gradient) {
        ctx.strokeStyle = createGradientFill(ctx, stroke.gradient, gradBounds);
      } else if (stroke.color) {
        ctx.strokeStyle = stroke.color;
      }

      if (stroke.width !== undefined) {
        ctx.lineWidth = stroke.width;
      }

      if (stroke.lineCap) {
        ctx.lineCap = stroke.lineCap;
      }

      if (stroke.lineJoin) {
        ctx.lineJoin = stroke.lineJoin;
      }

      if (stroke.miterLimit !== undefined) {
        ctx.miterLimit = stroke.miterLimit;
      }

      if (stroke.dashArray && stroke.dashArray.length > 0) {
        ctx.setLineDash(stroke.dashArray);
      } else if (stroke.style === "dashed") {
        ctx.setLineDash([10, 6]);
      } else if (stroke.style === "dotted") {
        ctx.setLineDash([2, 5]);
      } else {
        ctx.setLineDash([]);
      }

      if (stroke.dashOffset !== undefined) {
        ctx.lineDashOffset = stroke.dashOffset;
      }

      ctx.globalAlpha = rootOpacity * clamp01(stroke.opacity ?? 1);

      ctx.stroke(path2D);
      ctx.setLineDash([]);
    }

    if (options?.fill) {
      const fill = options.fill;

      if (fill.gradient) {
        ctx.fillStyle = createGradientFill(ctx, fill.gradient, gradBounds);
      } else if (fill.color) {
        ctx.fillStyle = fill.color;
      }

      ctx.globalAlpha = rootOpacity * clamp01(fill.opacity ?? 1);

      if (fill.rule) {
        ctx.fill(path2D, fill.rule);
      } else {
        ctx.fill(path2D);
      }
    }

    ctx.restore();
  }

  async drawPath(
    canvasBuffer: CanvasResults | Buffer,
    path: Path2D | PathCommand[],
    options?: Path2DDrawOptions
  ): Promise<Buffer> {
    try {
      if (!canvasBuffer) {
        throw new Error("drawPath: canvasBuffer is required.");
      }

      const image: Image = Buffer.isBuffer(canvasBuffer)
        ? await loadImage(canvasBuffer)
        : await loadImage((canvasBuffer as CanvasResults).buffer);

      const canvas = createCanvas(image.width, image.height);
      const ctx = getCanvasContext(canvas);
      ctx.drawImage(image, 0, 0);

      const path2D = Array.isArray(path) ? this.createPath2D(path) : path;

      this.drawPathOntoContext(ctx, path2D, { width: image.width, height: image.height }, options);

      return canvas.toBuffer("image/png");
    } catch (error) {
      throw new Error(`drawPath failed: ${getErrorMessage(error)}`);
    }
  }
}
