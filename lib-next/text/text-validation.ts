import type { CreateTextOptions, TextPerspectiveOptions, TextProperties } from "../types";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertFiniteNumber, assertFiniteNumericLeaves, assertGradient, assertOpacity,
  assertOptionalEnum, assertOptionalFiniteNumber, assertRecord,
} from "../runtime/validation";

const ALIGN = ["left", "center", "right", "start", "end"] as const;
const BASELINE = ["alphabetic", "bottom", "hanging", "ideographic", "middle", "top"] as const;
const CURVE_MODE = ["fit", "clamp", "override"] as const;
const FONT_STYLE = ["normal", "italic", "oblique"] as const;
const FONT_WEIGHT = ["normal", "bold", "bolder", "lighter"] as const;
const STROKE_STYLE = ["solid", "dashed", "dotted", "groove", "ridge", "double"] as const;

function validatePerspective(value: TextPerspectiveOptions | undefined, name: string): void {
  if (value === undefined) return;
  assertRecord(value, name);
  if (!Array.isArray(value.points) || value.points.length !== 4) {
    throw new ApexifyInputError(`${name}.points must contain exactly 4 destination corners.`);
  }
  value.points.forEach((point, index) => {
    assertRecord(point, `${name}.points[${index}]`);
    assertFiniteNumber(point.x, `${name}.points[${index}].x`);
    assertFiniteNumber(point.y, `${name}.points[${index}].y`);
  });
  assertOptionalEnum(value.interpolation, `${name}.interpolation`, ["nearest", "bilinear", "bicubic"] as const);
  assertOptionalEnum(value.edgeMode, `${name}.edgeMode`, ["transparent", "clamp", "wrap", "mirror"] as const);
}

function validateSkew(value: unknown, name: string): void {
  if (value === undefined) return;
  assertFiniteNumber(value, name);
  if (Math.abs(value) >= 90) throw new ApexifyInputError(`${name} must be strictly between -90 and 90 degrees.`);
}

function validateLineDecoration(value: unknown, name: string): void {
  if (value === undefined || typeof value === "boolean") return;
  assertRecord(value, name);
  assertOptionalFiniteNumber(value.width, `${name}.width`, { min: 0 });
  assertGradient(value.gradient, `${name}.gradient`);
}

