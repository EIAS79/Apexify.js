import type { SceneLayer, ProgressBarToLayersOptions } from "../types";
import { componentFinite, componentNonNegative, componentPositive } from "./component-validation";

export function progressBarToLayers(o: ProgressBarToLayersOptions): SceneLayer[] {
  componentFinite(o.x, "components.progressBar.x");
  componentFinite(o.y, "components.progressBar.y");
  componentPositive(o.width, "components.progressBar.width");
  componentPositive(o.height, "components.progressBar.height");
  componentFinite(o.value, "components.progressBar.value");
  const max = componentPositive(o.max ?? 100, "components.progressBar.max");
  const value = Math.min(max, Math.max(0, o.value));
  const ratio = value / max;
  const background = o.background ?? "#374151";
  const fill = o.fill ?? "#6366f1";
  const radius = componentNonNegative(o.radius ?? Math.min(o.height / 2, 8), "components.progressBar.radius");
  const resolvedRadius = Math.min(radius, o.height / 2, o.width / 2);
  const fillWidth = o.width * ratio;

  const layers: SceneLayer[] = [
    {
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        borderRadius: resolvedRadius,
        shape: { fill: true, color: background },
      },
    },
  ];

  if (fillWidth > 0) {
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: fillWidth,
        height: o.height,
        borderRadius: Math.min(resolvedRadius, fillWidth / 2),
        shape: { fill: true, color: fill },
      },
    });
  }

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
