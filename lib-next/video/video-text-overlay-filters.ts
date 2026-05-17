import type { VideoTextOverlayClip, VideoTextTransition, VideoTextTransitionPreset } from "../types";

const DEFAULT_TRANSITION_SEC = 0.35;

function transitionDuration(t?: VideoTextTransition): number {
  const d = t?.duration;
  if (d == null || !Number.isFinite(d) || d < 0) return DEFAULT_TRANSITION_SEC;
  return d;
}

function normalizePreset(type: VideoTextTransitionPreset): VideoTextTransitionPreset {
  if (type === "fadeIn") return "fade";
  if (type === "fadeOut") return "fade";
  if (type === "slideIn") return "slideLeft";
  if (type === "slideOut") return "slideRight";
  return type;
}

/** Combined visibility alpha 0–1 for overlay layer. */
export function buildOverlayAlphaExpression(
  clip: Pick<VideoTextOverlayClip, "startTime" | "endTime" | "transitionIn" | "transitionOut" | "overlayOpacity">
): string {
  const s = clip.startTime;
  const e = clip.endTime;
  const op = clip.overlayOpacity ?? 1;
  const di = clip.transitionIn ? transitionDuration(clip.transitionIn) : 0;
  const do_ = clip.transitionOut ? transitionDuration(clip.transitionOut) : 0;

  const tin = normalizePreset(clip.transitionIn?.type ?? "none");
  const tout = normalizePreset(clip.transitionOut?.type ?? "none");

  let fadeInExpr = "1";
  if (tin === "fade" || tin === "fadeIn") {
    fadeInExpr =
      di > 0
        ? `if(lt(t,${s}),0,if(lt(t,${s + di}),(t-${s})/${di},1))`
        : `if(lt(t,${s}),0,1)`;
  } else if (tin !== "none") {
    fadeInExpr =
      di > 0
        ? `if(lt(t,${s}),0,if(lt(t,${s + di}),(t-${s})/${di},1))`
        : `if(lt(t,${s}),0,1)`;
  } else {
    fadeInExpr = `if(lt(t,${s}),0,1)`;
  }

  let fadeOutExpr = "1";
  if (tout === "fade" || tout === "fadeOut") {
    fadeOutExpr =
      do_ > 0
        ? `if(gt(t,${e}),0,if(gt(t,${e - do_}),(${e}-t)/${do_},1))`
        : `if(gt(t,${e}),0,1)`;
  } else if (tout !== "none") {
    fadeOutExpr =
      do_ > 0
        ? `if(gt(t,${e}),0,if(gt(t,${e - do_}),(${e}-t)/${do_},1))`
        : `if(gt(t,${e}),0,1)`;
  } else {
    fadeOutExpr = `if(gt(t,${e}),0,1)`;
  }

  let alpha = `(${fadeInExpr})*(${fadeOutExpr})*${op}`;
  if (clip.transitionIn?.custom?.alpha) {
    alpha = clip.transitionIn.custom.alpha;
  } else if (clip.transitionOut?.custom?.alpha) {
    alpha = clip.transitionOut.custom.alpha;
  }
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
  const di = clip.transitionIn ? transitionDuration(clip.transitionIn) : 0;
  const do_ = clip.transitionOut ? transitionDuration(clip.transitionOut) : 0;
  const tin = normalizePreset(clip.transitionIn?.type ?? "none");
  const tout = normalizePreset(clip.transitionOut?.type ?? "none");

  let x = "0";
  let y = "0";
  let scale = "1";

  const slideDistX = videoWidth;
  const slideDistY = videoHeight;

  if (tin === "slideLeft" && di > 0) {
    x = `if(lt(t,${s}),-${slideDistX},if(lt(t,${s + di}),-${slideDistX}+${slideDistX}*((t-${s})/${di}),0))`;
  } else if (tin === "slideRight" && di > 0) {
    x = `if(lt(t,${s}),${slideDistX},if(lt(t,${s + di}),${slideDistX}-${slideDistX}*((t-${s})/${di}),0))`;
  } else if (tin === "slideUp" && di > 0) {
    y = `if(lt(t,${s}),-${slideDistY},if(lt(t,${s + di}),-${slideDistY}+${slideDistY}*((t-${s})/${di}),0))`;
  } else if (tin === "slideDown" && di > 0) {
    y = `if(lt(t,${s}),${slideDistY},if(lt(t,${s + di}),${slideDistY}-${slideDistY}*((t-${s})/${di}),0))`;
  }

  if (tout === "slideRight" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),${slideDistX},if(gt(t,${e - do_}),${slideDistX}*((t-(${e}-${do_}))/ ${do_}),0))`;
    x = x === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${x})`;
  } else if (tout === "slideLeft" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),-${slideDistX},if(gt(t,${e - do_}),-${slideDistX}*((t-(${e}-${do_}))/ ${do_}),0))`;
    x = x === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${x})`;
  } else if (tout === "slideUp" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),-${slideDistY},if(gt(t,${e - do_}),-${slideDistY}*((t-(${e}-${do_}))/ ${do_}),0))`;
    y = y === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${y})`;
  } else if (tout === "slideDown" && do_ > 0) {
    const outSlide = `if(gt(t,${e}),${slideDistY},if(gt(t,${e - do_}),${slideDistY}*((t-(${e}-${do_}))/ ${do_}),0))`;
    y = y === "0" ? outSlide : `if(between(t,${e - do_},${e}),${outSlide},${y})`;
  }

  if (tin === "zoomIn" && di > 0) {
    scale = `if(lt(t,${s}),0,if(lt(t,${s + di}),(t-${s})/${di},1))`;
  } else if (tin === "zoomOut" && di > 0) {
    scale = `if(lt(t,${s}),1.25,if(lt(t,${s + di}),1.25-0.25*((t-${s})/${di}),1))`;
  }

  if (tout === "zoomOut" && do_ > 0) {
    const zOut = `if(gt(t,${e}),0,if(gt(t,${e - do_}),1-((t-(${e}-${do_}))/ ${do_}),1))`;
    scale = scale === "1" ? zOut : `(${scale})*(${zOut})`;
  }

  if (tin === "bounce" && di > 0) {
    y = `if(between(t,${s},${s + di}),-20*sin(PI*(t-${s})/${di}),0)`;
  }

  const alpha = buildOverlayAlphaExpression(clip);

  if (clip.transitionIn?.custom?.x) x = clip.transitionIn.custom.x;
  if (clip.transitionIn?.custom?.y) y = clip.transitionIn.custom.y;
  if (clip.transitionOut?.custom?.x) x = clip.transitionOut.custom.x;
  if (clip.transitionOut?.custom?.y) y = clip.transitionOut.custom.y;

  if (clip.transitionIn?.custom?.scale) scale = clip.transitionIn.custom.scale;
  if (clip.transitionOut?.custom?.scale) scale = clip.transitionOut.custom.scale;

  if (tin === "typewriter") {
    // Full-string fade during in-transition; per-glyph typewriter needs frame pipeline.
  }

  return { x, y, alpha, scale };
}

export function buildEnableBetween(start: number, end: number): string {
  return `between(t\\,${start}\\,${end})`;
}
