import type { gradient } from "./gradient";

/**
 * Configuration option to decide the outputformate from ApexPainter
 * @param {type} default - 'buffer', other formates: url, blob, base64, dataURL, arraybuffer.
 */
export interface OutputFormat {
  type?: "buffer" | "url" | "blob" | "base64" | "dataURL" | "arraybuffer";
}

export type AlignMode =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type FitMode = "fill" | "contain" | "cover";

export type borderPosition =
  | "all"
  | "top"
  | "left"
  | "right"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | string;

export interface StrokeOptions {
  color?: string;
  gradient?: gradient;
  width?: number;
  position?: number;
  blur?: number;
  opacity?: number;
  borderRadius?: number | "circular";
  borderPosition?: borderPosition;
  roundedCorners?: borderPosition;
  style?: "solid" | "dashed" | "dotted" | "groove" | "ridge" | "double";
}

export interface ShadowOptions {
  color?: string;
  gradient?: gradient;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  opacity?: number;
  borderRadius?: number | "circular";
  roundedCorners?: borderPosition;
  /** @deprecated Use `roundedCorners` — same meaning (corner rounding only). */
  borderPosition?: borderPosition;
}

export interface BoxBackground {
  color?: string;
  gradient?: gradient;
}

export interface cropCoordinate {
  from: { x: number; y: number };
  to: { x: number; y: number };
  tension?: number;
}

export interface cropOptions {
  coordinates: cropCoordinate[];
  imageSource: string;
  crop: "inner" | "outer";
  radius: number | "circular";
}

export interface GradientConfig {
  type: "linear" | "radial" | "conic";
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  startRadius?: number;
  endRadius?: number;
  angle?: number;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
  repeat?: "repeat" | "reflect" | "no-repeat";
  colors: {
    stop: number;
    color: string;
  }[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Coordinate {
  from: Point;
  to: Point;
  tension?: number;
}

export interface CropOptions {
  imageSource: string;
  coordinates: Coordinate[];
  crop: "inner" | "outer";
  radius?: number | "circular" | null;
}
