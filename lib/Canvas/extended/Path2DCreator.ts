import { createCanvas, loadImage, SKRSContext2D, Image, Path2D as CanvasPath2D } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import type { CanvasResults } from "./CanvasCreator";

/**
 * Path command types for building Path2D objects
 */
export type PathCommand =
  | { type: 'moveTo'; x: number; y: number }
  | { type: 'lineTo'; x: number; y: number }
  | { type: 'arc'; x: number; y: number; radius: number; startAngle: number; endAngle: number; counterclockwise?: boolean }
  | { type: 'arcTo'; x1: number; y1: number; x2: number; y2: number; radius: number }
  | { type: 'quadraticCurveTo'; cpx: number; cpy: number; x: number; y: number }
  | { type: 'bezierCurveTo'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number }
  | { type: 'rect'; x: number; y: number; width: number; height: number }
  | { type: 'ellipse'; x: number; y: number; radiusX: number; radiusY: number; rotation?: number; startAngle?: number; endAngle?: number; counterclockwise?: boolean }
  | { type: 'closePath' }
  | { type: 'circle'; x: number; y: number; radius: number }
  | { type: 'roundedRect'; x: number; y: number; width: number; height: number; radius: number | { tl?: number; tr?: number; br?: number; bl?: number } }
  | { type: 'polygon'; points: Array<{ x: number; y: number }> }
  | { type: 'star'; x: number; y: number; outerRadius: number; innerRadius: number; points: number }
  | { type: 'arrow'; x: number; y: number; length: number; angle: number; headLength?: number; headAngle?: number };

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
  createPath2D(commands: PathCommand[]): CanvasPath2D {
    try {
      const path = new CanvasPath2D();

      for (const cmd of commands) {
        switch (cmd.type) {
          case 'moveTo':
            path.moveTo(cmd.x, cmd.y);
            break;
          case 'lineTo':
            path.lineTo(cmd.x, cmd.y);
            break;
          case 'arc':
            path.arc(cmd.x, cmd.y, cmd.radius, cmd.startAngle, cmd.endAngle, cmd.counterclockwise ?? false);
            break;
          case 'arcTo':
            path.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.radius);
            break;
          case 'quadraticCurveTo':
            path.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y);
            break;
          case 'bezierCurveTo':
            path.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y);
            break;
          case 'rect':
            path.rect(cmd.x, cmd.y, cmd.width, cmd.height);
            break;
          case 'ellipse':
            path.ellipse(
              cmd.x,
              cmd.y,
              cmd.radiusX,
              cmd.radiusY,
              cmd.rotation ?? 0,
              cmd.startAngle ?? 0,
              cmd.endAngle ?? Math.PI * 2,
              cmd.counterclockwise ?? false
            );
            break;
          case 'closePath':
            path.closePath();
            break;
          case 'circle':
            path.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2);
            break;
          case 'roundedRect':
            this.createRoundedRect(path, cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius);
            break;
          case 'polygon':
            if (cmd.points.length > 0) {
              path.moveTo(cmd.points[0].x, cmd.points[0].y);
              for (let i = 1; i < cmd.points.length; i++) {
                path.lineTo(cmd.points[i].x, cmd.points[i].y);
              }
              path.closePath();
            }
            break;
          case 'star':
            this.createStar(path, cmd.x, cmd.y, cmd.outerRadius, cmd.innerRadius, cmd.points);
            break;
          case 'arrow':
            this.createArrow(path, cmd.x, cmd.y, cmd.length, cmd.angle, cmd.headLength, cmd.headAngle);
            break;
        }
      }

      return path;
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
    path: CanvasPath2D | PathCommand[],
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

        if (stroke.opacity !== undefined) {
          ctx.globalAlpha = stroke.opacity;
        }

        ctx.stroke(path2D);
      }


      if (options?.fill) {
        const fill = options.fill;

        if (fill.color) {
          ctx.fillStyle = fill.color;
        }

        if (fill.rule) {
          ctx.fill(path2D, fill.rule);
        } else {
          ctx.fill(path2D);
        }

        if (fill.opacity !== undefined) {
          ctx.globalAlpha = fill.opacity;
        }
      }

      ctx.restore();

      return canvas.toBuffer("image/png");
    } catch (error) {
      throw new Error(`drawPath failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Helper: Creates a rounded rectangle path
   * @private
   */
  private createRoundedRect(
    path: CanvasPath2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number | { tl?: number; tr?: number; br?: number; bl?: number }
  ): void {
    if (typeof radius === 'number') {
      const r = Math.min(radius, width / 2, height / 2);
      path.moveTo(x + r, y);
      path.lineTo(x + width - r, y);
      path.quadraticCurveTo(x + width, y, x + width, y + r);
      path.lineTo(x + width, y + height - r);
      path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
      path.lineTo(x + r, y + height);
      path.quadraticCurveTo(x, y + height, x, y + height - r);
      path.lineTo(x, y + r);
      path.quadraticCurveTo(x, y, x + r, y);
    } else {
      const tl = radius.tl ?? 0;
      const tr = radius.tr ?? 0;
      const br = radius.br ?? 0;
      const bl = radius.bl ?? 0;

      path.moveTo(x + tl, y);
      path.lineTo(x + width - tr, y);
      path.quadraticCurveTo(x + width, y, x + width, y + tr);
      path.lineTo(x + width, y + height - br);
      path.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
      path.lineTo(x + bl, y + height);
      path.quadraticCurveTo(x, y + height, x, y + height - bl);
      path.lineTo(x, y + tl);
      path.quadraticCurveTo(x, y, x + tl, y);
    }
    path.closePath();
  }

  /**
   * Helper: Creates a star path
   * @private
   */
  private createStar(
    path: CanvasPath2D,
    x: number,
    y: number,
    outerRadius: number,
    innerRadius: number,
    points: number
  ): void {
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;

      if (i === 0) {
        path.moveTo(px, py);
      } else {
        path.lineTo(px, py);
      }
    }
    path.closePath();
  }

  /**
   * Helper: Creates an arrow path
   * @private
   */
  private createArrow(
    path: CanvasPath2D,
    x: number,
    y: number,
    length: number,
    angle: number,
    headLength?: number,
    headAngle?: number
  ): void {
    const headLen = headLength ?? length * 0.3;
    const headAng = (headAngle ?? 45) * (Math.PI / 180);
    const rad = (angle * Math.PI) / 180;

    const endX = x + Math.cos(rad) * length;
    const endY = y + Math.sin(rad) * length;

    path.moveTo(x, y);
    path.lineTo(endX, endY);


    const leftX = endX - Math.cos(rad - headAng) * headLen;
    const leftY = endY - Math.sin(rad - headAng) * headLen;
    const rightX = endX - Math.cos(rad + headAng) * headLen;
    const rightY = endY - Math.sin(rad + headAng) * headLen;

    path.moveTo(endX, endY);
    path.lineTo(leftX, leftY);
    path.moveTo(endX, endY);
    path.lineTo(rightX, rightY);
  }
}

