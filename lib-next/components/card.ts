import type { SceneLayer, CardToLayersOptions } from "../types";
import { componentFinite, componentNonNegative, componentPositive, componentText } from "./component-validation";
import { ApexifyInputError } from "../runtime/errors";

export function cardToLayers(o: CardToLayersOptions): SceneLayer[] {
  componentFinite(o.x, "components.card.x");
  componentFinite(o.y, "components.card.y");
  componentPositive(o.width, "components.card.width");
  componentPositive(o.height, "components.card.height");
  const radius = componentNonNegative(o.radius ?? 16, "components.card.radius");
  const padding = componentNonNegative(o.padding ?? 24, "components.card.padding");
  const borderWidth = componentNonNegative(o.borderWidth ?? 0, "components.card.borderWidth");
  if (o.title !== undefined) componentText(o.title, "components.card.title", true);
  if (o.body !== undefined) componentText(o.body, "components.card.body", true);
  if (padding * 2 + borderWidth * 2 >= o.width || padding * 2 + borderWidth * 2 >= o.height) {
    throw new ApexifyInputError("components.card padding and borderWidth leave no positive content area.");
  }
  if (borderWidth * 2 >= o.width || borderWidth * 2 >= o.height) {
    throw new ApexifyInputError("components.card.borderWidth is too large for the card dimensions.");
  }

  const background = o.background ?? "#1e293b";
  const layers: SceneLayer[] = [];
  const resolvedRadius = Math.min(radius, o.width / 2, o.height / 2);

  if (borderWidth > 0 && o.borderColor) {
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x,
        y: o.y,
        width: o.width,
        height: o.height,
        borderRadius: resolvedRadius,
        shape: { fill: true, color: o.borderColor },
      },
    });
    layers.push({
      type: "image",
      images: {
        source: "rectangle",
        x: o.x + borderWidth,
        y: o.y + borderWidth,
        width: o.width - 2 * borderWidth,
        height: o.height - 2 * borderWidth,
        borderRadius: Math.max(0, resolvedRadius - borderWidth),
        shape: { fill: true, color: background },
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
        borderRadius: resolvedRadius,
        shape: { fill: true, color: background },
      },
    });
  }

  let y = o.y + padding + borderWidth;
  if (o.title) {
    const fontSize = componentPositive(o.titleFontSize ?? 22, "components.card.titleFontSize");
    layers.push({
      type: "text",
      texts: {
        text: o.title,
        x: o.x + padding + borderWidth,
        y: y + fontSize,
        fontSize,
        color: o.titleColor ?? "#f8fafc",
        maxWidth: o.width - 2 * padding - 2 * borderWidth,
      },
    });
    y += fontSize * 1.35;
  }
  if (o.body) {
    const fontSize = componentPositive(o.bodyFontSize ?? 15, "components.card.bodyFontSize");
    layers.push({
      type: "text",
      texts: {
        text: o.body,
        x: o.x + padding + borderWidth,
        y: y + fontSize,
        fontSize,
        color: o.bodyColor ?? "#94a3b8",
        maxWidth: o.width - 2 * padding - 2 * borderWidth,
      },
    });
  }
  return layers;
}
