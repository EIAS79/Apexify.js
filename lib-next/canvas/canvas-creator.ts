import { createCanvas, type SKRSContext2D, type Canvas } from "@napi-rs/canvas";
import { loadImageCached } from "../image/image-properties";
import type { CanvasConfig, CanvasImageBackgroundOptions, CanvasResults } from "../types";
import { getCanvasContext } from "../core/errors";
import {
  drawBackgroundGradient,
  drawBackgroundColor,
  drawImageBackground,
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

  private async resolveVideoBackgroundFrame(canvas: CanvasConfig): Promise<Buffer | undefined> {
    const video = canvas.videoBg;
    if (!video) return undefined;
    if (!this.extractVideoFrame) {
      throw new ApexifyInputError(
        "createCanvas: videoBg requires an ApexPainter video frame extractor."
      );
    }

    try {
      const frameBuffer = await this.extractVideoFrame(
        video.source,
        video.frame,
        video.time,
        video.format ?? "jpg",
        video.quality ?? 2
      );
      if (!frameBuffer?.length) {
        throw new ApexifyDecodeError(
          "createCanvas: video frame extraction returned no image data."
        );
      }
      return frameBuffer;
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError(
        "createCanvas: video background extraction failed.",
        { cause: error }
      );
    }
  }

  private async resolveCanvasDimensions(
    canvas: CanvasConfig,
    videoFrame?: Buffer
  ): Promise<void> {
    const inheritedSource =
      canvas.customBg?.inherit
        ? canvas.customBg.source
        : canvas.videoBg?.inherit
          ? videoFrame
          : undefined;
    if (inheritedSource === undefined) return;

    try {
      const img = await loadImageCached(inheritedSource);
      validateInheritedCanvasDimensions(img.width, img.height);
      canvas.width = img.width;
      canvas.height = img.height;
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError(
        "createCanvas: failed to inspect inherited background dimensions.",
        { cause: error }
      );
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

  private async paintImageBackground(
    ctx: SKRSContext2D,
    source: string | Buffer,
    options: CanvasImageBackgroundOptions,
    width: number,
    height: number,
    canvasOpacity: number,
    blur: number
  ): Promise<void> {
    const imageOpacity = options.opacity ?? 1;
    if (options.filters?.length) {
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext("2d") as SKRSContext2D;
      await drawImageBackground(tempCtx, source, options, width, height, blur);
      await applyContextImageFilters(tempCtx, options.filters, width, height);
      ctx.globalAlpha = canvasOpacity * imageOpacity;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.globalAlpha = canvasOpacity;
      return;
    }

    ctx.globalAlpha = canvasOpacity * imageOpacity;
    await drawImageBackground(ctx, source, options, width, height, blur);
    ctx.globalAlpha = canvasOpacity;
  }

  private async paintConfiguredCanvasSurface(
    cv: Canvas,
    canvas: CanvasConfig,
    width: number,
    height: number,
    videoFrame?: Buffer
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

    const baseBackgrounds = [
      canvas.colorBg !== undefined ? "colorBg" : undefined,
      gradientBg !== undefined ? "gradientBg" : undefined,
      customBg !== undefined ? "customBg" : undefined,
      videoBg !== undefined ? "videoBg" : undefined,
    ].filter((value): value is string => value !== undefined);
    if (baseBackgrounds.length > 1) {
      throw new ApexifyInputError(
        `createCanvas: only one primary background may be used; received ${baseBackgrounds.join(", ")}.`
      );
    }

    // The overwhelmingly common canvas path is a full-surface opaque solid background.
    // It does not require a saved state, path construction, clip, transform, translation,
    // zoom, or the generic background dispatcher. Keeping this branch semantically narrow
    // makes it lossless while removing hot-path native context work.
    const simpleSolid =
      canvas.colorBg !== undefined &&
      x === 0 && y === 0 && rotation === 0 && borderRadius === 0 && borderPosition === "all" && opacity === 1 &&
      !customBg && !gradientBg && !videoBg && !patternBg && !noiseBg && !blendMode && !zoom && !stroke && !shadow &&
      !blur && !(canvas.bgLayers?.length);
    if (simpleSolid) {
      ctx.fillStyle = canvas.colorBg!;
      ctx.fillRect(0, 0, width, height);
      return;
    }

    // Paint the canvas shadow first and outside the background clip. This is
    // true painter order: lower content -> shadow -> background. Offsets remain
    // free to extend beyond the background path in either direction.
    if (shadow) {
      ctx.save();
      try {
        applyRotation(ctx, rotation, x, y, width, height);
        applyShadow(ctx, shadow, x, y, width, height, borderRadius, borderPosition);
      } finally {
        ctx.restore();
      }
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

      if (videoBg) {
        if (!videoFrame?.length) {
          throw new ApexifyDecodeError(
            "createCanvas: resolved video background frame is unavailable."
          );
        }
        await this.paintImageBackground(
          ctx,
          videoFrame,
          videoBg,
          width,
          height,
          opacity,
          blur ?? 0
        );
      } else if (customBg) {
        await this.paintImageBackground(
          ctx,
          customBg.source,
          customBg,
          width,
          height,
          opacity,
          blur ?? 0
        );
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
    const videoFrame = await this.resolveVideoBackgroundFrame(canvas);
    await this.resolveCanvasDimensions(canvas, videoFrame);
    const width = canvas.width ?? 500;
    const height = canvas.height ?? 500;
    assertCanvasResourceLimits(width, height);
    await this.preflightCanvasImageSources(canvas);
    const cv = createCanvas(width, height);
    await this.paintConfiguredCanvasSurface(cv, canvas, width, height, videoFrame);
    return { cv, width, height };
  }

  async paintCanvasOntoExisting(targetCv: Canvas, canvas: CanvasConfig): Promise<void> {
    validateCanvasConfig(canvas);
    const work: CanvasConfig = { ...canvas };
    const videoFrame = await this.resolveVideoBackgroundFrame(work);
    await this.resolveCanvasDimensions(work, videoFrame);
    const width = work.width ?? 500;
    const height = work.height ?? 500;
    assertCanvasResourceLimits(width, height);
    await this.preflightCanvasImageSources(work);
    if (targetCv.width !== width || targetCv.height !== height) {
      throw new ApexifyInputError(`paintCanvasOntoExisting: target is ${targetCv.width}×${targetCv.height} but config resolves to ${width}×${height}.`);
    }
    await this.paintConfiguredCanvasSurface(targetCv, work, width, height, videoFrame);
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
