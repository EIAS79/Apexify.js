import type { gradient } from "./gradient";
import type { CanvasConfig, BackgroundLayer } from "./canvas";
import type { PatternOptions } from "./pattern";

/**
 * Canonical legend positions for chart layout (aliases normalized elsewhere in chart code).
 */
export type LegendPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "right-top"
  | "right-bottom"
  | "left-top"
  | "left-bottom";

/**
 * Chart `appearance` background options aligned with {@link CanvasConfig} / chart renderers.
 */
export interface ChartAppearanceExtended {
  backgroundColor?: string;
  backgroundGradient?: gradient;
  backgroundImage?: string;
  customBg?: CanvasConfig["customBg"];
  bgLayers?: BackgroundLayer[];
  patternBg?: PatternOptions;
  noiseBg?: { intensity?: number };
  blur?: number;
  axisColor?: string;
  axisWidth?: number;
  arrowSize?: number;
  yAxisArrowExtensionPastMaxTickPx?: number;
  yAxisArrowTipOffsetY?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

export interface EnhancedTextStyle {
  fontPath?: string;
  fontName?: string;
  fontFamily?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  shadow?: {
    color?: string;
    offsetX?: number;
    offsetY?: number;
    blur?: number;
    opacity?: number;
  };
  stroke?: {
    color?: string;
    width?: number;
    gradient?: gradient;
  };
  glow?: {
    color?: string;
    intensity?: number;
    opacity?: number;
  };
}

export interface LegendEntry {
  color?: string;
  gradient?: gradient;
  label: string;
}

export interface StandardLegendConfig {
  show?: boolean;
  position?: LegendPlacement | string;
  fontSize?: number;
  backgroundColor?: string;
  backgroundGradient?: gradient;
  borderColor?: string;
  textColor?: string;
  textGradient?: gradient;
  textStyle?: EnhancedTextStyle;
  spacing?: number;
  padding?: number;
  maxWidth?: number;
  wrapText?: boolean;
}

export interface ConnectedLegendConfig {
  show?: boolean;
  fontSize?: number;
  backgroundColor?: string;
  backgroundGradient?: gradient;
  borderColor?: string;
  textColor?: string;
  textGradient?: gradient;
  textStyle?: EnhancedTextStyle;
  lineColor?: string;
  lineGradient?: gradient;
  lineWidth?: number;
  padding?: number;
  maxWidth?: number;
  wrapText?: boolean;
}
