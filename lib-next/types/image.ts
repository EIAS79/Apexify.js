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

  /** Optional pixelate region. Omit for the whole filtered surface. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export type ImageInterpolationMode = "nearest" | "bilinear" | "bicubic";
export type ImageEdgeMode = "transparent" | "clamp" | "wrap" | "mirror";
export type ImageWarpFalloff = "linear" | "smooth" | "gaussian";

export interface ImageWarpControlPoint {
  /** Undeformed point in canvas coordinates. */
  from: { x: number; y: number };
  /** Destination point in canvas coordinates. */
  to: { x: number; y: number };
  /** Influence radius in pixels. Defaults to 25% of the layer's largest side. */
  radius?: number;
  /** Per-handle displacement multiplier. */
  strength?: number;
  /** Influence curve around this handle. */
  falloff?: ImageWarpFalloff;
}

export interface ImageDistortionOptions {
  type: "perspective" | "warp" | "bulge" | "pinch" | "twirl" | "wave";

  /**
   * Destination quad in top-left, top-right, bottom-right, bottom-left order.
   * Perspective uses a projective homography; warp uses a free bilinear quad.
   */
  points?: Array<{ x: number; y: number }>;

  /**
   * Local free-warp/liquify handles. Each handle drags pixels from `from` to
   * `to` with radius/falloff control. Used by type:"warp".
   */
  controlPoints?: ImageWarpControlPoint[];

  /** General strength multiplier. Negative values reverse radial/twirl effects. */
  intensity?: number;
  /** Effect center in canvas coordinates. Defaults to the image center. */
  centerX?: number;
  centerY?: number;
  /** Effect radius in pixels. Defaults to half of the smaller layer dimension. */
  radius?: number;

  /** Twirl angle in degrees. If omitted, intensity × 180 degrees is used. */
  angle?: number;

  /** Wave displacement amplitudes in pixels. */
  amplitudeX?: number;
  amplitudeY?: number;
  /** Wave lengths in pixels. Values must be > 0 when supplied. */
  wavelengthX?: number;
  wavelengthY?: number;
  /** Wave phase in degrees. */
  phaseX?: number;
  phaseY?: number;

  /** Raster resampling quality. Defaults to bilinear. */
  interpolation?: ImageInterpolationMode;
  /** Sampling behavior outside source bounds. Defaults to transparent. */
  edgeMode?: ImageEdgeMode;
}

export interface ImageMeshWarpOptions {
  /** Number of horizontal mesh cells. Inferred from controlPoints when omitted. */
  gridX?: number;
  /** Number of vertical mesh cells. Inferred from controlPoints when omitted. */
  gridY?: number;
  /**
   * Destination mesh vertices in layer-local coordinates.
   * Preferred layout: (gridY + 1) rows × (gridX + 1) columns.
   * Legacy gridY × gridX cell-anchor layouts remain accepted and are normalized.
   */
  controlPoints?: Array<Array<{ x: number; y: number }>>;
  /** Sampling quality for mesh rasterization. Defaults to bilinear. */
  interpolation?: ImageInterpolationMode;
  /** Sampling behavior outside source bounds. Defaults to transparent. */
  edgeMode?: ImageEdgeMode;
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

  distortion?: ImageDistortionOptions;
  meshWarp?: ImageMeshWarpOptions;

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

  distortion?: ImageDistortionOptions;
  meshWarp?: ImageMeshWarpOptions;

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
