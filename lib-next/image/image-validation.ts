import type {
  CreateImageOptions,
  GroupTransformOptions,
  ImageDistortionOptions,
  ImageMeshWarpOptions,
  ImageProperties,
  ShapeType,
} from "../types";
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

function validateMask(
  mask: ImageProperties["mask"] | GroupTransformOptions["mask"] | undefined,
  name: string
): void {
  if (mask === undefined) return;
  assertRecord(mask, name);
  assertSource(mask.source, `${name}.source`);
  assertOptionalEnum(mask.mode, `${name}.mode`, ["alpha", "luminance", "inverse"] as const);
}

function validateFilterList(filters: unknown, name: string): void {
  if (filters === undefined) return;
  assertCollection(filters, name, { limit: "maxFiltersPerOperation" });
  for (let i = 0; i < filters.length; i++) {
    assertRecord(filters[i], `${name}[${i}]`);
    assertFiniteNumericLeaves(filters[i], `${name}[${i}]`);
  }
}

function validateDistortion(
  distortion: ImageDistortionOptions | undefined,
  name: string
): void {
  if (distortion === undefined) return;
  assertRecord(distortion, name);
  assertEnum(
    distortion.type,
    `${name}.type`,
    ["perspective", "warp", "bulge", "pinch", "twirl", "wave"] as const
  );
  assertOptionalEnum(
    distortion.interpolation,
    `${name}.interpolation`,
    ["nearest", "bilinear", "bicubic"] as const
  );
  assertOptionalEnum(
    distortion.edgeMode,
    `${name}.edgeMode`,
    ["transparent", "clamp", "wrap", "mirror"] as const
  );
  assertOptionalFiniteNumber(distortion.intensity, `${name}.intensity`);
  assertOptionalFiniteNumber(distortion.centerX, `${name}.centerX`);
  assertOptionalFiniteNumber(distortion.centerY, `${name}.centerY`);
  assertOptionalFiniteNumber(distortion.radius, `${name}.radius`, {
    min: 0,
    exclusiveMin: true,
  });
  assertOptionalFiniteNumber(distortion.angle, `${name}.angle`);
  assertOptionalFiniteNumber(distortion.amplitudeX, `${name}.amplitudeX`);
  assertOptionalFiniteNumber(distortion.amplitudeY, `${name}.amplitudeY`);
  assertOptionalFiniteNumber(distortion.wavelengthX, `${name}.wavelengthX`, {
    min: 0,
    exclusiveMin: true,
  });
  assertOptionalFiniteNumber(distortion.wavelengthY, `${name}.wavelengthY`, {
    min: 0,
    exclusiveMin: true,
  });
  assertOptionalFiniteNumber(distortion.phaseX, `${name}.phaseX`);
  assertOptionalFiniteNumber(distortion.phaseY, `${name}.phaseY`);

  if (distortion.points !== undefined) {
    assertCollection(distortion.points, `${name}.points`, {
      min: 1,
      limit: "maxCollectionItems",
    });
    distortion.points.forEach((point, index) =>
      validatePoint(point, `${name}.points[${index}]`)
    );
  }

  if (distortion.controlPoints !== undefined) {
    assertCollection(distortion.controlPoints, `${name}.controlPoints`, {
      min: 1,
      limit: "maxCollectionItems",
    });
    distortion.controlPoints.forEach((handle, index) => {
      const handleName = `${name}.controlPoints[${index}]`;
      assertRecord(handle, handleName);
      validatePoint(handle.from, `${handleName}.from`);
      validatePoint(handle.to, `${handleName}.to`);
      assertOptionalFiniteNumber(handle.radius, `${handleName}.radius`, {
        min: 0,
        exclusiveMin: true,
      });
      assertOptionalFiniteNumber(handle.strength, `${handleName}.strength`);
      assertOptionalEnum(
        handle.falloff,
        `${handleName}.falloff`,
        ["linear", "smooth", "gaussian"] as const
      );
    });
  }

  if (distortion.type === "perspective") {
    if (distortion.points?.length !== 4) {
      throw new ApexifyInputError(`${name}.points must contain exactly 4 destination corners for perspective.`);
    }
    if (distortion.controlPoints !== undefined) {
      throw new ApexifyInputError(`${name}.controlPoints is only supported by type "warp".`);
    }
  }

  if (distortion.type === "warp") {
    const hasQuad = distortion.points !== undefined;
    const hasHandles = distortion.controlPoints !== undefined;
    if (hasQuad === hasHandles) {
      throw new ApexifyInputError(
        `${name} type "warp" requires either exactly 4 points or controlPoints, but not both.`
      );
    }
    if (hasQuad && distortion.points?.length !== 4) {
      throw new ApexifyInputError(`${name}.points must contain exactly 4 destination corners for quad warp.`);
    }
  } else if (distortion.points !== undefined && distortion.type !== "perspective") {
    throw new ApexifyInputError(`${name}.points is only supported by perspective and warp.`);
  } else if (distortion.controlPoints !== undefined) {
    throw new ApexifyInputError(`${name}.controlPoints is only supported by type "warp".`);
  }
}

