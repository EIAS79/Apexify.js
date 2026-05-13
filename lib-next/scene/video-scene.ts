import type { SceneVideoFrameSlot } from "../types/scene";

export type { SceneVideoFrameSlot };

/**
 * Expands video frame slots into a flat list for {@link VideoCreationOptions.createFromFrames.frames}.
 */
export function expandSceneVideoFrames(slots: SceneVideoFrameSlot[]): (string | Buffer)[] {
  const out: (string | Buffer)[] = [];
  for (const s of slots) {
    if (typeof s === "string" || Buffer.isBuffer(s)) {
      out.push(s);
      continue;
    }
    const n = Math.max(1, Math.floor(s.repeat ?? 1));
    for (let i = 0; i < n; i++) {
      out.push(s.source);
    }
  }
  return out;
}
