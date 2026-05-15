import type { SceneLayer, SceneRenderInput } from "../types/scene";

const DEFAULT_MAX_SURFACE_DEPTH = 64;

/**
 * Validates root dimensions and nested `surface` depth before {@link SceneCreator.render}.
 * Call from tests or APIs that accept untrusted `SceneRenderInput` JSON.
 */
export function validateSceneRenderInput(
  input: SceneRenderInput,
  options?: { maxSurfaceDepth?: number }
): void {
  const { width, height, layers } = input;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Scene: width and height must be finite numbers.");
  }
  if (width < 1 || height < 1) {
    throw new Error("Scene: width and height must be at least 1.");
  }
  if (!Array.isArray(layers)) {
    throw new Error("Scene: layers must be an array.");
  }
  const maxDepth = Math.max(1, Math.floor(options?.maxSurfaceDepth ?? DEFAULT_MAX_SURFACE_DEPTH));
  assertSurfaceNestingDepth(layers, 0, maxDepth);
}

function assertSurfaceNestingDepth(
  layers: readonly SceneLayer[],
  surfaceDepth: number,
  maxSurfaceDepth: number
): void {
  for (const layer of layers) {
    if (layer.type === "surface") {
      if (surfaceDepth + 1 > maxSurfaceDepth) {
        throw new Error(
          `Scene: nested surface depth exceeds maxSurfaceDepth (${maxSurfaceDepth}). Flatten the scene or raise maxSurfaceDepth.`
        );
      }
      assertSurfaceNestingDepth(layer.layers, surfaceDepth + 1, maxSurfaceDepth);
    }
  }
}
