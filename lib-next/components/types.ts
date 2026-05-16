export interface BadgeToLayersOptions {
  text: string;
  x: number;
  y: number;
  paddingX?: number;
  paddingY?: number;
  radius?: number;
  background?: string;
  color?: string;
  fontSize?: number;
}

export interface ProgressBarToLayersOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  max?: number;
  background?: string;
  fill?: string;
  radius?: number;
  showLabel?: boolean;
  labelColor?: string;
}

export interface AvatarToLayersOptions {
  source: string | Buffer;
  x: number;
  y: number;
  size: number;
  /** Ring color around the circle; omit for no ring. */
  borderColor?: string;
  borderWidth?: number;
}

export interface CardToLayersOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  background?: string;
  borderColor?: string;
  borderWidth?: number;
  title?: string;
  titleFontSize?: number;
  titleColor?: string;
  body?: string;
  bodyFontSize?: number;
  bodyColor?: string;
  padding?: number;
}

export interface WatermarkToLayersOptions {
  text: string;
  /** Corner placement or center. */
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
  fontSize?: number;
  /** RGBA / hex with alpha recommended, e.g. `#f8fafc33`. */
  color?: string;
  margin?: number;
  /** Root canvas dimensions (required for corner math). */
  canvasWidth: number;
  canvasHeight: number;
}
