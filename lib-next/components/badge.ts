import type { SceneLayer, BadgeToLayersOptions } from "../types";
import { componentFinite, componentNonNegative, componentPositive, componentText } from "./component-validation";

export function badgeToLayers(o: BadgeToLayersOptions): SceneLayer[] {
  componentText(o.text, "components.badge.text");
  componentFinite(o.x, "components.badge.x");
  componentFinite(o.y, "components.badge.y");
  const paddingX = componentNonNegative(o.paddingX ?? 14, "components.badge.paddingX");
  const paddingY = componentNonNegative(o.paddingY ?? 8, "components.badge.paddingY");
  const radius = componentNonNegative(o.radius ?? 10, "components.badge.radius");
  const fontSize = componentPositive(o.fontSize ?? 18, "components.badge.fontSize");
  const background = o.background ?? "#6366f1";
  const color = o.color ?? "#ffffff";
  const estimatedWidth = Math.max(56, o.text.length * fontSize * 0.58 + paddingX * 2);
  const boxHeight = fontSize + paddingY * 2;

  return [
    {
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: estimatedWidth,
        height: boxHeight,
        borderRadius: Math.min(radius, boxHeight / 2, estimatedWidth / 2),
        shape: { fill: true, color: background },
      },
    },
    {
      type: "text",
      texts: {
        text: o.text,
        x: o.x + paddingX,
        y: o.y + paddingY + fontSize * 0.85,
        fontSize,
        color,
      },
    },
  ];
}
