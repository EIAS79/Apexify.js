/**
 * Shared 2D drawing primitives used by both the canvas pipeline and the image pipeline
 * (paths, gradients, stroke/shadow passes, raster filter stack).
 */
export { buildPath, applyRotation, buildPartialRectStrokeEdges, parseStrokeSideSet } from "./clip-path";
export { createGradientFill } from "./gradient-fill";
export * from "./stroke-renderer";
export * from "./shadow-renderer";
export { applyContextImageFilters } from "./context-image-filters";
