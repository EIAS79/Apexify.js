import type { PathLike } from "fs";
import type { gradient } from "./gradient";
import type {
  AlignMode,
  FitMode,
  borderPosition,
  StrokeOptions,
  ShadowOptions,
  BoxBackground,
} from "./common";

/**
 * Image filter configuration interface
 */
export interface ImageFilter {
  type:
    | "gaussianBlur"
    | "motionBlur"
    | "radialBlur"
    | "sharpen"
    | "noise"
    | "grain"
    | "edgeDetection"
    | "emboss"
    | "invert"
    | "grayscale"
    | "sepia"
    | "pixelate"
    | "brightness"
    | "contrast"
    | "saturation"
    | "hueShift"
    | "posterize";

  intensity?: number;
  radius?: number;
  angle?: number;
  centerX?: number;
  centerY?: number;
  value?: number;
  levels?: number;
  size?: number;
}

export type ShapeType =
  | "rectangle"
  | "square"
  | "circle"
  | "triangle"
  | "trapezium"
  | "star"
  | "heart"
  | "polygon"
  | "arc"
  | "pieSlice";

export interface ShapeProperties {
  fill?: boolean;
  color?: string;
  gradient?: gradient;
  points?: { x: number; y: number }[];
  radius?: number;
  sides?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  centerX?: number;
  centerY?: number;
}

export interface ImageProperties {
  source: string | Buffer | ShapeType;
  x: number;
  y: number;

  width?: number;
  height?: number;
  inherit?: boolean;

  fit?: FitMode;
  align?: AlignMode;

  rotation?: number;
  opacity?: number;
  blur?: number;
  blendMode?: GlobalCompositeOperation;
  borderRadius?: number | "circular";
  borderPosition?: string;

  filters?: ImageFilter[];
  filterIntensity?: number;
  filterOrder?: "pre" | "post";

  mask?: {
    source: string | Buffer;
    mode?: "alpha" | "luminance" | "inverse";
  };
  clipPath?: Array<{ x: number; y: number }>;

  distortion?: {
    type: "perspective" | "warp" | "bulge" | "pinch";
    points?: Array<{ x: number; y: number }>;
    intensity?: number;
  };
  meshWarp?: {
    gridX?: number;
    gridY?: number;
    controlPoints?: Array<Array<{ x: number; y: number }>>;
  };

  effects?: {
    vignette?: { intensity: number; size: number };
    lensFlare?: { x: number; y: number; intensity: number };
    chromaticAberration?: { intensity: number };
    filmGrain?: { intensity: number };
  };

  shape?: ShapeProperties;

  shadow?: ShadowOptions;
  stroke?: StrokeOptions;
  boxBackground?: BoxBackground;
}

export interface GroupTransformOptions {
  rotation?: number;
  translateX?: number;
  translateY?: number;
  scaleX?: number;
  scaleY?: number;
  pivotX?: number;
  pivotY?: number;

  opacity?: number;
  blur?: number;
  blendMode?: GlobalCompositeOperation;
  borderRadius?: number | "circular";
  borderPosition?: borderPosition;

  filters?: ImageFilter[];
  filterIntensity?: number;
  filterOrder?: "pre" | "post";

  mask?: {
    source: string | Buffer;
    mode?: "alpha" | "luminance" | "inverse";
  };
  clipPath?: Array<{ x: number; y: number }>;

  distortion?: {
    type: "perspective" | "warp" | "bulge" | "pinch";
    points?: Array<{ x: number; y: number }>;
    intensity?: number;
  };
  meshWarp?: {
    gridX?: number;
    gridY?: number;
    controlPoints?: Array<Array<{ x: number; y: number }>>;
  };

  effects?: {
    vignette?: { intensity: number; size: number };
    lensFlare?: { x: number; y: number; intensity: number };
    chromaticAberration?: { intensity: number };
    filmGrain?: { intensity: number };
  };

  shadow?: ShadowOptions;
  stroke?: StrokeOptions;
  boxBackground?: BoxBackground;
}

export interface CreateImageOptions {
  isGrouped?: boolean;
  groupTransform?: GroupTransformOptions;
}

export interface MaskOptions {
  type?: "alpha" | "grayscale" | "color";
  threshold?: number;
  invert?: boolean;
  colorKey?: string;
}

export interface BlendOptions {
  type?: "linear" | "radial" | "conic";
  angle?: number;
  colors: { stop: number; color: string }[];
  blendMode?: "multiply" | "overlay" | "screen" | "darken" | "lighten" | "difference";
  maskSource?: string | Buffer | PathLike | Uint8Array;
}

/** One layer for {@link blendImageLayers} / `ApexPainter.prototype.blend`. */
export interface ImageBlendLayer {
  image: string | Buffer;
  blendMode: GlobalCompositeOperation;
  position?: { x: number; y: number };
  opacity?: number;
}
