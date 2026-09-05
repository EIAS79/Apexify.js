import { promises as fs } from "node:fs";
import path from "node:path";
import type { VideoTextOverlayClip, VideoTextOverlayOperation } from "../types";
import { renderVideoTextLayerPng } from "./render-video-text-layer";
import { buildEnableBetween, buildOverlayMotionExpressions } from "./video-text-overlay-filters";

function splitOverlayStyle(clip: VideoTextOverlayClip): {
  style: Omit<VideoTextOverlayClip, "startTime" | "endTime" | "transitionIn" | "transitionOut" | "overlayOpacity">;
} {
  const { startTime: _startTime, endTime: _endTime, transitionIn: _transitionIn, transitionOut: _transitionOut, overlayOpacity: _overlayOpacity, ...style } = clip;
  return { style };
}

function validateClip(clip: VideoTextOverlayClip, index: number): void {
  if (!clip.text || clip.x == null || clip.y == null) throw new Error(`addTextOverlay: overlays[${index}] requires text, x, and y (same style contract as createText).`);
  if (!Number.isFinite(clip.startTime) || !Number.isFinite(clip.endTime)) throw new Error(`addTextOverlay: overlays[${index}] requires finite startTime and endTime.`);
  if (clip.startTime >= clip.endTime) throw new Error(`addTextOverlay: overlays[${index}] startTime must be less than endTime.`);
}

/** Builds FFmpeg `-filter_complex` only from validated numeric motion expressions and generated input labels. */
export function buildTextOverlayFilterComplex(overlayCount: number, clips: VideoTextOverlayClip[], videoWidth: number, videoHeight: number): { filterComplex: string; outputLabel: string } {
  if (overlayCount !== clips.length) throw new Error("Overlay count mismatch");
  const parts: string[] = [];
  let current = "[0:v]";
  for (let i = 0; i < clips.length; i += 1) {
    const clip = clips[i]!;
    const inputIdx = i + 1;
    const motion = buildOverlayMotionExpressions(clip, videoWidth, videoHeight);
    const enable = buildEnableBetween(clip.startTime, clip.endTime);
    const tag = `ov${i}`;
    const outTag = `v${i + 1}`;
    const scaleExpr = motion.scale === "1" ? "iw" : `iw*(${motion.scale})`;
    const scaleExprH = motion.scale === "1" ? "ih" : `ih*(${motion.scale})`;
    parts.push(`[${inputIdx}:v]format=rgba,scale=w='${scaleExpr}':h='${scaleExprH}':eval=frame,colorchannelmixer=aa='${motion.alpha}'[${tag}]`);
    parts.push(`${current}[${tag}]overlay=x='${motion.x}':y='${motion.y}':eval=frame:enable='${enable}'[${outTag}]`);
    current = `[${outTag}]`;
  }
  return { filterComplex: parts.join(";"), outputLabel: current.slice(1, -1) };
}

export async function prepareTextOverlayPngs(frameDir: string, clips: VideoTextOverlayClip[], videoWidth: number, videoHeight: number): Promise<string[]> {
  const pngPaths: string[] = [];
  for (let i = 0; i < clips.length; i += 1) {
    const { style } = splitOverlayStyle(clips[i]!);
    const png = await renderVideoTextLayerPng(videoWidth, videoHeight, style);
    const pngPath = path.join(frameDir, `text-overlay-${String(i).padStart(4, "0")}.png`);
    await fs.writeFile(pngPath, png);
    pngPaths.push(pngPath);
  }
  return pngPaths;
}

export function validateTextOverlayOperation(options: VideoTextOverlayOperation): void {
  if (!options.overlays?.length) throw new Error("addTextOverlay: provide at least one overlay in overlays[].");
  if (!options.outputPath) throw new Error("addTextOverlay: outputPath is required.");
  options.overlays.forEach(validateClip);
}
