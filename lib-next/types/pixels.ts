export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace?: "srgb" | "display-p3" | "rec2020";
}

export interface PixelManipulationOptions {
  processor?: (r: number, g: number, b: number, a: number, x: number, y: number) => [number, number, number, number];
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  filter?: "grayscale" | "invert" | "sepia" | "brightness" | "contrast" | "saturate";
  intensity?: number;
}
