import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";
import type { CanvasConfig } from "../utils/canvasUtils";
import { getErrorMessage, getCanvasContext } from "../utils/foundation/errorUtils";
import {
  drawBackgroundGradient,
  drawBackgroundColor,
  customBackground,
  applyCanvasZoom,
  applyRotation,
  applyShadow,
  applyStroke,
  buildPath,
  applyNoise,
  drawBackgroundLayers,
  resolveMediaPath,
} from "../utils/canvasUtils";
import { EnhancedPatternRenderer } from "../utils/pattern/enhancedPatternRenderer";
import { applyProfessionalImageFilters } from "../utils/image/professionalImageFilters";

export interface CanvasResults {
  buffer: Buffer;
  canvas: CanvasConfig;
}

/**
 * Extended class for canvas creation functionality
 */
export class CanvasCreator {
  /**
   * Extracts a video frame (helper method - will be passed from ApexPainter)
   */
  private extractVideoFrame?: (
    videoSource: string | Buffer,
    frameNumber?: number,
    timeSeconds?: number,
    outputFormat?: 'jpg' | 'png',
    quality?: number
  ) => Promise<Buffer | null>;

  /**
   * Sets the extractVideoFrame method (dependency injection)
   */
  setExtractVideoFrame(
    method: (
      videoSource: string | Buffer,
      frameNumber?: number,
      timeSeconds?: number,
      outputFormat?: 'jpg' | 'png',
      quality?: number
    ) => Promise<Buffer | null>
  ): void {
    this.extractVideoFrame = method;
  }

  /**
   * Validates canvas configuration.
   * @private
   * @param canvas - Canvas configuration to validate
   */
  private validateCanvasConfig(canvas: CanvasConfig): void {
    if (!canvas) {
      throw new Error("createCanvas: canvas configuration is required.");
    }

    if (canvas.width !== undefined && (typeof canvas.width !== 'number' || canvas.width <= 0)) {
      throw new Error("createCanvas: width must be a positive number.");
    }

    if (canvas.height !== undefined && (typeof canvas.height !== 'number' || canvas.height <= 0)) {
      throw new Error("createCanvas: height must be a positive number.");
    }

    if (canvas.opacity !== undefined && (typeof canvas.opacity !== 'number' || canvas.opacity < 0 || canvas.opacity > 1)) {
      throw new Error("createCanvas: opacity must be a number between 0 and 1.");
    }

    if (canvas.zoom?.scale !== undefined && (typeof canvas.zoom.scale !== 'number' || canvas.zoom.scale <= 0)) {
      throw new Error("createCanvas: zoom.scale must be a positive number.");
    }

    if (canvas.bgLayers !== undefined) {
      if (!Array.isArray(canvas.bgLayers)) {
        throw new Error("createCanvas: bgLayers must be an array.");
      }
      const allowed = new Set(["color", "gradient", "image", "pattern", "presetPattern", "noise"]);
      for (let i = 0; i < canvas.bgLayers.length; i++) {
        const layer = canvas.bgLayers[i];
        if (!layer || typeof layer !== "object" || !("type" in layer)) {
          throw new Error(`createCanvas: bgLayers[${i}] must be an object with a type field.`);
        }
        if (!allowed.has(layer.type)) {
          throw new Error(
            `createCanvas: bgLayers[${i}].type must be one of color, gradient, image, pattern, presetPattern, noise (got "${String((layer as { type: string }).type)}").`
          );
        }
        const layerOpacity =
          "opacity" in layer ? (layer as { opacity?: number }).opacity : undefined;
        if (
          layerOpacity !== undefined &&
          (typeof layerOpacity !== "number" || layerOpacity < 0 || layerOpacity > 1)
        ) {
          throw new Error(`createCanvas: bgLayers[${i}].opacity must be between 0 and 1.`);
        }
        if (layer.type === "color" && typeof (layer as { value?: unknown }).value !== "string") {
          throw new Error(`createCanvas: bgLayers[${i}].value must be a string for color layers.`);
        }
        if (layer.type === "gradient") {
          const g = (layer as { value?: { type?: string } }).value;
          if (!g || typeof g !== "object" || !g.type) {
            throw new Error(`createCanvas: bgLayers[${i}].value must be a gradient object with type.`);
          }
        }
        if (layer.type === "image" || layer.type === "pattern") {
          const src = (layer as { source?: unknown }).source;
          if (typeof src !== "string" || !src.trim()) {
            throw new Error(`createCanvas: bgLayers[${i}].source must be a non-empty string.`);
          }
        }
        if (layer.type === "presetPattern") {
          const pat = (layer as { pattern?: unknown }).pattern;
          if (
            !pat ||
            typeof pat !== "object" ||
            !("type" in (pat as object)) ||
            typeof (pat as { type?: unknown }).type !== "string"
          ) {
            throw new Error(
              `createCanvas: bgLayers[${i}].pattern must be a procedural PatternOptions object with string type.`
            );
          }
        }
        if (layer.type === "noise") {
          const inten = (layer as { intensity?: unknown }).intensity;
          if (inten !== undefined && (typeof inten !== "number" || inten < 0 || inten > 1)) {
            throw new Error(`createCanvas: bgLayers[${i}].intensity must be between 0 and 1.`);
          }
        }
      }
    }
  }

