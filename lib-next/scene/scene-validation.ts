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
interface SceneCounters {
  layers: number;
  surfaces: number;
  totalPixels: number;
  remoteAssets: number;
  charts: number;
  images: number;
  textLayers: number;
  textContent: number;
}

function isRemoteString(value: unknown): boolean { return typeof value === "string" && /^https?:\/\//i.test(value); }
function countRemoteSource(value: unknown): number { return isRemoteString(value) ? 1 : 0; }

function assertNoBackgroundDimensions(background: unknown, path: string): void {
  if (!background || typeof background !== "object" || Array.isArray(background) || Buffer.isBuffer(background)) return;
  if (Object.prototype.hasOwnProperty.call(background, "width") || Object.prototype.hasOwnProperty.call(background, "height")) {
    throw new ApexifyInputError(`${path} must not define width or height; scene dimensions are authoritative.`);
  }
}

function countPatternRemoteSource(pattern: unknown): number {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern) || Buffer.isBuffer(pattern)) return 0;
  return countRemoteSource((pattern as { customPatternImage?: unknown }).customPatternImage);
}

function countCanvasBackgroundRemoteSources(background: unknown): number {
  if (!background || typeof background !== "object" || Array.isArray(background) || Buffer.isBuffer(background)) return 0;
  const value = background as {
    customBg?: { source?: unknown };
    videoBg?: { source?: unknown };
    patternBg?: unknown;
    bgLayers?: Array<{ type?: unknown; source?: unknown; pattern?: unknown }>;
  };
  let total = countRemoteSource(value.customBg?.source) + countRemoteSource(value.videoBg?.source);
  total += countPatternRemoteSource(value.patternBg);
  for (const layer of value.bgLayers ?? []) {
    if (layer?.type === "image" || layer?.type === "pattern") total += countRemoteSource(layer.source);
    else if (layer?.type === "presetPattern") total += countPatternRemoteSource(layer.pattern);
  }
  return total;
}

function countImageLayerRemoteSources(layer: Extract<SceneLayer, { type: "image" }>): number {
  const images = Array.isArray(layer.images) ? layer.images : [layer.images];
  let total = 0;
  for (const image of images) {
    total += countRemoteSource(image.source);
    total += countRemoteSource(image.mask?.source);
  }
  total += countRemoteSource(layer.options?.groupTransform?.mask?.source);
  return total;
}

function addRemoteAssets(counters: SceneCounters, count: number): void {
  counters.remoteAssets += count;
  assertWithinLimit("maxRemoteAssets", counters.remoteAssets);
}

