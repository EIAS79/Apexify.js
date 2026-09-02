import { createCanvas, type Path2D } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { PathCommand } from "../foundation/path-cmd";
import { buildPath2DFromCommands } from "../foundation/path-cmd";
import type { HitDetectionOptions, HitDetectionResult, HitRegion } from "../types";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection,
  assertFiniteNumber,
  assertFiniteNumericLeaves,
  assertOptionalFiniteNumber,
  assertRecord,
} from "../runtime/validation";

function validatePath(path: Path2D | PathCommand[], name: string): void {
  if (!Array.isArray(path)) return;
  assertWithinLimit("maxCollectionItems", path.length);
  assertFiniteNumericLeaves(path, name);
}

function validateOptions(options: HitDetectionOptions | undefined, name: string): void {
  if (options === undefined) return;
  assertRecord(options, name);
  if (options.includeStroke !== undefined && typeof options.includeStroke !== "boolean") {
    throw new ApexifyInputError(`${name}.includeStroke must be boolean.`);
  }
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
      assertFiniteNumber(region.x, `${name}.x`);
      assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.width, `${name}.width`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(region.height, `${name}.height`, { min: 0, exclusiveMin: true });
      return;
    case "circle":
      assertFiniteNumber(region.x, `${name}.x`);
      assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.radius, `${name}.radius`, { min: 0, exclusiveMin: true });
      return;
    case "ellipse":
      assertFiniteNumber(region.x, `${name}.x`);
      assertFiniteNumber(region.y, `${name}.y`);
      assertFiniteNumber(region.radiusX, `${name}.radiusX`, { min: 0, exclusiveMin: true });
      assertFiniteNumber(region.radiusY, `${name}.radiusY`, { min: 0, exclusiveMin: true });
      assertOptionalFiniteNumber(region.rotation, `${name}.rotation`);
      return;
    case "polygon":
      assertCollection(region.points, `${name}.points`, { min: 3, limit: "maxCollectionItems" });
      region.points.forEach((point, i) => validatePoint(point, `${name}.points[${i}]`));
      return;
    case "path":
      validatePath(region.path, `${name}.path`);
      if (region.fillRule !== undefined && region.fillRule !== "nonzero" && region.fillRule !== "evenodd") {
        throw new ApexifyInputError(`${name}.fillRule must be nonzero or evenodd.`);
      }
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

