import type { SKRSContext2D } from "@napi-rs/canvas";
import {
  resolveTextDecorations,
  resolveTextEffects,
  resolveTextLayout,
  type TextCurveConfig,
  type TextProperties,
} from "../types/text";
import {
  applyTextTransformations,
  computeWrappedTextLines,
  registerTextFontFromPath,
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

/**
 * Enhanced text renderer with comprehensive styling options.
 * Layout helpers live in {@link ./text-layout}; paint/gradients in {@link ./text-style}; arc math in {@link ./text-curved}.
 */
export class EnhancedTextRenderer {
  static async renderText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    ctx.save();

    try {
      const fontPath = textProps.font?.path || textProps.fontPath;
      const fontName = textProps.font?.name || textProps.fontName;

      if (fontPath) {
        await registerTextFontFromPath(fontPath, fontName || "customFont");
      }

      applyTextTransformations(ctx, textProps);
      setupTextFont(ctx, textProps);
      setupTextAlignment(ctx, textProps);

      const lay = resolveTextLayout(textProps);
      if (textProps.textOnCurve) {
        await EnhancedTextRenderer.renderCurvedLines(ctx, textProps);
      } else if (lay.maxWidth) {
        await EnhancedTextRenderer.renderWrappedText(ctx, textProps);
      } else {
        await EnhancedTextRenderer.renderSingleLine(ctx, textProps);
      }
    } finally {
      ctx.restore();
    }
  }

  private static async renderCurvedLines(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (resolveTextLayout(textProps).lineHeight || 1.4) * fontSize;
    const lines = textProps.text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const y = textProps.y + i * lineHeight;
      await EnhancedTextRenderer.renderCurvedLine(ctx, line, { ...textProps, y }, textProps.textOnCurve!);
    }
  }

  private static async renderCurvedLine(
    ctx: SKRSContext2D,
    line: string,
    textProps: TextProperties,
    curve: TextCurveConfig
  ): Promise<void> {
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

    for (const p of placements) {
      EnhancedTextRenderer.renderRotatedGlyph(ctx, p.grapheme, p.x, p.y, p.rotationRad, textProps);
    }
  }

  private static renderRotatedGlyph(
    ctx: SKRSContext2D,
    char: string,
    x: number,
    y: number,
    rotation: number,
    textProps: TextProperties
  ): void {
    const w = ctx.measureText(char).width;
    const fontSize = textProps.font?.size || textProps.fontSize || 16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const lx = 0;
    const ly = 0;

    const effects = resolveTextEffects(textProps);
    const dec = resolveTextDecorations(textProps);

    if (effects.highlight) {
      renderTextHighlightLocal(ctx, w, fontSize, effects.highlight);
    }

    if (effects.glow) {
      renderTextGlow(ctx, char, lx, ly, effects.glow, true);
    }

    if (effects.shadow) {
      renderTextShadow(ctx, char, lx, ly, effects.shadow, true);
    }

    if (textProps.stroke) {
      renderTextStroke(ctx, char, lx, ly, textProps.stroke, true);
    }

    renderTextFill(ctx, char, lx, ly, textProps, true);

    if (dec.underline || dec.overline || dec.strikethrough) {
      renderTextDecorationsLocal(ctx, w, fontSize, textProps);
    }

    ctx.restore();
  }

  private static async renderWrappedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const fontSize = textProps.font?.size || textProps.fontSize || 16;
    const lineHeight = (resolveTextLayout(textProps).lineHeight || 1.4) * fontSize;
    const allLines = computeWrappedTextLines(ctx, textProps);

    for (let i = 0; i < allLines.length; i++) {
      const y = textProps.y + i * lineHeight;
      renderEnhancedTextLine(ctx, allLines[i]!, textProps.x, y, textProps);
    }
  }

  private static async renderSingleLine(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    const lineHeight =
      (textProps.font?.size || textProps.fontSize || 16) * (resolveTextLayout(textProps).lineHeight || 1.4);

    const lines = textProps.text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const y = textProps.y + i * lineHeight;
      renderEnhancedTextLine(ctx, lines[i]!, textProps.x, y, textProps);
    }
  }
}
