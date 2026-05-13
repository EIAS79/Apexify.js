import type { gradient } from "./gradient";
import type { borderPosition, StrokeOptions, ShadowOptions } from "./common";
import type { ImageFilter } from "./image";
import type { PatternOptions } from "./pattern";

/** Repeat mode for tiled image patterns in {@link BackgroundLayer}. */
export type BackgroundPatternRepeat = "repeat" | "repeat-x" | "repeat-y" | "no-repeat";

/** Alignment for {@link BackgroundLayer} image `contain` / `cover` (same as `customBg.align`). */
export type BackgroundImageAlign =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type BackgroundLayer =
  | { type: "color"; value: string; opacity?: number; blendMode?: GlobalCompositeOperation }
  | { type: "gradient"; value: gradient; opacity?: number; blendMode?: GlobalCompositeOperation }
  | {
      type: "image";
      source: string;
      opacity?: number;
      fit?: "fill" | "contain" | "cover";
      align?: BackgroundImageAlign;
      blendMode?: GlobalCompositeOperation;
    }
  | {
      type: "pattern";
      source: string;
      repeat?: BackgroundPatternRepeat;
      opacity?: number;
      blendMode?: GlobalCompositeOperation;
    }
  | {
      type: "presetPattern";
      pattern: PatternOptions;
      opacity?: number;
      blendMode?: GlobalCompositeOperation;
    }
  | { type: "noise"; intensity?: number; blendMode?: GlobalCompositeOperation };

export interface CanvasConfig {
  width?: number;
  height?: number;
  x?: number;
  y?: number;

  customBg?: {
    source: string;
    inherit?: boolean;
    fit?: "fill" | "contain" | "cover";
    align?:
      | "center"
      | "top"
      | "bottom"
      | "left"
      | "right"
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right";
    filters?: ImageFilter[];
    opacity?: number;
  };
  videoBg?: {
    source: string | Buffer;
    frame?: number;
    time?: number;
    loop?: boolean;
    autoplay?: boolean;
    opacity?: number;
    format?: "jpg" | "png";
    quality?: number;
  };

  colorBg?: string;
  gradientBg?: gradient;
  patternBg?: PatternOptions;
  noiseBg?: { intensity?: number };
  transparentBase?: boolean;
  bgLayers?: BackgroundLayer[];
  blendMode?: GlobalCompositeOperation;

  opacity?: number;
  blur?: number;

  rotation?: number;
  borderRadius?: number | "circular";
  borderPosition?: borderPosition;

  zoom?: {
    scale?: number;
    centerX?: number;
    centerY?: number;
  };

  stroke?: StrokeOptions;
  shadow?: ShadowOptions;
}
