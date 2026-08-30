import type { TextProperties } from "../types";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits, assertWithinLimit } from "../runtime/limits";
import {
  assertCollection, assertFiniteNumber, assertFiniteNumericLeaves, assertGradient, assertOpacity,
  assertOptionalEnum, assertOptionalFiniteNumber, assertRecord,
} from "../runtime/validation";

const ALIGN = ["left", "center", "right", "start", "end"] as const;
const BASELINE = ["alphabetic", "bottom", "hanging", "ideographic", "middle", "top"] as const;
const CURVE_MODE = ["fit", "clamp", "override"] as const;

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
  }

  const dec = textProps.decorations;
  validateLineDecoration(dec?.underline ?? textProps.underline, `${name}.underline`);
  validateLineDecoration(dec?.overline ?? textProps.overline, `${name}.overline`);
  validateLineDecoration(dec?.strikethrough ?? textProps.strikethrough, `${name}.strikethrough`);

  if (textProps.textOnCurve !== undefined) {
    const curve = textProps.textOnCurve;
    assertRecord(curve, `${name}.textOnCurve`);
    assertFiniteNumber(curve.sweepAngle, `${name}.textOnCurve.sweepAngle`, { min: 0, exclusiveMin: true, max: 360 });
    assertOptionalFiniteNumber(curve.radius, `${name}.textOnCurve.radius`, { min: 0, exclusiveMin: true });
    assertOptionalEnum(curve.layoutMode, `${name}.textOnCurve.layoutMode`, CURVE_MODE);
    assertOptionalFiniteNumber(curve.baselineOffset, `${name}.textOnCurve.baselineOffset`);
    assertOptionalFiniteNumber(curve.startAngleDeg, `${name}.textOnCurve.startAngleDeg`);
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
