import type { SceneLayer, AvatarToLayersOptions } from "../types";
import { componentFinite, componentImageSource, componentNonNegative, componentPositive } from "./component-validation";
import { ApexifyInputError } from "../runtime/errors";

export function avatarToLayers(o: AvatarToLayersOptions): SceneLayer[] {
  componentImageSource(o.source, "components.avatar.source");
  componentFinite(o.x, "components.avatar.x");
  componentFinite(o.y, "components.avatar.y");
  componentPositive(o.size, "components.avatar.size");
  const borderWidth = componentNonNegative(o.borderWidth ?? 0, "components.avatar.borderWidth");
  if (borderWidth > o.size) throw new ApexifyInputError("components.avatar.borderWidth must not exceed size.");
  const layers: SceneLayer[] = [];

  if (o.borderColor && borderWidth > 0) {
    const outer = o.size + 2 * borderWidth;
    layers.push({
      type: "image",
      images: {
        source: "circle",
        x: o.x - borderWidth,
        y: o.y - borderWidth,
        width: outer,
        height: outer,
        shape: { fill: true, color: o.borderColor },
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
