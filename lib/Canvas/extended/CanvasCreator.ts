import { createCanvas, loadImage, SKRSContext2D } from "@napi-rs/canvas";
import path from "path";
import fs from "fs";
import type { CanvasConfig } from "../utils/utils";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
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
} from "../utils/utils";
import { EnhancedPatternRenderer } from "../utils/Patterns/enhancedPatternRenderer";
import { applyProfessionalImageFilters } from "../utils/Image/professionalImageFilters";

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
        let p = canvas.customBg.source;
        if (!/^https?:\/\//.test(p)) {
          p = path.join(process.cwd(), p);
        }
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
        colorBg, customBg, gradientBg, videoBg,
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
'png',
            2
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
      } else {

        await drawBackgroundColor(ctx, { ...canvas, blur, colorBg: colorBg ?? '#000' });
      }

      if (patternBg) await EnhancedPatternRenderer.renderPattern(ctx, cv, patternBg);
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