export class HitDetectionCreator {
  isPointInPath(
    path: Path2D | PathCommand[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): HitDetectionResult {
    validatePath(path, "detect.path");
    assertFiniteNumber(x, "detect.path.x");
    assertFiniteNumber(y, "detect.path.y");
    validateOptions(options, "detect.path.options");
    try {
      assertCanvasResourceLimits(1, 1);
      const canvas = createCanvas(1, 1);
      const ctx = getCanvasContext(canvas);
      const path2D = Array.isArray(path) ? buildPath2DFromCommands(path) : path;
      const fillRule = options?.fillRule ?? "nonzero";
      const inFill = ctx.isPointInPath(path2D, x, y, fillRule);
      let inStroke = false;
      if (options?.includeStroke && options.strokeWidth) {
        ctx.lineWidth = options.strokeWidth;
        inStroke = ctx.isPointInStroke(path2D, x, y);
      }
      const hit = inFill || inStroke;
      return { hit, hitType: inFill ? "fill" : inStroke ? "stroke" : "outside", distance: hit ? 0 : undefined };
    } catch (error) {
      rethrowHitError(error, "Hit detection path evaluation failed.");
    }
  }

  isPointInRegion(region: HitRegion, x: number, y: number, options?: HitDetectionOptions): HitDetectionResult {
    validateRegion(region, "detect.region");
    assertFiniteNumber(x, "detect.region.x");
    assertFiniteNumber(y, "detect.region.y");
    validateOptions(options, "detect.region.options");
    try {
      let hit = false;
      let hitType: "fill" | "stroke" | "outside" = "outside";
      let distance = 0;
      switch (region.type) {
        case "rect":
          hit = this.isPointInRect(x, y, region.x, region.y, region.width, region.height);
          if (hit && options?.includeStroke && options.strokeWidth) {
            const onStroke = this.isPointOnRectStroke(
              x, y, region.x, region.y, region.width, region.height, options.strokeWidth, options.tolerance ?? 0
            );
            hitType = onStroke ? "stroke" : "fill";
          }
          break;
        case "circle":
          distance = Math.sqrt((x - region.x) ** 2 + (y - region.y) ** 2);
          hit = distance <= region.radius;
          if (hit && options?.includeStroke && options.strokeWidth) {
            hitType = distance > region.radius - options.strokeWidth ? "stroke" : "fill";
          }
          break;
        case "ellipse":
          hit = this.isPointInEllipse(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0);
          break;
        case "polygon":
          hit = this.isPointInPolygon(x, y, region.points);
          break;
        case "path":
          return this.isPointInPath(region.path, x, y, { ...options, fillRule: region.fillRule ?? options?.fillRule });
        case "custom":
          hit = region.check(x, y);
          break;
      }
      return { hit, hitType: hit ? hitType : "outside", distance: hit ? distance : undefined };
    } catch (error) {
      rethrowHitError(error, "Hit detection region evaluation failed.");
    }
  }

  isPointInAnyRegion(
    regions: HitRegion[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): HitDetectionResult {
    assertCollection(regions, "detect.anyRegion.regions", { min: 1, limit: "maxCollectionItems" });
    regions.forEach((region, i) => validateRegion(region, `detect.anyRegion.regions[${i}]`));
    assertFiniteNumber(x, "detect.anyRegion.x");
    assertFiniteNumber(y, "detect.anyRegion.y");
    validateOptions(options, "detect.anyRegion.options");
    for (let i = 0; i < regions.length; i++) {
      const result = this.isPointInRegion(regions[i]!, x, y, options);
      if (result.hit) return { ...result, hitRegion: i };
    }
    return { hit: false, hitType: "outside" };
  }

  getDistanceToRegion(region: HitRegion, x: number, y: number): number {
    validateRegion(region, "detect.distance.region");
    assertFiniteNumber(x, "detect.distance.x");
    assertFiniteNumber(y, "detect.distance.y");
    switch (region.type) {
      case "rect": return this.distanceToRect(x, y, region.x, region.y, region.width, region.height);
      case "circle": return Math.abs(Math.sqrt((x - region.x) ** 2 + (y - region.y) ** 2) - region.radius);
      case "ellipse": return this.distanceToEllipse(x, y, region.x, region.y, region.radiusX, region.radiusY, region.rotation ?? 0);
      case "polygon": return this.distanceToPolygon(x, y, region.points);
      default: return 0;
    }
  }

  private isPointInRect(x: number, y: number, rx: number, ry: number, width: number, height: number): boolean {
    return x >= rx && x <= rx + width && y >= ry && y <= ry + height;
  }

  private isPointOnRectStroke(
    x: number, y: number, rx: number, ry: number, width: number, height: number, strokeWidth: number, tolerance: number
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
    return x >= left && x <= right && y >= top && y <= bottom && !(x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom);
  }

  private isPointInEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation: number): boolean {
    const cos = Math.cos(-rotation);
    const sin = Math.sin(-rotation);
    const dx = x - cx;
    const dy = y - cy;
    const tx = dx * cos - dy * sin;
    const ty = dx * sin + dy * cos;
    return (tx * tx) / (rx * rx) + (ty * ty) / (ry * ry) <= 1;
  }

  private isPointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i]!.x, yi = points[i]!.y, xj = points[j]!.x, yj = points[j]!.y;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  private distanceToRect(x: number, y: number, rx: number, ry: number, width: number, height: number): number {
    const dx = Math.max(rx - x, 0, x - (rx + width));
    const dy = Math.max(ry - y, 0, y - (ry + height));
    return Math.sqrt(dx * dx + dy * dy);
  }

  private distanceToEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rotation: number): number {
    const cos = Math.cos(-rotation), sin = Math.sin(-rotation), dx = x - cx, dy = y - cy;
    const tx = dx * cos - dy * sin, ty = dx * sin + dy * cos;
    const angle = Math.atan2(ty / ry, tx / rx);
    const ex = cx + rx * Math.cos(angle) * cos - ry * Math.sin(angle) * sin;
    const ey = cy + rx * Math.cos(angle) * sin + ry * Math.sin(angle) * cos;
    return Math.sqrt((x - ex) ** 2 + (y - ey) ** 2);
  }

  private distanceToPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): number {
    let minDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i]!, p2 = points[(i + 1) % points.length]!;
      minDist = Math.min(minDist, this.distanceToLineSegment(x, y, p1.x, p1.y, p2.x, p2.y));
    }
    return minDist;
  }

  private distanceToLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
    const dot = A * C + B * D, lenSq = C * C + D * D;
    const param = lenSq !== 0 ? dot / lenSq : -1;
    let xx: number, yy: number;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
  }
}

export { HitDetectionCreator as HitDetectionService };
