import type { SceneLayer } from "../types/scene";
import type { CardToLayersOptions } from "./types";

export function cardToLayers(o: CardToLayersOptions): SceneLayer[] {
  const radius = o.radius ?? 16;
  const bg = o.background ?? "#1e293b";
  const pad = o.padding ?? 24;
  const layers: SceneLayer[] = [];
  const borderW = o.borderWidth ?? 0;
  const borderColor = o.borderColor;

  if (borderW > 0 && borderColor) {
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        borderRadius: radius,
        shape: { fill: true, color: borderColor },
      },
    });
    const inset = borderW;
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x + inset,
        y: o.y + inset,
        width: o.width - 2 * inset,
        height: o.height - 2 * inset,
        borderRadius: Math.max(0, radius - inset),
        shape: { fill: true, color: bg },
      },
    });
  } else {
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        borderRadius: radius,
        shape: { fill: true, color: bg },
      },
    });
  }

  let y = o.y + pad + (borderW > 0 ? borderW : 0);
  if (o.title) {
    const tfs = o.titleFontSize ?? 22;
    layers.push({
      type: "text",
      texts: {
        text: o.title,
        x: o.x + pad,
        y: y + tfs,
        fontSize: tfs,
        color: o.titleColor ?? "#f8fafc",
      },
    });
    y += tfs * 1.35;
  }
  if (o.body) {
    const bfs = o.bodyFontSize ?? 15;
    layers.push({
      type: "text",
      texts: {
        text: o.body,
        x: o.x + pad,
        y: y + bfs,
        fontSize: bfs,
        color: o.bodyColor ?? "#94a3b8",
        maxWidth: o.width - 2 * pad - 2 * (borderW > 0 ? borderW : 0),
      },
    });
  }

  return layers;
}
