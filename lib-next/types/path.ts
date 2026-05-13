import type { gradient } from "./gradient";

export interface CustomOptions {
  startCoordinates: {
    x: number;
    y: number;
  };
  endCoordinates: {
    x: number;
    y: number;
  };

  path?: {
    type: "smooth" | "bezier" | "catmull-rom";
    tension?: number;
    closed?: boolean;
  };

  arrow?: {
    start?: boolean;
    end?: boolean;
    size?: number;
    style?: "filled" | "outline";
    color?: string;
  };

  markers?: Array<{
    position: number;
    shape: "circle" | "square" | "diamond" | "arrow";
    size: number;
    color: string;
  }>;
  lineStyle?: {
    width?: number;
    color?: string;
    gradient?: gradient;
    lineRadius?: number | string;
    lineJoin?: "round" | "bevel" | "miter";
    lineCap?: "butt" | "round" | "square";
    singleLine?: boolean;
    lineDash?: {
      dashArray?: number[];
      offset?: number;
    };
    pattern?: {
      type: "dots" | "dashes" | "custom";
      segments?: number[];
      offset?: number;
    };
    texture?: string | Buffer;
    stroke?: {
      color?: string;
      gradient?: gradient;
      width?: number;
      lineRadius?: number | string;
      lineCap?: "butt" | "round" | "square";
    };
    shadow?: {
      offsetX?: number;
      offsetY?: number;
      blur?: number;
      color?: string;
      gradient?: gradient;
      lineRadius?: number | string;
    };
  };
}