  /**
   * Creates a canvas with the given configuration.
   * Applies rotation, shadow, border effects, background, and stroke.
   *
   * @param canvas - Canvas configuration object
   * @returns Promise<CanvasResults> - Object containing canvas buffer and configuration
   */
  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    try {

      this.validateCanvasConfig(canvas);

      if (canvas.customBg?.inherit) {
        const p = resolveMediaPath(canvas.customBg.source);
        try {
          const img = await loadImage(p);
          canvas.width = img.width;
          canvas.height = img.height;
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          throw new Error(`createCanvas: Failed to load image for inherit sizing: ${errorMessage}`);
        }
      }

      if (canvas.videoBg && this.extractVideoFrame) {
        try {
          const frameBuffer = await this.extractVideoFrame(
            canvas.videoBg.source,
            canvas.videoBg.frame ?? 0,
            canvas.videoBg.time,
            canvas.videoBg.format || 'jpg',
            canvas.videoBg.quality || 2
          );
          if (frameBuffer) {
            const img = await loadImage(frameBuffer);
            if (!canvas.width) canvas.width = img.width;
            if (!canvas.height) canvas.height = img.height;
          }
        } catch (e: unknown) {
          console.warn('createCanvas: Failed to extract video frame for sizing, using defaults');
        }
      }

      const width = canvas.width ?? 500;
      const height = canvas.height ?? 500;

      const {
        x = 0, y = 0,
        rotation = 0,
        borderRadius = 0,
        borderPosition = 'all',
        opacity = 1,
        customBg, gradientBg, videoBg,
        patternBg, noiseBg, blendMode,
        zoom, stroke, shadow,
        blur
      } = canvas;

      const bgSources = [
        canvas.colorBg ? 'colorBg' : null,
        canvas.gradientBg ? 'gradientBg' : null,
        canvas.customBg ? 'customBg' : null
      ].filter(Boolean);

      if (bgSources.length > 1) {
        throw new Error(`createCanvas: only one of colorBg, gradientBg, or customBg can be used. You provided: ${bgSources.join(', ')}`);
      }

      const cv = createCanvas(width, height);
      const ctx = getCanvasContext(cv);

      ctx.globalAlpha = opacity;

      ctx.save();
      applyRotation(ctx, rotation, x, y, width, height);

      buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
      ctx.clip();

      applyCanvasZoom(ctx, width, height, zoom);

      ctx.translate(x, y);
      if (typeof blendMode === 'string') {
        ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
      }

      if (videoBg && this.extractVideoFrame) {
        try {

          const frameBuffer = await this.extractVideoFrame(
            videoBg.source,
            videoBg.frame ?? 0,
            videoBg.time,
            videoBg.format || 'jpg',
            videoBg.quality || 2
          );
          if (frameBuffer && frameBuffer.length > 0) {
            let videoImg;
            try {
              videoImg = await loadImage(frameBuffer);
            } catch (bufferError) {

              const tempFramePath = path.join(process.cwd(), '.temp-frames', `video-bg-temp-${Date.now()}.png`);
              const frameDir = path.dirname(tempFramePath);
              if (!fs.existsSync(frameDir)) {
                fs.mkdirSync(frameDir, { recursive: true });
              }
              fs.writeFileSync(tempFramePath, frameBuffer);
              videoImg = await loadImage(tempFramePath);

              if (fs.existsSync(tempFramePath)) {
                fs.unlinkSync(tempFramePath);
              }
            }

            if (videoImg && videoImg.width > 0 && videoImg.height > 0) {
              ctx.globalAlpha = videoBg.opacity ?? 1;
              ctx.drawImage(videoImg, 0, 0, width, height);
              ctx.globalAlpha = opacity;
            } else {
              throw new Error(`Extracted video frame has invalid dimensions: ${videoImg?.width}x${videoImg?.height}`);
            }
          } else {
            throw new Error('Frame extraction returned empty buffer');
          }
        } catch (e: unknown) {
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          if (errorMsg.includes('FFMPEG NOT FOUND') || errorMsg.includes('FFmpeg')) {
            throw e;
          }
          throw new Error(`createCanvas: videoBg extraction failed: ${errorMsg}`);
        }
      } else if (customBg) {

        await customBackground(ctx, { ...canvas, blur });

        if (customBg.filters && customBg.filters.length > 0) {
          const tempCanvas = createCanvas(width, height);
          const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
          if (tempCtx) {
            tempCtx.drawImage(cv, 0, 0);
            await applyProfessionalImageFilters(tempCtx, customBg.filters, width, height);
            ctx.clearRect(0, 0, width, height);
            ctx.globalAlpha = customBg.opacity ?? 1;
            ctx.drawImage(tempCanvas, 0, 0);
            ctx.globalAlpha = opacity;
          }
        } else if (customBg.opacity !== undefined && customBg.opacity !== 1) {
          ctx.globalAlpha = customBg.opacity;
          await customBackground(ctx, { ...canvas, blur });
          ctx.globalAlpha = opacity;
        } else {
          await customBackground(ctx, { ...canvas, blur });
        }
      } else if (gradientBg) {
        await drawBackgroundGradient(ctx, { ...canvas, blur });
      } else if (canvas.colorBg !== undefined) {
        await drawBackgroundColor(ctx, { ...canvas, blur });
      } else if (canvas.transparentBase === true) {
        /* Transparent backing — compose via bgLayers / patternBg / noiseBg only */
      } else {
        await drawBackgroundColor(ctx, { ...canvas, blur, colorBg: "#000" });
      }

      if (canvas.bgLayers && canvas.bgLayers.length > 0) {
        await drawBackgroundLayers(ctx, { ...canvas, width, height });
      }

      if (patternBg)
        await EnhancedPatternRenderer.renderPattern(ctx, { width, height }, patternBg);
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

      return { buffer: cv.toBuffer('image/png'), canvas };
    } catch (error) {
      throw new Error(`createCanvas failed: ${getErrorMessage(error)}`);
    }
  }
}

