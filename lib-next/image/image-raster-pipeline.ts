import type { Canvas } from "@napi-rs/canvas";
import type { ImageProperties } from "../types";
import { getCanvasContext } from "../core/errors";
import { applyContextImageFilters } from "../render/context-image-filters";
import {
  applyChromaticAberration,
  applyFilmGrain,
  applyLensFlare,
  applyVignette,
} from "./image-effects";
import { applyRasterImageMask } from "./image-mask";
import { createDistortedRaster, createMeshWarpedRaster } from "./image-warp";

export interface ImageRasterSurface {
  canvas: Canvas;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageRasterPipelineOptions {
  filters?: ImageProperties["filters"];
  filterIntensity?: number;
  filterOrder?: ImageProperties["filterOrder"];
  meshWarp?: ImageProperties["meshWarp"];
  distortion?: ImageProperties["distortion"];
  mask?: ImageProperties["mask"];
  effects?: ImageProperties["effects"];
}

function scaleFilters(
  filters: ImageProperties["filters"],
  multiplier: number
): NonNullable<ImageProperties["filters"]> | undefined {
  if (!filters?.length) return undefined;
  return filters.map((filter) => ({
    ...filter,
    intensity: filter.intensity === undefined ? undefined : filter.intensity * multiplier,
    value: filter.value === undefined ? undefined : filter.value * multiplier,
    radius: filter.radius === undefined ? undefined : filter.radius * multiplier,
  }));
}

function applyEffects(
  surface: ImageRasterSurface,
  effects: ImageProperties["effects"],
  originalX: number,
  originalY: number
): void {
  if (!effects) return;
  const ctx = getCanvasContext(surface.canvas);
  if (effects.vignette) {
    applyVignette(ctx, effects.vignette.intensity, effects.vignette.size, surface.width, surface.height);
  }
  if (effects.lensFlare) {
    applyLensFlare(
      ctx,
      originalX + effects.lensFlare.x - surface.x,
      originalY + effects.lensFlare.y - surface.y,
      effects.lensFlare.intensity,
      surface.width,
      surface.height
    );
  }
  if (effects.chromaticAberration) {
    applyChromaticAberration(ctx, effects.chromaticAberration.intensity, surface.width, surface.height);
  }
  if (effects.filmGrain) {
    applyFilmGrain(ctx, effects.filmGrain.intensity, surface.width, surface.height);
  }
}

/**
 * Canonical createImage raster order:
 * source -> pre-filters -> meshWarp -> distortion -> mask -> post-filters -> effects.
 */
export async function processImageRaster(
  sourceCanvas: Canvas,
  originX: number,
  originY: number,
  options: ImageRasterPipelineOptions
): Promise<ImageRasterSurface> {
  let surface: ImageRasterSurface = {
    canvas: sourceCanvas,
    x: originX,
    y: originY,
    width: sourceCanvas.width,
    height: sourceCanvas.height,
  };
  const filters = scaleFilters(options.filters, options.filterIntensity ?? 1);

  if (filters?.length && options.filterOrder === "pre") {
    await applyContextImageFilters(getCanvasContext(surface.canvas), filters, surface.width, surface.height);
  }

  if (options.meshWarp) {
    surface = createMeshWarpedRaster(
      getCanvasContext(surface.canvas),
      surface.width,
      surface.height,
      options.meshWarp,
      surface.x,
      surface.y
    );
  }

  if (options.distortion) {
    surface = createDistortedRaster(
      getCanvasContext(surface.canvas),
      surface.width,
      surface.height,
      options.distortion,
      surface.x,
      surface.y
    );
  }

  if (options.mask) {
    await applyRasterImageMask(
      getCanvasContext(surface.canvas),
      surface.width,
      surface.height,
      options.mask.source,
      options.mask.mode ?? "alpha"
    );
  }

  if (filters?.length && options.filterOrder !== "pre") {
    await applyContextImageFilters(getCanvasContext(surface.canvas), filters, surface.width, surface.height);
  }

  applyEffects(surface, options.effects, originX, originY);
  return surface;
}
