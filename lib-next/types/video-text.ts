import type { TextProperties } from "./text";

/**
 * Enter/exit motion for a {@link VideoTextOverlayClip} on the video timeline.
 * Maps to FFmpeg overlay / alpha expressions (eval=frame).
 */
export type VideoTextTransitionPreset =
  | "none"
  | "fade"
  | "fadeIn"
  | "fadeOut"
  | "slideIn"
  | "slideOut"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "zoomIn"
  | "zoomOut"
  | "bounce"
  | "typewriter";

/** Built-in or custom FFmpeg expression overrides (`t` = seconds). */
export interface VideoTextTransition {
  type: VideoTextTransitionPreset;
  /** Seconds (default `0.35`). */
  duration?: number;
  /**
   * Advanced: override auto-built expressions (`t` variable, main video `w`/`h`).
   * When set, merged with preset (preset fills missing keys).
   */
  custom?: {
    x?: string;
    y?: string;
    alpha?: string;
    scale?: string;
  };
}

/**
 * One timed caption using the same styling model as **`createText`** ({@link TextProperties}).
 */
export interface VideoTextOverlayClip extends TextProperties {
  /** Seconds when this overlay becomes visible. */
  startTime: number;
  /** Seconds when this overlay is hidden. */
  endTime: number;
  transitionIn?: VideoTextTransition;
  transitionOut?: VideoTextTransition;
  /**
   * Master overlay opacity 0–1 (default `1`), multiplied with transition fades.
   * Distinct from {@link TextProperties.fill} / `opacity` on glyphs.
   */
  overlayOpacity?: number;
}

export interface VideoTextOverlayOperation {
  overlays: VideoTextOverlayClip[];
  outputPath: string;
}

/** Strip timeline fields; remainder is valid {@link TextProperties}. */
export type VideoTextOverlayStyle = Omit<
  VideoTextOverlayClip,
  "startTime" | "endTime" | "transitionIn" | "transitionOut" | "overlayOpacity"
>;
