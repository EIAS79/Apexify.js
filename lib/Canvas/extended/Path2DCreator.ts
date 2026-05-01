import { createCanvas, loadImage, Image } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../utils/core/errorUtils";
import type { CanvasResults } from "./CanvasCreator";
import type { PathCommand } from "../utils/core/pathCmd";
import { buildPath2DFromCommands } from "../utils/core/pathCmd";

export type { PathCommand } from "../utils/core/pathCmd";

/**
 * Path2D drawing options
 */
export interface Path2DDrawOptions {
  /** Stroke options */
  stroke?: {
    color?: string;
    width?: number;
    lineCap?: 'butt' | 'round' | 'square';
    lineJoin?: 'bevel' | 'round' | 'miter';
    miterLimit?: number;
    dashArray?: number[];
    dashOffset?: number;
    opacity?: number;
  };
  /** Fill options */
  fill?: {
    color?: string;
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
   * Draws a Path2D object onto a canvas buffer
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param path - Path2D object or commands array
   * @param options - Drawing options (stroke, fill, transform)
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


      if (options?.stroke) {
        const stroke = options.stroke;

        if (stroke.color) {
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

        if (stroke.dashArray) {
          ctx.setLineDash(stroke.dashArray);
        }

        if (stroke.dashOffset !== undefined) {
          ctx.lineDashOffset = stroke.dashOffset;
        }

        ctx.globalAlpha = stroke.opacity !== undefined ? stroke.opacity : 1;

        ctx.stroke(path2D);
      }


      if (options?.fill) {
        const fill = options.fill;

        if (fill.color) {
          ctx.fillStyle = fill.color;
        }

        ctx.globalAlpha = fill.opacity !== undefined ? fill.opacity : 1;

        if (fill.rule) {
          ctx.fill(path2D, fill.rule);
        } else {
          ctx.fill(path2D);
        }
      }

      ctx.restore();

      return canvas.toBuffer("image/png");
    } catch (error) {
      throw new Error(`drawPath failed: ${getErrorMessage(error)}`);
    }
  }
}

