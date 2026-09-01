import type { CustomOptions } from "../types";
import { assertCollection, assertFiniteNumber, assertFiniteNumericLeaves, assertGradient, assertRecord } from "../runtime/validation";

/**
 * Validates {@link SceneLayer} `customLines` and {@link ApexPainter#path2d.custom} through one bounded runtime contract.
 */
export function validateSceneCustomLinesOptions(opts: CustomOptions[]): void {
  assertCollection(opts, "customLines", { min: 1, limit: "maxCollectionItems" });
  for (let i = 0; i < opts.length; i++) {
    const opt = opts[i];
    const name = `customLines[${i}]`;
    assertRecord(opt, name);
    assertRecord(opt.startCoordinates, `${name}.startCoordinates`);
    assertFiniteNumber(opt.startCoordinates.x, `${name}.startCoordinates.x`);
    assertFiniteNumber(opt.startCoordinates.y, `${name}.startCoordinates.y`);
    assertRecord(opt.endCoordinates, `${name}.endCoordinates`);
    assertFiniteNumber(opt.endCoordinates.x, `${name}.endCoordinates.x`);
    assertFiniteNumber(opt.endCoordinates.y, `${name}.endCoordinates.y`);
    assertFiniteNumericLeaves(opt, name);

    if (opt.markers !== undefined) {
      assertCollection(opt.markers, `${name}.markers`, { limit: "maxCollectionItems" });
    }
    if (opt.lineStyle?.lineDash?.dashArray !== undefined) {
      assertCollection(opt.lineStyle.lineDash.dashArray, `${name}.lineStyle.lineDash.dashArray`, { limit: "maxCollectionItems" });
    }
    if (opt.lineStyle?.pattern?.segments !== undefined) {
      assertCollection(opt.lineStyle.pattern.segments, `${name}.lineStyle.pattern.segments`, { limit: "maxCollectionItems" });
    }
    assertGradient(opt.lineStyle?.gradient, `${name}.lineStyle.gradient`);
    assertGradient(opt.lineStyle?.stroke?.gradient, `${name}.lineStyle.stroke.gradient`);
    assertGradient(opt.lineStyle?.shadow?.gradient, `${name}.lineStyle.shadow.gradient`);
  }
}
