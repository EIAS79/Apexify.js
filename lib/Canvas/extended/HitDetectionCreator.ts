import { createCanvas, SKRSContext2D, Path2D as CanvasPath2D } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import type { CanvasResults } from "./CanvasCreator";
import type { PathCommand } from "./Path2DCreator";

/**
 * Region types for hit detection
 */
export type RegionType =
| 'rect'
| 'circle'
  | 'ellipse' // Ellipse
| 'polygon'
| 'path'
| 'custom';

/**
 * Base region configuration
 */
export interface BaseRegion {
  type: RegionType;
}

/**
 * Rectangle region
 */
export interface RectRegion extends BaseRegion {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Circle region
 */
export interface CircleRegion extends BaseRegion {
  type: 'circle';
  x: number;
  y: number;
  radius: number;
}

/**
 * Ellipse region
 */
export interface EllipseRegion extends BaseRegion {
  type: 'ellipse';
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation?: number;
}

/**
 * Polygon region
 */
export interface PolygonRegion extends BaseRegion {
  type: 'polygon';
  points: Array<{ x: number; y: number }>;
}

/**
 * Path2D region
 */
export interface PathRegion extends BaseRegion {
  type: 'path';
  path: CanvasPath2D | PathCommand[];
  fillRule?: 'nonzero' | 'evenodd';
}

/**
 * Custom function region
 */
export interface CustomRegion extends BaseRegion {
  type: 'custom';
  /** Custom function that returns true if point is in region */
  check: (x: number, y: number) => boolean;
}

/**
 * Union of all region types
 */
export type HitRegion = RectRegion | CircleRegion | EllipseRegion | PolygonRegion | PathRegion | CustomRegion;

/**
 * Hit detection options
 */
export interface HitDetectionOptions {
  /** Check inside stroke (if applicable) */
  includeStroke?: boolean;
  /** Stroke width for stroke detection */
  strokeWidth?: number;
  /** Tolerance for hit detection (pixels) */
  tolerance?: number;
  /** Custom region to check */
  region?: HitRegion;
}

/**
 * Hit detection result
 */
export interface HitDetectionResult {
  /** Whether the point hits the target */
  hit: boolean;
  /** Distance from point to nearest edge (if hit) */
  distance?: number;
  /** Which part was hit: 'fill', 'stroke', or 'outside' */
  hitType?: 'fill' | 'stroke' | 'outside';
  /** Region that was hit (if using regions) */
  hitRegion?: string | number;
}

/**
 * Extended class for hit detection functionality
 */
export class HitDetectionCreator {
  /**
   * Checks if a point is inside a Path2D object
   * @param path - Path2D object or commands array
   * @param x - X coordinate to test
   * @param y - Y coordinate to test
   * @param options - Hit detection options
   * @returns Hit detection result
   */
  isPointInPath(
    path: CanvasPath2D | PathCommand[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): HitDetectionResult {
    try {

      const canvas = createCanvas(100, 100);
      const ctx = getCanvasContext(canvas);


      const path2D = Array.isArray(path)
        ? this.commandsToPath(ctx, path)
        : path;


      const fillRule = (options as any)?.fillRule || 'nonzero';
      const inFill = ctx.isPointInPath(path2D, x, y, fillRule);


      let inStroke = false;
      if (options?.includeStroke && options?.strokeWidth) {
        inStroke = ctx.isPointInStroke(path2D, x, y);
      }

      const hit = inFill || inStroke;
      const hitType: 'fill' | 'stroke' | 'outside' = inFill ? 'fill' : (inStroke ? 'stroke' : 'outside');

      return {
        hit,
        hitType,
        distance: hit ? 0 : undefined
      };
    } catch (error) {
      throw new Error(`isPointInPath failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Checks if a point is inside a custom region
   * @param region - Region to test against
   * @param x - X coordinate to test
   * @param y - Y coordinate to test
   * @param options - Hit detection options
   * @returns Hit detection result
   */
  isPointInRegion(
    region: HitRegion,
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): HitDetectionResult {
    try {
      let hit = false;
      let hitType: 'fill' | 'stroke' | 'outside' = 'outside';
      let distance = 0;

      switch (region.type) {
        case 'rect':
          hit = this.isPointInRect(x, y, region.x, region.y, region.width, region.height);
          if (hit && options?.includeStroke && options?.strokeWidth) {

            const tolerance = options.tolerance ?? 0;
            const onStroke = this.isPointOnRectStroke(
              x, y,
              region.x, region.y, region.width, region.height,
              options.strokeWidth!,
              tolerance
            );
            hitType = onStroke ? 'stroke' : 'fill';
          }
          break;

        case 'circle':
          distance = Math.sqrt((x - region.x) ** 2 + (y - region.y) ** 2);
          hit = distance <= region.radius;

          if (hit && options?.includeStroke && options?.strokeWidth) {
            const innerRadius = region.radius - options.strokeWidth;
            const inStroke = distance > innerRadius && distance <= region.radius;
            hitType = inStroke ? 'stroke' : 'fill';
          }
          break;

        case 'ellipse':
          hit = this.isPointInEllipse(
            x, y,
            region.x, region.y,
            region.radiusX, region.radiusY,
            region.rotation ?? 0
          );
          break;

        case 'polygon':
          hit = this.isPointInPolygon(x, y, region.points);
          break;

        case 'path':
          const pathOptions: HitDetectionOptions = { ...options };
          return this.isPointInPath(region.path, x, y, pathOptions);

        case 'custom':
          hit = region.check(x, y);
          break;
      }

      return {
        hit,
        hitType: hit ? hitType : 'outside',
        distance: hit ? distance : undefined
      };
    } catch (error) {
      throw new Error(`isPointInRegion failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Checks if a point is inside any of multiple regions
   * @param regions - Array of regions to test
   * @param x - X coordinate to test
   * @param y - Y coordinate to test
   * @param options - Hit detection options
   * @returns Hit detection result with region index
   */
  isPointInAnyRegion(
    regions: HitRegion[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): HitDetectionResult {
    try {
      for (let i = 0; i < regions.length; i++) {
        const result = this.isPointInRegion(regions[i], x, y, options);
        if (result.hit) {
          return {
            ...result,
            hitRegion: i
          };
        }
      }

      return {
        hit: false,
        hitType: 'outside'
      };
    } catch (error) {
      throw new Error(`isPointInAnyRegion failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Gets the distance from a point to the nearest edge of a region
   * @param region - Region to measure distance to
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns Distance in pixels
   */
  getDistanceToRegion(region: HitRegion, x: number, y: number): number {
    switch (region.type) {
      case 'rect':
        return this.distanceToRect(x, y, region.x, region.y, region.width, region.height);
      case 'circle':
        const dist = Math.sqrt((x - region.x) ** 2 + (y - region.y) ** 2);
        return Math.abs(dist - region.radius);
      case 'ellipse':
        return this.distanceToEllipse(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0);
      case 'polygon':
        return this.distanceToPolygon(x, y, region.points);
      default:
        return 0;
    }
  }

  // Helper methods

  private commandsToPath(ctx: SKRSContext2D, commands: PathCommand[]): CanvasPath2D {
    const { Path2D } = require("@napi-rs/canvas");
    const path = new Path2D();

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
        case 'closePath':
          path.closePath();
          break;
        case 'rect':
          path.rect(cmd.x, cmd.y, cmd.width, cmd.height);
          break;
        case 'ellipse':
          path.ellipse(
            cmd.x, cmd.y, cmd.radiusX, cmd.radiusY,
            cmd.rotation ?? 0,
            cmd.startAngle ?? 0, cmd.endAngle ?? Math.PI * 2,
            cmd.counterclockwise ?? false
          );
          break;
        case 'circle':
          path.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2);
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

      }
    }

    return path;
  }

  private isPointInRect(x: number, y: number, rx: number, ry: number, width: number, height: number): boolean {
    return x >= rx && x <= rx + width && y >= ry && y <= ry + height;
  }

  private isPointOnRectStroke(
    x: number, y: number,
    rx: number, ry: number, width: number, height: number,
    strokeWidth: number,
    tolerance: number
  ): boolean {
    const halfStroke = strokeWidth / 2;
    const left = rx - halfStroke - tolerance;
    const right = rx + width + halfStroke + tolerance;
    const top = ry - halfStroke - tolerance;
    const bottom = ry + height + halfStroke + tolerance;
    const innerLeft = rx + halfStroke - tolerance;
    const innerRight = rx + width - halfStroke + tolerance;
    const innerTop = ry + halfStroke - tolerance;
    const innerBottom = ry + height - halfStroke + tolerance;

    return (
      (x >= left && x <= right && y >= top && y <= bottom) &&
      !(x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom)
    );
  }

  private isPointInEllipse(
    x: number, y: number,
    cx: number, cy: number,
    rx: number, ry: number,
    rotation: number
  ): boolean {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const dx = x - cx;
    const dy = y - cy;
    const tx = dx * cos - dy * sin;
    const ty = dx * sin + dy * cos;
    return (tx * tx) / (rx * rx) + (ty * ty) / (ry * ry) <= 1;
  }

  private isPointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
    if (points.length < 3) return false;

    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;

      const intersect = ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private distanceToRect(x: number, y: number, rx: number, ry: number, width: number, height: number): number {
    const dx = Math.max(rx - x, 0, x - (rx + width));
    const dy = Math.max(ry - y, 0, y - (ry + height));
    return Math.sqrt(dx * dx + dy * dy);
  }

  private distanceToEllipse(
    x: number, y: number,
    cx: number, cy: number,
    rx: number, ry: number,
    rotation: number
  ): number {
    // Simplified distance calculation
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const dx = x - cx;
    const dy = y - cy;
    const tx = dx * cos - dy * sin;
    const ty = dx * sin + dy * cos;
    const angle = Math.atan2(ty / ry, tx / rx);
    const ex = cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin;
    const ey = cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos;
    return Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
  }

  private distanceToPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): number {
    if (points.length < 2) return 0;

    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const dist = this.distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y);
      minDist = Math.min(minDist, dist);
    }
    return minDist;
  }

  private distanceToLineSegment(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const A = px - x1;
    const B = py - y1;
    const C = x2 - x1;
    const D = y2 - y1;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;

    if (lenSq !== 0) param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = x1;
      yy = y1;
    } else if (param > 1) {
      xx = x2;
      yy = y2;
    } else {
      xx = x1 + param * C;
      yy = y1 + param * D;
    }

    const dx = px - xx;
    const dy = py - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

