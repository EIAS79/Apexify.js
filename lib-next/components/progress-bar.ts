import type { SceneLayer } from "../types/scene";
import type { ProgressBarToLayersOptions } from "./types";

export function progressBarToLayers(o: ProgressBarToLayersOptions): SceneLayer[] {
  const max = o.max ?? 100;
  const v = Math.min(max, Math.max(0, Number(o.value)));
  const ratio = max > 0 ? v / max : 0;
  const bg = o.background ?? "#374151";
  const fill = o.fill ?? "#6366f1";
  const r = o.radius ?? Math.min(o.height / 2, 8);
  const fillW = Math.max(0, o.width * ratio);

  const layers: SceneLayer[] = [
    {
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        borderRadius: r,
        shape: { fill: true, color: bg },
      },
    },
    {
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: fillW,
        height: o.height,
        borderRadius: r,
        shape: { fill: true, color: fill },
      },
    },
  ];

  if (o.showLabel) {
    layers.push({
      type: "text",
      texts: {
        text: `${Math.round(ratio * 100)}%`,
        x: o.x + o.width / 2 - 16,
        y: o.y + o.height * 0.72,
        fontSize: Math.max(10, Math.min(14, o.height * 0.45)),
        color: o.labelColor ?? "#f8fafc",
      },
    });
  }

  return layers;
}
