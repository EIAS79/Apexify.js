import type { GradientConfig } from "./common";

/**
 * Enhanced pattern options supporting all pattern types
 */
export interface PatternOptions {
  type:
    | "grid"
    | "dots"
    | "diagonal"
    | "stripes"
    | "waves"
    | "crosses"
    | "hexagons"
    | "checkerboard"
    | "diamonds"
    | "triangles"
    | "stars"
    | "polka"
    | "custom";

  color?: string;
  secondaryColor?: string;
  opacity?: number;

  size?: number;
  spacing?: number;
  rotation?: number;

  customPatternImage?: string;
  repeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
  scale?: number;

  offsetX?: number;
  offsetY?: number;

  blendMode?: GlobalCompositeOperation;
  gradient?: GradientConfig;
}
