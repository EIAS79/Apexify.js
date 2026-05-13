import type { gradient } from "./gradient";

/**
 * Path2D drawing options (aligned with {@link Path2DCreator}).
 */
export interface Path2DDrawOptions {
  opacity?: number;
  globalCompositeOperation?: string;
  shadow?: {
    color?: string;
    gradient?: gradient;
    blur?: number;
    offsetX?: number;
    offsetY?: number;
  };
  gradientBounds?: { x: number; y: number; w: number; h: number };
  stroke?: {
    color?: string;
    gradient?: gradient;
    width?: number;
    lineCap?: "butt" | "round" | "square";
    lineJoin?: "bevel" | "round" | "miter";
    miterLimit?: number;
    style?: "solid" | "dashed" | "dotted";
    dashArray?: number[];
    dashOffset?: number;
    opacity?: number;
  };
  fill?: {
    color?: string;
    gradient?: gradient;
    opacity?: number;
    rule?: "nonzero" | "evenodd";
  };
  transform?: {
    translateX?: number;
    translateY?: number;
    rotate?: number;
    scaleX?: number;
    scaleY?: number;
    originX?: number;
    originY?: number;
  };
}
