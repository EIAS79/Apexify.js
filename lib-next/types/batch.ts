export interface BatchOperation {
  type: "canvas" | "image" | "text";
  config: unknown;
}

export interface ChainOperation {
  method: string;
  args: unknown[];
}

export interface StitchOptions {
  direction?: "horizontal" | "vertical" | "grid";
  overlap?: number;
  blend?: boolean;
  spacing?: number;
}

export interface CollageLayout {
  type: "grid" | "masonry" | "carousel" | "custom";
  columns?: number;
  rows?: number;
  spacing?: number;
  background?: string;
  borderRadius?: number;
}

export interface CompressionOptions {
  quality?: number;
  format?: "jpeg" | "webp" | "avif";
  maxWidth?: number;
  maxHeight?: number;
  progressive?: boolean;
}

export interface PaletteOptions {
  count?: number;
  method?: "kmeans" | "median-cut" | "octree";
  format?: "hex" | "rgb" | "hsl";
}
