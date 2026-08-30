import type { CreateImageOptions, GroupTransformOptions, ImageProperties, ShapeType } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection, assertEnum, assertFiniteNumber, assertFiniteNumericLeaves, assertGradient, assertOpacity,
  assertOptionalEnum, assertOptionalFiniteNumber, assertRecord, assertSource,
} from "../runtime/validation";

const SHAPES: readonly ShapeType[] = ["rectangle", "square", "circle", "triangle", "trapezium", "star", "heart", "polygon", "arc", "pieSlice"];
const FIT = ["fill", "contain", "cover"] as const;
const ALIGN = ["center", "top", "bottom", "left", "right", "top-left", "top-right", "bottom-left", "bottom-right"] as const;

function validatePoint(point: unknown, name: string): void {
  assertRecord(point, name);
  assertFiniteNumber(point.x, `${name}.x`);
  assertFiniteNumber(point.y, `${name}.y`);
}

function validateFilterList(filters: unknown, name: string): void {
  if (filters === undefined) return;
  assertCollection(filters, name, { limit: "maxFiltersPerOperation" });
  for (let i = 0; i < filters.length; i++) {
    assertRecord(filters[i], `${name}[${i}]`);
    assertFiniteNumericLeaves(filters[i], `${name}[${i}]`);
  }
}

function validateShape(ip: ImageProperties, name: string): void {
  const shapeSource = typeof ip.source === "string" && (SHAPES as readonly string[]).includes(ip.source);
  if (!shapeSource && ip.shape === undefined) return;
  if (ip.shape !== undefined) {
    assertRecord(ip.shape, `${name}.shape`);
    assertFiniteNumericLeaves(ip.shape, `${name}.shape`);
    assertOptionalFiniteNumber(ip.shape.radius, `${name}.shape.radius`, { min: 0, exclusiveMin: true });
    assertOptionalFiniteNumber(ip.shape.innerRadius, `${name}.shape.innerRadius`, { min: 0 });
    assertOptionalFiniteNumber(ip.shape.outerRadius, `${name}.shape.outerRadius`, { min: 0, exclusiveMin: true });
    if (ip.shape.sides !== undefined) {
      assertFiniteNumber(ip.shape.sides, `${name}.shape.sides`, { min: 3, integer: true });
      assertWithinLimit("maxCollectionItems", ip.shape.sides);
    }
    if (ip.shape.points !== undefined) {
      assertCollection(ip.shape.points, `${name}.shape.points`, { min: 1, limit: "maxCollectionItems" });
      ip.shape.points.forEach((p, i) => validatePoint(p, `${name}.shape.points[${i}]`));
    }
    assertGradient(ip.shape.gradient, `${name}.shape.gradient`);
  }
}

