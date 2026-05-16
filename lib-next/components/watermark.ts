import type { SceneLayer } from "../types/scene";
import type { WatermarkToLayersOptions } from "./types";

export function watermarkToLayers(o: WatermarkToLayersOptions): SceneLayer[] {
  const fs = o.fontSize ?? 14;
  const color = o.color ?? "rgba(248,250,252,0.25)";
  const m = o.margin ?? 24;
  const pos = o.position ?? "bottom-right";

  /** Approximate width for placement; callers can tune with longer strings. */
  const approxW = o.text.length * fs * 0.55;
  const approxH = fs * 1.2;

  let x = m;
  let y = m;

  switch (pos) {
    case "top-left":
      x = m;
      y = m + approxH;
      break;
    case "top-right":
      x = o.canvasWidth - m - approxW;
      y = m + approxH;
      break;
    case "bottom-left":
      x = m;
      y = o.canvasHeight - m;
      break;
    case "bottom-right":
      x = o.canvasWidth - m - approxW;
      y = o.canvasHeight - m;
      break;
    case "center":
      x = (o.canvasWidth - approxW) / 2;
      y = (o.canvasHeight + approxH) / 2;
      break;
    default:
      break;
  }

  return [
    {
      type: "text",
      texts: {
        text: o.text,
        x,
        y,
        fontSize: fs,
        color,
      },
    },
  ];
}
