import { createCanvas } from "@napi-rs/canvas";
import { getCanvasContext } from "../core/errors";
import type { TextProperties } from "../types/text";
import { EnhancedTextRenderer } from "../text/enhanced-text-renderer";

/**
 * Renders {@link TextProperties} onto a full-frame transparent PNG (video dimensions).
 */
export async function renderVideoTextLayerPng(
  width: number,
  height: number,
  textProps: TextProperties
): Promise<Buffer> {
  if (!textProps.text || textProps.x == null || textProps.y == null) {
    throw new Error("Video text overlay: text, x, and y are required (same as createText).");
  }
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  ctx.clearRect(0, 0, width, height);
  await EnhancedTextRenderer.renderText(ctx, textProps);
  return canvas.toBuffer("image/png");
}