export function validateGroupTransform(group: GroupTransformOptions | undefined): void {
  if (group === undefined) return;
  assertRecord(group, "createImage.options.groupTransform");
  assertFiniteNumericLeaves(group, "createImage.options.groupTransform");
  assertOpacity(group.opacity, "createImage.options.groupTransform.opacity");
  assertOptionalFiniteNumber(group.scaleX, "createImage.options.groupTransform.scaleX", { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(group.scaleY, "createImage.options.groupTransform.scaleY", { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(group.blur, "createImage.options.groupTransform.blur", { min: 0 });
  validateFilterList(group.filters, "createImage.options.groupTransform.filters");
  if (group.clipPath !== undefined) {
    assertCollection(group.clipPath, "createImage.options.groupTransform.clipPath", { min: 1, limit: "maxCollectionItems" });
    group.clipPath.forEach((p, i) => validatePoint(p, `createImage.options.groupTransform.clipPath[${i}]`));
  }
}

export function validateImageProperties(ip: ImageProperties, index?: number): void {
  const name = index === undefined ? "image" : `images[${index}]`;
  assertRecord(ip, name);
  if (typeof ip.source === "string" && (SHAPES as readonly string[]).includes(ip.source)) {
    assertEnum(ip.source, `${name}.source`, SHAPES);
  } else {
    assertSource(ip.source, `${name}.source`);
  }
  assertFiniteNumber(ip.x, `${name}.x`);
  assertFiniteNumber(ip.y, `${name}.y`);
  assertOptionalFiniteNumber(ip.width, `${name}.width`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(ip.height, `${name}.height`, { min: 0, exclusiveMin: true });
  if (ip.width !== undefined) assertWithinLimit("maxCanvasDimension", ip.width);
  if (ip.height !== undefined) assertWithinLimit("maxCanvasDimension", ip.height);
  if (ip.width !== undefined && ip.height !== undefined) assertCanvasResourceLimits(ip.width, ip.height);
  assertOptionalEnum(ip.fit, `${name}.fit`, FIT);
  assertOptionalEnum(ip.align, `${name}.align`, ALIGN);
  assertOptionalFiniteNumber(ip.rotation, `${name}.rotation`);
  assertOpacity(ip.opacity, `${name}.opacity`);
  assertOptionalFiniteNumber(ip.blur, `${name}.blur`, { min: 0 });
  if (ip.borderRadius !== undefined && ip.borderRadius !== "circular") assertFiniteNumber(ip.borderRadius, `${name}.borderRadius`, { min: 0 });
  validateFilterList(ip.filters, `${name}.filters`);
  assertOptionalFiniteNumber(ip.filterIntensity, `${name}.filterIntensity`, { min: 0 });

  if (ip.mask !== undefined) {
    assertRecord(ip.mask, `${name}.mask`);
    assertSource(ip.mask.source, `${name}.mask.source`);
    assertOptionalEnum(ip.mask.mode, `${name}.mask.mode`, ["alpha", "luminance", "inverse"] as const);
  }
  if (ip.clipPath !== undefined) {
    assertCollection(ip.clipPath, `${name}.clipPath`, { min: 1, limit: "maxCollectionItems" });
    ip.clipPath.forEach((p, i) => validatePoint(p, `${name}.clipPath[${i}]`));
  }
  if (ip.distortion !== undefined) {
    assertRecord(ip.distortion, `${name}.distortion`);
    assertEnum(ip.distortion.type, `${name}.distortion.type`, ["perspective", "warp", "bulge", "pinch"] as const);
    assertOptionalFiniteNumber(ip.distortion.intensity, `${name}.distortion.intensity`);
    if (ip.distortion.points !== undefined) {
      assertCollection(ip.distortion.points, `${name}.distortion.points`, { min: 1, limit: "maxCollectionItems" });
      ip.distortion.points.forEach((p, i) => validatePoint(p, `${name}.distortion.points[${i}]`));
    }
  }
  if (ip.meshWarp !== undefined) {
    assertRecord(ip.meshWarp, `${name}.meshWarp`);
    assertOptionalFiniteNumber(ip.meshWarp.gridX, `${name}.meshWarp.gridX`, { min: 1, integer: true });
    assertOptionalFiniteNumber(ip.meshWarp.gridY, `${name}.meshWarp.gridY`, { min: 1, integer: true });
    if (ip.meshWarp.gridX !== undefined && ip.meshWarp.gridY !== undefined) {
      assertWithinLimit("maxCollectionItems", ip.meshWarp.gridX * ip.meshWarp.gridY);
    }
    if (ip.meshWarp.controlPoints !== undefined) {
      assertCollection(ip.meshWarp.controlPoints, `${name}.meshWarp.controlPoints`, { min: 1, limit: "maxCollectionItems" });
      let total = 0;
      ip.meshWarp.controlPoints.forEach((row, y) => {
        assertCollection(row, `${name}.meshWarp.controlPoints[${y}]`, { min: 1, limit: "maxCollectionItems" });
        total += row.length;
        row.forEach((p, x) => validatePoint(p, `${name}.meshWarp.controlPoints[${y}][${x}]`));
      });
      assertWithinLimit("maxCollectionItems", total);
    }
  }
  if (ip.effects !== undefined) assertFiniteNumericLeaves(ip.effects, `${name}.effects`);
  validateShape(ip, name);
  if (ip.stroke !== undefined) assertFiniteNumericLeaves(ip.stroke, `${name}.stroke`);
  if (ip.shadow !== undefined) assertFiniteNumericLeaves(ip.shadow, `${name}.shadow`);
  if (ip.boxBackground !== undefined) assertFiniteNumericLeaves(ip.boxBackground, `${name}.boxBackground`);
}

export function validateImageInput(images: ImageProperties | ImageProperties[], options?: CreateImageOptions): ImageProperties[] {
  const list = Array.isArray(images) ? images : [images];
  if (list.length === 0) throw new ApexifyInputError("createImage requires at least one image or shape.");
  assertWithinLimit("maxCollectionItems", list.length);
  list.forEach((ip, i) => validateImageProperties(ip, i));
  if (options !== undefined) {
    assertRecord(options, "createImage.options");
    if (options.isGrouped !== undefined && typeof options.isGrouped !== "boolean") throw new ApexifyInputError("createImage.options.isGrouped must be boolean.");
    validateGroupTransform(options.groupTransform);
  }
  return list;
}
