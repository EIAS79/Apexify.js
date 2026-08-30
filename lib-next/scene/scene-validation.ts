import type { SceneLayer, SceneRenderInput } from "../types";
import { validateCanvasConfig } from "../canvas/canvas-validation";
import { validateImageInput } from "../image/image-validation";
import { validateTextInput } from "../text/text-validation";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyInputError, ApexifyResourceLimitError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import { assertCollection, assertFiniteNumber, assertFiniteNumericLeaves, assertOpacity, assertRecord } from "../runtime/validation";

export const DEFAULT_MAX_SCENE_SURFACE_DEPTH = 32;

export interface SceneValidationOptions { maxSurfaceDepth?: number; }
interface SceneCounters { layers: number; surfaces: number; remoteAssets: number; charts: number; images: number; textLayers: number; textContent: number; }

function isRemoteString(value: unknown): boolean { return typeof value === "string" && /^https?:\/\//i.test(value); }
function countRemoteLeaves(value: unknown, depth = 0): number {
  if (depth > 12 || value == null || Buffer.isBuffer(value) || value instanceof Uint8Array) return 0;
  if (isRemoteString(value)) return 1;
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + countRemoteLeaves(item, depth + 1), 0);
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).reduce((sum, child) => sum + countRemoteLeaves(child, depth + 1), 0);
  return 0;
}

function validateLayer(layer: SceneLayer, depth: number, maxDepth: number, counters: SceneCounters, path: string): void {
  assertRecord(layer, path);
  if (typeof layer.type !== "string") throw new ApexifyInputError(`${path}.type must be a string.`);
  counters.layers += 1;
  counters.remoteAssets += countRemoteLeaves(layer);
  assertWithinLimit("maxSceneLayers", counters.layers);
  assertWithinLimit("maxRemoteAssets", counters.remoteAssets);
  assertFiniteNumericLeaves(layer, path);

  switch (layer.type) {
    case "image": {
      const list = validateImageInput(layer.images, layer.options);
      counters.images += list.length;
      assertWithinLimit("maxCollectionItems", counters.images);
      return;
    }
    case "text": {
      const list = validateTextInput(layer.texts);
      counters.textLayers += 1;
      counters.textContent += list.reduce((sum, t) => sum + t.text.length, 0);
      assertWithinLimit("maxCollectionItems", counters.textLayers);
      assertWithinLimit("maxTextLength", counters.textContent);
      return;
    }
    case "chart":
    case "chartComparison":
    case "chartCombo": {
      counters.charts += 1;
      assertWithinLimit("maxCollectionItems", counters.charts);
      assertFiniteNumber(layer.x, `${path}.x`);
      assertFiniteNumber(layer.y, `${path}.y`);
      if (layer.width !== undefined) assertFiniteNumber(layer.width, `${path}.width`, { min: 0, exclusiveMin: true });
      if (layer.height !== undefined) assertFiniteNumber(layer.height, `${path}.height`, { min: 0, exclusiveMin: true });
      if (layer.width !== undefined && layer.height !== undefined) assertCanvasResourceLimits(layer.width, layer.height);
      assertOpacity(layer.opacity, `${path}.opacity`);
      return;
    }
    case "imageBuffer":
      if (!Buffer.isBuffer(layer.buffer) || layer.buffer.length === 0) throw new ApexifyInputError(`${path}.buffer must be a non-empty Buffer.`);
      assertFiniteNumber(layer.x, `${path}.x`); assertFiniteNumber(layer.y, `${path}.y`);
      if (layer.width !== undefined) assertFiniteNumber(layer.width, `${path}.width`, { min: 0, exclusiveMin: true });
      if (layer.height !== undefined) assertFiniteNumber(layer.height, `${path}.height`, { min: 0, exclusiveMin: true });
      if (layer.width !== undefined && layer.height !== undefined) assertCanvasResourceLimits(layer.width, layer.height);
      assertOpacity(layer.globalAlpha, `${path}.globalAlpha`); return;
    case "customLines": {
      const list = Array.isArray(layer.lines) ? layer.lines : [layer.lines]; assertWithinLimit("maxCollectionItems", list.length); return;
    }
    case "path":
      if (Array.isArray(layer.path)) assertWithinLimit("maxCollectionItems", layer.path.length); return;
    case "surface": {
      counters.surfaces += 1; assertWithinLimit("maxNestedSurfaces", counters.surfaces);
      if (depth > maxDepth) throw new ApexifyResourceLimitError("maxSceneDepth", maxDepth, depth);
      assertRecord(layer.placement, `${path}.placement`);
      const p = layer.placement;
      assertFiniteNumber(p.x, `${path}.placement.x`); assertFiniteNumber(p.y, `${path}.placement.y`);
      assertFiniteNumber(p.width, `${path}.placement.width`, { min: 0, exclusiveMin: true, integer: true });
      assertFiniteNumber(p.height, `${path}.placement.height`, { min: 0, exclusiveMin: true, integer: true });
      assertCanvasResourceLimits(p.width, p.height); assertOpacity(p.opacity, `${path}.placement.opacity`);
      if (p.scaleX !== undefined) assertFiniteNumber(p.scaleX, `${path}.placement.scaleX`, { min: 0, exclusiveMin: true });
      if (p.scaleY !== undefined) assertFiniteNumber(p.scaleY, `${path}.placement.scaleY`, { min: 0, exclusiveMin: true });
      if (p.rotation !== undefined) assertFiniteNumber(p.rotation, `${path}.placement.rotation`);
      if (layer.background !== undefined) validateCanvasConfig({ ...layer.background, width: p.width, height: p.height });
      assertCollection(layer.layers, `${path}.layers`);
      layer.layers.forEach((child, i) => validateLayer(child, depth + 1, maxDepth, counters, `${path}.layers[${i}]`)); return;
    }
    default: throw new ApexifyInputError(`${path}.type is not a supported scene layer type.`);
  }
}

export function validateSceneRenderInput(input: SceneRenderInput, options: SceneValidationOptions = {}): void {
  assertRecord(input, "scene");
  assertFiniteNumber(input.width, "scene.width", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(input.height, "scene.height", { min: 0, exclusiveMin: true, integer: true });
  assertCanvasResourceLimits(input.width, input.height); assertCollection(input.layers, "scene.layers");
  if (input.background !== undefined) validateCanvasConfig({ ...input.background, width: input.width, height: input.height });
  const configured = getDefaultApexifyRuntimeConfig().limits.maxSceneDepth;
  let maxDepth = configured;
  if (options.maxSurfaceDepth !== undefined) {
    assertFiniteNumber(options.maxSurfaceDepth, "scene.maxSurfaceDepth", { min: 0, exclusiveMin: true, integer: true });
    if (options.maxSurfaceDepth > configured) throw new ApexifyResourceLimitError("maxSceneDepth", configured, options.maxSurfaceDepth);
    maxDepth = options.maxSurfaceDepth;
  }
  const counters: SceneCounters = { layers: 0, surfaces: 0, remoteAssets: countRemoteLeaves(input.background), charts: 0, images: 0, textLayers: 0, textContent: 0 };
  assertWithinLimit("maxRemoteAssets", counters.remoteAssets);
  input.layers.forEach((layer, i) => validateLayer(layer, 1, maxDepth, counters, `scene.layers[${i}]`));
}
