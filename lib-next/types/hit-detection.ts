import type { PathCommand } from "./pathCommands";
import type { Path2D } from "@napi-rs/canvas";

export type RegionType = "rect" | "circle" | "ellipse" | "polygon" | "path" | "custom";

export interface BaseRegion {
  type: RegionType;
}

export interface RectRegion extends BaseRegion {
  type: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CircleRegion extends BaseRegion {
  type: "circle";
  x: number;
  y: number;
  radius: number;
}

export interface EllipseRegion extends BaseRegion {
  type: "ellipse";
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  rotation?: number;
}

export interface PolygonRegion extends BaseRegion {
  type: "polygon";
  points: Array<{ x: number; y: number }>;
}

export interface PathRegion extends BaseRegion {
  type: "path";
  path: Path2D | PathCommand[];
  fillRule?: CanvasFillRule;
}

export interface CustomRegion extends BaseRegion {
  type: "custom";
  check: (x: number, y: number) => boolean;
}

export type HitRegion = RectRegion | CircleRegion | EllipseRegion | PolygonRegion | PathRegion | CustomRegion;

export interface HitDetectionOptions {
  includeStroke?: boolean;
  strokeWidth?: number;
  tolerance?: number;
  region?: HitRegion;
  /** Fill rule when testing {@link PathCommand} / {@link Path2D} regions. */
  fillRule?: CanvasFillRule;
}

export interface HitDetectionResult {
  hit: boolean;
  distance?: number;
  hitType?: "fill" | "stroke" | "outside";
  hitRegion?: string | number;
}
