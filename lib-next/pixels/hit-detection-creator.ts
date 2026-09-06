import { createCanvas, type Path2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { PathCommand } from "../foundation/path-cmd";
import { buildPath2DFromCommands } from "../foundation/path-cmd";
import { validatePathCommands } from "../path/path-validation";
import type { HitDetectionOptions, HitDetectionResult, HitRegion } from "../types";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { assertCollection, assertFiniteNumber, assertOptionalFiniteNumber, assertRecord } from "../runtime/validation";

const EDGE_EPSILON = 1e-9;

function validatePath(path: Path2D | PathCommand[], name: string): void {
  if (Array.isArray(path)) validatePathCommands(path, name);
}

function validateOptions(options: HitDetectionOptions | undefined, name: string): void {
  if (options === undefined) return;
  assertRecord(options, name);
  if (options.includeStroke !== undefined && typeof options.includeStroke !== "boolean") throw new ApexifyInputError(`${name}.includeStroke must be boolean.`);
  assertOptionalFiniteNumber(options.strokeWidth, `${name}.strokeWidth`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(options.tolerance, `${name}.tolerance`, { min: 0 });
  if (options.fillRule !== undefined && options.fillRule !== "nonzero" && options.fillRule !== "evenodd") {
    throw new ApexifyInputError(`${name}.fillRule must be nonzero or evenodd.`);
  }
}

function validatePoint(point: unknown, name: string): void {
  assertRecord(point, name);
  assertFiniteNumber(point.x, `${name}.x`);
  assertFiniteNumber(point.y, `${name}.y`);
}

function validateRegion(region: HitRegion, name: string): void {
  assertRecord(region, name);
  switch (region.type) {
    case "rect":
      assertFiniteNumber(region.x, `${name}.x`); assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.width, `${name}.width`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(region.height, `${name}.height`, { min: 0, exclusiveMin: true });
      return;
    case "circle":
      assertFiniteNumber(region.x, `${name}.x`); assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.radius, `${name}.radius`, { min: 0, exclusiveMin: true });
      return;
    case "ellipse":
      assertFiniteNumber(region.x, `${name}.x`); assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.radiusX, `${name}.radiusX`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(region.radiusY, `${name}.radiusY`, { min: 0, exclusiveMin: true });
      assertOptionalFiniteNumber(region.rotation, `${name}.rotation`);
      return;
    case "polygon":
      assertCollection(region.points, `${name}.points`, { min: 3, limit: "maxCollectionItems" });
      region.points.forEach((point, index) => validatePoint(point, `${name}.points[${index}]`));
      return;
    case "path":
      validatePath(region.path, `${name}.path`);
      if (region.fillRule !== undefined && region.fillRule !== "nonzero" && region.fillRule !== "evenodd") throw new ApexifyInputError(`${name}.fillRule must be nonzero or evenodd.`);
      return;
    case "custom":
      if (typeof region.check !== "function") throw new ApexifyInputError(`${name}.check must be a function.`);
      return;
    default:
      throw new ApexifyInputError(`${name}.type is unsupported.`);
  }
}

function rethrowHitError(error: unknown, message: string): never {
  if (error instanceof ApexifyError) throw error;
  throw new ApexifyInputError(message, { cause: error });
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

export class HitDetectionCreator {
  isPointInPath(path: Path2D | PathCommand[], x: number, y: number, options?: HitDetectionOptions): HitDetectionResult {
    validatePath(path, "detect.path");
    assertFiniteNumber(x, "detect.path.x"); assertFiniteNumber(y, "detect.path.y");
    validateOptions(options, "detect.path.options");
    try {
      assertCanvasResourceLimits(1, 1);
      const ctx = getCanvasContext(createCanvas(1, 1));
      const path2D = Array.isArray(path) ? buildPath2DFromCommands(path) : path;
      const inFill = ctx.isPointInPath(path2D, x, y, options?.fillRule ?? "nonzero");
      let inStroke = false;
      if (options?.includeStroke && options.strokeWidth !== undefined) {
        ctx.lineWidth = options.strokeWidth + 2 * (options.tolerance ?? 0);
        inStroke = ctx.isPointInStroke(path2D, x, y);
      }
      return { hit: inFill || inStroke, hitType: inFill ? "fill" : inStroke ? "stroke" : "outside", distance: inFill || inStroke ? 0 : undefined };
    } catch (error) {
      rethrowHitError(error, "Hit detection path evaluation failed.");
    }
  }

  isPointInRegion(region: HitRegion, x: number, y: number, options?: HitDetectionOptions): HitDetectionResult {
    validateRegion(region, "detect.region");
    assertFiniteNumber(x, "detect.region.x"); assertFiniteNumber(y, "detect.region.y");
    validateOptions(options, "detect.region.options");
    try {
      if (region.type === "path") return this.isPointInPath(region.path, x, y, { ...options, fillRule: region.fillRule ?? options?.fillRule });
      const tolerance = options?.tolerance ?? 0;
      let hit = false;
      let stroke = false;
      let distance = 0;
      switch (region.type) {
        case "rect": {
          hit = x >= region.x - tolerance && x <= region.x + region.width + tolerance && y >= region.y - tolerance && y <= region.y + region.height + tolerance;
          if (hit && options?.includeStroke && options.strokeWidth !== undefined) stroke = this.isPointOnRectStroke(x, y, region.x, region.y, region.width, region.height, options.strokeWidth, tolerance);
          distance = hit ? 0 : this.distanceToRect(x, y, region.x, region.y, region.width, region.height);
          break;
        }
        case "circle": {
          const radial = Math.sqrt(distanceSq(x, y, region.x, region.y));
          hit = radial <= region.radius + tolerance;
          if (hit && options?.includeStroke && options.strokeWidth !== undefined) stroke = Math.abs(radial - region.radius) <= options.strokeWidth / 2 + tolerance;
          distance = hit ? 0 : radial - region.radius;
          break;
        }
        case "ellipse": {
          hit = this.isPointInEllipse(x, y, region.x, region.y, region.radiusX + tolerance, region.radiusY + tolerance, region.rotation ?? 0);
          distance = hit ? 0 : this.distanceToEllipseBoundary(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0);
          break;
        }
        case "polygon": {
          hit = this.isPointInPolygonInclusive(x, y, region.points, tolerance);
          distance = hit ? 0 : this.distanceToPolygonBoundary(x, y, region.points);
          break;
        }
        case "custom":
          hit = region.check(x, y);
          if (typeof hit !== "boolean") throw new ApexifyInputError("detect.region custom check must return boolean.");
          distance = hit ? 0 : undefined as never;
          break;
      }
      return { hit, hitType: hit ? (stroke ? "stroke" : "fill") : "outside", distance: hit ? 0 : Number.isFinite(distance) ? distance : undefined };
    } catch (error) {
      rethrowHitError(error, "Hit detection region evaluation failed.");
    }
  }

  isPointInAnyRegion(regions: HitRegion[], x: number, y: number, options?: HitDetectionOptions): HitDetectionResult {
    assertCollection(regions, "detect.anyRegion.regions", { min: 1, limit: "maxCollectionItems" });
    regions.forEach((region, index) => validateRegion(region, `detect.anyRegion.regions[${index}]`));
    assertFiniteNumber(x, "detect.anyRegion.x"); assertFiniteNumber(y, "detect.anyRegion.y");
    validateOptions(options, "detect.anyRegion.options");
    for (let i = 0; i < regions.length; i++) {
      const result = this.isPointInRegion(regions[i]!, x, y, options);
      if (result.hit) return { ...result, hitRegion: i };
    }
    return { hit: false, hitType: "outside" };
  }

  /** Distance to the filled region: zero inside/on-boundary, positive outside. Path/custom distance is intentionally unsupported. */
  getDistanceToRegion(region: HitRegion, x: number, y: number): number {
    validateRegion(region, "detect.distance.region");
    assertFiniteNumber(x, "detect.distance.x"); assertFiniteNumber(y, "detect.distance.y");
    switch (region.type) {
      case "rect": return this.distanceToRect(x, y, region.x, region.y, region.width, region.height);
      case "circle": return Math.max(0, Math.sqrt(distanceSq(x, y, region.x, region.y)) - region.radius);
      case "ellipse": return this.isPointInEllipse(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0) ? 0 : this.distanceToEllipseBoundary(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0);
      case "polygon": return this.isPointInPolygonInclusive(x, y, region.points, 0) ? 0 : this.distanceToPolygonBoundary(x, y, region.points);
      case "path":
      case "custom": throw new ApexifyInputError(`detect.distance does not support ${region.type} regions because no reliable distance metric is defined.`);
    }
  }

  private isPointOnRectStroke(x: number, y: number, rx: number, ry: number, width: number, height: number, strokeWidth: number, tolerance: number): boolean {
    const half = strokeWidth / 2 + tolerance;
    const outer = x >= rx - half && x <= rx + width + half && y >= ry - half && y <= ry + height + half;
    const inner = x > rx + half && x < rx + width - half && y > ry + half && y < ry + height - half;
    return outer && !inner;
  }

  private isPointInEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation: number): boolean {
    const cos = Math.cos(-rotation), sin = Math.sin(-rotation), dx = x - cx, dy = y - cy;
    const tx = dx * cos - dy * sin, ty = dx * sin + dy * cos;
    return (tx * tx) / (rx * rx) + (ty * ty) / (ry * ry) <= 1 + EDGE_EPSILON;
  }

  private isPointInPolygonInclusive(x: number, y: number, points: Array<{ x: number; y: number }>, tolerance: number): boolean {
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      if (this.distanceToLineSegment(x, y, a.x, a.y, b.x, b.y) <= tolerance + EDGE_EPSILON) return true;
    }
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!, b = points[j]!;
      if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  }

  private distanceToRect(x: number, y: number, rx: number, ry: number, width: number, height: number): number {
    const dx = Math.max(rx - x, 0, x - (rx + width));
    const dy = Math.max(ry - y, 0, y - (ry + height));
    return Math.sqrt(dx * dx + dy * dy);
  }

  private distanceToEllipseBoundary(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation: number): number {
    const cos = Math.cos(-rotation), sin = Math.sin(-rotation), dx = x - cx, dy = y - cy;
    const tx = dx * cos - dy * sin, ty = dx * sin + dy * cos;
    const angle = Math.atan2(ty * rx, tx * ry);
    const localX = rx * Math.cos(angle), localY = ry * Math.sin(angle);
    const ex = cx + localX * cos - localY * sin;
    const ey = cy + localX * sin + localY * cos;
    return Math.sqrt(distanceSq(x, y, ex, ey));
  }

  private distanceToPolygonBoundary(x: number, y: number, points: Array<{ x: number; y: number }>): number {
    let min = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      min = Math.min(min, this.distanceToLineSegment(x, y, a.x, a.y, b.x, b.y));
    }
    return min;
  }

  private distanceToLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const vx = x2 - x1, vy = y2 - y1;
    const lengthSquared = vx * vx + vy * vy;
    if (lengthSquared === 0) return Math.sqrt(distanceSq(px, py, x1, y1));
    const t = Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / lengthSquared));
    return Math.sqrt(distanceSq(px, py, x1 + t * vx, y1 + t * vy));
  }
}

export { HitDetectionCreator as HitDetectionService };