function validateMeshWarp(
  meshWarp: ImageMeshWarpOptions | undefined,
  name: string
): void {
  if (meshWarp === undefined) return;
  assertRecord(meshWarp, name);
  assertOptionalFiniteNumber(meshWarp.gridX, `${name}.gridX`, { min: 1, integer: true });
  assertOptionalFiniteNumber(meshWarp.gridY, `${name}.gridY`, { min: 1, integer: true });
  assertOptionalEnum(meshWarp.interpolation, `${name}.interpolation`, ["nearest", "bilinear", "bicubic"] as const);
  assertOptionalEnum(meshWarp.edgeMode, `${name}.edgeMode`, ["transparent", "clamp", "wrap", "mirror"] as const);

  if (!meshWarp.controlPoints) throw new ApexifyInputError(`${name}.controlPoints is required.`);
  assertCollection(meshWarp.controlPoints, `${name}.controlPoints`, { min: 1, limit: "maxCollectionItems" });
  const rows = meshWarp.controlPoints.length;
  const columns = meshWarp.controlPoints[0]?.length ?? 0;
  if (columns === 0) throw new ApexifyInputError(`${name}.controlPoints rows cannot be empty.`);

  let total = 0;
  meshWarp.controlPoints.forEach((row, y) => {
    assertCollection(row, `${name}.controlPoints[${y}]`, { min: 1, limit: "maxCollectionItems" });
    if (row.length !== columns) throw new ApexifyInputError(`${name}.controlPoints must be a rectangular grid.`);
    total += row.length;
    row.forEach((point, x) => validatePoint(point, `${name}.controlPoints[${y}][${x}]`));
  });
  assertWithinLimit("maxCollectionItems", total);

  const gridX = meshWarp.gridX ?? Math.max(1, columns - 1);
  const gridY = meshWarp.gridY ?? Math.max(1, rows - 1);
  assertWithinLimit("maxCollectionItems", gridX * gridY);
  const modern = rows === gridY + 1 && columns === gridX + 1;
  const legacy = rows === gridY && columns === gridX;
  if (!modern && !legacy) {
    throw new ApexifyInputError(
      `${name}.controlPoints must be ${gridY + 1}×${gridX + 1} vertices (or legacy ${gridY}×${gridX} anchors).`
    );
  }
}

function validateShape(
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
  assertOptionalFiniteNumber(group.filterIntensity, "createImage.options.groupTransform.filterIntensity", { min: 0 });
  assertOptionalEnum(group.filterOrder, "createImage.options.groupTransform.filterOrder", ["pre", "post"] as const);
  validateMask(group.mask, "createImage.options.groupTransform.mask");
  validateDistortion(group.distortion, "createImage.options.groupTransform.distortion");
  validateMeshWarp(group.meshWarp, "createImage.options.groupTransform.meshWarp");
  if (group.clipPath !== undefined) {
    assertCollection(group.clipPath, "createImage.options.groupTransform.clipPath", { min: 3, limit: "maxCollectionItems" });
    group.clipPath.forEach((p, i) => validatePoint(p, `createImage.options.groupTransform.clipPath[${i}]`));
  }
}

function validateGroupedTemporarySurfaceBudget(list: ImageProperties[], options?: CreateImageOptions): void {
  const group = options?.groupTransform;
  if (!options?.isGrouped || !group || list.length <= 1) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const image of list) {
    const width = image.width ?? 100;
    const height = image.height ?? 100;
    minX = Math.min(minX, image.x);
    minY = Math.min(minY, image.y);
    maxX = Math.max(maxX, image.x + width);
    maxY = Math.max(maxY, image.y + height);
  }

  const groupWidth = maxX - minX;
  const groupHeight = maxY - minY;
  if (group.filters?.length && group.filterOrder === "pre") {
    assertCanvasResourceLimits(groupWidth, groupHeight);
  }
  if (group.effects?.chromaticAberration || group.effects?.filmGrain) {
    assertCanvasResourceLimits(groupWidth * (group.scaleX ?? 1), groupHeight * (group.scaleY ?? 1));
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
  assertOptionalEnum(ip.filterOrder, `${name}.filterOrder`, ["pre", "post"] as const);
  validateMask(ip.mask, `${name}.mask`);
  if (ip.clipPath !== undefined) {
    assertCollection(ip.clipPath, `${name}.clipPath`, { min: 3, limit: "maxCollectionItems" });
    ip.clipPath.forEach((p, i) => validatePoint(p, `${name}.clipPath[${i}]`));
  }
  validateDistortion(ip.distortion, `${name}.distortion`);
  validateMeshWarp(ip.meshWarp, `${name}.meshWarp`);
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
  validateGroupedTemporarySurfaceBudget(list, options);
  return list;
}
