import { GlobalFonts, type SKRSContext2D } from "@napi-rs/canvas";
import path from "node:path";
import { access } from "node:fs/promises";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { resolveTextDecorations, resolveTextFill, resolveTextLayout, resolveTextPlacement, type TextProperties } from "../types";

/** Vertical offset from `textBaseline: 'middle'` to alphabetic baseline (em-relative, Latin text). */
export const TEXT_MIDDLE_TO_ALPHABETIC = 0.38;

const registeredFonts = new Set<string>();
const pendingFonts = new Map<string, Promise<void>>();

/** Register a local font once per process. Missing/invalid fonts fail predictably instead of silently changing metrics. */
function stableFontAlias(fontPath: string): string {
  const base = path.basename(fontPath, path.extname(fontPath)).replace(/[^a-zA-Z0-9_-]+/g, "_") || "font";
  let hash = 2166136261;
  for (const char of fontPath) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `Apexify_${base}_${(hash >>> 0).toString(16)}`;
}

export function resolveTextFontIdentity(textProps: TextProperties): {
  path?: string;
  family: string;
} {
  const fontPath = textProps.font?.path ?? textProps.fontPath;
  const explicitName = textProps.font?.name ?? textProps.fontName;
  const family = textProps.font?.family ?? textProps.fontFamily;
  if (fontPath) {
    return { path: fontPath, family: explicitName ?? family ?? stableFontAlias(fontPath) };
  }
  return { family: explicitName ?? family ?? "Arial" };
}

export async function registerTextFontFromPath(fontPath: string, fontName: string): Promise<void> {
  const fullPath = path.isAbsolute(fontPath) ? fontPath : path.join(process.cwd(), fontPath);
  const key = `${fullPath}\u0000${fontName}`;
  if (registeredFonts.has(key)) return;
  const pending = pendingFonts.get(key);
  if (pending) return pending;

  // The native font registry is process-wide and does not expose a reliable unregister operation.
  // Bound unique registrations (including in-flight work) through the existing global collection budget
  // so untrusted or highly dynamic text input cannot grow native font state indefinitely.
  assertWithinLimit("maxCollectionItems", registeredFonts.size + pendingFonts.size + 1);

  const registration = (async () => {
    try {
      await access(fullPath);
      const registered = GlobalFonts.registerFromPath(fullPath, fontName);
      if (registered === null) throw new ApexifyInputError(`text.font.path could not be registered: ${fontPath}`);
      registeredFonts.add(key);
    } catch (cause) {
      if (cause instanceof ApexifyInputError) throw cause;
      throw new ApexifyInputError(`text.font.path is missing or invalid: ${fontPath}`, { cause });
    } finally {
      pendingFonts.delete(key);
    }
  })();
  pendingFonts.set(key, registration);
  return registration;
}

export function applyTextTransformations(ctx: SKRSContext2D, textProps: TextProperties): void {
  const pl = resolveTextPlacement(textProps);
  const fl = resolveTextFill(textProps);
  const rotation = pl.rotation ?? 0;
  const scaleX = pl.scaleX ?? 1;
  const scaleY = pl.scaleY ?? 1;
  const skewX = ((pl.skewX ?? 0) * Math.PI) / 180;
  const skewY = ((pl.skewY ?? 0) * Math.PI) / 180;
  const hasAffine =
    rotation !== 0 ||
    scaleX !== 1 ||
    scaleY !== 1 ||
    skewX !== 0 ||
    skewY !== 0;

  if (hasAffine) {
    ctx.translate(textProps.x, textProps.y);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    if (skewX !== 0 || skewY !== 0) {
      ctx.transform(1, Math.tan(skewY), Math.tan(skewX), 1, 0, 0);
    }
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    ctx.translate(-textProps.x, -textProps.y);
  }
  if (fl.opacity !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, fl.opacity));
}

export function resolveTextFontSize(textProps: TextProperties): number {
  return textProps.font?.size ?? textProps.fontSize ?? 16;
}

export function setupTextFont(ctx: SKRSContext2D, textProps: TextProperties): void {
  const fontSize = resolveTextFontSize(textProps);
  const fontFamily = resolveTextFontIdentity(textProps).family;
  const dec = resolveTextDecorations(textProps);
  const explicitStyle = textProps.font?.style;
  const explicitWeight = textProps.font?.weight;
  const style = explicitStyle ?? (dec.italic ? "italic" : "normal");
  const weight =
    explicitWeight !== undefined
      ? String(explicitWeight)
      : dec.bold
        ? "bold"
        : "normal";
  ctx.font = `${style} ${weight} ${fontSize}px "${fontFamily}"`;

  const lay = resolveTextLayout(textProps);
  if (lay.letterSpacing !== undefined) ctx.letterSpacing = `${lay.letterSpacing}px`;
  if (lay.wordSpacing !== undefined) ctx.wordSpacing = `${lay.wordSpacing}px`;
}

export function setupTextAlignment(ctx: SKRSContext2D, textProps: TextProperties): void {
  const pl = resolveTextPlacement(textProps);
  ctx.textAlign = pl.textAlign ?? "left";
  ctx.textBaseline = pl.textBaseline ?? "alphabetic";
}

export function resolveTextLineHeight(textProps: TextProperties): number {
  return (resolveTextLayout(textProps).lineHeight ?? 1.4) * resolveTextFontSize(textProps);
}

function graphemes(value: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: "grapheme" } as never).segment(value)].map((part) => part.segment);
  return Array.from(value);
}

function splitOverlongToken(ctx: SKRSContext2D, token: string, maxWidth: number): string[] {
  if (ctx.measureText(token).width <= maxWidth) return [token];
  const chunks: string[] = [];
  let current = "";
  for (const unit of graphemes(token)) {
    const candidate = current + unit;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [token];
}

/**
 * Explicit-newline-aware word wrapping with grapheme fallback for a token wider than maxWidth.
 * Whitespace runs collapse between words; explicit empty lines are preserved. The function always advances.
 */
export function computeWrappedTextLines(ctx: SKRSContext2D, textProps: TextProperties): string[] {
  const lay = resolveTextLayout(textProps);
  const maxWidth = lay.maxWidth ?? Infinity;
  const lineHeight = resolveTextLineHeight(textProps);
  const maxLines = lay.maxHeight === undefined ? Infinity : Math.max(0, Math.floor(lay.maxHeight / lineHeight));
  if (maxLines === 0) return [];

  const output: string[] = [];
  for (const explicitLine of textProps.text.split("\n")) {
    if (output.length >= maxLines) break;
    if (explicitLine.length === 0) {
      output.push("");
      continue;
    }

    const tokens = explicitLine.trim().split(/\s+/u).filter(Boolean);
    if (tokens.length === 0) {
      output.push("");
      continue;
    }

    let current = "";
    for (const token of tokens) {
      for (const piece of splitOverlongToken(ctx, token, maxWidth)) {
        const candidate = current ? `${current} ${piece}` : piece;
        if (current && ctx.measureText(candidate).width > maxWidth) {
          output.push(current);
          if (output.length >= maxLines) return output;
          current = piece;
        } else {
          current = candidate;
        }
      }
    }
    if (current && output.length < maxLines) output.push(current);
  }
  return output;
}
