import type { CustomOptions } from "../types/path";

/**
 * Validates {@link SceneLayer} `customLines` the same way as {@link ApexPainter.createCustom}.
 */
export function validateSceneCustomLinesOptions(opts: CustomOptions[]): void {
  if (opts.length === 0) {
    throw new Error("Scene customLines: at least one custom option is required.");
  }
  for (const opt of opts) {
    if (!opt.startCoordinates || typeof opt.startCoordinates.x !== "number" || typeof opt.startCoordinates.y !== "number") {
      throw new Error("Scene customLines: startCoordinates with valid x and y are required.");
    }
    if (!opt.endCoordinates || typeof opt.endCoordinates.x !== "number" || typeof opt.endCoordinates.y !== "number") {
      throw new Error("Scene customLines: endCoordinates with valid x and y are required.");
    }
  }
}
