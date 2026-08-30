import { createCanvas, loadImage, SKRSContext2D, Canvas } from "@napi-rs/canvas";
import { loadImageCached } from "../image/image-properties";
import type { CanvasConfig, CanvasResults } from "../types";
import { getCanvasContext } from "../core/errors";
import { currentApexifyRuntime } from "../runtime/context";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasWithinLimits } from "../runtime/limits";
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

export type { CanvasResults };

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
    if (!canvas) throw new ApexifyInputError("createCanvas: canvas configuration is required.");
    if (canvas.width !== undefined && (!Number.isFinite(canvas.width) || canvas.width <= 0)) {
      throw new ApexifyInputError("createCanvas: width must be a finite positive number.");
    }
    if (canvas.height !== undefined && (!Number.isFinite(canvas.height) || canvas.height <= 0)) {
      throw new ApexifyInputError("createCanvas: height must be a finite positive number.");
    }
    if (canvas.opacity !== undefined && (!Number.isFinite(canvas.opacity) || canvas.opacity < 0 || canvas.opacity > 1)) {
      throw new ApexifyInputError("createCanvas: opacity must be a number between 0 and 1.");
    }
    if (canvas.zoom?.scale !== undefined && (!Number.isFinite(canvas.zoom.scale) || canvas.zoom.scale <= 0)) {
      throw new ApexifyInputError("createCanvas: zoom.scale must be a finite positive number.");
    }

    if (canvas.bgLayers !== undefined) {
      if (!Array.isArray(canvas.bgLayers)) throw new ApexifyInputError("createCanvas: bgLayers must be an array.");
      const allowed = new Set(["color", "gradient", "image", "pattern", "presetPattern", "noise"]);
      for (let i = 0; i < canvas.bgLayers.length; i += 1) {
        const layer = canvas.bgLayers[i];
        if (!layer || typeof layer !== "object" || !("type" in layer)) {
          throw new ApexifyInputError(`createCanvas: bgLayers[${i}] must be an object with a type field.`);
        }
        if (!allowed.has(layer.type)) {
          throw new ApexifyInputError(`createCanvas: bgLayers[${i}].type is unsupported.`);
        }
        const layerOpacity = "opacity" in layer ? (layer as { opacity?: number }).opacity : undefined;
        if (layerOpacity !== undefined && (!Number.isFinite(layerOpacity) || layerOpacity < 0 || layerOpacity > 1)) {
          throw new ApexifyInputError(`createCanvas: bgLayers[${i}].opacity must be between 0 and 1.`);
        }
        if (layer.type === "color" && typeof (layer as { value?: unknown }).value !== "string") {
          throw new ApexifyInputError(`createCanvas: bgLayers[${i}].value must be a string for color layers.`);
        }
        if (layer.type === "gradient") {
          const gradient = (layer as { value?: { type?: string } }).value;
          if (!gradient || typeof gradient !== "object" || !gradient.type) {
            throw new ApexifyInputError(`createCanvas: bgLayers[${i}].value must be a gradient object with type.`);
          }
        }
        if (layer.type === "image" || layer.type === "pattern") {
          const source = (layer as { source?: unknown }).source;
          if (typeof source !== "string" || !source.trim()) {
            throw new ApexifyInputError(`createCanvas: bgLayers[${i}].source must be a non-empty string.`);
          }
        }
        if (layer.type === "presetPattern") {
          const pattern = (layer as { pattern?: unknown }).pattern;
          if (!pattern || typeof pattern !== "object" || !("type" in pattern) || typeof (pattern as { type?: unknown }).type !== "string") {
            throw new ApexifyInputError(`createCanvas: bgLayers[${i}].pattern must be a PatternOptions object.`);
          }
        }
        if (layer.type === "noise") {
          const intensity = (layer as { intensity?: unknown }).intensity;
          if (intensity !== undefined && (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity < 0 || intensity > 1)) {
            throw new ApexifyInputError(`createCanvas: bgLayers[${i}].intensity must be between 0 and 1.`);
          }
        }
      }
    }
  }

  private async resolveCanvasDimensions(canvas: CanvasConfig): Promise<void> {
    if (canvas.customBg?.inherit) {
      const source = resolveMediaPath(canvas.customBg.source);
      try {
        const image = await loadImageCached(source);
        canvas.width = image.width;
        canvas.height = image.height;
      } catch (error) {
        if (error instanceof ApexifyError) throw error;
        throw new ApexifyError("createCanvas: failed to load inherited background sizing.", {
          cause: error,
          details: { operation: "canvas.inheritBackground" },
        });
      }
    }

    if (canvas.videoBg && this.extractVideoFrame) {
      try {
        const frameBuffer = await this.extractVideoFrame(
          canvas.videoBg.source,
          canvas.videoBg.frame ?? 0,
          canvas.videoBg.time,
          canvas.videoBg.format ?? "jpg",
          canvas.videoBg.quality ?? 2
        );
        if (frameBuffer) {
          const image = await loadImage(frameBuffer);
          if (canvas.width === undefined) canvas.width = image.width;
          if (canvas.height === undefined) canvas.height = image.height;
        }
      } catch (error) {
        currentApexifyRuntime().diagnostics.emit(
          "warn",
          "CANVAS_VIDEO_SIZE_FALLBACK",
          "Video frame sizing failed; canvas defaults will be used.",
          { causeName: error instanceof Error ? error.name : typeof error }
        );
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

  private async paintConfiguredCanvasSurface(
    cv: Canvas,
    canvas: CanvasConfig,
    width: number,
    height: number
  ): Promise<void> {
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
      throw new ApexifyInputError(`createCanvas: only one base background is allowed (${bgSources.join(", ")}).`);
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
          videoBg.format ?? "jpg",
          videoBg.quality ?? 2
        );
        if (!frameBuffer?.length) throw new ApexifyError("Video frame extraction returned an empty buffer.");
        const videoImage = await this.decodeVideoFrame(frameBuffer);
        if (videoImage.width <= 0 || videoImage.height <= 0) {
          throw new ApexifyError("Extracted video frame has invalid dimensions.");
        }
        ctx.globalAlpha = videoBg.opacity ?? 1;
        ctx.drawImage(videoImage, 0, 0, width, height);
        ctx.globalAlpha = opacity;
      } catch (error) {
        if (error instanceof ApexifyError) throw error;
        throw new ApexifyError("createCanvas: video background extraction failed.", { cause: error });
      }
    } else if (customBg) {
      const customBgOpacity = customBg.opacity ?? 1;
      if (customBg.filters?.length) {
        const tempCanvas = createCanvas(width, height);
        const tempCtx = tempCanvas.getContext("2d") as SKRSContext2D;
        await customBackground(tempCtx, { ...canvas, x: 0, y: 0, opacity: 1, blur });
        await applyContextImageFilters(tempCtx, customBg.filters, width, height);
        ctx.globalAlpha = opacity * customBgOpacity;
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.globalAlpha = opacity;
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
    assertCanvasWithinLimits(width, height, currentApexifyRuntime().config.limits, "createCanvas");
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
    assertCanvasWithinLimits(width, height, currentApexifyRuntime().config.limits, "paintCanvasOntoExisting");
    if (targetCv.width !== width || targetCv.height !== height) {
      throw new ApexifyInputError(`paintCanvasOntoExisting: target is ${targetCv.width}x${targetCv.height} but config resolves to ${width}x${height}.`);
    }
    await this.paintConfiguredCanvasSurface(targetCv, work, width, height);
  }

  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    try {
      const { cv } = await this.composeCanvasForScene(canvas);
      return { buffer: cv.toBuffer("image/png"), canvas };
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyError("createCanvas failed.", { cause: error, details: { operation: "createCanvas" } });
    }
  }
}
