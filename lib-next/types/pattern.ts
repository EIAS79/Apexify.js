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

/** Width/height target for procedural patterns (no full canvas required). */
export type PatternViewport = { width: number; height: number };

export type RenderPatternStackOptions = {
  /**
   * When true (used from `bgLayers`), unset `pattern.blendMode` keeps the layer's
   * `globalCompositeOperation`. When false/omitted (`patternBg` on createCanvas),
   * missing blend defaults to `'overlay'`.
   */
  stackedInLayer?: boolean;
};
