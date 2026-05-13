export type GradientStop = { stop: number; color: string };

export type gradient =
  | {
      type: "linear";
      startX?: number;
      startY?: number;
      endX?: number;
      endY?: number;
      rotate?: number;
      pivotX?: number;
      pivotY?: number;
      repeat?: "repeat" | "reflect" | "no-repeat";
      colors: GradientStop[];
    }
  | {
      type: "radial";
      startX?: number;
      startY?: number;
      startRadius?: number;
      endX?: number;
      endY?: number;
      endRadius?: number;
      rotate?: number;
      pivotX?: number;
      pivotY?: number;
      repeat?: "repeat" | "reflect" | "no-repeat";
      colors: GradientStop[];
    }
  | {
      type: "conic";
      centerX?: number;
      centerY?: number;
      startAngle?: number;
      rotate?: number;
      pivotX?: number;
      pivotY?: number;
      colors: GradientStop[];
    };
