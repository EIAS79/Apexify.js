import type { GIFInputFrame } from "../types/gif";
import type { SceneGifInputFrame } from "../types/scene";

export type { SceneGifInputFrame };

export function expandSceneGifFrames(frames: SceneGifInputFrame[]): GIFInputFrame[] {
  const out: GIFInputFrame[] = [];
  for (const raw of frames) {
    const { repeat, ...rest } = raw;
    const n = Math.max(1, Math.floor(repeat ?? 1));
    const base = { ...rest } as GIFInputFrame;
    for (let i = 0; i < n; i++) {
      out.push({ ...base });
    }
  }
  return out;
}
