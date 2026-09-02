import type { GIFInputFrame, SceneGifInputFrame } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumber } from "../runtime/validation";

export type { SceneGifInputFrame };

export function expandSceneGifFrames(frames: SceneGifInputFrame[]): GIFInputFrame[] {
  assertWithinLimit("maxGifFrames", frames.length);
  const out: GIFInputFrame[] = [];
  for (let index = 0; index < frames.length; index++) {
    const raw = frames[index];
    const { repeat, ...rest } = raw;
    if (repeat !== undefined) {
      assertFiniteNumber(repeat, `scene.gifFrames[${index}].repeat`, { min: 1, integer: true });
    }
    const n = repeat ?? 1;
    if (out.length + n > Number.MAX_SAFE_INTEGER) {
      throw new ApexifyInputError("scene GIF repeat expansion exceeds safe integer range.");
    }
    assertWithinLimit("maxGifFrames", out.length + n);
    const base = { ...rest } as GIFInputFrame;
    for (let i = 0; i < n; i++) out.push({ ...base });
  }
  return out;
}
