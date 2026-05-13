import type { SKRSContext2D } from "@napi-rs/canvas";
import type { borderPosition } from "../types/common";

function computeCornerRadii(
  borderPos: borderPosition,
  br: number,
  w: number,
  h: number
): { tl: number; tr: number; brR: number; bl: number } {
  const sel = new Set(borderPos.toLowerCase().split(",").map((s) => s.trim()));
  const has = (name: string) =>
    sel.has("all") ||
    sel.has(name) ||
    (name === "top-left" && (sel.has("top") || sel.has("left"))) ||
    (name === "top-right" && (sel.has("top") || sel.has("right"))) ||
    (name === "bottom-right" && (sel.has("bottom") || sel.has("right"))) ||
    (name === "bottom-left" && (sel.has("bottom") || sel.has("left")));
  const R = Math.min(br, w / 2, h / 2);
  return {
    tl: has("top-left") ? R : 0,
    tr: has("top-right") ? R : 0,
    brR: has("bottom-right") ? R : 0,
    bl: has("bottom-left") ? R : 0,
  };
}

type RectEdge = "top" | "right" | "bottom" | "left";

function parseStrokeSideSet(edgeSpec: borderPosition | undefined): Set<RectEdge> | "all" {
  const raw = (edgeSpec ?? "all").toString().toLowerCase().trim();
  if (!raw || raw === "all") return "all";

  const EDGE = new Set(["top", "right", "bottom", "left"]);
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const out = new Set<RectEdge>();
  for (const p of parts) {
    if (EDGE.has(p)) out.add(p as RectEdge);
    else if (p === "top-left") {
      out.add("top");
      out.add("left");
    } else if (p === "top-right") {
      out.add("top");
      out.add("right");
    } else if (p === "bottom-right") {
      out.add("bottom");
      out.add("right");
    } else if (p === "bottom-left") {
      out.add("bottom");
      out.add("left");
    }
  }
  return out.size > 0 ? out : "all";
}

const CLOCKWISE_EDGES: RectEdge[] = ["top", "right", "bottom", "left"];

function buildPartialRectStrokeEdges(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  roundedCorners: borderPosition,
  sides: Set<RectEdge>
): void {
  const br = radius > 0 ? Math.min(radius, w / 2, h / 2) : 0;
  const { tl, tr, brR, bl } = computeCornerRadii(roundedCorners, br, w, h);
  const has = (e: RectEdge) => sides.has(e);

  if (CLOCKWISE_EDGES.every(has)) {
    buildPath(ctx, x, y, w, h, radius, roundedCorners);
    return;
  }

  ctx.beginPath();

  const starts: number[] = [];
  for (let i = 0; i < 4; i++) {
    if (has(CLOCKWISE_EDGES[i]!) && !has(CLOCKWISE_EDGES[(i + 3) % 4]!)) starts.push(i);
  }

  const collectRun = (startIdx: number): RectEdge[] => {
    const run: RectEdge[] = [];
    let i = startIdx;
    while (has(CLOCKWISE_EDGES[i]!)) {
      run.push(CLOCKWISE_EDGES[i]!);
      i = (i + 1) % 4;
      if (i === startIdx) break;
      if (run.length >= 4) break;
    }
    return run;
  };

  if (starts.length === 0) return;

  for (const s of starts) {
    const run = collectRun(s);
    if (run.length === 0) continue;

    const e0 = run[0]!;
    switch (e0) {
      case "top":
        ctx.moveTo(x + tl, y);
        break;
      case "right":
        ctx.moveTo(x + w, y + tr);
        break;
      case "bottom":
        ctx.moveTo(x + w - brR, y + h);
        break;
      case "left":
        ctx.moveTo(x, y + h - bl);
        break;
    }

    for (let r = 0; r < run.length; r++) {
      const e = run[r]!;
      const next = run[r + 1];
      switch (e) {
        case "top":
          ctx.lineTo(x + w - tr, y);
          if (next === "right") {
            if (tr > 0) ctx.arcTo(x + w, y, x + w, y + tr, tr);
            else ctx.lineTo(x + w, y);
          }
          break;
        case "right":
          ctx.lineTo(x + w, y + h - brR);
          if (next === "bottom") {
            if (brR > 0) ctx.arcTo(x + w, y + h, x + w - brR, y + h, brR);
            else ctx.lineTo(x + w, y + h);
          }
          break;
        case "bottom":
          ctx.lineTo(x + bl, y + h);
          if (next === "left") {
            if (bl > 0) ctx.arcTo(x, y + h, x, y + h - bl, bl);
            else ctx.lineTo(x, y + h);
          }
          break;
        case "left":
          ctx.lineTo(x, y + tl);
          if (next === "top") {
            if (tl > 0) ctx.arcTo(x, y, x + tl, y, tl);
            else ctx.lineTo(x, y);
          }
          break;
      }
    }
  }
}

export function buildPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number | "circular" = 0,
  borderPos: borderPosition = "all"
): void {
  ctx.beginPath();

  if (radius === "circular") {
    const r = Math.min(w, h) / 2;
    ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.closePath();
    return;
  }

  if (!radius || radius <= 0) {
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }

  const br = Math.min(radius, w / 2, h / 2);
  const { tl, tr, brR, bl } = computeCornerRadii(borderPos, br, w, h);

  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
  ctx.lineTo(x + w, y + h - brR);
  if (brR) ctx.arcTo(x + w, y + h, x + w - brR, y + h, brR);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.arcTo(x, y, x + tl, y, tl);

  ctx.closePath();
}

export function applyRotation(
  ctx: SKRSContext2D,
  deg: number | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  if (!deg) return;
  const cx = x + w / 2;
  const cy = y + h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/** @internal used by stroke renderer */
export { parseStrokeSideSet, buildPartialRectStrokeEdges };
