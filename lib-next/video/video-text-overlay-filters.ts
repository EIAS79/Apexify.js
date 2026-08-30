import type { VideoTextOverlayClip, VideoTextTransition, VideoTextTransitionPreset } from "../types";

const DEFAULT_TRANSITION_SEC = 0.35;
const MAX_CUSTOM_EXPRESSION_LENGTH = 512;
const ALLOWED_EXPRESSION_IDENTIFIERS = new Set([
  "t", "w", "h", "W", "H", "main_w", "main_h", "overlay_w", "overlay_h", "ow", "oh",
  "PI", "E", "if", "lt", "lte", "gt", "gte", "eq", "between", "sin", "cos", "tan",
  "abs", "min", "max", "pow", "sqrt", "clip", "mod", "not", "isnan", "isinf", "floor",
  "ceil", "trunc", "round", "exp", "log",
]);

/**
 * Validate advanced FFmpeg expressions before they are embedded in a filter graph.
 * Delimiters that can terminate/rewrite a filter graph are deliberately forbidden.
 */
export function assertSafeFilterExpression(value: string, label = "custom filter expression"): string {
  if (!value || value.length > MAX_CUSTOM_EXPRESSION_LENGTH || /[\0\r\n;'"\\:\[\]]/.test(value)) {
    throw new Error(`${label} contains unsafe FFmpeg filter syntax.`);
  }
  if (!/^[A-Za-z0-9_+\-*/%().,!?<>=\s]+$/.test(value)) {
    throw new Error(`${label} contains unsupported characters.`);
  }
  for (const match of value.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    if (!ALLOWED_EXPRESSION_IDENTIFIERS.has(match[0])) {
      throw new Error(`${label} contains unsupported identifier "${match[0]}".`);
    }
  }
  return value;
}

function transitionDuration(t?: VideoTextTransition): number {
  const d = t?.duration;
  if (d == null) return DEFAULT_TRANSITION_SEC;
  if (!Number.isFinite(d) || d < 0) throw new Error("Video text transition duration must be finite and non-negative.");
  return d;
}

function normalizePreset(type: VideoTextTransitionPreset): VideoTextTransitionPreset {
  if (type === "fadeIn" || type === "fadeOut") return "fade";
  if (type === "slideIn") return "slideLeft";
  if (type === "slideOut") return "slideRight";
  return type;
}

function customExpression(value: string | undefined, label: string): string | undefined {
  return value === undefined ? undefined : assertSafeFilterExpression(value, label);
}

export function buildOverlayAlphaExpression(
  clip: Pick<VideoTextOverlayClip, "startTime" | "endTime" | "transitionIn" | "transitionOut" | "overlayOpacity">
): string {
  const s = clip.startTime;
  const e = clip.endTime;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) throw new Error("Video text timing must be a finite increasing range.");
  const op = clip.overlayOpacity ?? 1;
  if (!Number.isFinite(op) || op < 0 || op > 1) throw new Error("Video text overlayOpacity must be between 0 and 1.");
  const di = clip.transitionIn ? transitionDuration(clip.transitionIn) : 0;
  const do_ = clip.transitionOut ? transitionDuration(clip.transitionOut) : 0;
  const tin = normalizePreset(clip.transitionIn?.type ?? "none");
  const tout = normalizePreset(clip.transitionOut?.type ?? "none");

  const fadeInExpr = di > 0
    ? `if(lt(t,${s}),0,if(lt(t,${s + di}),(t-${s})/${di},1))`
    : `if(lt(t,${s}),0,1)`;
  const fadeOutExpr = do_ > 0
    ? `if(gt(t,${e}),0,if(gt(t,${e - do_}),(${e}-t)/${do_},1))`
    : `if(gt(t,${e}),0,1)`;

  let alpha = `(${fadeInExpr})*(${fadeOutExpr})*${op}`;
  const inCustom = customExpression(clip.transitionIn?.custom?.alpha, "transitionIn.custom.alpha");
  const outCustom = customExpression(clip.transitionOut?.custom?.alpha, "transitionOut.custom.alpha");
  if (inCustom) alpha = inCustom;
  else if (outCustom) alpha = outCustom;

  // Touch normalized presets so unsupported future branches cannot silently bypass timing behavior.
  void tin;
  void tout;
  return alpha;
}

