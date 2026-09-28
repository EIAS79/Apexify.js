import type { gradient } from "./gradient";
import type { AlignMode, FitMode, borderPosition, StrokeOptions, ShadowOptions } from "./common";
import type { ImageFilter } from "./image";
import type { PatternOptions } from "./pattern";

/** Repeat mode for tiled image patterns in {@link BackgroundLayer}. */
export type BackgroundPatternRepeat = "repeat" | "repeat-x" | "repeat-y" | "no-repeat";

/** Alignment for {@link BackgroundLayer} image `contain` / `cover` (same as `customBg.align`). */
export type BackgroundImageAlign = AlignMode;

/**
 * Placement/effect contract shared by still-image canvas backgrounds.
 *
 * `videoBg` uses these options after its selected video frame has been
 * extracted to a raster image, keeping its public video selection API distinct
 * while sharing the same image rendering semantics as `customBg`.
 */
export interface CanvasImageBackgroundOptions {
  /** Adopt the source image dimensions as the canvas dimensions. */
  inherit?: boolean;
  /** Resize policy when `inherit` is false. */
  fit?: FitMode;
  /** Placement used by `contain` / `cover` when `inherit` is false. */
  align?: AlignMode;
  /** Image filters applied to this background only. */
  filters?: ImageFilter[];
  /** Background-image opacity, multiplied by the canvas-level opacity. */
  opacity?: number;
}

export interface CanvasCustomBackground extends CanvasImageBackgroundOptions {
  source: string;
}

export interface CanvasVideoBackground extends CanvasImageBackgroundOptions {
  source: string | Buffer;
  /**
   * 1-based frame number. Mutually exclusive with `time`.
   * Defaults to frame 1 when neither selector is provided.
   */
  frame?: number;
  /** Timestamp in seconds. Mutually exclusive with `frame`. */
  time?: number;
  format?: "jpg" | "png";
  /** FFmpeg image quality value from 1 (best) through 31. */
  quality?: number;
  /** @deprecated A canvas video background is one extracted still frame; looping has no effect. */
  loop?: boolean;
  /** @deprecated A canvas video background is one extracted still frame; autoplay has no effect. */
  autoplay?: boolean;
}

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

  customBg?: CanvasCustomBackground;
  videoBg?: CanvasVideoBackground;

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

/** Result of {@link ApexPainter.createCanvas} — buffer + config for follow-up draws. */
export interface CanvasResults {
  buffer: Buffer;
  canvas: CanvasConfig;
}
