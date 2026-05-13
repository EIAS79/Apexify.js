import type { SKRSContext2D } from "@napi-rs/canvas";
import type {
  CurvedTextLayoutMode,
  CircularArcLayoutOptions,
  GlyphArcPlacement,
} from "../types/text";

export type { CurvedTextLayoutMode, CircularArcLayoutOptions, GlyphArcPlacement };

let graphemeSegmenter: Intl.Segmenter | null = null;
try {
  if (
    typeof Intl !== "undefined" &&
    typeof (Intl as unknown as { Segmenter?: new (locales?: string, options?: { granularity: string }) => Intl.Segmenter })
      .Segmenter === "function"
  ) {
    graphemeSegmenter = new (
      Intl as unknown as {
        Segmenter: new (locales?: string, options?: { granularity: string }) => Intl.Segmenter;
      }
    ).Segmenter(undefined, {
      granularity: "grapheme",
    });
  }
} catch {
  graphemeSegmenter = null;
}

/** User-perceived characters (combining marks stay with base) when supported. */
export function segmentGraphemes(line: string): string[] {
  if (!line) return [];
  if (graphemeSegmenter) {
    const out: string[] = [];
    for (const { segment } of graphemeSegmenter.segment(line)) {
      if (segment.length > 0) out.push(segment);
    }
    return out;
  }
  return Array.from(line);
}

/**
 * Cumulative `measureText` along the same font / letterSpacing / wordSpacing as the full line,
 * returning each grapheme’s **horizontal center** along the straight baseline (same model as one-line layout).
 */
export function measureGraphemeCenters(
  ctx: SKRSContext2D,
  graphemes: string[]
): { centers: number[]; denom: number; cumulativeTail: number } {
  if (graphemes.length === 0) {
    return { centers: [], denom: 0, cumulativeTail: 0 };
  }
  const centers: number[] = [];
  let prevRight = 0;
  let acc = "";
  for (let i = 0; i < graphemes.length; i++) {
    acc += graphemes[i]!;
    const right = ctx.measureText(acc).width;
    centers.push((prevRight + right) / 2);
    prevRight = right;
  }
  const full = graphemes.join("");
  const lineWidth = ctx.measureText(full).width;
  const denom = Math.max(lineWidth, prevRight, 1e-6);
  return { centers, denom, cumulativeTail: prevRight };
}

export function resolveArcRadiusAndSweep(
  W: number,
  sweepRad: number,
  radius: number | undefined,
  mode: CurvedTextLayoutMode | undefined
): { R: number; sweepRad: number } {
  const θ = sweepRad;
  const R_fit = θ > 0 ? W / θ : W;
  const m = mode ?? "clamp";

  if (m === "fit") {
    return { R: R_fit, sweepRad: θ };
  }
  if (m === "override") {
    const R = radius ?? R_fit;
    const minTheta = R > 0 ? W / R : θ;
    return { R, sweepRad: Math.max(θ, minTheta) };
  }
  const R = radius != null ? Math.max(radius, R_fit) : R_fit;
  return { R, sweepRad: θ };
}

export function curvedArcBoundingChord(sweepRad: number, R: number): { chord: number; sagitta: number } {
  const chord = 2 * R * Math.sin(sweepRad / 2);
  const sagitta = R * (1 - Math.cos(sweepRad / 2));
  return { chord, sagitta };
}

/** Tangent rotation so the glyph’s local +x follows the arc (canvas y-down). */
export function glyphRotationOnCircle(α: number, up: boolean): number {
  if (up) return α + Math.PI / 2;
  return Math.atan2(-Math.cos(α), Math.sin(α));
}

/**
 * Builds per-grapheme positions on a circular arc. `(anchorX, anchorY)` is the **mid-string** anchor on the arc
 * (apex for `up: true` at the default start angle).
 */
export function computeCircularArcPlacements(
  ctx: SKRSContext2D,
  line: string,
  anchorX: number,
  anchorY: number,
  options: CircularArcLayoutOptions
): GlyphArcPlacement[] | null {
  const sweepDeg = options.sweepDegrees;
  if (!line || sweepDeg <= 0 || sweepDeg >= 360) {
    return null;
  }

  const graphemes = segmentGraphemes(line);
  if (graphemes.length === 0) {
    return [];
  }

  const { centers, denom } = measureGraphemeCenters(ctx, graphemes);
  if (centers.length === 0 || denom <= 0) {
    return null;
  }

  const W = denom;
  const θUser = (sweepDeg * Math.PI) / 180;
  const { R, sweepRad: θ } = resolveArcRadiusAndSweep(W, θUser, options.radius, options.layoutMode);

  const up = options.up;
  const δ = options.baselineOffset ?? 0;
  const Rdraw = R + δ;
  const startExtra = ((options.startAngleDeg ?? 0) * Math.PI) / 180;

  const cx = anchorX;
  const cy = up ? anchorY + R : anchorY - R;

  const placements: GlyphArcPlacement[] = [];
  for (let i = 0; i < graphemes.length; i++) {
    const t = centers[i]! / denom;
    const α = up ? startExtra - Math.PI / 2 - θ / 2 + t * θ : startExtra + Math.PI / 2 + θ / 2 - t * θ;

    const px = cx + Rdraw * Math.cos(α);
    const py = cy + Rdraw * Math.sin(α);
    const rotationRad = glyphRotationOnCircle(α, up);
    placements.push({
      grapheme: graphemes[i]!,
      x: px,
      y: py,
      rotationRad,
      resolvedRadius: R,
      resolvedSweepRad: θ,
    });
  }

  return placements;
}