function validateLayer(layer: SceneLayer, depth: number, maxDepth: number, counters: SceneCounters, path: string): void {
  assertRecord(layer, path);
  if (typeof layer.type !== "string") throw new ApexifyInputError(`${path}.type must be a string.`);
  counters.layers += 1;
  assertWithinLimit("maxSceneLayers", counters.layers);
  assertFiniteNumericLeaves(layer, path);

  switch (layer.type) {
    case "image": {
      addRemoteAssets(counters, countImageLayerRemoteSources(layer));
      const list = validateImageInput(layer.images, layer.options);
      counters.images += list.length;
      assertWithinLimit("maxSceneImages", counters.images);
      return;
    }
    case "text": {
      const list = validateTextInput(layer.texts);
      counters.textLayers += 1;
      counters.textContent += list.reduce((sum, text) => sum + text.text.length, 0);
      assertWithinLimit("maxSceneTextLayers", counters.textLayers);
      assertWithinLimit("maxTextLength", counters.textContent);
      return;
    }
    case "chart":
    case "chartComparison":
    case "chartCombo": {
      counters.charts += 1;
      assertWithinLimit("maxSceneCharts", counters.charts);
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
      assertFiniteNumber(layer.x, `${path}.x`);
      assertFiniteNumber(layer.y, `${path}.y`);
      if (layer.width !== undefined) assertFiniteNumber(layer.width, `${path}.width`, { min: 0, exclusiveMin: true });
      if (layer.height !== undefined) assertFiniteNumber(layer.height, `${path}.height`, { min: 0, exclusiveMin: true });
      if (layer.width !== undefined && layer.height !== undefined) assertCanvasResourceLimits(layer.width, layer.height);
      assertOpacity(layer.globalAlpha, `${path}.globalAlpha`);
      return;
    case "customLines": {
      const list = Array.isArray(layer.lines) ? layer.lines : [layer.lines];
      assertWithinLimit("maxCollectionItems", list.length);
      return;
    }
    case "path":
      if (Array.isArray(layer.path)) assertWithinLimit("maxCollectionItems", layer.path.length);
      return;
    case "surface": {
      counters.surfaces += 1;
      assertWithinLimit("maxNestedSurfaces", counters.surfaces);
      if (depth > maxDepth) throw new ApexifyResourceLimitError("maxSceneDepth", maxDepth, depth);
      assertRecord(layer.placement, `${path}.placement`);
      const p = layer.placement;
      assertFiniteNumber(p.x, `${path}.placement.x`);
      assertFiniteNumber(p.y, `${path}.placement.y`);
      assertFiniteNumber(p.width, `${path}.placement.width`, { min: 0, exclusiveMin: true, integer: true });
      assertFiniteNumber(p.height, `${path}.placement.height`, { min: 0, exclusiveMin: true, integer: true });
      assertCanvasResourceLimits(p.width, p.height);
      counters.totalPixels += p.width * p.height;
      assertWithinLimit("maxSceneTotalPixels", counters.totalPixels);
      assertOpacity(p.opacity, `${path}.placement.opacity`);
      if (p.scaleX !== undefined) assertFiniteNumber(p.scaleX, `${path}.placement.scaleX`, { min: 0, exclusiveMin: true });
      if (p.scaleY !== undefined) assertFiniteNumber(p.scaleY, `${path}.placement.scaleY`, { min: 0, exclusiveMin: true });
      if (p.rotation !== undefined) assertFiniteNumber(p.rotation, `${path}.placement.rotation`);
      if (layer.background !== undefined) {
        assertNoBackgroundDimensions(layer.background, `${path}.background`);
        addRemoteAssets(counters, countCanvasBackgroundRemoteSources(layer.background));
        validateCanvasConfig({ ...layer.background, width: p.width, height: p.height });
      }
      assertCollection(layer.layers, `${path}.layers`);
      layer.layers.forEach((child, index) => validateLayer(child, depth + 1, maxDepth, counters, `${path}.layers[${index}]`));
      return;
    }
    default:
      throw new ApexifyInputError(`${path}.type is not a supported scene layer type.`);
  }
}

export function validateSceneRenderInput(input: SceneRenderInput, options: SceneValidationOptions = {}): void {
  assertRecord(input, "scene");
  assertFiniteNumber(input.width, "scene.width", { min: 0, exclusiveMin: true, integer: true });
  assertFiniteNumber(input.height, "scene.height", { min: 0, exclusiveMin: true, integer: true });
  assertCanvasResourceLimits(input.width, input.height);
  assertCollection(input.layers, "scene.layers");
  if (input.background !== undefined) {
    assertNoBackgroundDimensions(input.background, "scene.background");
    validateCanvasConfig({ ...input.background, width: input.width, height: input.height });
  }

  const configured = getDefaultApexifyRuntimeConfig().limits.maxSceneDepth;
  let maxDepth = configured;
  if (options.maxSurfaceDepth !== undefined) {
    assertFiniteNumber(options.maxSurfaceDepth, "scene.maxSurfaceDepth", { min: 0, exclusiveMin: true, integer: true });
    if (options.maxSurfaceDepth > configured) throw new ApexifyResourceLimitError("maxSceneDepth", configured, options.maxSurfaceDepth);
    maxDepth = options.maxSurfaceDepth;
  }

  const counters: SceneCounters = {
    layers: 0,
    surfaces: 0,
    totalPixels: input.width * input.height,
    remoteAssets: countCanvasBackgroundRemoteSources(input.background),
    charts: 0,
    images: 0,
    textLayers: 0,
    textContent: 0,
  };
  assertWithinLimit("maxSceneTotalPixels", counters.totalPixels);
  assertWithinLimit("maxRemoteAssets", counters.remoteAssets);
  input.layers.forEach((layer, index) => validateLayer(layer, 1, maxDepth, counters, `scene.layers[${index}]`));
}