export function validateTextProperties(textProps: TextProperties, index?: number): void {
  const name = index === undefined ? "text" : `texts[${index}]`;
  assertRecord(textProps, name);
  if (typeof textProps.text !== "string" || textProps.text.length === 0) {
    throw new ApexifyInputError(`${name}.text must be a non-empty string.`);
  }
  assertWithinLimit("maxTextLength", textProps.text.length);
  assertFiniteNumber(textProps.x, `${name}.x`);
  assertFiniteNumber(textProps.y, `${name}.y`);
  if (textProps.font !== undefined) {
    assertRecord(textProps.font, `${name}.font`);
    for (const [key, value] of [
      ["family", textProps.font.family],
      ["name", textProps.font.name],
      ["path", textProps.font.path],
    ] as const) {
      if (value !== undefined && (typeof value !== "string" || value.trim().length === 0 || value.includes("\0"))) {
        throw new ApexifyInputError(`${name}.font.${key} must be a non-empty string without NUL bytes.`);
      }
    }
    if (typeof textProps.font.weight === "number") {
      assertFiniteNumber(textProps.font.weight, `${name}.font.weight`, { min: 100, max: 900, integer: true });
    } else {
      assertOptionalEnum(textProps.font.weight, `${name}.font.weight`, FONT_WEIGHT);
    }
    assertOptionalEnum(textProps.font.style, `${name}.font.style`, FONT_STYLE);
  }
  const fontSize = textProps.font?.size ?? textProps.fontSize;
  assertOptionalFiniteNumber(fontSize, `${name}.fontSize`, { min: 0, exclusiveMin: true });
  if (typeof fontSize === "number") assertWithinLimit("maxCanvasDimension", fontSize);

  const layout = textProps.layout;
  if (layout !== undefined) assertRecord(layout, `${name}.layout`);
  const lineHeight = layout?.lineHeight ?? textProps.lineHeight;
  const letterSpacing = layout?.letterSpacing ?? textProps.letterSpacing;
  const wordSpacing = layout?.wordSpacing ?? textProps.wordSpacing;
  const maxWidth = layout?.maxWidth ?? textProps.maxWidth;
  const maxHeight = layout?.maxHeight ?? textProps.maxHeight;
  assertOptionalFiniteNumber(lineHeight, `${name}.lineHeight`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(letterSpacing, `${name}.letterSpacing`);
  assertOptionalFiniteNumber(wordSpacing, `${name}.wordSpacing`);
  assertOptionalFiniteNumber(maxWidth, `${name}.maxWidth`, { min: 0, exclusiveMin: true });
  assertOptionalFiniteNumber(maxHeight, `${name}.maxHeight`, { min: 0, exclusiveMin: true });
  if (typeof maxWidth === "number") assertWithinLimit("maxCanvasDimension", maxWidth);
  if (typeof maxHeight === "number") assertWithinLimit("maxCanvasDimension", maxHeight);

  const placement = textProps.placement;
  if (placement !== undefined) assertRecord(placement, `${name}.placement`);
  assertOptionalEnum(placement?.textAlign ?? textProps.textAlign, `${name}.textAlign`, ALIGN);
  assertOptionalEnum(placement?.textBaseline ?? textProps.textBaseline, `${name}.textBaseline`, BASELINE);
  assertOptionalFiniteNumber(placement?.rotation ?? textProps.rotation, `${name}.rotation`);
  assertOptionalFiniteNumber(placement?.scaleX ?? textProps.scaleX, `${name}.scaleX`);
  assertOptionalFiniteNumber(placement?.scaleY ?? textProps.scaleY, `${name}.scaleY`);
  validateSkew(placement?.skewX ?? textProps.skewX, `${name}.skewX`);
  validateSkew(placement?.skewY ?? textProps.skewY, `${name}.skewY`);
  validatePerspective(placement?.perspective, `${name}.placement.perspective`);

  const fill = textProps.fill;
  if (fill !== undefined) assertRecord(fill, `${name}.fill`);
  assertOpacity(fill?.opacity ?? textProps.opacity, `${name}.opacity`);
  assertGradient(fill?.gradient ?? textProps.gradient, `${name}.gradient`);

  const effects = textProps.effects;
  if (effects !== undefined) assertRecord(effects, `${name}.effects`);
  const shadow = effects?.shadow ?? textProps.shadow;
  if (shadow !== undefined) {
    assertRecord(shadow, `${name}.shadow`);
    assertOptionalFiniteNumber(shadow.offsetX, `${name}.shadow.offsetX`);
    assertOptionalFiniteNumber(shadow.offsetY, `${name}.shadow.offsetY`);
    assertOptionalFiniteNumber(shadow.blur, `${name}.shadow.blur`, { min: 0 });
    assertOpacity(shadow.opacity, `${name}.shadow.opacity`);
    assertGradient(shadow.gradient, `${name}.shadow.gradient`);
  }
  const glow = effects?.glow ?? textProps.glow;
  if (glow !== undefined) {
    assertRecord(glow, `${name}.glow`);
    assertOptionalFiniteNumber(glow.intensity, `${name}.glow.intensity`, { min: 0 });
    assertOpacity(glow.opacity, `${name}.glow.opacity`);
    assertGradient(glow.gradient, `${name}.glow.gradient`);
  }
  const highlight = effects?.highlight ?? textProps.highlight;
  if (highlight !== undefined) {
    assertRecord(highlight, `${name}.highlight`);
    assertOpacity(highlight.opacity, `${name}.highlight.opacity`);
    assertGradient(highlight.gradient, `${name}.highlight.gradient`);
  }

  if (textProps.stroke !== undefined) {
    assertRecord(textProps.stroke, `${name}.stroke`);
    assertOptionalFiniteNumber(textProps.stroke.width, `${name}.stroke.width`, { min: 0 });
    assertOpacity(textProps.stroke.opacity, `${name}.stroke.opacity`);
    assertGradient(textProps.stroke.gradient, `${name}.stroke.gradient`);
    assertOptionalEnum(textProps.stroke.style, `${name}.stroke.style`, STROKE_STYLE);
  }

  const dec = textProps.decorations;
  validateLineDecoration(dec?.underline ?? textProps.underline, `${name}.underline`);
  validateLineDecoration(dec?.overline ?? textProps.overline, `${name}.overline`);
  validateLineDecoration(dec?.strikethrough ?? textProps.strikethrough, `${name}.strikethrough`);

  if (textProps.textOnCurve !== undefined) {
    const curve = textProps.textOnCurve;
    assertRecord(curve, `${name}.textOnCurve`);
    assertFiniteNumber(curve.sweepAngle, `${name}.textOnCurve.sweepAngle`, { min: 0, exclusiveMin: true, max: 360 });
    if (curve.sweepAngle >= 360) {
      throw new ApexifyInputError(`${name}.textOnCurve.sweepAngle must be < 360.`);
    }
    assertOptionalFiniteNumber(curve.radius, `${name}.textOnCurve.radius`, { min: 0, exclusiveMin: true });
    if (curve.up !== undefined && typeof curve.up !== "boolean") {
      throw new ApexifyInputError(`${name}.textOnCurve.up must be a boolean.`);
    }
    assertOptionalEnum(curve.layoutMode, `${name}.textOnCurve.layoutMode`, CURVE_MODE);
    assertOptionalFiniteNumber(curve.baselineOffset, `${name}.textOnCurve.baselineOffset`);
    assertOptionalFiniteNumber(curve.startAngleDeg, `${name}.textOnCurve.startAngleDeg`);
  }

  if (textProps.isBold !== undefined && typeof textProps.isBold !== "boolean") {
    throw new ApexifyInputError(`${name}.isBold must be a boolean.`);
  }
  if (textProps.outlined !== undefined && typeof textProps.outlined !== "boolean") {
    throw new ApexifyInputError(`${name}.outlined must be a boolean.`);
  }

  if (textProps.measurementCanvas !== undefined) {
    assertRecord(textProps.measurementCanvas, `${name}.measurementCanvas`);
    const w = textProps.measurementCanvas.width;
    const h = textProps.measurementCanvas.height;
    assertOptionalFiniteNumber(w, `${name}.measurementCanvas.width`, { min: 0, exclusiveMin: true, integer: true });
    assertOptionalFiniteNumber(h, `${name}.measurementCanvas.height`, { min: 0, exclusiveMin: true, integer: true });
    if (w !== undefined && h !== undefined) assertCanvasResourceLimits(w, h);
  }
  assertFiniteNumericLeaves(textProps, name);
}

export function validateTextInput(texts: TextProperties | TextProperties[]): TextProperties[] {
  const list = Array.isArray(texts) ? texts : [texts];
  if (list.length === 0) throw new ApexifyInputError("createText requires at least one text object.");
  assertWithinLimit("maxCollectionItems", list.length);
  let totalLength = 0;
  list.forEach((text, i) => {
    validateTextProperties(text, i);
    totalLength += text.text.length;
  });
  assertWithinLimit("maxTextLength", totalLength);
  return list;
}

export function getTextValidationDefaults(): { maxTextLength: number } {
  return { maxTextLength: getDefaultApexifyRuntimeConfig().limits.maxTextLength };
}


export function validateCreateTextOptions(options: CreateTextOptions | undefined): void {
  if (options === undefined) return;
  assertRecord(options, "createText.options");
  if (options.isGrouped !== undefined && typeof options.isGrouped !== "boolean") {
    throw new ApexifyInputError("createText.options.isGrouped must be a boolean.");
  }
  const group = options.groupTransform;
  if (group === undefined) return;
  assertRecord(group, "createText.options.groupTransform");
  for (const [key, value] of [
    ["rotation", group.rotation],
    ["translateX", group.translateX],
    ["translateY", group.translateY],
    ["scaleX", group.scaleX],
    ["scaleY", group.scaleY],
    ["pivotX", group.pivotX],
    ["pivotY", group.pivotY],
  ] as const) {
    assertOptionalFiniteNumber(value, `createText.options.groupTransform.${key}`);
  }
  validateSkew(group.skewX, "createText.options.groupTransform.skewX");
  validateSkew(group.skewY, "createText.options.groupTransform.skewY");
  assertOpacity(group.opacity, "createText.options.groupTransform.opacity");
  validatePerspective(group.perspective, "createText.options.groupTransform.perspective");
}
