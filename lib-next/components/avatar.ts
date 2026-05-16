import type { SceneLayer } from "../types/scene";
import type { AvatarToLayersOptions } from "./types";

export function avatarToLayers(o: AvatarToLayersOptions): SceneLayer[] {
  const layers: SceneLayer[] = [];
  const bw = o.borderWidth ?? 0;
  const borderColor = o.borderColor;

  if (borderColor && bw > 0) {
    const outer = o.size + 2 * bw;
    layers.push({
      type: "image",
      images: {
        source: "circle",
        x: o.x - bw,
        y: o.y - bw,
        width: outer,
        height: outer,
        shape: { fill: true, color: borderColor },
      },
    });
  }

  layers.push({
    type: "image",
    images: {
      source: o.source,
      x: o.x,
      y: o.y,
      width: o.size,
      height: o.size,
      borderRadius: "circular",
    },
  });

  return layers;
}