export interface OverlayMotionExprs {
  x: string;
  y: string;
  alpha: string;
  scale: string;
}

export function buildOverlayMotionExpressions(
  clip: VideoTextOverlayClip,
  videoWidth: number,
  videoHeight: number
): OverlayMotionExprs {
  const s = clip.startTime;
  const e = clip.endTime;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) throw new Error("Video text timing must be a finite increasing range.");
  if (!Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) || videoWidth <= 0 || videoHeight <= 0) {
    throw new Error("Video dimensions must be finite positive numbers.");
  }

  const di = clip.transitionIn ? transitionDuration(clip.transitionIn) : 0;
  const do_ = clip.transitionOut ? transitionDuration(clip.transitionOut) : 0;
  const tin = normalizePreset(clip.transitionIn?.type ?? "none");
  const tout = normalizePreset(clip.transitionOut?.type ?? "none");
  let x = "0";
  let y = "0";
  let scale = "1";

  if (tin === "slideLeft" && di > 0) {
    x = `if(lt(t,${s}),-${videoWidth},if(lt(t,${s + di}),-${videoWidth}+${videoWidth}*((t-${s})/${di}),0))`;
  } else if (tin === "slideRight" && di > 0) {
    x = `if(lt(t,${s}),${videoWidth},if(lt(t,${s + di}),${videoWidth}-${videoWidth}*((t-${s})/${di}),0))`;
  } else if (tin === "slideUp" && di > 0) {
    y = `if(lt(t,${s}),-${videoHeight},if(lt(t,${s + di}),-${videoHeight}+${videoHeight}*((t-${s})/${di}),0))`;
  } else if (tin === "slideDown" && di > 0) {
    y = `if(lt(t,${s}),${videoHeight},if(lt(t,${s + di}),${videoHeight}-${videoHeight}*((t-${s})/${di}),0))`;
  }

  if (tout === "slideRight" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),${videoWidth},if(gt(t,${e - do_}),${videoWidth}*((t-(${e}-${do_}))/${do_}),0))`;
    x = x === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${x})`;
  } else if (tout === "slideLeft" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),-${videoWidth},if(gt(t,${e - do_}),-${videoWidth}*((t-(${e}-${do_}))/${do_}),0))`;
    x = x === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${x})`;
  } else if (tout === "slideUp" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),-${videoHeight},if(gt(t,${e - do_}),-${videoHeight}*((t-(${e}-${do_}))/${do_}),0))`;
    y = y === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${y})`;
  } else if (tout === "slideDown" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),${videoHeight},if(gt(t,${e - do_}),${videoHeight}*((t-(${e}-${do_}))/${do_}),0))`;
    y = y === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${y})`;
  }

  if (tin === "zoomIn" && di > 0) scale = `if(lt(t,${s}),0,if(lt(t,${s + di}),(t-${s})/${di},1))`;
  else if (tin === "zoomOut" && di > 0) scale = `if(lt(t,${s}),1.25,if(lt(t,${s + di}),1.25-0.25*((t-${s})/${di}),1))`;

  if (tout === "zoomOut" && do_ > 0) {
    const zOut = `if(gt(t,${e}),0,if(gt(t,${e - do_}),1-((t-(${e}-${do_}))/${do_}),1))`;
    scale = scale === "1" ? zOut : `(${scale})*(${zOut})`;
  }
  if (tin === "bounce" && di > 0) y = `if(between(t,${s},${s + di}),-20*sin(PI*(t-${s})/${di}),0)`;

  const customIn = clip.transitionIn?.custom;
  const customOut = clip.transitionOut?.custom;
  x = customExpression(customOut?.x, "transitionOut.custom.x")
    ?? customExpression(customIn?.x, "transitionIn.custom.x") ?? x;
  y = customExpression(customOut?.y, "transitionOut.custom.y")
    ?? customExpression(customIn?.y, "transitionIn.custom.y") ?? y;
  scale = customExpression(customOut?.scale, "transitionOut.custom.scale")
    ?? customExpression(customIn?.scale, "transitionIn.custom.scale") ?? scale;

  return { x, y, alpha: buildOverlayAlphaExpression(clip), scale };
}

export function buildEnableBetween(start: number, end: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
    throw new Error("Video text enable range must be finite and increasing.");
  }
  return `between(t\\,${start}\\,${end})`;
}
