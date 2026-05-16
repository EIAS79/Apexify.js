import type { SceneLayer } from "../types/scene";
import type { BadgeToLayersOptions } from "./types";

export function badgeToLayers(o: BadgeToLayersOptions): SceneLayer[] {
  const paddingX = o.paddingX ?? 14;
  const paddingY = o.paddingY ?? 8;
  const radius = o.radius ?? 10;
  const fontSize = o.fontSize ?? 18;
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
        borderRadius: radius,
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
