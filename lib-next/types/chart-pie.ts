import type { gradient } from "./gradient";
import type {
  ChartAppearanceExtended,
  EnhancedTextStyle,
  StandardLegendConfig,
  ConnectedLegendConfig,
} from "./chart-common";

export interface PieSlice {
  label: string;
  value: number;
  color?: string;
  gradient?: gradient;
  showValue?: boolean;
  showLabel?: boolean;
  valueLabel?: string;
  opacity?: number;
  shadow?: {
    color?: string;
    offsetX?: number;
    offsetY?: number;
    blur?: number;
  };
  stroke?: {
    color?: string;
    width?: number;
    gradient?: gradient;
  };
}

export interface PieChartOptions {
  dimensions?: {
    width?: number;
    height?: number;
    padding?: {
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };
  };

  appearance?: ChartAppearanceExtended;

  type?: "pie" | "donut";
  donutInnerRadius?: number;

  labels?: {
    title?: {
      text?: string;
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
    };
    sliceLabels?: {
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
    };
    valueLabels?: {
      fontSize?: number;
      color?: string;
      gradient?: gradient;
      textStyle?: EnhancedTextStyle;
    };
    showValues?: boolean;
    showLabels?: boolean;
    valueFormat?: (value: number, percentage: number) => string;
  };

  legends?: {
    standard?: StandardLegendConfig;
    connected?: ConnectedLegendConfig;
  };

  slices?: {
    opacity?: number;
    shadow?: {
      color?: string;
      offsetX?: number;
      offsetY?: number;
      blur?: number;
    };
    stroke?: {
      color?: string;
      width?: number;
      gradient?: gradient;
    };
  };
}
