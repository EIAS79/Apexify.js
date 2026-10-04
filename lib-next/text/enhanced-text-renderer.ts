import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { resolveTextDecorations, resolveTextEffects, resolveTextPlacement, resolveTextStroke, type TextCurveConfig, type TextProperties } from "../types";
import { getCanvasContext } from "../core/errors";
import { applyTextPerspective, cropTransparentTextRaster } from "./text-transform";
import {
  applyTextTransformations,
  computeWrappedTextLines,
  registerTextFontFromPath,
  resolveTextFontIdentity,
  resolveTextFontSize,
  resolveTextLineHeight,
  setupTextAlignment,
  setupTextFont,
} from "./text-layout";
import {
  renderEnhancedTextLine,
  renderTextDecorationsLocal,
  renderTextFill,
  renderTextGlow,
  renderTextHighlightLocal,
  renderTextShadow,
  renderTextStroke,
} from "./text-style";
import { computeCircularArcPlacements } from "./text-curved";

/** Enhanced text renderer. Measurement and rendering share the same font/wrapping helpers. */
export class EnhancedTextRenderer {
  static async renderText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const perspective = resolveTextPlacement(textProps).perspective;
    if (perspective) {
      const offscreen = createCanvas(ctx.canvas.width, ctx.canvas.height);
      const offscreenCtx = getCanvasContext(offscreen);
      const placement = textProps.placement
        ? { ...textProps.placement, perspective: undefined }
        : undefined;
      await EnhancedTextRenderer.renderTextDirect(offscreenCtx, { ...textProps, placement });
      const cropped = cropTransparentTextRaster(offscreen);
      if (!cropped) return;
      const warped = applyTextPerspective(cropped, perspective);
      ctx.drawImage(warped.canvas, warped.x, warped.y);
      return;
    }
    await EnhancedTextRenderer.renderTextDirect(ctx, textProps);
  }

  private static async renderTextDirect(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    ctx.save();
    try {
      const identity = resolveTextFontIdentity(textProps);
      if (identity.path) await registerTextFontFromPath(identity.path, identity.family);
      applyTextTransformations(ctx, textProps);
      setupTextFont(ctx, textProps);
      setupTextAlignment(ctx, textProps);

      if (textProps.textOnCurve) await EnhancedTextRenderer.renderCurvedLines(ctx, textProps);
      else if (
        (textProps.layout?.maxWidth ?? textProps.maxWidth) !== undefined ||
        (textProps.layout?.maxHeight ?? textProps.maxHeight) !== undefined
      ) await EnhancedTextRenderer.renderWrappedText(ctx, textProps);
      else await EnhancedTextRenderer.renderSingleLine(ctx, textProps);
    } finally {
      ctx.restore();
    }
  }

  private static async renderCurvedLines(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const lineHeight = resolveTextLineHeight(textProps);
    const hasBounds =
      (textProps.layout?.maxWidth ?? textProps.maxWidth) !== undefined ||
      (textProps.layout?.maxHeight ?? textProps.maxHeight) !== undefined;
    const lines = hasBounds ? computeWrappedTextLines(ctx, textProps) : textProps.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      await EnhancedTextRenderer.renderCurvedLine(ctx, lines[i]!, { ...textProps, y: textProps.y + i * lineHeight }, textProps.textOnCurve!);
    }
  }

  private static async renderCurvedLine(ctx: SKRSContext2D, line: string, textProps: TextProperties, curve: TextCurveConfig): Promise<void> {
    const sweepDeg = curve.sweepAngle;
    if (!line || sweepDeg <= 0 || sweepDeg >= 360) {
      renderEnhancedTextLine(ctx, line, textProps.x, textProps.y, textProps);
      return;
    }
    const placements = computeCircularArcPlacements(ctx, line, textProps.x, textProps.y, {
      sweepDegrees: sweepDeg,
      radius: curve.radius,
      up: curve.up !== false,
      layoutMode: curve.layoutMode,
      baselineOffset: curve.baselineOffset,
      startAngleDeg: curve.startAngleDeg,
    });
    if (!placements || placements.length === 0) {
      renderEnhancedTextLine(ctx, line, textProps.x, textProps.y, textProps);
      return;
    }
    for (const p of placements) EnhancedTextRenderer.renderRotatedGlyph(ctx, p.grapheme, p.x, p.y, p.rotationRad, textProps);
  }

  private static renderRotatedGlyph(ctx: SKRSContext2D, char: string, x: number, y: number, rotation: number, textProps: TextProperties): void {
    const w = ctx.measureText(char).width;
    const fontSize = resolveTextFontSize(textProps);
    ctx.save();
    try {
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const effects = resolveTextEffects(textProps);
      const dec = resolveTextDecorations(textProps);
      if (effects.highlight) renderTextHighlightLocal(ctx, w, fontSize, effects.highlight);
      if (effects.glow) renderTextGlow(ctx, char, 0, 0, effects.glow, true);
      if (effects.shadow) renderTextShadow(ctx, char, 0, 0, effects.shadow, true);
      const stroke = resolveTextStroke(textProps);
      if (stroke) renderTextStroke(ctx, char, 0, 0, stroke, true);
      renderTextFill(ctx, char, 0, 0, textProps, true);
      if (dec.underline || dec.overline || dec.strikethrough) renderTextDecorationsLocal(ctx, w, fontSize, textProps);
    } finally {
      ctx.restore();
    }
  }

  private static async renderWrappedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const lineHeight = resolveTextLineHeight(textProps);
    const lines = computeWrappedTextLines(ctx, textProps);
    for (let i = 0; i < lines.length; i++) renderEnhancedTextLine(ctx, lines[i]!, textProps.x, textProps.y + i * lineHeight, textProps);
  }

  private static async renderSingleLine(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    if (!textProps.text.includes("\n")) {
      renderEnhancedTextLine(ctx, textProps.text, textProps.x, textProps.y, textProps);
      return;
    }
    const lineHeight = resolveTextLineHeight(textProps);
    const lines = textProps.text.split("\n");
    for (let i = 0; i < lines.length; i++) renderEnhancedTextLine(ctx, lines[i]!, textProps.x, textProps.y + i * lineHeight, textProps);
  }
}
