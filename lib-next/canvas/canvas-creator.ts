import { createCanvas, type SKRSContext2D, type Canvas } from "@napi-rs/canvas";
import { loadImageCached } from "../image/image-properties";
import type { CanvasConfig, CanvasResults } from "../types";
import { getCanvasContext } from "../core/errors";
import {
  drawBackgroundGradient,
  drawBackgroundColor,
  customBackground,
  applyCanvasZoom,
  applyNoise,
  drawBackgroundLayers,
} from "./background-renderer";
import { validateCanvasConfig, validateInheritedCanvasDimensions } from "./canvas-validation";
import { buildPath, applyRotation } from "../render/clip-path";
import { applyShadow } from "../render/shadow-renderer";
import { applyStroke } from "../render/stroke-renderer";
import { EnhancedPatternRenderer } from "./pattern-renderer";
import { applyContextImageFilters } from "../render/context-image-filters";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { emitDiagnostic } from "../runtime/diagnostics";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";

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

  private async resolveCanvasDimensions(canvas: CanvasConfig): Promise<void> {
    if (canvas.customBg?.inherit) {
      try {
        const img = await loadImageCached(canvas.customBg.source);
        validateInheritedCanvasDimensions(img.width, img.height);
        canvas.width = img.width;
        canvas.height = img.height;
      } catch (error) {
        if (error instanceof ApexifyError) throw error;
        throw new ApexifyDecodeError("createCanvas: failed to inspect inherited background dimensions.", { cause: error });
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
        if (frameBuffer?.length) {
          const img = await loadImageCached(frameBuffer);
          if (canvas.width === undefined) canvas.width = img.width;
          if (canvas.height === undefined) canvas.height = img.height;
        }
      } catch (error) {
        if (error instanceof ApexifyError) throw error;
        emitDiagnostic({
          level: "warn",
          code: "CANVAS_VIDEO_SIZE_FALLBACK",
          message: "Video frame sizing failed; canvas defaults will be used.",
        });
      }
    }
  }

  /** Decode/metadata-check image-backed backgrounds before the native output canvas exists. */
  private async preflightCanvasImageSources(canvas: CanvasConfig): Promise<void> {
    const sources: string[] = [];
    if (canvas.customBg?.source) sources.push(canvas.customBg.source);
    for (const layer of canvas.bgLayers ?? []) {
      if ((layer.type === "image" || layer.type === "pattern") && layer.source) sources.push(layer.source);
    }
    await Promise.all([...new Set(sources)].map((source) => loadImageCached(source)));
  }

  private async decodeVideoFrame(frameBuffer: Buffer) {
    return loadImageCached(frameBuffer);
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

    const baseBackgrounds = [
      canvas.colorBg !== undefined ? "colorBg" : undefined,
      gradientBg !== undefined ? "gradientBg" : undefined,
      customBg !== undefined ? "customBg" : undefined,
    ].filter((value): value is string => value !== undefined);
    if (baseBackgrounds.length > 1) {
      throw new ApexifyInputError(`createCanvas: only one of colorBg, gradientBg, or customBg may be used; received ${baseBackgrounds.join(", ")}.`);
    }

    ctx.save();
    try {
      ctx.globalAlpha = opacity;
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
          if (!frameBuffer?.length) throw new ApexifyDecodeError("createCanvas: video frame extraction returned no image data.");
          const videoImg = await this.decodeVideoFrame(frameBuffer);
          ctx.globalAlpha = opacity * (videoBg.opacity ?? 1);
          ctx.drawImage(videoImg, 0, 0, width, height);
          ctx.globalAlpha = opacity;
        } catch (error) {
          if (error instanceof ApexifyError) throw error;
          throw new ApexifyDecodeError("createCanvas: video background extraction failed.", { cause: error });
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
    } finally {
      ctx.restore();
    }

    if (shadow) {
      ctx.save();
      try {
        buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
        applyShadow(ctx, shadow, x, y, width, height);
      } finally {
        ctx.restore();
      }
    }
    if (stroke) {
      ctx.save();
      try {
        buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
        applyStroke(ctx, stroke, x, y, width, height);
      } finally {
        ctx.restore();
      }
    }
  }

  async composeCanvasForScene(canvas: CanvasConfig): Promise<{ cv: Canvas; width: number; height: number }> {
    validateCanvasConfig(canvas);
    await this.resolveCanvasDimensions(canvas);
    const width = canvas.width ?? 500;
    const height = canvas.height ?? 500;
    assertCanvasResourceLimits(width, height);
    await this.preflightCanvasImageSources(canvas);
    const cv = createCanvas(width, height);
    await this.paintConfiguredCanvasSurface(cv, canvas, width, height);
    return { cv, width, height };
  }

  async paintCanvasOntoExisting(targetCv: Canvas, canvas: CanvasConfig): Promise<void> {
    validateCanvasConfig(canvas);
    const work: CanvasConfig = { ...canvas };
    await this.resolveCanvasDimensions(work);
    const width = work.width ?? 500;
    const height = work.height ?? 500;
    assertCanvasResourceLimits(width, height);
    await this.preflightCanvasImageSources(work);
    if (targetCv.width !== width || targetCv.height !== height) {
      throw new ApexifyInputError(`paintCanvasOntoExisting: target is ${targetCv.width}×${targetCv.height} but config resolves to ${width}×${height}.`);
    }
    await this.paintConfiguredCanvasSurface(targetCv, work, width, height);
  }

  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    try {
      const { cv } = await this.composeCanvasForScene(canvas);
      return { buffer: cv.toBuffer("image/png"), canvas };
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("Canvas creation failed.", { cause: error });
    }
  }
}
