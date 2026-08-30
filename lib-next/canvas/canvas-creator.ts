import { createCanvas, loadImage, SKRSContext2D, Canvas } from "@napi-rs/canvas";
import { loadImageCached } from "../image/image-properties";
import type { CanvasConfig, CanvasResults } from "../types";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import {
  drawBackgroundGradient,
  drawBackgroundColor,
  customBackground,
  applyCanvasZoom,
  applyNoise,
  drawBackgroundLayers,
  resolveMediaPath,
} from "./background-renderer";
import { buildPath, applyRotation } from "../render/clip-path";
import { applyShadow } from "../render/shadow-renderer";
import { applyStroke } from "../render/stroke-renderer";
import { EnhancedPatternRenderer } from "./pattern-renderer";
import { applyContextImageFilters } from "../render/context-image-filters";
import { withTempWorkspace } from "../video/temp-workspace";
import { assertCanvasResourceLimits } from "../runtime/limits";

export type { CanvasResults };

/** When createImage/createText receive CanvasResults, keep canvas.buffer current. */
export function assignCanvasResultsBuffer(target: CanvasResults | Buffer, buffer: Buffer): Buffer {
  if (!Buffer.isBuffer(target)) target.buffer = buffer;
  return buffer;
}

export class CanvasCreator {
  private extractVideoFrame?: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: "jpg" | "png",
    quality?: number
  ) => Promise<Buffer | null>;

  setExtractVideoFrame(method: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: "jpg" | "png",
    quality?: number
  ) => Promise<Buffer | null>): void {
    this.extractVideoFrame = method;
  }

  private validateCanvasConfig(canvas: CanvasConfig): void {
    if (!canvas) throw new Error("createCanvas: canvas configuration is required.");
    if (canvas.width !== undefined && (typeof canvas.width !== "number" || !Number.isFinite(canvas.width) || canvas.width <= 0)) {
      throw new Error("createCanvas: width must be a finite positive number.");
    }
    if (canvas.height !== undefined && (typeof canvas.height !== "number" || !Number.isFinite(canvas.height) || canvas.height <= 0)) {
      throw new Error("createCanvas: height must be a finite positive number.");
    }
    if (canvas.opacity !== undefined && (typeof canvas.opacity !== "number" || canvas.opacity < 0 || canvas.opacity > 1)) {
      throw new Error("createCanvas: opacity must be a number between 0 and 1.");
    }
    if (canvas.zoom?.scale !== undefined && (typeof canvas.zoom.scale !== "number" || canvas.zoom.scale <= 0)) {
      throw new Error("createCanvas: zoom.scale must be a positive number.");
    }

    if (canvas.bgLayers !== undefined) {
      if (!Array.isArray(canvas.bgLayers)) throw new Error("createCanvas: bgLayers must be an array.");
      const allowed = new Set(["color", "gradient", "image", "pattern", "presetPattern", "noise"]);
      for (let i = 0; i < canvas.bgLayers.length; i++) {
        const layer = canvas.bgLayers[i];
        if (!layer || typeof layer !== "object" || !("type" in layer)) {
          throw new Error(`createCanvas: bgLayers[${i}] must be an object with a type field.`);
        }
        if (!allowed.has(layer.type)) {
          throw new Error(`createCanvas: bgLayers[${i}].type must be one of color, gradient, image, pattern, presetPattern, noise (got "${String((layer as { type: string }).type)}").`);
        }
        const layerOpacity = "opacity" in layer ? (layer as { opacity?: number }).opacity : undefined;
        if (layerOpacity !== undefined && (typeof layerOpacity !== "number" || layerOpacity < 0 || layerOpacity > 1)) {
          throw new Error(`createCanvas: bgLayers[${i}].opacity must be between 0 and 1.`);
        }
        if (layer.type === "color" && typeof (layer as { value?: unknown }).value !== "string") {
          throw new Error(`createCanvas: bgLayers[${i}].value must be a string for color layers.`);
        }
        if (layer.type === "gradient") {
          const g = (layer as { value?: { type?: string } }).value;
          if (!g || typeof g !== "object" || !g.type) throw new Error(`createCanvas: bgLayers[${i}].value must be a gradient object with type.`);
        }
        if (layer.type === "image" || layer.type === "pattern") {
          const src = (layer as { source?: unknown }).source;
          if (typeof src !== "string" || !src.trim()) throw new Error(`createCanvas: bgLayers[${i}].source must be a non-empty string.`);
        }
        if (layer.type === "presetPattern") {
          const pat = (layer as { pattern?: unknown }).pattern;
          if (!pat || typeof pat !== "object" || !("type" in (pat as object)) || typeof (pat as { type?: unknown }).type !== "string") {
            throw new Error(`createCanvas: bgLayers[${i}].pattern must be a procedural PatternOptions object with string type.`);
          }
        }
        if (layer.type === "noise") {
          const intensity = (layer as { intensity?: unknown }).intensity;
          if (intensity !== undefined && (typeof intensity !== "number" || intensity < 0 || intensity > 1)) {
            throw new Error(`createCanvas: bgLayers[${i}].intensity must be between 0 and 1.`);
          }
        }
      }
    }
  }

  private async resolveCanvasDimensions(canvas: CanvasConfig): Promise<void> {
    if (canvas.customBg?.inherit) {
      const p = resolveMediaPath(canvas.customBg.source);
      try {
        const img = await loadImageCached(p);
        canvas.width = img.width;
        canvas.height = img.height;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`createCanvas: Failed to load image for inherit sizing: ${message}`);
      }
    }

    if (canvas.videoBg && this.extractVideoFrame) {
      try {
        const frameBuffer = await this.extractVideoFrame(
          canvas.videoBg.source,
          canvas.videoBg.frame ?? 0,
          canvas.videoBg.time,
          canvas.videoBg.format || "jpg",
          canvas.videoBg.quality || 2
        );
        if (frameBuffer) {
          const img = await loadImage(frameBuffer);
          if (!canvas.width) canvas.width = img.width;
          if (!canvas.height) canvas.height = img.height;
        }
      } catch {
        console.warn("createCanvas: Failed to extract video frame for sizing, using defaults");
      }
    }
  }

  private async decodeVideoFrame(frameBuffer: Buffer) {
    try {
      return await loadImage(frameBuffer);
    } catch {
      return withTempWorkspace({ prefix: "apexify-canvas-video-" }, async (workspace) => {
        const tempFramePath = await workspace.writeFile("frame.png", frameBuffer);
        return loadImage(tempFramePath);
      });
    }
  }

  private async paintConfiguredCanvasSurface(cv: Canvas, canvas: CanvasConfig, width: number, height: number): Promise<void> {
    const ctx = getCanvasContext(cv);
    const {
      x = 0,
      y = 0,
      rotation = 0,
      borderRadius = 0,
      borderPosition = "all",
      opacity = 1,
      customBg,
      gradientBg,
      videoBg,
      patternBg,
      noiseBg,
      blendMode,
      zoom,
      stroke,
      shadow,
      blur,
    } = canvas;

    const bgSources = [canvas.colorBg ? "colorBg" : null, canvas.gradientBg ? "gradientBg" : null, canvas.customBg ? "customBg" : null].filter(Boolean);
    if (bgSources.length > 1) {
      throw new Error(`createCanvas: only one of colorBg, gradientBg, or customBg can be used. You provided: ${bgSources.join(", ")}`);
    }

    ctx.globalAlpha = opacity;
    ctx.save();
    applyRotation(ctx, rotation, x, y, width, height);
    buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
    ctx.clip();
    applyCanvasZoom(ctx, width, height, zoom);
    ctx.translate(x, y);
    if (typeof blendMode === "string") ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;

    if (videoBg && this.extractVideoFrame) {
      try {
        const frameBuffer = await this.extractVideoFrame(
          videoBg.source,
          videoBg.frame ?? 0,
          videoBg.time,
          videoBg.format || "jpg",
          videoBg.quality || 2
        );
        if (!frameBuffer?.length) throw new Error("Frame extraction returned empty buffer");
        const videoImg = await this.decodeVideoFrame(frameBuffer);
        if (!videoImg || videoImg.width <= 0 || videoImg.height <= 0) {
          throw new Error(`Extracted video frame has invalid dimensions: ${videoImg?.width}x${videoImg?.height}`);
        }
        ctx.globalAlpha = videoBg.opacity ?? 1;
        ctx.drawImage(videoImg, 0, 0, width, height);
        ctx.globalAlpha = opacity;
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        if (errorMsg.includes("FFMPEG NOT FOUND") || errorMsg.includes("FFmpeg")) throw error;
        throw new Error(`createCanvas: videoBg extraction failed: ${errorMsg}`, { cause: error });
      }
    } else if (customBg) {
      const customBgOpacity = customBg.opacity ?? 1;
      if (customBg.filters && customBg.filters.length > 0) {
        const tempCanvas = createCanvas(width, height);
        const tempCtx = tempCanvas.getContext("2d") as SKRSContext2D;
        if (tempCtx) {
          await customBackground(tempCtx, { ...canvas, x: 0, y: 0, opacity: 1, blur });
          await applyContextImageFilters(tempCtx, customBg.filters, width, height);
          ctx.globalAlpha = opacity * customBgOpacity;
          ctx.drawImage(tempCanvas, 0, 0);
          ctx.globalAlpha = opacity;
        }
      } else {
        ctx.globalAlpha = opacity * customBgOpacity;
        await customBackground(ctx, { ...canvas, blur });
        ctx.globalAlpha = opacity;
      }
    } else if (gradientBg) {
      await drawBackgroundGradient(ctx, { ...canvas, blur });
    } else if (canvas.colorBg !== undefined) {
      await drawBackgroundColor(ctx, { ...canvas, blur });
    } else if (canvas.transparentBase !== true) {
      await drawBackgroundColor(ctx, { ...canvas, blur, colorBg: "#000" });
    }

    if (canvas.bgLayers?.length) await drawBackgroundLayers(ctx, { ...canvas, width, height });
    if (patternBg) await EnhancedPatternRenderer.renderPattern(ctx, { width, height }, patternBg);
    if (noiseBg) applyNoise(ctx, width, height, noiseBg.intensity ?? 0.05);
    ctx.restore();

    if (shadow) {
      ctx.save();
      buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
      applyShadow(ctx, shadow, x, y, width, height);
      ctx.restore();
    }
    if (stroke) {
      ctx.save();
      buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
      applyStroke(ctx, stroke, x, y, width, height);
      ctx.restore();
    }
  }

  async composeCanvasForScene(canvas: CanvasConfig): Promise<{ cv: Canvas; width: number; height: number }> {
    this.validateCanvasConfig(canvas);
    await this.resolveCanvasDimensions(canvas);
    const width = canvas.width ?? 500;
    const height = canvas.height ?? 500;
    assertCanvasResourceLimits(width, height);
    const cv = createCanvas(width, height);
    await this.paintConfiguredCanvasSurface(cv, canvas, width, height);
    return { cv, width, height };
  }

  async paintCanvasOntoExisting(targetCv: Canvas, canvas: CanvasConfig): Promise<void> {
    this.validateCanvasConfig(canvas);
    const work: CanvasConfig = { ...canvas };
    await this.resolveCanvasDimensions(work);
    const width = work.width ?? 500;
    const height = work.height ?? 500;
    assertCanvasResourceLimits(width, height);
    if (targetCv.width !== width || targetCv.height !== height) {
      throw new Error(`paintCanvasOntoExisting: target is ${targetCv.width}×${targetCv.height} but config resolves to ${width}×${height}.`);
    }
    await this.paintConfiguredCanvasSurface(targetCv, work, width, height);
  }

  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    try {
      const { cv } = await this.composeCanvasForScene(canvas);
      return { buffer: cv.toBuffer("image/png"), canvas };
    } catch (error) {
      throw new Error(`createCanvas failed: ${getErrorMessage(error)}`, { cause: error });
    }
  }
}
