import { SKRSContext2D, GlobalFonts } from "@napi-rs/canvas";
import path from "path";
import { resolveTextDecorations, resolveTextFill, resolveTextLayout, resolveTextPlacement, type TextProperties } from "../types/text";

/** Vertical offset from `textBaseline: 'middle'` to alphabetic baseline (em-relative, Latin text). */
export const TEXT_MIDDLE_TO_ALPHABETIC = 0.38;

export async function registerTextFontFromPath(fontPath: string, fontName: string): Promise<void> {
  try {
    const fullPath = path.isAbsolute(fontPath) ? fontPath : path.join(process.cwd(), fontPath);
    GlobalFonts.registerFromPath(fullPath, fontName);
  } catch (error) {
    console.warn(`Failed to register font from path: ${fontPath}`, error);
  }
}

export function applyTextTransformations(ctx: SKRSContext2D, textProps: TextProperties): void {
  const pl = resolveTextPlacement(textProps);
  const fl = resolveTextFill(textProps);

  if (pl.rotation && pl.rotation !== 0) {
    ctx.translate(textProps.x, textProps.y);
    ctx.rotate((pl.rotation * Math.PI) / 180);
    ctx.translate(-textProps.x, -textProps.y);
  }

  if (fl.opacity !== undefined) {
    ctx.globalAlpha = Math.max(0, Math.min(1, fl.opacity));
  }
}

export function setupTextFont(ctx: SKRSContext2D, textProps: TextProperties): void {
  const fontSize = textProps.font?.size || textProps.fontSize || 16;
  const fontFamily =
    textProps.font?.name ||
    textProps.fontName ||
    textProps.font?.family ||
    textProps.fontFamily ||
    "Arial";

  let fontString = "";

  const dec = resolveTextDecorations(textProps);
  if (dec.bold) fontString += "bold ";
  if (dec.italic) fontString += "italic ";

  fontString += `${fontSize}px "${fontFamily}"`;

  ctx.font = fontString;

  const lay = resolveTextLayout(textProps);
  if (lay.letterSpacing !== undefined) {
    ctx.letterSpacing = `${lay.letterSpacing}px`;
  }

  if (lay.wordSpacing !== undefined) {
    ctx.wordSpacing = `${lay.wordSpacing}px`;
  }
}

export function setupTextAlignment(ctx: SKRSContext2D, textProps: TextProperties): void {
  const pl = resolveTextPlacement(textProps);
  ctx.textAlign = pl.textAlign || "left";
  ctx.textBaseline = pl.textBaseline || "alphabetic";
}

/**
 * Word-wrap to `maxWidth` / `maxHeight` (same rules as {@link EnhancedTextRenderer} wrapped pass).
 */
export function computeWrappedTextLines(ctx: SKRSContext2D, textProps: TextProperties): string[] {
  const lay = resolveTextLayout(textProps);
  const fontSize = textProps.font?.size || textProps.fontSize || 16;
  const lineHeight = (lay.lineHeight || 1.4) * fontSize;
  const maxHeight = lay.maxHeight;
  const maxLines = maxHeight ? Math.floor(maxHeight / lineHeight) : Infinity;

  const explicitLines = textProps.text.split("\n");
  const allLines: string[] = [];

  for (const explicitLine of explicitLines) {
    if (!explicitLine.trim() && explicitLines.length > 1) {
      allLines.push("");
      continue;
    }

    const words = explicitLine.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = ctx.measureText(testLine).width;

      if (testWidth > (lay.maxWidth || Infinity) && currentLine) {
        allLines.push(currentLine);
        currentLine = word;

        if (allLines.length >= maxLines) {
          currentLine = "...";
          break;
        }
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine && allLines.length < maxLines) {
      allLines.push(currentLine);
    }

    if (allLines.length >= maxLines) {
      break;
    }
  }

  return allLines;
}
