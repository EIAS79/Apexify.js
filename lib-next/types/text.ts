import type { gradient } from "./gradient";

/**
 * How measured line width **W**, user **radius**, and **sweep** (radians) are reconciled on a circle.
 *
 * - **fit** — `R = W / θ`. Arc length equals typographic width; `radius` is ignored for geometry.
 * - **clamp** (default) — `R = max(radius ?? R_fit, R_fit)` so the arc is never shorter than the text.
 * - **override** — `R = radius ?? R_fit`. If `R·θ < W`, **θ is expanded** to `W/R` so the string still fits
 *   without crowding (user sweep becomes a minimum when the arc is too tight).
 */
export type CurvedTextLayoutMode = "fit" | "clamp" | "override";

export interface CircularArcLayoutOptions {
  sweepDegrees: number;
  radius?: number;
  up: boolean;
  layoutMode?: CurvedTextLayoutMode;
  /** Pixels along the outward radial direction (+ = away from circle center). Shifts glyphs without changing θ. */
  baselineOffset?: number;
  /** Rotates the whole arc around `(anchorX, anchorY)` (degrees). 0 keeps the midpoint at the circular apex. */
  startAngleDeg?: number;
}

export interface GlyphArcPlacement {
  /** One user-perceived character (grapheme cluster when `Intl.Segmenter` exists). */
  grapheme: string;
  x: number;
  y: number;
  rotationRad: number;
  resolvedRadius: number;
  /** Final angular span in radians (may exceed user sweep in `override` when radius is tight). */
  resolvedSweepRad: number;
}

export interface TextMetrics {
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
  actualBoundingBoxLeft: number;
  actualBoundingBoxRight: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;

  alphabeticBaseline?: number;
  emHeightAscent?: number;
  emHeightDescent?: number;
  hangingBaseline?: number;
  ideographicBaseline?: number;

  height: number;
  lineHeight: number;
  baseline: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;

  lines?: Array<{
    text: string;
    width: number;
    height: number;
    metrics: Omit<TextMetrics, "lines" | "totalHeight" | "lineCount">;
  }>;
  totalHeight?: number;
  lineCount?: number;

  charWidths?: number[];
  charPositions?: Array<{ x: number; width: number }>;
}

/** One line-edge decoration (underline / overline / strikethrough). */
export type TextLineDecoration =
  | boolean
  | {
      color?: string;
      gradient?: gradient;
      width?: number;
    };

/** Typographic extras: line-edge marks plus bold/italic flags (canvas font string). Prefer nested `decorations` over flat `underline` / `bold` / etc. */
export interface TextDecorations {
  underline?: TextLineDecoration;
  overline?: TextLineDecoration;
  strikethrough?: TextLineDecoration;
  bold?: boolean;
  italic?: boolean;
}

export interface TextHighlightStyle {
  color?: string;
  gradient?: gradient;
  opacity?: number;
}

export interface TextGlowStyle {
  color?: string;
  gradient?: gradient;
  intensity?: number;
  opacity?: number;
}

export interface TextShadowStyle {
  color?: string;
  gradient?: gradient;
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  opacity?: number;
}

/** Outline drawn around glyph strokes (distinct from {@link TextLineDecoration}). */
export interface TextStrokeStyle {
  color?: string;
  width?: number;
  gradient?: gradient;
  opacity?: number;
  style?: "solid" | "dashed" | "dotted" | "groove" | "ridge" | "double";
}

/** Halo, drop shadow, and flat highlight behind text. Prefer this over top-level `glow` / `shadow` / `highlight`. */
export interface TextEffects {
  highlight?: TextHighlightStyle;
  glow?: TextGlowStyle;
  shadow?: TextShadowStyle;
}

export interface TextCurveConfig {
  sweepAngle: number;
  radius?: number;
  up?: boolean;
  layoutMode?: CurvedTextLayoutMode;
  baselineOffset?: number;
  startAngleDeg?: number;
}

/** Canvas `textAlign` values. */
export type TextAlignMode = "left" | "center" | "right" | "start" | "end";

/** Canvas `textBaseline` values. */
export type TextBaselineMode =
  | "alphabetic"
  | "bottom"
  | "hanging"
  | "ideographic"
  | "middle"
  | "top";

/** Line metrics, spacing, and wrap bounds. Prefer over top-level `lineHeight` / `maxWidth` / etc. */
export interface TextLayout {
  lineHeight?: number;
  letterSpacing?: number;
  wordSpacing?: number;
  maxWidth?: number;
  maxHeight?: number;
}

/** Anchor, baseline, and rotation around `(x, y)`. Prefer over top-level `textAlign` / `rotation` / etc. */
export interface TextPlacement {
  textAlign?: TextAlignMode;
  textBaseline?: TextBaselineMode;
  rotation?: number;
}

/** Primary fill paint and overall draw opacity. Prefer over top-level `color` / `gradient` / `opacity`. */
export interface TextFill {
  color?: string;
  gradient?: gradient;
  opacity?: number;
}

/** Merged decorations: nested `decorations` wins for line marks and bold/italic; falls back to legacy flat fields. */
export function resolveTextDecorations(p: TextProperties): TextDecorations {
  return {
    underline: p.decorations?.underline ?? p.underline,
    overline: p.decorations?.overline ?? p.overline,
    strikethrough: p.decorations?.strikethrough ?? p.strikethrough,
    bold: p.decorations?.bold ?? p.bold,
    italic: p.decorations?.italic ?? p.italic,
  };
}

