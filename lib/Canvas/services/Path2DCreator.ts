import { createCanvas, loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../utils/foundation/errorUtils";
import type { CanvasResults } from "./CanvasCreator";
import type { PathCommand } from "../utils/foundation/pathCmd";
import { buildPath2DFromCommands } from "../utils/foundation/pathCmd";
import type { gradient as GradientSpec } from "../utils/types";
import { createGradientFill } from "../utils/image/imageProperties";

export type { PathCommand } from "../utils/foundation/pathCmd";

function clamp01(n: number): number {
  if (n == null || Number.isNaN(Number(n))) return 1;
  return Math.min(1, Math.max(0, Number(n)));
}

/**
 * Path2D drawing options
 */
export interface Path2DDrawOptions {
  /**
   * Multiplies both stroke and fill alpha (0–1). Combines with `stroke.opacity` / `fill.opacity` as
   * `globalAlpha = opacity * stroke.opacity` (per operation).
   */
  opacity?: number;
  /**
   * Canvas blend mode while stroking/filling (e.g. `multiply`, `screen`, `overlay`). Default `source-over`.
   */
  globalCompositeOperation?: string;
  /**
   * Drop shadow for stroke/fill on this path. Uses the same **`gradientBounds`** as stroke/fill when
   * `gradient` is set. Provide **`color`** and/or **`gradient`** (gradient wins if both).
   */
  shadow?: {
    color?: string;
    gradient?: GradientSpec;
    blur?: number;
    offsetX?: number;
    offsetY?: number;
  };
  /**
   * Bounding box for `stroke.gradient`, `fill.gradient`, and `shadow.gradient` in **canvas coordinates**.
   * Defaults to the full buffer `{ x:0, y:0, w, h }`.
   */
  gradientBounds?: { x: number; y: number; w: number; h: number };
  /** Stroke options */
  stroke?: {
    color?: string;
    /** Linear / radial / conic stroke paint (use `gradientBounds` or full canvas). */
    gradient?: GradientSpec;
    width?: number;
    lineCap?: 'butt' | 'round' | 'square';
    lineJoin?: 'bevel' | 'round' | 'miter';
    miterLimit?: number;
    /** Ignored when `dashArray` is set. */
    style?: 'solid' | 'dashed' | 'dotted';
    dashArray?: number[];
    dashOffset?: number;
    opacity?: number;
  };
  /** Fill options */
  fill?: {
    color?: string;
    gradient?: GradientSpec;
    opacity?: number;
    rule?: 'nonzero' | 'evenodd';
  };
  /** Transform options */
  transform?: {
    translateX?: number;
    translateY?: number;
    rotate?: number; // degrees
    scaleX?: number;
    scaleY?: number;
    originX?: number; // rotation/scale origin
    originY?: number;
  };
}

function applyCanvasShadow(
  ctx: SKRSContext2D,
  s: NonNullable<Path2DDrawOptions["shadow"]>,
  gradBounds: { x: number; y: number; w: number; h: number }
): void {
  if (s.gradient) {
    const paint = createGradientFill(ctx, s.gradient, gradBounds);
    // Skia: shadow paint can be a gradient; typings often only expose `string`.
    (ctx as unknown as { shadowColor: typeof paint }).shadowColor = paint;
  } else if (s.color !== undefined) {
    ctx.shadowColor = s.color;
  }
  ctx.shadowBlur = s.blur ?? 0;
  ctx.shadowOffsetX = s.offsetX ?? 0;
  ctx.shadowOffsetY = s.offsetY ?? 0;
}

/**
 * Extended class for Path2D functionality
 */
export class Path2DCreator {
  /**
   * Creates a Path2D object from commands
   * @param commands - Array of path commands
   * @returns Path2D object
   */
  createPath2D(commands: PathCommand[]): any {
    try {
      return buildPath2DFromCommands(commands);
    } catch (error) {
      throw new Error(`createPath2D failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Draws path stroke/fill onto an existing 2D context. Used by {@link drawPath} and scene rendering.
   */
  drawPathOntoContext(
    ctx: SKRSContext2D,
    path: any | PathCommand[],
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

  /**
   * Draws a Path2D object onto a canvas buffer
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param path - Path2D object or commands array
   * @param options - Stroke/fill/transform, root `opacity`, `shadow`, `globalCompositeOperation`, gradients
   * @returns New canvas buffer with path drawn
   */
  async drawPath(
    canvasBuffer: CanvasResults | Buffer,
    path: any | PathCommand[],
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

