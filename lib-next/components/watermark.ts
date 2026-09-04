import type { SceneLayer, WatermarkToLayersOptions } from "../types";
import { componentNonNegative, componentPositive, componentText } from "./component-validation";
import { ApexifyInputError } from "../runtime/errors";

const WATERMARK_POSITIONS = new Set(["bottom-right", "bottom-left", "top-right", "top-left", "center"]);

export function watermarkToLayers(o: WatermarkToLayersOptions): SceneLayer[] {
  componentText(o.text, "components.watermark.text");
  componentPositive(o.canvasWidth, "components.watermark.canvasWidth");
  componentPositive(o.canvasHeight, "components.watermark.canvasHeight");
  const fontSize = componentPositive(o.fontSize ?? 14, "components.watermark.fontSize");
  const margin = componentNonNegative(o.margin ?? 24, "components.watermark.margin");
  const color = o.color ?? "rgba(248,250,252,0.25)";
  const position = o.position ?? "bottom-right";
  if (!WATERMARK_POSITIONS.has(position)) {
    throw new ApexifyInputError("components.watermark.position is invalid.");
  }

  const approxWidth = o.text.length * fontSize * 0.55;
  const approxHeight = fontSize * 1.2;
  if (approxWidth > o.canvasWidth || approxHeight > o.canvasHeight) {
    throw new ApexifyInputError("components.watermark text does not fit within the canvas dimensions.");
  }
  if (position !== "center" && (margin * 2 + approxWidth > o.canvasWidth || margin * 2 + approxHeight > o.canvasHeight)) {
    throw new ApexifyInputError("components.watermark margin leaves insufficient canvas space for the watermark.");
  }

  let x = margin;
  let y = margin + approxHeight;
  switch (position) {
    case "top-left": break;
    case "top-right": x = o.canvasWidth - margin - approxWidth; break;
    case "bottom-left": y = o.canvasHeight - margin; break;
    case "bottom-right": x = o.canvasWidth - margin - approxWidth; y = o.canvasHeight - margin; break;
    case "center": x = (o.canvasWidth - approxWidth) / 2; y = (o.canvasHeight + approxHeight) / 2; break;
  }

  return [{
    type: "text",
    texts: { text: o.text, x, y, fontSize, color },
  }];
}