/** Merged effects: nested `effects` wins; falls back to legacy flat fields. */
export function resolveTextEffects(p: TextProperties): TextEffects {
  return {
    highlight: p.effects?.highlight ?? p.highlight,
    glow: p.effects?.glow ?? p.glow,
    shadow: p.effects?.shadow ?? p.shadow,
  };
}

/** Merged layout: nested `layout` wins; falls back to legacy flat fields. */
export function resolveTextLayout(p: TextProperties): TextLayout {
  return {
    lineHeight: p.layout?.lineHeight ?? p.lineHeight,
    letterSpacing: p.layout?.letterSpacing ?? p.letterSpacing,
    wordSpacing: p.layout?.wordSpacing ?? p.wordSpacing,
    maxWidth: p.layout?.maxWidth ?? p.maxWidth,
    maxHeight: p.layout?.maxHeight ?? p.maxHeight,
  };
}

/** Merged placement: nested `placement` wins; falls back to legacy flat fields. */
export function resolveTextPlacement(p: TextProperties): TextPlacement {
  return {
    textAlign: p.placement?.textAlign ?? p.textAlign,
    textBaseline: p.placement?.textBaseline ?? p.textBaseline,
    rotation: p.placement?.rotation ?? p.rotation,
  };
}

/** Merged fill: nested `fill` wins; falls back to legacy flat fields. */
export function resolveTextFill(p: TextProperties): TextFill {
  return {
    color: p.fill?.color ?? p.color,
    gradient: p.fill?.gradient ?? p.gradient,
    opacity: p.fill?.opacity ?? p.opacity,
  };
}

export interface TextProperties {
  text: string;
  x: number;
  y: number;

  font?: {
    size?: number;
    family?: string;
    name?: string;
    path?: string;
  };
  /** @deprecated Use `font.size` */
  fontSize?: number;
  /** @deprecated Use `font.family` */
  fontFamily?: string;
  /** @deprecated Use `font.name` */
  fontName?: string;
  /** @deprecated Use `font.path` */
  fontPath?: string;

  /** @deprecated Use `decorations.bold` */
  bold?: boolean;
  /** @deprecated Use `decorations.italic` */
  italic?: boolean;

  /**
   * Grouped line decorations (`underline` / `overline` / `strikethrough`) and optional `bold` / `italic`
   * flags for the canvas font string. Nested keys override the legacy flat fields (see {@link resolveTextDecorations}).
   */
  decorations?: TextDecorations;
  /**
   * Grouped highlight, glow, and shadow. When set, entries override the legacy flat fields
   * (see {@link resolveTextEffects}).
   */
  effects?: TextEffects;

  /** @deprecated Prefer `decorations.underline` */
  underline?: TextLineDecoration;
  /** @deprecated Prefer `decorations.overline` */
  overline?: TextLineDecoration;
  /** @deprecated Prefer `decorations.strikethrough` */
  strikethrough?: TextLineDecoration;
  /** @deprecated Prefer `effects.highlight` */
  highlight?: TextHighlightStyle;
  /** @deprecated Prefer `effects.glow` */
  glow?: TextGlowStyle;
  /** @deprecated Prefer `effects.shadow` */
  shadow?: TextShadowStyle;

  /**
   * Grouped line height, spacing, and wrap bounds (see {@link resolveTextLayout}).
   */
  layout?: TextLayout;
  /**
   * Grouped alignment, baseline, and rotation (see {@link resolveTextPlacement}).
   */
  placement?: TextPlacement;
  /**
   * Grouped fill color / gradient and draw opacity (see {@link resolveTextFill}).
   */
  fill?: TextFill;

  /** @deprecated Prefer `layout.lineHeight` */
  lineHeight?: number;
  /** @deprecated Prefer `layout.letterSpacing` */
  letterSpacing?: number;
  /** @deprecated Prefer `layout.wordSpacing` */
  wordSpacing?: number;
  /** @deprecated Prefer `layout.maxWidth` */
  maxWidth?: number;
  /** @deprecated Prefer `layout.maxHeight` */
  maxHeight?: number;

  /** @deprecated Prefer `placement.textAlign` */
  textAlign?: TextAlignMode;
  /** @deprecated Prefer `placement.textBaseline` */
  textBaseline?: TextBaselineMode;
  /** @deprecated Prefer `placement.rotation` */
  rotation?: number;

  /** @deprecated Prefer `fill.color` */
  color?: string;
  /** @deprecated Prefer `fill.gradient` */
  gradient?: gradient;
  /** @deprecated Prefer `fill.opacity` */
  opacity?: number;

  stroke?: TextStrokeStyle;

  /** @deprecated Prefer a shared name — kept as the canonical field; shape matches {@link TextCurveConfig}. */
  textOnCurve?: TextCurveConfig;

  includeCharMetrics?: boolean;
  measurementCanvas?: {
    width?: number;
    height?: number;
  };
}

/** @deprecated Use TextProperties instead */
export interface TextObject extends TextProperties {
  /** @deprecated Use bold instead */
  isBold?: boolean;
  /** @deprecated Use outlined instead of stroke */
  outlined?: boolean;
}
