import type { CanvasConfig, PatternOptions } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import {
  assertCollection, assertDimensions, assertEnum, assertFiniteNumber, assertFiniteNumericLeaves,
  assertGradient, assertNonEmptyString, assertOpacity, assertOptionalEnum, assertOptionalFiniteNumber,
  assertRecord,
} from "../runtime/validation";

const FIT = ["fill", "contain", "cover"] as const;
const ALIGN = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
const BG_TYPES = ["color", "gradient", "image", "pattern", "presetPattern", "noise"] as const;

const PATTERN_TYPES = ["grid", "dots", "diagonal", "stripes", "waves", "crosses", "hexagons", "checkerboard", "diamonds", "triangles", "stars", "polka", "custom"] as const;
const PATTERN_REPEAT = ["repeat", "repeat-x", "repeat-y", "no-repeat"] as const;

export function validatePatternOptions(pattern: PatternOptions, name = "pattern"): void {
  assertRecord(pattern, name);
  assertEnum(pattern.type, `${name}.type`, PATTERN_TYPES);
  assertOpacity(pattern.opacity, `${name}.opacity`);
  assertOptionalFiniteNumber(pattern.size, `${name}.size`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(pattern.spacing, `${name}.spacing`, { min: 0 });
  assertOptionalFiniteNumber(pattern.rotation, `${name}.rotation`);
  assertOptionalFiniteNumber(pattern.scale, `${name}.scale`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(pattern.offsetX, `${name}.offsetX`);
  assertOptionalFiniteNumber(pattern.offsetY, `${name}.offsetY`);
  assertOptionalEnum(pattern.repeat, `${name}.repeat`, PATTERN_REPEAT);
  if (pattern.color !== undefined) assertNonEmptyString(pattern.color, `${name}.color`, 512);
  if (pattern.secondaryColor !== undefined) assertNonEmptyString(pattern.secondaryColor, `${name}.secondaryColor`, 512);
  if (pattern.type === "custom") {
    assertNonEmptyString(pattern.customPatternImage, `${name}.customPatternImage`, 16_384);
  }
  assertFiniteNumericLeaves(pattern, name);
}

function validateFilters(filters: unknown, name: string): void {
  if (filters === undefined) return;
  assertCollection(filters, name, { limit: "maxFiltersPerOperation" });
  for (let i = 0; i < filters.length; i++) {
    assertRecord(filters[i], `${name}[${i}]`);
    assertFiniteNumericLeaves(filters[i], `${name}[${i}]`);
  }
}

function validateBackgroundLayer(layer: unknown, index: number): void {
  const name = `canvas.bgLayers[${index}]`;
  assertRecord(layer, name);
  assertEnum(layer.type, `${name}.type`, BG_TYPES);
  assertOpacity(layer.opacity, `${name}.opacity`);
  if (layer.type === "color") assertNonEmptyString(layer.value, `${name}.value`, 512);
  if (layer.type === "gradient") assertGradient(layer.value, `${name}.value`);
  if (layer.type === "image" || layer.type === "pattern") {
    assertNonEmptyString(layer.source, `${name}.source`, 16_384);
  }
  if (layer.type === "image") {
    assertOptionalEnum(layer.fit, `${name}.fit`, FIT);
    assertOptionalEnum(layer.align, `${name}.align`, ALIGN);
  }
  if (layer.type === "pattern") {
    assertOptionalEnum(layer.repeat, `${name}.repeat`, ["repeat", "repeat-x", "repeat-y", "no-repeat"] as const);
  }
  if (layer.type === "presetPattern") {
    validatePatternOptions(layer.pattern as PatternOptions, `${name}.pattern`);
  }
  if (layer.type === "noise") assertOptionalFiniteNumber(layer.intensity, `${name}.intensity`, { min: 0, max: 1 });
}

export function validateCanvasConfig(canvas: CanvasConfig): void {
  assertRecord(canvas, "canvas");
  if (canvas.width !== undefined || canvas.height !== undefined) {
    if (canvas.width !== undefined) assertFiniteNumber(canvas.width, "canvas.width", { min: 0, exclusiveMin: true, integer: true });
    if (canvas.height !== undefined) assertFiniteNumber(canvas.height, "canvas.height", { min: 0, exclusiveMin: true, integer: true });
    if (canvas.width !== undefined && canvas.height !== undefined) assertDimensions(canvas.width, canvas.height, "canvas");
  }
  assertOptionalFiniteNumber(canvas.x, "canvas.x");
  assertOptionalFiniteNumber(canvas.y, "canvas.y");
  assertOpacity(canvas.opacity, "canvas.opacity");
  assertOptionalFiniteNumber(canvas.blur, "canvas.blur", { min: 0 });
  assertOptionalFiniteNumber(canvas.rotation, "canvas.rotation");
  if (canvas.borderRadius !== undefined && canvas.borderRadius !== "circular") {
    assertFiniteNumber(canvas.borderRadius, "canvas.borderRadius", { min: 0 });
  }
  if (canvas.zoom !== undefined) {
    assertRecord(canvas.zoom, "canvas.zoom");
    assertOptionalFiniteNumber(canvas.zoom.scale, "canvas.zoom.scale", { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(canvas.zoom.centerX, "canvas.zoom.centerX");
    assertOptionalFiniteNumber(canvas.zoom.centerY, "canvas.zoom.centerY");
  }
  if (canvas.customBg !== undefined) {
    assertRecord(canvas.customBg, "canvas.customBg");
    assertNonEmptyString(canvas.customBg.source, "canvas.customBg.source", 16_384);
    assertOptionalEnum(canvas.customBg.fit, "canvas.customBg.fit", FIT);
    assertOptionalEnum(canvas.customBg.align, "canvas.customBg.align", ALIGN);
    assertOpacity(canvas.customBg.opacity, "canvas.customBg.opacity");
    validateFilters(canvas.customBg.filters, "canvas.customBg.filters");
  }
  if (canvas.videoBg !== undefined) {
    assertRecord(canvas.videoBg, "canvas.videoBg");
    if (!(typeof canvas.videoBg.source === "string" && canvas.videoBg.source.trim()) && !Buffer.isBuffer(canvas.videoBg.source)) {
      throw new ApexifyInputError("canvas.videoBg.source must be a non-empty string or Buffer.");
    }
    assertOptionalFiniteNumber(canvas.videoBg.frame, "canvas.videoBg.frame", { min: 0, integer: true });
    assertOptionalFiniteNumber(canvas.videoBg.time, "canvas.videoBg.time", { min: 0 });
    assertOpacity(canvas.videoBg.opacity, "canvas.videoBg.opacity");
    assertOptionalFiniteNumber(canvas.videoBg.quality, "canvas.videoBg.quality", { min: 1, max: 100, integer: true });
  }
  assertGradient(canvas.gradientBg, "canvas.gradientBg");
  if (canvas.patternBg !== undefined) {
    validatePatternOptions(canvas.patternBg, "canvas.patternBg");
  }
  if (canvas.noiseBg !== undefined) {
    assertRecord(canvas.noiseBg, "canvas.noiseBg");
    assertOptionalFiniteNumber(canvas.noiseBg.intensity, "canvas.noiseBg.intensity", { min: 0, max: 1 });
  }
  if (canvas.bgLayers !== undefined) {
    assertCollection(canvas.bgLayers, "canvas.bgLayers", { limit: "maxBackgroundLayers" });
    canvas.bgLayers.forEach(validateBackgroundLayer);
  }
  if (canvas.stroke !== undefined) assertFiniteNumericLeaves(canvas.stroke, "canvas.stroke");
  if (canvas.shadow !== undefined) assertFiniteNumericLeaves(canvas.shadow, "canvas.shadow");
}

export function validateInheritedCanvasDimensions(width: number, height: number): void {
  assertDimensions(width, height, "canvas.customBg.inherited");
}

export function validateBackgroundLayerCount(count: number): void {
  assertWithinLimit("maxBackgroundLayers", count);
}
