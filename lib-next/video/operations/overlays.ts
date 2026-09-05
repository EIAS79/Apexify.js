import { promises as fs } from "node:fs";
import type { VideoTextOverlayClip, VideoTextOverlayOperation } from "../../types";
import { ApexifyInputError } from "../../runtime/errors";
import { resolveMediaInput } from "../../media/source";
import { buildTextOverlayFilterComplex, prepareTextOverlayPngs, validateTextOverlayOperation } from "../video-text-overlay-apply";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { evenDimension, finiteNumber, nonNegativeNumber, positiveNumber, watermarkPosition } from "./filter-graph";

function imageScaleFilter(size?: { width?: number; height?: number; fit?: "contain" | "cover" | "stretch" }): string | undefined {
  if (!size || (size.width === undefined && size.height === undefined)) return undefined;
  if (size.width !== undefined) positiveNumber(size.width, "overlay width");
  if (size.height !== undefined) positiveNumber(size.height, "overlay height");
  const width = size.width === undefined ? -2 : evenDimension(size.width);
  const height = size.height === undefined ? -2 : evenDimension(size.height);
  if (size.fit === "stretch") return `scale=${width}:${height}`;
  if (size.width === undefined || size.height === undefined) return `scale=${width}:${height}`;
  if (size.fit === "cover") return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease`;
}

function overlayEnable(startTime: number | undefined, endTime: number | undefined, duration: number): string | undefined {
  const start = startTime ?? 0;
  const end = endTime ?? duration;
  nonNegativeNumber(start, "overlay startTime");
  positiveNumber(end, "overlay endTime");
  if (end <= start || end > duration + 0.001) throw new ApexifyInputError("overlay time range must be increasing and inside the source duration.");
  return start === 0 && Math.abs(end - duration) < 0.001 ? undefined : `between(t\\,${start}\\,${end})`;
}

async function resolveImage(source: string | Buffer, workspacePath: (name: string) => string, signal?: AbortSignal): Promise<string> {
  const resolved = await resolveMediaInput(source, { kind: "image", signal, cache: false });
  if (Buffer.isBuffer(resolved)) {
    const target = workspacePath("overlay-media.bin");
    await fs.writeFile(target, resolved);
    return target;
  }
  return resolved;
}

function namedPosition(position: string | undefined, width: number, height: number): { x: number; y: number; textAlign: CanvasTextAlign; textBaseline: CanvasTextBaseline } {
  switch (position) {
    case "top-right": return { x: width - 10, y: 10, textAlign: "right", textBaseline: "top" };
    case "bottom-left": return { x: 10, y: height - 10, textAlign: "left", textBaseline: "bottom" };
    case "bottom-right": return { x: width - 10, y: height - 10, textAlign: "right", textBaseline: "bottom" };
    case "center": return { x: width / 2, y: height / 2, textAlign: "center", textBaseline: "middle" };
    case "top-center": return { x: width / 2, y: 10, textAlign: "center", textBaseline: "top" };
    case "bottom-center": return { x: width / 2, y: height - 10, textAlign: "center", textBaseline: "bottom" };
    default: return { x: 10, y: 10, textAlign: "left", textBaseline: "top" };
  }
}

export class OverlayOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async watermark(source: string | Buffer, options: {
    watermarkPath: string | Buffer;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    opacity?: number;
    size?: { width?: number; height?: number; fit?: "contain" | "cover" | "stretch" };
    marginX?: number;
    marginY?: number;
    startTime?: number;
    endTime?: number;
    outputPath: string;
  }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-watermark-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const watermarkPath = await resolveImage(options.watermarkPath, (name) => workspace.path(name), controls.signal);
      const opacity = finiteNumber(options.opacity ?? 1, "watermark opacity");
      if (opacity < 0 || opacity > 1) throw new ApexifyInputError("watermark opacity must be between 0 and 1.");
      const marginX = nonNegativeNumber(options.marginX ?? 10, "watermark marginX");
      const marginY = nonNegativeNumber(options.marginY ?? 10, "watermark marginY");
      const scale = imageScaleFilter(options.size);
      const enable = overlayEnable(options.startTime, options.endTime, info.duration);
      const prep = [scale, "format=rgba", `colorchannelmixer=aa=${opacity}`].filter(Boolean).join(",");
      const position = watermarkPosition(options.position ?? "bottom-right", marginX, marginY);
      const filter = `[1:v]${prep}[wm];[0:v][wm]overlay=${position}:eof_action=pass${enable ? `:enable='${enable}'` : ""}[vout]`;
      const args = ["-i", videoPath, "-i", watermarkPath, "-filter_complex", filter, "-map", "[vout]", ...(info.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]), "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async pictureInPicture(source: string | Buffer, options: {
    overlayVideo: string | Buffer;
    position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
    size?: { width?: number; height?: number; fit?: "contain" | "cover" | "stretch" };
    opacity?: number;
    outputPath: string;
  }, controls: VideoRunControls = {}) {
    return this.runtime.withWorkspace("apexify-pip-", async (workspace) => {
      const main = await this.runtime.resolve(source, workspace, "main", controls);
      const overlay = await this.runtime.resolve(options.overlayVideo, workspace, "pip", controls);
      const info = await this.runtime.probeFile(main.videoPath, controls);
      const opacity = finiteNumber(options.opacity ?? 1, "PIP opacity");
      if (opacity < 0 || opacity > 1) throw new ApexifyInputError("PIP opacity must be between 0 and 1.");
      const scale = imageScaleFilter(options.size ?? { width: 320, height: 180, fit: "contain" });
      const pos = watermarkPosition(options.position ?? "bottom-right", 10, 10);
      const filter = `[1:v]${scale},format=rgba,colorchannelmixer=aa=${opacity}[pip];[0:v][pip]overlay=${pos}:eof_action=pass[vout]`;
      const args = ["-i", main.videoPath, "-i", overlay.videoPath, "-filter_complex", filter, "-map", "[vout]", ...(info.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]), "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async text(source: string | Buffer, options: VideoTextOverlayOperation, controls: VideoRunControls = {}) {
    validateTextOverlayOperation(options);
    return this.runtime.withWorkspace("apexify-text-overlay-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      for (const [index, clip] of options.overlays.entries()) {
        if (clip.endTime > info.duration + 0.001) throw new ApexifyInputError(`text overlay ${index} ends after the source duration.`);
      }
      const { pngPaths } = await prepareTextOverlayPngs(workspace.directory, 0, options.overlays, info.width, info.height);
      const { filterComplex, outputLabel } = buildTextOverlayFilterComplex(options.overlays.length, options.overlays, info.width, info.height);
      const args: string[] = ["-i", videoPath];
      for (const png of pngPaths) args.push("-i", png);
      args.push("-filter_complex", filterComplex, "-map", `[${outputLabel}]`, ...(info.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]), "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async deprecatedText(source: string | Buffer, options: {
    text: string;
    position?: string;
    fontSize?: number;
    fontColor?: string;
    backgroundColor?: string;
    startTime?: number;
    endTime?: number;
    outputPath: string;
  }, controls: VideoRunControls = {}) {
    const info = await this.runtime.withWorkspace("apexify-text-info-", async (workspace) => {
      const resolved = await this.runtime.resolve(source, workspace, "input", controls);
      return this.runtime.probeFile(resolved.videoPath, controls);
    });
    const pos = namedPosition(options.position, info.width, info.height);
    const clip = {
      text: options.text,
      x: pos.x,
      y: pos.y,
      font: { size: positiveNumber(options.fontSize ?? 24, "fontSize"), family: "Arial" },
      fill: { color: options.fontColor ?? "white" },
      highlight: options.backgroundColor ? { color: options.backgroundColor } : undefined,
      placement: { textAlign: pos.textAlign, textBaseline: pos.textBaseline },
      startTime: options.startTime ?? 0,
      endTime: options.endTime ?? info.duration,
    } as VideoTextOverlayClip;
    return this.text(source, { overlays: [clip], outputPath: options.outputPath }, controls);
  }

  async deprecatedAnimatedText(source: string | Buffer, options: {
    text: string;
    animation?: string;
    startTime: number;
    endTime: number;
    position?: { x: number; y: number } | string;
    fontSize?: number;
    fontColor?: string;
    fontPath?: string;
    fontName?: string;
    fontFamily?: string;
    backgroundColor?: string;
    outputPath: string;
  }, controls: VideoRunControls = {}) {
    if (options.fontPath) throw new ApexifyInputError("Deprecated addAnimatedText.fontPath is not supported; register the font and use addTextOverlay with the createText font model.");
    const info = await this.runtime.withWorkspace("apexify-animated-text-info-", async (workspace) => {
      const resolved = await this.runtime.resolve(source, workspace, "input", controls);
      return this.runtime.probeFile(resolved.videoPath, controls);
    });
    const named = typeof options.position === "string" || options.position === undefined ? namedPosition(options.position, info.width, info.height) : undefined;
    const x = typeof options.position === "object" ? finiteNumber(options.position.x, "text x") : named!.x;
    const y = typeof options.position === "object" ? finiteNumber(options.position.y, "text y") : named!.y;
    const animation = options.animation ?? "none";
    if (animation === "typewriter" || animation === "rotate") {
      throw new ApexifyInputError(`Deprecated addAnimatedText animation '${animation}' was historically a no-op and is intentionally unsupported; use addTextOverlay transitions.`);
    }
    const transitionIn = animation === "fadeIn" ? { type: "fade" as const, duration: 0.5 }
      : animation === "slideIn" ? { type: "slideLeft" as const, duration: 0.5 }
      : animation === "bounce" ? { type: "bounce" as const, duration: 0.5 }
      : animation === "zoom" ? { type: "zoomIn" as const, duration: 0.5 }
      : undefined;
    const transitionOut = animation === "fadeOut" ? { type: "fade" as const, duration: 0.5 }
      : animation === "slideOut" ? { type: "slideRight" as const, duration: 0.5 }
      : undefined;
    const clip = {
      text: options.text,
      x,
      y,
      font: { size: positiveNumber(options.fontSize ?? 24, "fontSize"), family: options.fontFamily ?? options.fontName ?? "Arial" },
      fill: { color: options.fontColor ?? "white" },
      highlight: options.backgroundColor ? { color: options.backgroundColor } : undefined,
      placement: { textAlign: named?.textAlign ?? "left", textBaseline: named?.textBaseline ?? "top" },
      startTime: options.startTime,
      endTime: options.endTime,
      transitionIn,
      transitionOut,
    } as VideoTextOverlayClip;
    return this.text(source, { overlays: [clip], outputPath: options.outputPath }, controls);
  }
}
