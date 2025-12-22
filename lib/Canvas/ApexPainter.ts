import { createCanvas, loadImage, Image, SKRSContext2D  } from "@napi-rs/canvas";
import GIFEncoder from "gifencoder";
import { PassThrough} from "stream";
import { exec, execSync } from "child_process";
import { promisify } from "util";
import axios from 'axios';
import fs, { PathLike } from "fs";
import path from "path";

const execAsync = promisify(exec);
import { OutputFormat, CanvasConfig, TextProperties, ImageProperties, GIFOptions, GIFResults, CustomOptions, cropOptions,
    drawBackgroundGradient, drawBackgroundColor, customBackground, customLines,
    converter, resizingImg, applyColorFilters, imgEffects,verticalBarChart, pieChart,
    lineChart, cropInner, cropOuter, bgRemoval, detectColors, removeColor, dataURL, 
    base64, arrayBuffer, blob, url, GradientConfig, Frame,
    ExtractFramesOptions, buildPath, ResizeOptions, MaskOptions, BlendOptions,
    applyCanvasZoom, applyNoise,
    applyStroke, applyRotation, applyShadow, drawBoxBackground, fitInto, loadImageCached,
    drawShape, isShapeSource, ShapeType, createShapePath, createGradientFill, applySimpleProfessionalFilters,
    ImageFilter, barChart_1, PieChartData, LineChartConfig,
    // New features
    applyImageMask, applyClipPath, applyPerspectiveDistortion, applyBulgeDistortion, applyMeshWarp,
    applyVignette, applyLensFlare, applyChromaticAberration, applyFilmGrain,
    renderTextOnPath,
    batchOperations, chainOperations,
    stitchImages as stitchImagesUtil, createCollage,
    compressImage, extractPalette as extractPaletteUtil,
    BatchOperation, ChainOperation, StitchOptions, CollageLayout, CompressionOptions, PaletteOptions,
    SaveOptions, SaveResult
    } from "./utils/utils";
import { EnhancedTextRenderer } from "./utils/Texts/enhancedTextRenderer";
import { EnhancedPatternRenderer } from "./utils/Patterns/enhancedPatternRenderer";

  interface CanvasResults {
    buffer: Buffer;
    canvas: CanvasConfig;
  }


export class ApexPainter {
  private format?: OutputFormat;
  private saveCounter: number = 1;

  constructor({ type }: OutputFormat = { type: 'buffer' }) {
    this.format = { type: type || 'buffer' };
  }

  /**
   * Validates image properties for required fields.
   * @private
   * @param ip - Image properties to validate
   */
  #validateImageProperties(ip: ImageProperties): void {
    if (!ip.source || ip.x == null || ip.y == null) {
      throw new Error("createImage: source, x, and y are required.");
    }
  }

  /**
   * Validates text properties for required fields.
   * @private
   * @param textProps - Text properties to validate
   */
  #validateTextProperties(textProps: TextProperties): void {
    if (!textProps.text || textProps.x == null || textProps.y == null) {
      throw new Error("createText: text, x, and y are required.");
    }
  }

  /**
   * Renders enhanced text using the new text renderer.
   * @private
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  async #renderEnhancedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    // Check if text should be rendered on a path
    if (textProps.path && textProps.textOnPath) {
      renderTextOnPath(ctx, textProps.text, textProps.path, textProps.path.offset ?? 0);
    } else {
      await EnhancedTextRenderer.renderText(ctx, textProps);
    }
  }

  /**
   * Creates a canvas with the given configuration.
   * Applies rotation, shadow, border effects, background, and stroke.
   * 
   * @param canvas - Canvas configuration object containing:
   *   - width: Canvas width in pixels
   *   - height: Canvas height in pixels
   *   - x: X position offset (default: 0)
   *   - y: Y position offset (default: 0)
   *   - colorBg: Solid color background (hex, rgb, rgba, hsl, etc.)
   *   - gradientBg: Gradient background configuration
   *   - customBg: Custom background image buffer
   *   - zoom: Canvas zoom level (default: 1)
   *   - pattern: Pattern background configuration
   *   - noise: Noise effect configuration
   * 
   * @returns Promise<CanvasResults> - Object containing canvas buffer and configuration
   * 
   * @throws Error if canvas configuration is invalid or conflicting
   * 
   * @example
   * ```typescript
   * const result = await painter.createCanvas({
   *   width: 800,
   *   height: 600,
   *   colorBg: '#ffffff',
   *   zoom: 1.5
   * });
   * const buffer = result.buffer;
   * ```
   */
  /**
   * Validates canvas configuration.
   * @private
   * @param canvas - Canvas configuration to validate
   */
  #validateCanvasConfig(canvas: CanvasConfig): void {
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

  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    try {
      // Validate canvas configuration
      this.#validateCanvasConfig(canvas);
      
      // Handle inherit sizing
      if (canvas.customBg?.inherit) {
        let p = canvas.customBg.source;
        if (!/^https?:\/\//i.test(p)) p = path.join(process.cwd(), p);
        try {
          const img = await loadImage(p);
          canvas.width = img.width;
          canvas.height = img.height;
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          throw new Error(`createCanvas: Failed to load image for inherit sizing: ${errorMessage}`);
        }
      }

      // Handle video background inherit sizing
      if (canvas.videoBg) {
        try {
          const frameBuffer = await this.#extractVideoFrame(
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

  // 2) Use final width/height after inherit
  const width  = canvas.width  ?? 500;
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

  // Validate background configuration
  const bgSources = [
    canvas.colorBg ? 'colorBg' : null,
    canvas.gradientBg ? 'gradientBg' : null,
    canvas.customBg ? 'customBg' : null
  ].filter(Boolean);

  if (bgSources.length > 1) {
    throw new Error(`createCanvas: only one of colorBg, gradientBg, or customBg can be used. You provided: ${bgSources.join(', ')}`);
  }

      const cv = createCanvas(width, height);
      const ctx = cv.getContext('2d') as SKRSContext2D;
      if (!ctx) throw new Error('Unable to get 2D context');


      ctx.globalAlpha = opacity;

      // ---- BACKGROUND (clipped) ----
      ctx.save();
      applyRotation(ctx, rotation, x, y, width, height);

      buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
      ctx.clip();

      applyCanvasZoom(ctx, width, height, zoom);

      ctx.translate(x, y);
      if (typeof blendMode === 'string') {
        ctx.globalCompositeOperation = blendMode as GlobalCompositeOperation;
      }

      // Draw background - videoBg takes priority, then customBg, then gradientBg, then colorBg
      if (videoBg) {
        try {
          // For videoBg, always use PNG format to ensure compatibility with loadImage
          // The rgb24 pixel format for JPEG can cause issues with loadImage
          const frameBuffer = await this.#extractVideoFrame(
            videoBg.source, 
            videoBg.frame ?? 0,
            videoBg.time,
            'png', // Force PNG format for videoBg to ensure proper color rendering
            2
          );
          if (frameBuffer && frameBuffer.length > 0) {
            // Try loading from buffer first, if that fails, save to temp file and load from file
            // This is a workaround for potential buffer compatibility issues with loadImage
            let videoImg: Image;
            try {
              videoImg = await loadImage(frameBuffer);
            } catch (bufferError) {
              // If loading from buffer fails, try saving to temp file and loading from file
              const tempFramePath = path.join(process.cwd(), '.temp-frames', `video-bg-temp-${Date.now()}.png`);
              const frameDir = path.dirname(tempFramePath);
              if (!fs.existsSync(frameDir)) {
                fs.mkdirSync(frameDir, { recursive: true });
              }
              fs.writeFileSync(tempFramePath, frameBuffer);
              videoImg = await loadImage(tempFramePath);
              // Cleanup temp file after loading
              if (fs.existsSync(tempFramePath)) {
                fs.unlinkSync(tempFramePath);
              }
            }
            
            if (videoImg && videoImg.width > 0 && videoImg.height > 0) {
              ctx.globalAlpha = videoBg.opacity ?? 1;
              // Draw the video frame to fill the entire canvas
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
          // Re-throw FFmpeg installation errors so user sees installation guide
          if (errorMsg.includes('FFMPEG NOT FOUND') || errorMsg.includes('FFmpeg')) {
            throw e;
          }
          // Re-throw other errors instead of silently failing with black background
          throw new Error(`createCanvas: videoBg extraction failed: ${errorMsg}`);
        }
      } else if (customBg) {
        // Draw custom background with filters and opacity support
        await customBackground(ctx, { ...canvas, blur });
        // Apply filters to background if specified
        if (customBg.filters && customBg.filters.length > 0) {
          const tempCanvas = createCanvas(width, height);
          const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
          if (tempCtx) {
            tempCtx.drawImage(cv, 0, 0);
            await applySimpleProfessionalFilters(tempCtx, customBg.filters, width, height);
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
        // Default to black background if no background is specified
        await drawBackgroundColor(ctx, { ...canvas, blur, colorBg: colorBg ?? '#000' });
      }

      if (patternBg) await EnhancedPatternRenderer.renderPattern(ctx, cv, patternBg);
      if (noiseBg)   applyNoise(ctx, width, height, noiseBg.intensity ?? 0.05);

      ctx.restore();

      // Apply shadow effect
      if (shadow) {
        ctx.save();
        buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
        applyShadow(ctx, shadow, x, y, width, height);
        ctx.restore();
      }

      // Apply stroke effect
      if (stroke) {
        ctx.save();
        buildPath(ctx, x, y, width, height, borderRadius, borderPosition);
        applyStroke(ctx, stroke, x, y, width, height);
        ctx.restore();
      }

      return { buffer: cv.toBuffer('image/png'), canvas };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createCanvas failed: ${errorMessage}`);
    }
  }



  /**
   * Draws one or more images (or shapes) on an existing canvas buffer.
   * 
   * @param images - Single ImageProperties object or array of ImageProperties containing:
   *   - source: Image path/URL/Buffer or ShapeType ('rectangle', 'circle', etc.)
   *   - x: X position on canvas
   *   - y: Y position on canvas
   *   - width: Image/shape width (optional, defaults to original size)
   *   - height: Image/shape height (optional, defaults to original size)
   *   - inherit: Use original image dimensions (boolean)
   *   - fit: Image fitting mode ('fill', 'contain', 'cover', 'scale-down', 'none')
   *   - align: Image alignment ('center', 'start', 'end')
   *   - rotation: Rotation angle in degrees (default: 0)
   *   - opacity: Opacity level 0-1 (default: 1)
   *   - blur: Blur radius in pixels (default: 0)
   *   - borderRadius: Border radius or 'circular' (default: 0)
   *   - borderPosition: Border position ('all', 'top', 'bottom', 'left', 'right')
   *   - filters: Array of image filters to apply
   *   - shape: Shape properties (when source is a shape)
   *   - shadow: Shadow configuration
   *   - stroke: Stroke configuration
   *   - boxBackground: Background behind image/shape
   * 
   * @param canvasBuffer - Existing canvas buffer (Buffer) or CanvasResults object
   * 
   * @returns Promise<Buffer> - Updated canvas buffer in PNG format
   * 
   * @throws Error if source, x, or y are missing
   * 
   * @example
   * ```typescript
   * const result = await painter.createImage([
   *   {
   *     source: 'rectangle',
   *     x: 100, y: 100,
   *     width: 200, height: 150,
   *     shape: { fill: true, color: '#ff6b6b' },
   *     shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 5, offsetY: 5, blur: 10 }
   *   }
   * ], canvasBuffer);
   * ```
   */
  /**
   * Validates image/shape properties array.
   * @private
   * @param images - Image properties to validate
   */
  #validateImageArray(images: ImageProperties | ImageProperties[]): void {
    const list = Array.isArray(images) ? images : [images];
    if (list.length === 0) {
      throw new Error("createImage: At least one image/shape is required.");
    }
    for (const ip of list) {
      this.#validateImageProperties(ip);
    }
  }

  async createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer
  ): Promise<Buffer> {
    try {
      // Validate inputs
      if (!canvasBuffer) {
        throw new Error("createImage: canvasBuffer is required.");
      }
      this.#validateImageArray(images);
      
      const list = Array.isArray(images) ? images : [images];

      // Load base canvas buffer
      const base: Image = Buffer.isBuffer(canvasBuffer)
        ? await loadImage(canvasBuffer)
        : await loadImage((canvasBuffer as CanvasResults).buffer);

      const cv = createCanvas(base.width, base.height);
      const ctx = cv.getContext("2d") as SKRSContext2D;
      if (!ctx) throw new Error("Unable to get 2D rendering context");

      // Paint bg
      ctx.drawImage(base, 0, 0);

      // Draw each image/shape on canvas
      for (const ip of list) {
        await this.#drawImageBitmap(ctx, ip);
      }

      // Return updated buffer
      return cv.toBuffer("image/png");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createImage failed: ${errorMessage}`);
    }
  }

  /**
   * Draws a single bitmap or shape with independent shadow & stroke.
   * @private
   * @param ctx - Canvas 2D context
   * @param ip - Image properties
   */
  async #drawImageBitmap(ctx: SKRSContext2D, ip: ImageProperties): Promise<void> {
    const {
      source, x, y,
      width, height,
      inherit,
      fit = "fill",
      align = "center",
      rotation = 0,
      opacity = 1,
      blur = 0,
      borderRadius = 0,
      borderPosition = "all",
      shadow,
      stroke,
      boxBackground,
      shape,
      filters,
      filterIntensity = 1,
      filterOrder = 'post',
      mask,
      clipPath,
      distortion,
      meshWarp,
      effects
    } = ip;

    this.#validateImageProperties(ip);

    // Check if source is a shape
    if (isShapeSource(source)) {
      await this.#drawShape(ctx, source, x, y, width ?? 100, height ?? 100, {
        ...shape,
        rotation,
        opacity,
        blur,
        borderRadius,
        borderPosition,
        shadow,
        stroke,
        boxBackground,
        filters
      });
      return;
    }

    // Handle image sources
    const img = await loadImageCached(source);

    // Resolve this image's destination box
    const boxW = (inherit && !width)  ? img.width  : (width  ?? img.width);
    const boxH = (inherit && !height) ? img.height : (height ?? img.height);
    const box = { x, y, w: boxW, h: boxH };

    ctx.save();

    // Rotate around the box center; affects shadow, background, bitmap, stroke uniformly
    applyRotation(ctx, rotation, box.x, box.y, box.w, box.h);

    // 1) Shadow (independent) — supports gradient or color
    applyShadow(ctx, box, shadow);

    // 2) Optional box background (under bitmap, inside clip) — color or gradient
    drawBoxBackground(ctx, box, boxBackground, borderRadius, borderPosition);

    // 3) Clip to image border radius or custom clip path, then draw the bitmap with blur/opacity and fit/align
    ctx.save();
    if (clipPath && clipPath.length >= 3) {
      applyClipPath(ctx, clipPath);
    } else {
      buildPath(ctx, box.x, box.y, box.w, box.h, borderRadius, borderPosition);
      ctx.clip();
    }

    const { dx, dy, dw, dh, sx, sy, sw, sh } =
      fitInto(box.x, box.y, box.w, box.h, img.width, img.height, fit, align);

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = opacity ?? 1;
    if ((blur ?? 0) > 0) ctx.filter = `blur(${blur}px)`;

    // Apply professional image filters BEFORE drawing if filterOrder is 'pre'
    if (filters && filters.length > 0 && filterOrder === 'pre') {
      const adjustedFilters = filters.map(f => ({
        ...f,
        intensity: f.intensity !== undefined ? f.intensity * filterIntensity : (f.intensity ?? 1) * filterIntensity,
        value: f.value !== undefined ? f.value * filterIntensity : f.value,
        radius: f.radius !== undefined ? f.radius * filterIntensity : f.radius
      }));
      await applySimpleProfessionalFilters(ctx, adjustedFilters, dw, dh);
    }

    // Apply distortion if specified (before drawing)
    if (distortion) {
      if (distortion.type === 'perspective' && distortion.points && distortion.points.length === 4) {
        applyPerspectiveDistortion(ctx, img, distortion.points, dx, dy, dw, dh);
        ctx.filter = "none";
        ctx.globalAlpha = prevAlpha;
        ctx.restore();
        ctx.restore();
        return;
      } else if (distortion.type === 'bulge' || distortion.type === 'pinch') {
        const centerX = dx + dw / 2;
        const centerY = dy + dh / 2;
        const radius = Math.min(dw, dh) / 2;
        const intensity = (distortion.intensity ?? 0.5) * (distortion.type === 'pinch' ? -1 : 1);
        applyBulgeDistortion(ctx, img, centerX, centerY, radius, intensity, dx, dy, dw, dh);
        ctx.filter = "none";
        ctx.globalAlpha = prevAlpha;
        ctx.restore();
        ctx.restore();
        return;
      }
    }

    // Apply mesh warp if specified
    if (meshWarp && meshWarp.controlPoints) {
      applyMeshWarp(ctx, img, meshWarp.gridX ?? 10, meshWarp.gridY ?? 10, meshWarp.controlPoints, dx, dy, dw, dh);
      ctx.filter = "none";
      ctx.globalAlpha = prevAlpha;
      ctx.restore();
      ctx.restore();
      return;
    }

    // Draw image with or without masking
    if (mask) {
      await applyImageMask(ctx, img, mask.source, mask.mode ?? 'alpha', dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    ctx.filter = "none";
    ctx.globalAlpha = prevAlpha;
    ctx.restore();

    // Apply professional image filters AFTER drawing if filterOrder is 'post'
    if (filters && filters.length > 0 && filterOrder === 'post') {
      ctx.save();
      const imageData = ctx.getImageData(box.x, box.y, box.w, box.h);
      const tempCanvas = createCanvas(box.w, box.h);
      const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        const adjustedFilters = filters.map(f => ({
          ...f,
          intensity: f.intensity !== undefined ? f.intensity * filterIntensity : (f.intensity ?? 1) * filterIntensity,
          value: f.value !== undefined ? f.value * filterIntensity : f.value,
          radius: f.radius !== undefined ? f.radius * filterIntensity : f.radius
        }));
        await applySimpleProfessionalFilters(tempCtx, adjustedFilters, box.w, box.h);
        ctx.clearRect(box.x, box.y, box.w, box.h);
        ctx.drawImage(tempCanvas, box.x, box.y);
      }
      ctx.restore();
    }

    // Apply effects stack
    if (effects) {
      ctx.save();
      const effectsCtx = ctx;
      if (effects.vignette) {
        applyVignette(effectsCtx, effects.vignette.intensity, effects.vignette.size, box.w, box.h);
      }
      if (effects.lensFlare) {
        applyLensFlare(effectsCtx, box.x + effects.lensFlare.x, box.y + effects.lensFlare.y, effects.lensFlare.intensity, box.w, box.h);
      }
      if (effects.chromaticAberration) {
        const imageData = ctx.getImageData(box.x, box.y, box.w, box.h);
        const tempCanvas = createCanvas(box.w, box.h);
        const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          applyChromaticAberration(tempCtx, effects.chromaticAberration.intensity, box.w, box.h);
          ctx.clearRect(box.x, box.y, box.w, box.h);
          ctx.drawImage(tempCanvas, box.x, box.y);
        }
      }
      if (effects.filmGrain) {
        const imageData = ctx.getImageData(box.x, box.y, box.w, box.h);
        const tempCanvas = createCanvas(box.w, box.h);
        const tempCtx = tempCanvas.getContext('2d') as SKRSContext2D;
        if (tempCtx) {
          tempCtx.putImageData(imageData, 0, 0);
          applyFilmGrain(tempCtx, effects.filmGrain.intensity, box.w, box.h);
          ctx.clearRect(box.x, box.y, box.w, box.h);
          ctx.drawImage(tempCanvas, box.x, box.y);
        }
      }
      ctx.restore();
    }


    // 4) Stroke (independent) — supports gradient or color
    applyStroke(ctx, box, stroke);

    ctx.restore();
  }

  /**
   * Draws a shape with all effects (shadow, stroke, filters, etc.).
   * @private
   * @param ctx - Canvas 2D context
   * @param shapeType - Type of shape to draw
   * @param x - X position
   * @param y - Y position
   * @param width - Shape width
   * @param height - Shape height
   * @param options - Shape drawing options
   */
  async #drawShape(
    ctx: SKRSContext2D, 
    shapeType: ShapeType, 
    x: number, 
    y: number, 
    width: number, 
    height: number,
    options: {
      rotation?: number;
      opacity?: number;
      blur?: number;
      borderRadius?: number | 'circular';
      borderPosition?: string;
      shadow?: any;
      stroke?: any;
      boxBackground?: any;
      fill?: boolean;
      color?: string;
      gradient?: any;
      radius?: number;
      sides?: number;
      innerRadius?: number;
      outerRadius?: number;
      filters?: any[];
    }
  ): Promise<void> {
    const box = { x, y, w: width, h: height };

    ctx.save();

    // Apply rotation
    if (options.rotation) {
      applyRotation(ctx, options.rotation, box.x, box.y, box.w, box.h);
    }

    // Apply opacity
    if (options.opacity !== undefined) {
      ctx.globalAlpha = options.opacity;
    }

    // Apply blur
    if (options.blur && options.blur > 0) {
      ctx.filter = `blur(${options.blur}px)`;
    }

    // 1) Custom Shadow for complex shapes (heart, star)
    if (options.shadow && this.#isComplexShape(shapeType)) {
      this.#applyShapeShadow(ctx, shapeType, x, y, width, height, options.shadow, {
        radius: options.radius,
        sides: options.sides,
        innerRadius: options.innerRadius,
        outerRadius: options.outerRadius
      });
    } else if (options.shadow) {
      // Use standard shadow for simple shapes
      applyShadow(ctx, box, options.shadow);
    }

    // 2) Optional box background
    if (options.boxBackground) {
      drawBoxBackground(ctx, box, options.boxBackground, options.borderRadius, options.borderPosition);
    }

    // 3) Draw the shape
    ctx.save();
    if (options.borderRadius) {
      buildPath(ctx, box.x, box.y, box.w, box.h, options.borderRadius, options.borderPosition);
      ctx.clip();
    }

    // Apply professional filters BEFORE drawing the shape
    if (options.filters && options.filters.length > 0) {
      await applySimpleProfessionalFilters(ctx, options.filters, width, height);
    }

    drawShape(ctx, shapeType, x, y, width, height, {
      fill: options.fill,
      color: options.color,
      gradient: options.gradient,
      radius: options.radius,
      sides: options.sides,
      innerRadius: options.innerRadius,
      outerRadius: options.outerRadius
    });

    ctx.restore();


    // 4) Custom Stroke for complex shapes (heart, star)
    if (options.stroke && this.#isComplexShape(shapeType)) {
      this.#applyShapeStroke(ctx, shapeType, x, y, width, height, options.stroke, {
        radius: options.radius,
        sides: options.sides,
        innerRadius: options.innerRadius,
        outerRadius: options.outerRadius
      });
    } else if (options.stroke) {
      // Use standard stroke for simple shapes
      applyStroke(ctx, box, options.stroke);
    }

    // Reset filters and alpha
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Checks if shape needs custom shadow/stroke (heart, star).
   * @private
   * @param shapeType - Type of shape
   * @returns True if shape is complex and needs custom effects
   */
  #isComplexShape(shapeType: ShapeType): boolean {
    return shapeType === 'heart' || shapeType === 'star';
  }

  /**
   * Applies custom shadow for complex shapes (heart, star).
   * @private
   * @param ctx - Canvas 2D context
   * @param shapeType - Type of shape
   * @param x - X position
   * @param y - Y position
   * @param width - Shape width
   * @param height - Shape height
   * @param shadow - Shadow options
   * @param shapeOptions - Shape-specific options
   */
  #applyShapeShadow(
    ctx: SKRSContext2D,
    shapeType: ShapeType,
    x: number,
    y: number,
    width: number,
    height: number,
    shadow: any,
    shapeProps: any
  ): void {
    const {
      color = "rgba(0,0,0,1)",
      gradient,
      opacity = 0.4,
      offsetX = 0,
      offsetY = 0,
      blur = 20
    } = shadow;

    ctx.save();
    ctx.globalAlpha = opacity;
    if (blur > 0) ctx.filter = `blur(${blur}px)`;

    // Set shadow color or gradient
    if (gradient) {
      const gfill = createGradientFill(ctx, gradient, { x: x + offsetX, y: y + offsetY, w: width, h: height });
      ctx.fillStyle = gfill as any;
    } else {
      ctx.fillStyle = color;
    }

    // Create shadow path
    createShapePath(ctx, shapeType, x + offsetX, y + offsetY, width, height, shapeProps);
    ctx.fill();

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Applies custom stroke for complex shapes (heart, star).
   * @private
   * @param ctx - Canvas 2D context
   * @param shapeType - Type of shape
   * @param x - X position
   * @param y - Y position
   * @param width - Shape width
   * @param height - Shape height
   * @param stroke - Stroke options
   * @param shapeOptions - Shape-specific options
   */
  #applyShapeStroke(
    ctx: SKRSContext2D,
    shapeType: ShapeType,
    x: number,
    y: number,
    width: number,
    height: number,
    stroke: any,
    shapeProps: any
  ): void {
    const {
      color = "#000",
      gradient,
      width: strokeWidth = 2,
      position = 0,
      blur = 0,
      opacity = 1,
      style = 'solid'
    } = stroke;

    ctx.save();
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    ctx.globalAlpha = opacity;

    // Set stroke color or gradient
    if (gradient) {
      const gstroke = createGradientFill(ctx, gradient, { x, y, w: width, h: height });
      ctx.strokeStyle = gstroke as any;
    } else {
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = strokeWidth;

    // Apply stroke style
    this.#applyShapeStrokeStyle(ctx, style, strokeWidth);

    // Create stroke path
    createShapePath(ctx, shapeType, x, y, width, height, shapeProps);
    
    // Handle complex stroke styles
    if (style === 'groove' || style === 'ridge' || style === 'double') {
      this.#applyComplexShapeStroke(ctx, style, strokeWidth, color, gradient);
    } else {
      ctx.stroke();
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }


  /**
   * Creates text on an existing canvas buffer with enhanced styling options.
   * 
   * @param textArray - Single TextProperties object or array of TextProperties containing:
   *   - text: Text content to render (required)
   *   - x: X position on canvas (required)
   *   - y: Y position on canvas (required)
   *   - fontPath: Path to custom font file (.ttf, .otf, .woff, etc.)
   *   - fontName: Custom font name (used with fontPath)
   *   - fontSize: Font size in pixels (default: 16)
   *   - fontFamily: Font family name (e.g., 'Arial', 'Helvetica')
   *   - bold: Make text bold (boolean)
   *   - italic: Make text italic (boolean)
   *   - underline: Add underline decoration (boolean)
   *   - overline: Add overline decoration (boolean)
   *   - strikethrough: Add strikethrough decoration (boolean)
   *   - highlight: Highlight text with background color and opacity
   *   - lineHeight: Line height multiplier (default: 1.4)
   *   - letterSpacing: Space between letters in pixels
   *   - wordSpacing: Space between words in pixels
   *   - maxWidth: Maximum width for text wrapping
   *   - maxHeight: Maximum height for text (truncates with ellipsis)
   *   - textAlign: Horizontal text alignment ('left', 'center', 'right', 'start', 'end')
   *   - textBaseline: Vertical text baseline ('alphabetic', 'bottom', 'hanging', 'ideographic', 'middle', 'top')
   *   - color: Text color (hex, rgb, rgba, hsl, etc.)
   *   - gradient: Gradient fill for text
   *   - opacity: Text opacity (0-1, default: 1)
   *   - glow: Text glow effect with color, intensity, and opacity
   *   - shadow: Text shadow effect with color, offset, blur, and opacity
   *   - stroke: Text stroke/outline with color, width, gradient, and opacity
   *   - rotation: Text rotation in degrees
   * 
   * @param canvasBuffer - Existing canvas buffer (Buffer) or CanvasResults object
   * 
   * @returns Promise<Buffer> - Updated canvas buffer in PNG format
   * 
   * @throws Error if text, x, or y are missing, or if canvas buffer is invalid
   * 
   * @example
   * ```typescript
   * const result = await painter.createText([
   *   {
   *     text: "Hello World!",
   *     x: 100, y: 100,
   *     fontSize: 24,
   *     bold: true,
   *     color: '#ff6b6b',
   *     shadow: { color: 'rgba(0,0,0,0.3)', offsetX: 2, offsetY: 2, blur: 4 },
   *     underline: true,
   *     highlight: { color: '#ffff00', opacity: 0.3 }
   *   }
   * ], canvasBuffer);
   * ```
   */
  /**
   * Validates text properties array.
   * @private
   * @param textArray - Text properties to validate
   */
  #validateTextArray(textArray: TextProperties | TextProperties[]): void {
    const textList = Array.isArray(textArray) ? textArray : [textArray];
    if (textList.length === 0) {
      throw new Error("createText: At least one text object is required.");
    }
    for (const textProps of textList) {
      this.#validateTextProperties(textProps);
    }
  }

  async createText(textArray: TextProperties | TextProperties[], canvasBuffer: CanvasResults | Buffer): Promise<Buffer> {
    try {
      // Validate inputs
      if (!canvasBuffer) {
        throw new Error("createText: canvasBuffer is required.");
      }
      this.#validateTextArray(textArray);
      
      // Ensure textArray is an array
      const textList = Array.isArray(textArray) ? textArray : [textArray];

      // Load existing canvas buffer
      let existingImage: Image;
      
      if (Buffer.isBuffer(canvasBuffer)) {
        existingImage = await loadImage(canvasBuffer);
      } else if (canvasBuffer && canvasBuffer.buffer) {
        existingImage = await loadImage(canvasBuffer.buffer);
      } else {
        throw new Error('Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer');
      }

      if (!existingImage) {
        throw new Error('Unable to load image from buffer');
      }

      // Create new canvas with same dimensions
      const canvas = createCanvas(existingImage.width, existingImage.height);
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Unable to get 2D rendering context");
      }

      // Draw existing image as background
      ctx.drawImage(existingImage, 0, 0);

      // Render each text object with enhanced features
      for (const textProps of textList) {
        await this.#renderEnhancedText(ctx, textProps);
      }

      return canvas.toBuffer("image/png");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createText failed: ${errorMessage}`);
    }
  }



  /**
   * Validates custom line options.
   * @private
   * @param options - Custom options to validate
   */
  #validateCustomOptions(options: CustomOptions | CustomOptions[]): void {
    const opts = Array.isArray(options) ? options : [options];
    if (opts.length === 0) {
      throw new Error("createCustom: At least one custom option is required.");
    }
    for (const opt of opts) {
      if (!opt.startCoordinates || typeof opt.startCoordinates.x !== 'number' || typeof opt.startCoordinates.y !== 'number') {
        throw new Error("createCustom: startCoordinates with valid x and y are required.");
      }
      if (!opt.endCoordinates || typeof opt.endCoordinates.x !== 'number' || typeof opt.endCoordinates.y !== 'number') {
        throw new Error("createCustom: endCoordinates with valid x and y are required.");
      }
    }
  }

  async createCustom(options: CustomOptions | CustomOptions[], buffer: CanvasResults | Buffer): Promise<Buffer> {
    try {
      // Validate inputs
      if (!buffer) {
        throw new Error("createCustom: buffer is required.");
      }
      this.#validateCustomOptions(options);

      const opts = Array.isArray(options) ? options : [options];

      let existingImage: Image;
        
      if (Buffer.isBuffer(buffer)) {
        existingImage = await loadImage(buffer);
      } else if (buffer && buffer.buffer) {
        existingImage = await loadImage(buffer.buffer);
      } else {
        throw new Error('Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer');
      }

      if (!existingImage) {
        throw new Error('Unable to load image from buffer');
      }

      const canvas = createCanvas(existingImage.width, existingImage.height);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(existingImage, 0, 0);

      await customLines(ctx, opts);

      return canvas.toBuffer("image/png");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createCustom failed: ${errorMessage}`);
    }
  }

  /**
   * Validates GIF options and frames.
   * @private
   * @param gifFrames - GIF frames to validate
   * @param options - GIF options to validate
   */
  #validateGIFOptions(gifFrames: { background: string; duration: number }[], options: GIFOptions): void {
    if (!gifFrames || gifFrames.length === 0) {
      throw new Error("createGIF: At least one frame is required.");
    }
    for (const frame of gifFrames) {
      if (!frame.background) {
        throw new Error("createGIF: Each frame must have a background property.");
      }
      if (typeof frame.duration !== 'number' || frame.duration < 0) {
        throw new Error("createGIF: Each frame duration must be a non-negative number.");
      }
    }
    if (options.outputFormat === "file" && !options.outputFile) {
      throw new Error("createGIF: outputFile is required when outputFormat is 'file'.");
    }
    if (options.repeat !== undefined && (typeof options.repeat !== "number" || options.repeat < 0)) {
      throw new Error("createGIF: repeat must be a non-negative number or undefined.");
    }
    if (options.quality !== undefined && (typeof options.quality !== "number" || options.quality < 1 || options.quality > 20)) {
      throw new Error("createGIF: quality must be a number between 1 and 20 or undefined.");
    }
  }

  async createGIF(gifFrames: { background: string; duration: number }[], options: GIFOptions): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | undefined> {
    try {
      this.#validateGIFOptions(gifFrames, options);
      
      async function resizeImage(image: Image, targetWidth: number, targetHeight: number) {
      const canvas = createCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      return canvas;
  }

  function createOutputStream(outputFile: string): fs.WriteStream {
      return fs.createWriteStream(outputFile);
  }

  function createBufferStream(): PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] } {
      const bufferStream = new PassThrough();
      const chunks: Buffer[] = [];
  
      bufferStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
      });
  
      // Properly extend the stream object
      const extendedStream = bufferStream as PassThrough & { getBuffer: () => Buffer; chunks: Buffer[] };
      extendedStream.getBuffer = function (): Buffer {
          return Buffer.concat(chunks);
      };
      extendedStream.chunks = chunks;
  
      return extendedStream;
  }

      // Validation is done in #validateGIFOptions
  
      const canvasWidth = options.width || 1200;
      const canvasHeight = options.height || 1200;

      const encoder = new GIFEncoder(canvasWidth, canvasHeight);
      // Use buffer stream for buffer/base64/attachment, file stream only for 'file' format
      const useBufferStream = options.outputFormat !== "file";
      const outputStream = useBufferStream ? createBufferStream() : (options.outputFile ? createOutputStream(options.outputFile) : createBufferStream());
      
      encoder.createReadStream().pipe(outputStream);
      
      encoder.start();
      encoder.setRepeat(options.repeat || 0);
      encoder.setQuality(options.quality || 10);

      const canvas = createCanvas(canvasWidth, canvasHeight);
      const ctx = canvas.getContext("2d") as SKRSContext2D;
      if (!ctx) throw new Error("Unable to get 2D context");
      
      for (const frame of gifFrames) {
          const image = await loadImage(frame.background);
          const resizedImage = await resizeImage(image, canvasWidth, canvasHeight);
          
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(resizedImage, 0, 0);
          
          if (options.watermark?.enable) {
              const watermark = await loadImage(options.watermark.url);
              ctx.drawImage(watermark, 10, canvasHeight - watermark.height - 10);
          }
          
          if (options.textOverlay) {
              ctx.font = `${options.textOverlay.fontSize || 20}px Arial`;
              ctx.fillStyle = options.textOverlay.fontColor || "white";
              ctx.fillText(options.textOverlay.text, options.textOverlay.x || 10, options.textOverlay.y || 30);
          }

          encoder.setDelay(frame.duration);
          encoder.addFrame(ctx as unknown as CanvasRenderingContext2D);
      }
      
      encoder.finish();
      
      if (options.outputFormat === "file") {
          outputStream.end();
          await new Promise<void>((resolve) => outputStream.on("finish", () => resolve()));
      } else if (options.outputFormat === "base64") {
          // Wait for stream to finish before getting buffer
          await new Promise<void>((resolve) => {
              outputStream.on("end", () => resolve());
              outputStream.end();
          });
          if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
              return outputStream.getBuffer().toString("base64");
          }
          throw new Error("createGIF: Unable to get buffer for base64 output.");
      } else if (options.outputFormat === "attachment") {
          const gifStream = encoder.createReadStream();
          return [{ attachment: gifStream, name: "gif.js" }];
      } else if (options.outputFormat === "buffer") {
          // Wait for stream to finish before getting buffer
          await new Promise<void>((resolve) => {
              outputStream.on("end", () => resolve());
              outputStream.end();
          });
          if ('getBuffer' in outputStream && typeof outputStream.getBuffer === 'function') {
              return outputStream.getBuffer();
          }
          throw new Error("createGIF: Unable to get buffer for buffer output.");
      } else {
          throw new Error("Invalid output format. Supported formats are 'file', 'base64', 'attachment', and 'buffer'.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createGIF failed: ${errorMessage}`);
    }
  }

  /**
   * Validates resize options.
   * @private
   * @param options - Resize options to validate
   */
  #validateResizeOptions(options: ResizeOptions): void {
    if (!options || !options.imagePath) {
      throw new Error("resize: imagePath is required.");
    }
    if (options.size) {
      if (options.size.width !== undefined && (typeof options.size.width !== 'number' || options.size.width <= 0)) {
        throw new Error("resize: size.width must be a positive number.");
      }
      if (options.size.height !== undefined && (typeof options.size.height !== 'number' || options.size.height <= 0)) {
        throw new Error("resize: size.height must be a positive number.");
      }
    }
    if (options.quality !== undefined && (typeof options.quality !== 'number' || options.quality < 0 || options.quality > 100)) {
      throw new Error("resize: quality must be a number between 0 and 100.");
    }
  }

  async resize(resizeOptions: ResizeOptions): Promise<Buffer> {
    try {
      this.#validateResizeOptions(resizeOptions);
      return await resizingImg(resizeOptions);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`resize failed: ${errorMessage}`);
    }
  }

  /**
   * Validates image converter inputs.
   * @private
   * @param source - Image source to validate
   * @param newExtension - Extension to validate
   */
  #validateConverterInputs(source: string, newExtension: string): void {
    if (!source) {
      throw new Error("imgConverter: source is required.");
    }
    if (!newExtension) {
      throw new Error("imgConverter: newExtension is required.");
    }
    const validExtensions = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif', 'heif', 'raw', 'pdf', 'svg'];
    if (!validExtensions.includes(newExtension.toLowerCase())) {
      throw new Error(`imgConverter: Invalid extension. Supported: ${validExtensions.join(', ')}`);
    }
  }

  async imgConverter(source: string, newExtension: string): Promise<Buffer> {
    try {
      this.#validateConverterInputs(source, newExtension);
      return await converter(source, newExtension);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`imgConverter failed: ${errorMessage}`);
    }
  }

  /**
   * Validates effects inputs.
   * @private
   * @param source - Image source to validate
   * @param filters - Filters array to validate
   */
  #validateEffectsInputs(source: string, filters: ImageFilter[]): void {
    if (!source) {
      throw new Error("effects: source is required.");
    }
    if (!filters || !Array.isArray(filters) || filters.length === 0) {
      throw new Error("effects: filters array with at least one filter is required.");
    }
  }

  async effects(source: string, filters: ImageFilter[]): Promise<Buffer> {
    try {
      this.#validateEffectsInputs(source, filters);
      return await imgEffects(source, filters);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`effects failed: ${errorMessage}`);
    }
  }

  /**
   * Validates color filter inputs.
   * @private
   * @param source - Image source to validate
   * @param opacity - Opacity to validate
   */
  #validateColorFilterInputs(source: string, opacity?: number): void {
    if (!source) {
      throw new Error("colorsFilter: source is required.");
    }
    if (opacity !== undefined && (typeof opacity !== 'number' || opacity < 0 || opacity > 1)) {
      throw new Error("colorsFilter: opacity must be a number between 0 and 1.");
    }
  }

  async colorsFilter(source: string, filterColor: string | GradientConfig, opacity?: number): Promise<Buffer> {
    try {
      this.#validateColorFilterInputs(source, opacity);
      return await applyColorFilters(source, filterColor, opacity);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`colorsFilter failed: ${errorMessage}`);
    }
  }

  async colorAnalysis(source: string): Promise<{ color: string; frequency: string }[]> {
    try {
      if (!source) {
        throw new Error("colorAnalysis: source is required.");
      }
      return await detectColors(source);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`colorAnalysis failed: ${errorMessage}`);
    }
  }

  async colorsRemover(source: string, colorToRemove: { red: number, green: number, blue: number }): Promise<Buffer | undefined> {
    try {
      if (!source) {
        throw new Error("colorsRemover: source is required.");
      }
      if (!colorToRemove || typeof colorToRemove.red !== 'number' || typeof colorToRemove.green !== 'number' || typeof colorToRemove.blue !== 'number') {
        throw new Error("colorsRemover: colorToRemove must be an object with red, green, and blue properties (0-255).");
      }
      if (colorToRemove.red < 0 || colorToRemove.red > 255 || 
          colorToRemove.green < 0 || colorToRemove.green > 255 || 
          colorToRemove.blue < 0 || colorToRemove.blue > 255) {
        throw new Error("colorsRemover: colorToRemove RGB values must be between 0 and 255.");
      }
      return await removeColor(source, colorToRemove);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`colorsRemover failed: ${errorMessage}`);
    }
  }

  async removeBackground(imageURL: string, apiKey: string): Promise<Buffer | undefined> {
    try {
      if (!imageURL) {
        throw new Error("removeBackground: imageURL is required.");
      }
      if (!apiKey) {
        throw new Error("removeBackground: apiKey is required.");
      }
      return await bgRemoval(imageURL, apiKey);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`removeBackground failed: ${errorMessage}`);
    }
  }

  /**
   * Validates blend inputs.
   * @private
   * @param layers - Layers to validate
   * @param baseImageBuffer - Base image buffer to validate
   */
  #validateBlendInputs(
    layers: Array<{
      image: string | Buffer;
      blendMode: GlobalCompositeOperation;
      position?: { x: number; y: number };
      opacity?: number;
    }>,
    baseImageBuffer: Buffer
  ): void {
    if (!baseImageBuffer || !Buffer.isBuffer(baseImageBuffer)) {
      throw new Error("blend: baseImageBuffer must be a valid Buffer.");
    }
    if (!layers || !Array.isArray(layers) || layers.length === 0) {
      throw new Error("blend: layers array with at least one layer is required.");
    }
    for (const layer of layers) {
      if (!layer.image) {
        throw new Error("blend: Each layer must have an image property.");
      }
      if (!layer.blendMode) {
        throw new Error("blend: Each layer must have a blendMode property.");
      }
      if (layer.opacity !== undefined && (typeof layer.opacity !== 'number' || layer.opacity < 0 || layer.opacity > 1)) {
        throw new Error("blend: Layer opacity must be a number between 0 and 1.");
      }
    }
  }

  async blend(
    layers: Array<{
      image: string | Buffer;
      blendMode: GlobalCompositeOperation;
      position?: { x: number; y: number };
      opacity?: number;
    }>,
    baseImageBuffer: Buffer,
    defaultBlendMode: GlobalCompositeOperation = 'source-over'
  ): Promise<Buffer> {
    try {
      this.#validateBlendInputs(layers, baseImageBuffer);
      
      const baseImage = await loadImage(baseImageBuffer);
      const canvas = createCanvas(baseImage.width, baseImage.height);
      const ctx = canvas.getContext('2d') as SKRSContext2D;
      if (!ctx) throw new Error("Unable to get 2D context");
  
      ctx.globalCompositeOperation = defaultBlendMode;
      ctx.drawImage(baseImage, 0, 0);
  
      for (const layer of layers) {
        const layerImage = await loadImage(layer.image);
        ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;
  
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(layerImage, layer.position?.x || 0, layer.position?.y || 0);
      }
  
      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = defaultBlendMode; // Reset to user-defined default
  
      return canvas.toBuffer('image/png');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`blend failed: ${errorMessage}`);
    }
  }
  

  /**
   * Validates chart inputs.
   * @private
   * @param data - Chart data to validate
   * @param type - Chart type configuration to validate
   */
  #validateChartInputs(data: unknown, type: { chartType: string; chartNumber: number }): void {
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
      throw new Error("createChart: data object with datasets is required.");
    }
    if (!type || typeof type !== 'object') {
      throw new Error("createChart: type configuration object is required.");
    }
    if (!type.chartType || typeof type.chartType !== 'string') {
      throw new Error("createChart: type.chartType must be a string.");
    }
    if (typeof type.chartNumber !== 'number' || type.chartNumber < 1) {
      throw new Error("createChart: type.chartNumber must be a positive number.");
    }
    const validChartTypes = ['bar', 'line', 'pie'];
    if (!validChartTypes.includes(type.chartType.toLowerCase())) {
      throw new Error(`createChart: Invalid chartType. Supported: ${validChartTypes.join(', ')}`);
    }
  }

  async createChart(data: unknown, type: { chartType: string; chartNumber: number }): Promise<Buffer> {
    try {
      this.#validateChartInputs(data, type);

      const { chartType, chartNumber } = type;

    switch (chartType.toLowerCase()) {
        case 'bar':
            switch (chartNumber) {
                case 1:
                    const barResult = await verticalBarChart(data as barChart_1);
                    if (!barResult) {
                      throw new Error("createChart: Failed to generate bar chart.");
                    }
                    return barResult;
                case 2:
                    throw new Error('Type 2 is still under development.');
                default:
                    throw new Error('Invalid chart number for chart type "bar".');
            }
        case 'line':
            switch (chartNumber) {
                case 1:
                    // LineChart expects DataPoint[][] where DataPoint has { label: string; y: number }
                    // Type assertion needed because there are two different DataPoint interfaces
                    return await lineChart(data as unknown as { data: Array<Array<{ label: string; y: number }>>; lineConfig: LineChartConfig });
                case 2:
                    throw new Error('Type 2 is still under development.');
                default:
                    throw new Error('Invalid chart number for chart type "line".');
            }
        case 'pie':
            switch (chartNumber) {
                case 1:
                    return await pieChart(data as PieChartData);
                case 2:
                    throw new Error('Type 2 is still under development.');
                default:
                    throw new Error('Invalid chart number for chart type "pie".');
            }
        default:
            throw new Error(`Unsupported chart type "${chartType}".`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createChart failed: ${errorMessage}`);
    }
  }


  /**
   * Validates crop options.
   * @private
   * @param options - Crop options to validate
   */
  #validateCropOptions(options: cropOptions): void {
    if (!options) {
      throw new Error("cropImage: options object is required.");
    }
    if (!options.imageSource) {
      throw new Error("cropImage: imageSource is required.");
    }
    if (!options.coordinates || !Array.isArray(options.coordinates) || options.coordinates.length < 3) {
      throw new Error("cropImage: coordinates array with at least 3 points is required.");
    }
    if (options.crop !== 'inner' && options.crop !== 'outer') {
      throw new Error("cropImage: crop must be either 'inner' or 'outer'.");
    }
  }

  async cropImage(options: cropOptions): Promise<Buffer> {
    try {
      this.#validateCropOptions(options);

      if (options.crop === 'outer') {
        return await cropOuter(options);
      } else {
        return await cropInner(options);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`cropImage failed: ${errorMessage}`);
    }
  }

  private _ffmpegAvailable: boolean | null = null;
  private _ffmpegChecked: boolean = false;
  private _ffmpegPath: string | null = null;

  /**
   * Gets comprehensive FFmpeg installation instructions based on OS
   * @private
   * @returns Detailed installation instructions
   */
  #getFFmpegInstallInstructions(): string {
    const os = process.platform;
    let instructions = '\n\n📹 FFMPEG INSTALLATION GUIDE\n';
    instructions += '═'.repeat(50) + '\n\n';

    if (os === 'win32') {
      instructions += '🪟 WINDOWS INSTALLATION:\n\n';
      instructions += 'OPTION 1 - Using Chocolatey (Recommended):\n';
      instructions += '  1. Open PowerShell as Administrator\n';
      instructions += '  2. Run: choco install ffmpeg\n';
      instructions += '  3. Restart your terminal\n\n';
      
      instructions += 'OPTION 2 - Using Winget:\n';
      instructions += '  1. Open PowerShell\n';
      instructions += '  2. Run: winget install ffmpeg\n';
      instructions += '  3. Restart your terminal\n\n';
      
      instructions += 'OPTION 3 - Manual Installation:\n';
      instructions += '  1. Visit: https://www.gyan.dev/ffmpeg/builds/\n';
      instructions += '  2. Download "ffmpeg-release-essentials.zip"\n';
      instructions += '  3. Extract to C:\\ffmpeg\n';
      instructions += '  4. Add C:\\ffmpeg\\bin to System PATH:\n';
      instructions += '     - Press Win + X → System → Advanced → Environment Variables\n';
      instructions += '     - Edit "Path" → Add "C:\\ffmpeg\\bin"\n';
      instructions += '  5. Restart terminal and verify: ffmpeg -version\n\n';
      
      instructions += '🔍 Search Terms: "install ffmpeg windows", "ffmpeg windows tutorial"\n';
      instructions += '📺 YouTube: Search "How to install FFmpeg on Windows 2024"\n';
      instructions += '🌐 Official: https://ffmpeg.org/download.html\n';
    } else if (os === 'darwin') {
      instructions += '🍎 macOS INSTALLATION:\n\n';
      instructions += 'OPTION 1 - Using Homebrew (Recommended):\n';
      instructions += '  1. Install Homebrew if not installed:\n';
      instructions += '     /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"\n';
      instructions += '  2. Run: brew install ffmpeg\n';
      instructions += '  3. Verify: ffmpeg -version\n\n';
      
      instructions += 'OPTION 2 - Using MacPorts:\n';
      instructions += '  1. Install MacPorts from: https://www.macports.org/\n';
      instructions += '  2. Run: sudo port install ffmpeg\n\n';
      
      instructions += '🔍 Search Terms: "install ffmpeg mac", "ffmpeg macos homebrew"\n';
      instructions += '📺 YouTube: Search "Install FFmpeg on Mac using Homebrew"\n';
      instructions += '🌐 Official: https://ffmpeg.org/download.html\n';
    } else {
      instructions += '🐧 LINUX INSTALLATION:\n\n';
      instructions += 'Ubuntu/Debian:\n';
      instructions += '  sudo apt-get update\n';
      instructions += '  sudo apt-get install ffmpeg\n\n';
      
      instructions += 'RHEL/CentOS/Fedora:\n';
      instructions += '  sudo yum install ffmpeg\n';
      instructions += '  # OR for newer versions:\n';
      instructions += '  sudo dnf install ffmpeg\n\n';
      
      instructions += 'Arch Linux:\n';
      instructions += '  sudo pacman -S ffmpeg\n\n';
      
      instructions += '🔍 Search Terms: "install ffmpeg [your-distro]", "ffmpeg linux tutorial"\n';
      instructions += '📺 YouTube: Search "Install FFmpeg on Linux"\n';
      instructions += '🌐 Official: https://ffmpeg.org/download.html\n';
    }

    instructions += '\n' + '═'.repeat(50) + '\n';
    instructions += '✅ After installation, restart your terminal and verify with: ffmpeg -version\n';
    instructions += '💡 If still not working, ensure FFmpeg is in your system PATH\n';
    
    return instructions;
  }

  /**
   * Checks if ffmpeg is available in the system (cached check)
   * @private
   * @returns Promise<boolean> - True if ffmpeg is available
   */
  async #checkFFmpegAvailable(): Promise<boolean> {
    // Cache the result to avoid multiple checks
    if (this._ffmpegChecked) {
      return this._ffmpegAvailable ?? false;
    }

    try {
      // Try to execute ffmpeg -version (suppress output)
      await execAsync('ffmpeg -version', { 
        timeout: 5000,
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      this._ffmpegAvailable = true;
      this._ffmpegChecked = true;
      this._ffmpegPath = 'ffmpeg';
      return true;
    } catch {
      // Try common installation paths
      const commonPaths = process.platform === 'win32' ? [
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe',
        'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe'
      ] : [
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/opt/homebrew/bin/ffmpeg',
        '/opt/local/bin/ffmpeg'
      ];

      for (const ffmpegPath of commonPaths) {
        try {
          await execAsync(`"${ffmpegPath}" -version`, { 
            timeout: 3000,
            maxBuffer: 1024 * 1024
          });
          this._ffmpegAvailable = true;
          this._ffmpegChecked = true;
          this._ffmpegPath = ffmpegPath;
          return true;
        } catch {
          continue;
        }
      }

      this._ffmpegAvailable = false;
      this._ffmpegChecked = true;
      return false;
    }
  }

  /**
   * Gets video information (duration, resolution, fps, etc.)
   * @param videoSource - Video source (path, URL, or Buffer)
   * @returns Video metadata object
   */
  /**
   * Gets video information (duration, resolution, fps, etc.)
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param skipFFmpegCheck - Skip FFmpeg availability check (for internal use, default: false)
   * @returns Video metadata object
   */
  async getVideoInfo(videoSource: string | Buffer, skipFFmpegCheck: boolean = false): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    format: string;
  } | null> {
    try {
      // Skip FFmpeg check if we already know it's available (for internal calls)
      if (!skipFFmpegCheck) {
        const ffmpegAvailable = await this.#checkFFmpegAvailable();
        if (!ffmpegAvailable) {
          const errorMessage = 
            '❌ FFMPEG NOT FOUND\n' +
            'Video processing features require FFmpeg to be installed on your system.\n' +
            this.#getFFmpegInstallInstructions();
          
          throw new Error(errorMessage);
        }
      }

      const frameDir = path.join(process.cwd(), '.temp-frames');
      if (!fs.existsSync(frameDir)) {
        fs.mkdirSync(frameDir, { recursive: true });
      }

      let videoPath: string;
      const tempVideoPath = path.join(frameDir, `temp-video-${Date.now()}.mp4`);

      // Handle video source
      if (Buffer.isBuffer(videoSource)) {
        fs.writeFileSync(tempVideoPath, videoSource);
        videoPath = tempVideoPath;
      } else if (typeof videoSource === 'string' && videoSource.startsWith('http')) {
        const response = await axios({
          method: 'get',
          url: videoSource,
          responseType: 'arraybuffer'
        });
        fs.writeFileSync(tempVideoPath, Buffer.from(response.data));
        videoPath = tempVideoPath;
      } else {
        if (!fs.existsSync(videoSource)) {
          throw new Error(`Video file not found: ${videoSource}`);
        }
        videoPath = videoSource;
      }

      // Use ffprobe to get video info (escape path for Windows)
      const escapedPath = videoPath.replace(/"/g, '\\"');
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries stream=width,height,r_frame_rate,bit_rate -show_entries format=duration,format_name -of json "${escapedPath}"`,
        { 
          timeout: 30000, // 30 second timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large JSON responses
        }
      );

      const info = JSON.parse(stdout);
      const videoStream = info.streams?.find((s: any) => s.width && s.height) || info.streams?.[0];
      const format = info.format || {};

      // Parse frame rate (e.g., "30/1" -> 30)
      const fps = videoStream?.r_frame_rate 
        ? (() => {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            return den ? num / den : num;
          })()
        : 30;

      const result = {
        duration: parseFloat(format.duration || '0'),
        width: parseInt(videoStream?.width || '0'),
        height: parseInt(videoStream?.height || '0'),
        fps: fps,
        bitrate: parseInt(videoStream?.bit_rate || format.bit_rate || '0'),
        format: format.format_name || 'unknown'
      };

      // Cleanup temp file if created
      if (videoPath === tempVideoPath && fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      // Re-throw FFmpeg installation errors
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`getVideoInfo failed: ${errorMessage}`);
    }
  }

  /**
   * Extracts a single frame from a video at a specific time or frame number
   * @private
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param frameNumber - Frame number to extract (default: 0)
   * @param timeSeconds - Alternative: time in seconds (overrides frameNumber if provided)
   * @param outputFormat - Output image format ('jpg' or 'png', default: 'jpg')
   * @param quality - JPEG quality 1-31 (lower = better, default: 2) or PNG compression
   * @returns Buffer containing the frame image
   */
  async #extractVideoFrame(
    videoSource: string | Buffer, 
    frameNumber: number = 0,
    timeSeconds?: number,
    outputFormat: 'jpg' | 'png' = 'jpg',
    quality: number = 2
  ): Promise<Buffer | null> {
    try {
      const ffmpegAvailable = await this.#checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        const errorMessage = 
          '❌ FFMPEG NOT FOUND\n' +
          'Video processing features require FFmpeg to be installed on your system.\n' +
          this.#getFFmpegInstallInstructions();
        
        throw new Error(errorMessage);
      }

      const frameDir = path.join(process.cwd(), '.temp-frames');
      if (!fs.existsSync(frameDir)) {
        fs.mkdirSync(frameDir, { recursive: true });
      }

      const timestamp = Date.now();
      const tempVideoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      const frameOutputPath = path.join(frameDir, `frame-${timestamp}.${outputFormat}`);

      let videoPath: string;
      let shouldCleanupVideo = false;

      // Handle video source
      if (Buffer.isBuffer(videoSource)) {
        fs.writeFileSync(tempVideoPath, videoSource);
        videoPath = tempVideoPath;
        shouldCleanupVideo = true;
      } else if (typeof videoSource === 'string' && videoSource.startsWith('http')) {
        const response = await axios({
          method: 'get',
          url: videoSource,
          responseType: 'arraybuffer'
        });
        fs.writeFileSync(tempVideoPath, Buffer.from(response.data));
        videoPath = tempVideoPath;
        shouldCleanupVideo = true;
      } else {
        // Resolve relative paths (similar to customBackground)
        let resolvedPath = videoSource;
        if (!/^https?:\/\//i.test(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }
        
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found: ${videoSource} (resolved to: ${resolvedPath})`);
        }
        videoPath = resolvedPath;
      }

      // Calculate time in seconds
      // If time is provided, use it directly (most accurate)
      // If only frame is provided, we need to get video FPS to convert frame to time
      let time: number;
      if (timeSeconds !== undefined) {
        time = timeSeconds;
      } else if (frameNumber === 0) {
        // Frame 0 = start of video
        time = 0;
      } else {
        // Get video FPS to convert frame number to time accurately
        try {
          const videoInfo = await this.getVideoInfo(videoPath, true); // Skip FFmpeg check (already done)
          if (videoInfo && videoInfo.fps > 0) {
            time = frameNumber / videoInfo.fps;
          } else {
            // Fallback to 30 FPS if we can't get video info
            console.warn(`Could not get video FPS, assuming 30 FPS for frame ${frameNumber}`);
            time = frameNumber / 30;
          }
        } catch (error) {
          // If getVideoInfo fails, assume 30 FPS (standard video framerate)
          console.warn(`Could not get video info, assuming 30 FPS for frame ${frameNumber}`);
          time = frameNumber / 30;
        }
      }

      // Build ffmpeg command (escape paths for Windows)
      // Don't use -f flag, let FFmpeg infer format from file extension
      // Use -frames:v 1 instead of -vframes 1 (more explicit)
      // For PNG: use rgba pixel format (best compatibility with loadImage)
      // For JPEG: don't specify pixel format, let FFmpeg use default (yuvj420p works better than rgb24)
      const escapedVideoPath = videoPath.replace(/"/g, '\\"');
      const escapedOutputPath = frameOutputPath.replace(/"/g, '\\"');
      
      let command: string;
      if (outputFormat === 'png') {
        // PNG: Use rgba pixel format for best compatibility
        const pixFmt = '-pix_fmt rgba';
        command = `ffmpeg -i "${escapedVideoPath}" -ss ${time} -frames:v 1 ${pixFmt} -y "${escapedOutputPath}"`;
      } else {
        // JPEG: Use quality flag, let FFmpeg choose pixel format (default works better than rgb24)
        const qualityFlag = `-q:v ${quality}`;
        command = `ffmpeg -i "${escapedVideoPath}" -ss ${time} -frames:v 1 ${qualityFlag} -y "${escapedOutputPath}"`;
      }

      try {
        await execAsync(command, { 
          timeout: 30000, // 30 second timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        
        if (!fs.existsSync(frameOutputPath)) {
          throw new Error('Frame extraction failed - output file not created');
        }

        const buffer = fs.readFileSync(frameOutputPath);

        // Cleanup
        if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
        if (shouldCleanupVideo && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

        return buffer;
      } catch (error) {
        // Cleanup on error
        if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
        if (shouldCleanupVideo && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      // Re-throw FFmpeg installation errors so user sees installation guide
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`extractVideoFrame failed: ${errorMessage}`);
    }
  }

  /**
   * Validates extract frames inputs.
   * @private
   * @param videoSource - Video source to validate
   * @param options - Extract frames options to validate
   */
  #validateExtractFramesInputs(videoSource: string | Buffer, options: ExtractFramesOptions): void {
    if (!videoSource) {
      throw new Error("extractFrames: videoSource is required.");
    }
    if (!options || typeof options !== 'object') {
      throw new Error("extractFrames: options object is required.");
    }
    if (typeof options.interval !== 'number' || options.interval <= 0) {
      throw new Error("extractFrames: options.interval must be a positive number (milliseconds).");
    }
    if (options.outputFormat && !['jpg', 'png'].includes(options.outputFormat)) {
      throw new Error("extractFrames: outputFormat must be 'jpg' or 'png'.");
    }
  }

  /**
   * Extracts multiple frames from a video at specified intervals
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param options - Extraction options
   * @returns Array of frame file paths
   */
  async extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions): Promise<Array<{ source: string; isRemote: boolean }>> {
    try {
      const ffmpegAvailable = await this.#checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        const errorMessage = 
          '❌ FFMPEG NOT FOUND\n' +
          'Video processing features require FFmpeg to be installed on your system.\n' +
          this.#getFFmpegInstallInstructions();
        
        throw new Error(errorMessage);
      }

      this.#validateExtractFramesInputs(videoSource, options);
      
      const frames: Array<{ source: string; isRemote: boolean }> = [];
      const frameDir = path.join(process.cwd(), '.temp-frames', `frames-${Date.now()}`);

      if (!fs.existsSync(frameDir)) {
        fs.mkdirSync(frameDir, { recursive: true });
      }

      const timestamp = Date.now();
      const videoPath = typeof videoSource === 'string' ? videoSource : path.join(frameDir, `temp-video-${timestamp}.mp4`);
      let shouldCleanupVideo = false;

      // Handle video source
      if (Buffer.isBuffer(videoSource)) {
        fs.writeFileSync(videoPath, videoSource);
        shouldCleanupVideo = true;
      } else if (typeof videoSource === 'string' && videoSource.startsWith('http')) {
        const response = await axios({
          method: 'get',
          url: videoSource,
          responseType: 'arraybuffer'
        });
        fs.writeFileSync(videoPath, Buffer.from(response.data));
        shouldCleanupVideo = true;
      } else if (!fs.existsSync(videoPath)) {
        throw new Error("Video file not found at specified path.");
      }

      // Get video duration using ffprobe (escape path for Windows)
      const escapedVideoPath = videoPath.replace(/"/g, '\\"');
      const { stdout: probeOutput } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
      );
      
      const duration = parseFloat(probeOutput.trim());
      if (isNaN(duration) || duration <= 0) {
        throw new Error("Video duration not found in metadata.");
      }

      const outputFormat = options.outputFormat || 'jpg';
      const fps = 1000 / options.interval; // Frames per second based on interval
      const totalFrames = Math.floor(duration * fps);
      
      // Apply frame selection if specified
      const startFrame = options.frameSelection?.start || 0;
      const endFrame = options.frameSelection?.end !== undefined 
        ? Math.min(options.frameSelection.end, totalFrames - 1)
        : totalFrames - 1;

      // Build ffmpeg command for frame extraction
      const outputFileTemplate = path.join(frameDir, `frame-%03d.${outputFormat}`);
      const qualityFlag = outputFormat === 'jpg' ? '-q:v 2' : '';
      const pixFmt = outputFormat === 'png' ? '-pix_fmt rgba' : '-pix_fmt yuvj420p';
      
      // Calculate start and end times
      const startTime = startFrame / fps;
      const endTime = (endFrame + 1) / fps;
      const durationToExtract = endTime - startTime;

      const escapedOutputTemplate = outputFileTemplate.replace(/"/g, '\\"');
      // Don't use -f flag, let FFmpeg infer format from file extension
      // -vf fps=${fps} extracts frames at the specified FPS
      // Use -ss after -i for more accurate frame extraction
      const command = `ffmpeg -i "${escapedVideoPath}" -ss ${startTime} -t ${durationToExtract} -vf fps=${fps} ${pixFmt} ${qualityFlag} -y "${escapedOutputTemplate}"`;

      try {
        await execAsync(command, { 
          timeout: 60000, // 60 second timeout for multiple frames
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });

        // Collect all extracted frame files
        const actualFrameCount = endFrame - startFrame + 1;
        for (let i = 0; i < actualFrameCount; i++) {
          const frameNumber = startFrame + i;
          const framePath = path.join(frameDir, `frame-${String(i + 1).padStart(3, '0')}.${outputFormat}`);
          
          if (fs.existsSync(framePath)) {
            frames.push({
              source: framePath,
              isRemote: false
            });
          }
        }

        // Cleanup temp video if created
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }

        return frames;
      } catch (error) {
        // Cleanup on error
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      // Re-throw FFmpeg installation errors so user sees installation guide
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`extractFrames failed: ${errorMessage}`);
    }
  }

  /**
   * Comprehensive video processing method - all video features in one place
   * @param options - Video processing options
   * @returns Results based on the operation requested
   */
  async createVideo(options: {
    source: string | Buffer;
    
    // Get video information
    getInfo?: boolean;
    
    // Extract single frame (creates canvas)
    extractFrame?: {
      time?: number; // Time in seconds
      frame?: number; // Frame number (1-based, will be converted to time using video FPS)
      width?: number; // Canvas width (default: video width)
      height?: number; // Canvas height (default: video height)
      outputFormat?: 'jpg' | 'png'; // Frame extraction format (default: 'png')
      quality?: number; // JPEG quality 1-31 (lower = better, default: 2)
    };
    
    // Extract multiple frames at specific times
    extractFrames?: {
      times?: number[]; // Array of times in seconds
      interval?: number; // Extract frames at intervals (milliseconds)
      frameSelection?: { start?: number; end?: number }; // Frame range for interval extraction
      outputFormat?: 'jpg' | 'png';
      quality?: number;
      outputDirectory?: string; // Directory to save frames (for interval extraction)
    };
    
    // Extract ALL frames from video
    extractAllFrames?: {
      outputFormat?: 'jpg' | 'png';
      outputDirectory?: string;
      quality?: number;
      prefix?: string; // Filename prefix (default: 'frame')
      startTime?: number; // Start time in seconds (default: 0)
      endTime?: number; // End time in seconds (default: video duration)
    };
    
    // Generate video thumbnail (multiple frames in grid)
    generateThumbnail?: {
      count?: number; // Number of frames to extract (default: 9)
      grid?: { cols: number; rows: number }; // Grid layout (default: 3x3)
      width?: number; // Thumbnail width (default: 320)
      height?: number; // Thumbnail height (default: 180)
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    };
    
    // Convert video format
    convert?: {
      outputPath: string; // Output video file path
      format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv'; // Output format (default: 'mp4')
      quality?: 'low' | 'medium' | 'high' | 'ultra'; // Quality preset
      bitrate?: number; // Custom bitrate in kbps
      fps?: number; // Output FPS (default: source FPS)
      resolution?: { width: number; height: number }; // Output resolution
    };
    
    // Trim/Cut video
    trim?: {
      startTime: number; // Start time in seconds
      endTime: number; // End time in seconds
      outputPath: string; // Output video file path
    };
    
    // Extract audio from video
    extractAudio?: {
      outputPath: string; // Output audio file path
      format?: 'mp3' | 'wav' | 'aac' | 'ogg'; // Audio format (default: 'mp3')
      bitrate?: number; // Audio bitrate in kbps (default: 128)
    };
    
    // Add watermark to video
    addWatermark?: {
      watermarkPath: string; // Watermark image path
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      opacity?: number; // Watermark opacity 0-1 (default: 0.5)
      size?: { width: number; height: number }; // Watermark size
      outputPath: string; // Output video file path
    };
    
    // Adjust video speed
    changeSpeed?: {
      speed: number; // Speed multiplier (0.5 = half speed, 2 = double speed)
      outputPath: string; // Output video file path
    };
    
    // Extract video preview (multiple frames as images)
    generatePreview?: {
      count?: number; // Number of preview frames (default: 10)
      outputDirectory?: string; // Directory to save preview frames
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    };
    
    // Apply video effects/filters
    applyEffects?: {
      filters: Array<{
        type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'noise';
        intensity?: number; // 0-100
        value?: number; // For brightness, contrast, saturation (-100 to 100)
      }>;
      outputPath: string;
    };
    
    // Merge/Concatenate videos
    merge?: {
      videos: Array<string | Buffer>; // Array of video sources
      outputPath: string;
      mode?: 'sequential' | 'side-by-side' | 'grid'; // Merge mode
      grid?: { cols: number; rows: number }; // For grid mode
    };
    
    // Rotate/Flip video
    rotate?: {
      angle?: 90 | 180 | 270; // Rotation angle
      flip?: 'horizontal' | 'vertical' | 'both'; // Flip direction
      outputPath: string;
    };
    
    // Crop video
    crop?: {
      x: number; // Start X position
      y: number; // Start Y position
      width: number; // Crop width
      height: number; // Crop height
      outputPath: string;
    };
    
    // Compress/Optimize video
    compress?: {
      outputPath: string;
      quality?: 'low' | 'medium' | 'high' | 'ultra'; // Quality preset
      targetSize?: number; // Target file size in MB
      maxBitrate?: number; // Max bitrate in kbps
    };
    
    // Add text overlay to video
    addText?: {
      text: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top-center' | 'bottom-center';
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string; // Text background color
      startTime?: number; // Start time in seconds
      endTime?: number; // End time in seconds
      outputPath: string;
    };
    
    // Add fade effects
    addFade?: {
      fadeIn?: number; // Fade in duration in seconds
      fadeOut?: number; // Fade out duration in seconds
      outputPath: string;
    };
    
    // Reverse video playback
    reverse?: {
      outputPath: string;
    };
    
    // Create seamless loop
    createLoop?: {
      outputPath: string;
      smooth?: boolean; // Try to create smooth loop
    };
    
    // Batch process multiple videos
    batch?: {
      videos: Array<{ source: string | Buffer; operations: any }>; // Array of videos with their operations
      outputDirectory: string;
    };
    
    // Detect scene changes
    detectScenes?: {
      threshold?: number; // Scene change threshold (0-1)
      outputPath?: string; // Optional: save scene markers to file
    };
    
    // Stabilize video (reduce shake)
    stabilize?: {
      outputPath: string;
      smoothing?: number; // Smoothing factor (default: 10)
    };
    
    // Color correction
    colorCorrect?: {
      brightness?: number; // -100 to 100
      contrast?: number; // -100 to 100
      saturation?: number; // -100 to 100
      hue?: number; // -180 to 180
      temperature?: number; // Color temperature adjustment
      outputPath: string;
    };
    
    // Picture-in-picture
    pictureInPicture?: {
      overlayVideo: string | Buffer; // Overlay video source
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      size?: { width: number; height: number }; // Overlay size
      opacity?: number; // 0-1
      outputPath: string;
    };
    
    // Split screen (side-by-side or grid)
    splitScreen?: {
      videos: Array<string | Buffer>; // Array of videos
      layout?: 'side-by-side' | 'top-bottom' | 'grid'; // Layout type
      grid?: { cols: number; rows: number }; // For grid layout
      outputPath: string;
    };
    
    // Create time-lapse
    createTimeLapse?: {
      speed?: number; // Speed multiplier (default: 10x)
      outputPath: string;
    };
    
    // Mute/Unmute video
    mute?: {
      outputPath: string;
    };
    
    // Adjust audio volume
    adjustVolume?: {
      volume: number; // Volume multiplier (0.0 = mute, 1.0 = original, 2.0 = double)
      outputPath: string;
    };
    
    // Detect video format and codec
    detectFormat?: boolean; // Returns detailed format information
  }): Promise<any> {
    try {
      const ffmpegAvailable = await this.#checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        const errorMessage = 
          '❌ FFMPEG NOT FOUND\n' +
          'Video processing features require FFmpeg to be installed on your system.\n' +
          this.#getFFmpegInstallInstructions();
        throw new Error(errorMessage);
      }

      // Get video info if requested or needed
      let videoInfo: any = null;
      if (options.getInfo || options.extractFrame?.frame || options.generateThumbnail || options.generatePreview) {
        videoInfo = await this.getVideoInfo(options.source, true);
      }

      // Handle getInfo
      if (options.getInfo) {
        return videoInfo || await this.getVideoInfo(options.source, true);
      }

      // Handle extractFrame (creates canvas)
      if (options.extractFrame) {
        const frameBuffer = await this.#extractVideoFrame(
          options.source,
          options.extractFrame.frame ?? 0,
          options.extractFrame.time,
          options.extractFrame.outputFormat || 'png',
          options.extractFrame.quality || 2
        );

        if (!frameBuffer || frameBuffer.length === 0) {
          throw new Error('Failed to extract video frame');
        }

        const frameImage = await loadImage(frameBuffer);
        const videoWidth = frameImage.width;
        const videoHeight = frameImage.height;

        const width = options.extractFrame.width ?? videoWidth;
        const height = options.extractFrame.height ?? videoHeight;

        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d') as SKRSContext2D;
        if (!ctx) {
          throw new Error('Unable to get 2D context');
        }

        ctx.drawImage(frameImage, 0, 0, width, height);

        return {
          buffer: canvas.toBuffer('image/png'),
          canvas: { width, height }
        };
      }

      // Handle extractFrames (multiple frames at specific times or intervals)
      if (options.extractFrames) {
        if (options.extractFrames.times) {
          // Extract frames at specific times
          const frames: Buffer[] = [];
          for (const time of options.extractFrames.times) {
            const frame = await this.#extractVideoFrame(
              options.source,
              0,
              time,
              options.extractFrames.outputFormat || 'jpg',
              options.extractFrames.quality || 2
            );
            if (frame) {
              frames.push(frame);
            }
          }
          return frames;
        } else if (options.extractFrames.interval) {
          // Extract frames at intervals
          return await this.extractFrames(options.source, {
            interval: options.extractFrames.interval,
            outputFormat: options.extractFrames.outputFormat || 'jpg',
            frameSelection: options.extractFrames.frameSelection,
            outputDirectory: options.extractFrames.outputDirectory
          });
        }
      }

      // Handle extractAllFrames
      if (options.extractAllFrames) {
        return await this.extractAllFrames(options.source, {
          outputFormat: options.extractAllFrames.outputFormat,
          outputDirectory: options.extractAllFrames.outputDirectory,
          quality: options.extractAllFrames.quality,
          prefix: options.extractAllFrames.prefix,
          startTime: options.extractAllFrames.startTime,
          endTime: options.extractAllFrames.endTime
        });
      }

      // Handle generateThumbnail
      if (options.generateThumbnail) {
        return await this.#generateVideoThumbnail(options.source, options.generateThumbnail, videoInfo);
      }

      // Handle convert
      if (options.convert) {
        return await this.#convertVideo(options.source, options.convert);
      }

      // Handle trim
      if (options.trim) {
        return await this.#trimVideo(options.source, options.trim);
      }

      // Handle extractAudio
      if (options.extractAudio) {
        return await this.#extractAudio(options.source, options.extractAudio);
      }

      // Handle addWatermark
      if (options.addWatermark) {
        return await this.#addWatermarkToVideo(options.source, options.addWatermark);
      }

      // Handle changeSpeed
      if (options.changeSpeed) {
        return await this.#changeVideoSpeed(options.source, options.changeSpeed);
      }

      // Handle generatePreview
      if (options.generatePreview) {
        return await this.#generateVideoPreview(options.source, options.generatePreview, videoInfo);
      }

      // Handle applyEffects
      if (options.applyEffects) {
        return await this.#applyVideoEffects(options.source, options.applyEffects);
      }

      // Handle merge
      if (options.merge) {
        return await this.#mergeVideos(options.merge);
      }

      // Handle rotate
      if (options.rotate) {
        return await this.#rotateVideo(options.source, options.rotate);
      }

      // Handle crop
      if (options.crop) {
        return await this.#cropVideo(options.source, options.crop);
      }

      // Handle compress
      if (options.compress) {
        return await this.#compressVideo(options.source, options.compress);
      }

      // Handle addText
      if (options.addText) {
        return await this.#addTextToVideo(options.source, options.addText);
      }

      // Handle addFade
      if (options.addFade) {
        return await this.#addFadeToVideo(options.source, options.addFade);
      }

      // Handle reverse
      if (options.reverse) {
        return await this.#reverseVideo(options.source, options.reverse);
      }

      // Handle createLoop
      if (options.createLoop) {
        return await this.#createVideoLoop(options.source, options.createLoop);
      }

      // Handle batch
      if (options.batch) {
        return await this.#batchProcessVideos(options.batch);
      }

      // Handle detectScenes
      if (options.detectScenes) {
        return await this.#detectVideoScenes(options.source, options.detectScenes);
      }

      // Handle stabilize
      if (options.stabilize) {
        return await this.#stabilizeVideo(options.source, options.stabilize);
      }

      // Handle colorCorrect
      if (options.colorCorrect) {
        return await this.#colorCorrectVideo(options.source, options.colorCorrect);
      }

      // Handle pictureInPicture
      if (options.pictureInPicture) {
        return await this.#addPictureInPicture(options.source, options.pictureInPicture);
      }

      // Handle splitScreen
      if (options.splitScreen) {
        return await this.#createSplitScreen(options.splitScreen);
      }

      // Handle createTimeLapse
      if (options.createTimeLapse) {
        return await this.#createTimeLapseVideo(options.source, options.createTimeLapse);
      }

      // Handle mute
      if (options.mute) {
        return await this.#muteVideo(options.source, options.mute);
      }

      // Handle adjustVolume
      if (options.adjustVolume) {
        return await this.#adjustVideoVolume(options.source, options.adjustVolume);
      }

      // Handle detectFormat
      if (options.detectFormat) {
        const info = await this.getVideoInfo(options.source, true);
        // Try to get codec from ffprobe
        let codec = 'unknown';
        try {
          const frameDir = path.join(process.cwd(), '.temp-frames');
          let videoPath: string;
          if (Buffer.isBuffer(options.source)) {
            const tempPath = path.join(frameDir, `temp-video-${Date.now()}.mp4`);
            fs.writeFileSync(tempPath, options.source);
            videoPath = tempPath;
          } else {
            let resolvedPath = options.source;
            if (!/^https?:\/\//i.test(resolvedPath)) {
              resolvedPath = path.join(process.cwd(), resolvedPath);
            }
            videoPath = resolvedPath;
          }
          const escapedPath = videoPath.replace(/"/g, '\\"');
          const { stdout } = await execAsync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${escapedPath}"`,
            { timeout: 10000, maxBuffer: 1024 * 1024 }
          );
          codec = stdout.toString().trim() || 'unknown';
        } catch {
          codec = 'unknown';
        }
        
        return {
          format: info?.format || 'unknown',
          codec: codec,
          container: info?.format || 'unknown',
          width: info?.width,
          height: info?.height,
          fps: info?.fps,
          bitrate: info?.bitrate,
          duration: info?.duration
        };
      }

      throw new Error('No video operation specified');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`createVideo failed: ${errorMessage}`);
    }
  }

  /**
   * Generate video thumbnail (grid of frames)
   * @private
   */
  async #generateVideoThumbnail(
    videoSource: string | Buffer,
    options: {
      count?: number;
      grid?: { cols: number; rows: number };
      width?: number;
      height?: number;
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    },
    videoInfo: any
  ): Promise<CanvasResults> {
    const count = options.count || 9;
    const grid = options.grid || { cols: 3, rows: 3 };
    const frameWidth = options.width || 320;
    const frameHeight = options.height || 180;
    const outputFormat = options.outputFormat || 'jpg';
    const quality = options.quality || 2;

    if (!videoInfo) {
      videoInfo = await this.getVideoInfo(videoSource, true);
    }

    const duration = videoInfo.duration;
    const interval = duration / (count + 1); // Distribute frames evenly

    // Extract frames
    const frames: Buffer[] = [];
    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const frame = await this.#extractVideoFrame(videoSource, 0, time, outputFormat, quality);
      if (frame) {
        frames.push(frame);
      }
    }

    // Create thumbnail canvas
    const thumbnailWidth = frameWidth * grid.cols;
    const thumbnailHeight = frameHeight * grid.rows;
    const canvas = createCanvas(thumbnailWidth, thumbnailHeight);
    const ctx = canvas.getContext('2d') as SKRSContext2D;
    if (!ctx) {
      throw new Error('Unable to get 2D context');
    }

    // Draw frames in grid
    for (let i = 0; i < frames.length; i++) {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const x = col * frameWidth;
      const y = row * frameHeight;

      const frameImage = await loadImage(frames[i]);
      ctx.drawImage(frameImage, x, y, frameWidth, frameHeight);
    }

    return {
      buffer: canvas.toBuffer('image/png'),
      canvas: { width: thumbnailWidth, height: thumbnailHeight }
    };
  }

  /**
   * Convert video format
   * @private
   */
  async #convertVideo(
    videoSource: string | Buffer,
    options: {
      outputPath: string;
      format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      bitrate?: number;
      fps?: number;
      resolution?: { width: number; height: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    // Handle video source
    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const format = options.format || 'mp4';
    const qualityPresets: Record<string, string> = {
      low: '-crf 28',
      medium: '-crf 23',
      high: '-crf 18',
      ultra: '-crf 15'
    };
    const qualityFlag = options.bitrate 
      ? `-b:v ${options.bitrate}k` 
      : qualityPresets[options.quality || 'medium'];

    const fpsFlag = options.fps ? `-r ${options.fps}` : '';
    const resolutionFlag = options.resolution 
      ? `-vf scale=${options.resolution.width}:${options.resolution.height}` 
      : '';

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${qualityFlag} ${fpsFlag} ${resolutionFlag} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { 
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Trim/Cut video
   * @private
   */
  async #trimVideo(
    videoSource: string | Buffer,
    options: { startTime: number; endTime: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const duration = options.endTime - options.startTime;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -ss ${options.startTime} -t ${duration} -c copy -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { 
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Extract audio from video
   * @private
   */
  async #extractAudio(
    videoSource: string | Buffer,
    options: { outputPath: string; format?: 'mp3' | 'wav' | 'aac' | 'ogg'; bitrate?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    // Check if video has audio stream
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024 }
      );
      const hasAudio = stdout.toString().trim() === 'audio';
      if (!hasAudio) {
        throw new Error('Video does not contain an audio stream. Cannot extract audio.');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Video does not contain')) {
        throw error;
      }
      // If ffprobe fails, assume no audio
      throw new Error('Video does not contain an audio stream. Cannot extract audio.');
    }

    const format = options.format || 'mp3';
    const bitrate = options.bitrate || 128;
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vn -acodec ${format === 'mp3' ? 'libmp3lame' : format === 'wav' ? 'pcm_s16le' : format === 'aac' ? 'aac' : 'libvorbis'} -ab ${bitrate}k -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { 
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add watermark to video
   * @private
   */
  async #addWatermarkToVideo(
    videoSource: string | Buffer,
    options: {
      watermarkPath: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      opacity?: number;
      size?: { width: number; height: number };
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    let watermarkPath = options.watermarkPath;
    if (!/^https?:\/\//i.test(watermarkPath)) {
      watermarkPath = path.join(process.cwd(), watermarkPath);
    }
    if (!fs.existsSync(watermarkPath)) {
      throw new Error(`Watermark file not found: ${options.watermarkPath}`);
    }

    const position = options.position || 'bottom-right';
    const opacity = options.opacity || 0.5;
    const size = options.size ? `scale=${options.size.width}:${options.size.height}` : '';

    const positionMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'W-w-10:10',
      'bottom-left': '10:H-h-10',
      'bottom-right': 'W-w-10:H-h-10',
      'center': '(W-w)/2:(H-h)/2'
    };

    const overlay = positionMap[position];
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedWatermarkPath = watermarkPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const filter = `[1:v]${size ? size + ',' : ''}format=rgba,colorchannelmixer=aa=${opacity}[wm];[0:v][wm]overlay=${overlay}`;
    const command = `ffmpeg -i "${escapedVideoPath}" -i "${escapedWatermarkPath}" -filter_complex "${filter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { 
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Change video speed
   * @private
   */
  async #changeVideoSpeed(
    videoSource: string | Buffer,
    options: { speed: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    // Check if video has audio stream
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    let hasAudio = false;
    try {
      const { stdout } = await execAsync(
        `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${escapedVideoPath}"`,
        { timeout: 10000, maxBuffer: 1024 * 1024 }
      );
      hasAudio = stdout.toString().trim() === 'audio';
    } catch {
      hasAudio = false;
    }

    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
    let command: string;

    if (hasAudio) {
      // Video has audio - process both video and audio
      // For speeds > 2.0, we need to chain atempo filters (atempo max is 2.0)
      if (options.speed > 2.0) {
        const atempoCount = Math.ceil(Math.log2(options.speed));
        const atempoValue = Math.pow(2, Math.log2(options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else if (options.speed < 0.5) {
        // For speeds < 0.5, we need to chain atempo filters
        const atempoCount = Math.ceil(Math.log2(1 / options.speed));
        const atempoValue = Math.pow(0.5, Math.log2(1 / options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else {
        // Normal speed range (0.5 to 2.0)
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]atempo=${options.speed}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      }
    } else {
      // No audio - only process video
      command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v]" -map "[v]" -y "${escapedOutputPath}"`;
    }

    try {
      await execAsync(command, { 
        timeout: 300000,
        maxBuffer: 10 * 1024 * 1024
      });

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Generate video preview (multiple frames)
   * @private
   */
  async #generateVideoPreview(
    videoSource: string | Buffer,
    options: {
      count?: number;
      outputDirectory?: string;
      outputFormat?: 'jpg' | 'png';
      quality?: number;
    },
    videoInfo: any
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    const count = options.count || 10;
    const outputDir = options.outputDirectory || path.join(process.cwd(), 'video-preview');
    const outputFormat = options.outputFormat || 'png';
    const quality = options.quality || 2;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!videoInfo) {
      videoInfo = await this.getVideoInfo(videoSource, true);
    }

    const duration = videoInfo.duration;
    const interval = duration / (count + 1);

    const frames: Array<{ source: string; frameNumber: number; time: number }> = [];

    for (let i = 1; i <= count; i++) {
      const time = interval * i;
      const frameBuffer = await this.#extractVideoFrame(videoSource, 0, time, outputFormat, quality);
      
      if (frameBuffer) {
        const framePath = path.join(outputDir, `preview-${String(i).padStart(3, '0')}.${outputFormat}`);
        fs.writeFileSync(framePath, frameBuffer);
        frames.push({
          source: framePath,
          frameNumber: i,
          time: time
        });
      }
    }

    return frames;
  }

  /**
   * Apply video effects/filters
   * @private
   */
  async #applyVideoEffects(
    videoSource: string | Buffer,
    options: {
      filters: Array<{
        type: 'blur' | 'brightness' | 'contrast' | 'saturation' | 'grayscale' | 'sepia' | 'invert' | 'sharpen' | 'noise';
        intensity?: number;
        value?: number;
      }>;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    // Build filter chain
    const filters: string[] = [];
    for (const filter of options.filters) {
      switch (filter.type) {
        case 'blur':
          filters.push(`boxblur=${filter.intensity || 5}`);
          break;
        case 'brightness':
          filters.push(`eq=brightness=${((filter.value || 0) / 100).toFixed(2)}`);
          break;
        case 'contrast':
          filters.push(`eq=contrast=${1 + ((filter.value || 0) / 100)}`);
          break;
        case 'saturation':
          filters.push(`eq=saturation=${1 + ((filter.value || 0) / 100)}`);
          break;
        case 'grayscale':
          filters.push('hue=s=0');
          break;
        case 'sepia':
          filters.push('colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131');
          break;
        case 'invert':
          filters.push('negate');
          break;
        case 'sharpen':
          filters.push(`unsharp=5:5:${filter.intensity || 1.0}:5:5:0.0`);
          break;
        case 'noise':
          filters.push(`noise=alls=${filter.intensity || 20}:allf=t+u`);
          break;
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Merge/Concatenate videos
   * @private
   */
  async #mergeVideos(
    options: {
      videos: Array<string | Buffer>;
      outputPath: string;
      mode?: 'sequential' | 'side-by-side' | 'grid';
      grid?: { cols: number; rows: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const videoPaths: string[] = [];
    const shouldCleanup: boolean[] = [];

    // Prepare all video files
    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      if (Buffer.isBuffer(video)) {
        const tempPath = path.join(frameDir, `temp-video-${timestamp}-${i}.mp4`);
        fs.writeFileSync(tempPath, video);
        videoPaths.push(tempPath);
        shouldCleanup.push(true);
      } else {
        let resolvedPath = video;
        if (!/^https?:\/\//i.test(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found: ${video}`);
        }
        videoPaths.push(resolvedPath);
        shouldCleanup.push(false);
      }
    }

    const mode = options.mode || 'sequential';
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    let command: string;

    if (mode === 'sequential') {
      // Create concat file
      const concatFile = path.join(frameDir, `concat-${timestamp}.txt`);
      const concatContent = videoPaths.map(vp => `file '${vp.replace(/'/g, "\\'")}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      command = `ffmpeg -f concat -safe 0 -i "${concatFile.replace(/"/g, '\\"')}" -c copy -y "${escapedOutputPath}"`;
    } else if (mode === 'side-by-side') {
      const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1] || escapedPaths[0]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (mode === 'grid') {
      const grid = options.grid || { cols: 2, rows: 2 };
      const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));
      // Simplified grid - would need more complex filter for full grid
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1] || escapedPaths[0]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else {
      throw new Error(`Unknown merge mode: ${mode}`);
    }

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      
      // Cleanup
      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      // Cleanup on error
      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      throw error;
    }
  }

  /**
   * Rotate/Flip video
   * @private
   */
  async #rotateVideo(
    videoSource: string | Buffer,
    options: { angle?: 90 | 180 | 270; flip?: 'horizontal' | 'vertical' | 'both'; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const filters: string[] = [];
    
    if (options.angle) {
      const rotationMap: Record<number, string> = {
        90: 'transpose=1',
        180: 'transpose=1,transpose=1',
        270: 'transpose=2'
      };
      filters.push(rotationMap[options.angle]);
    }
    
    if (options.flip) {
      if (options.flip === 'horizontal') {
        filters.push('hflip');
      } else if (options.flip === 'vertical') {
        filters.push('vflip');
      } else if (options.flip === 'both') {
        filters.push('hflip', 'vflip');
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Crop video
   * @private
   */
  async #cropVideo(
    videoSource: string | Buffer,
    options: { x: number; y: number; width: number; height: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "crop=${options.width}:${options.height}:${options.x}:${options.y}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Compress/Optimize video
   * @private
   */
  async #compressVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; quality?: 'low' | 'medium' | 'high' | 'ultra'; targetSize?: number; maxBitrate?: number }
  ): Promise<{ outputPath: string; success: boolean; originalSize?: number; compressedSize?: number }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();
    let originalSize = 0;

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
      originalSize = videoSource.length;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
      originalSize = fs.statSync(resolvedPath).size;
    }

    const qualityPresets: Record<string, string> = {
      low: '-crf 32 -preset fast',
      medium: '-crf 28 -preset medium',
      high: '-crf 23 -preset slow',
      ultra: '-crf 18 -preset veryslow'
    };

    let qualityFlag = qualityPresets[options.quality || 'medium'];
    
    if (options.maxBitrate) {
      qualityFlag = `-b:v ${options.maxBitrate}k -maxrate ${options.maxBitrate}k -bufsize ${options.maxBitrate * 2}k`;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${qualityFlag} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      
      const compressedSize = fs.existsSync(options.outputPath) ? fs.statSync(options.outputPath).size : 0;
      
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      return {
        outputPath: options.outputPath,
        success: true,
        originalSize,
        compressedSize
      };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add text overlay to video
   * @private
   */
  async #addTextToVideo(
    videoSource: string | Buffer,
    options: {
      text: string;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center' | 'top-center' | 'bottom-center';
      fontSize?: number;
      fontColor?: string;
      backgroundColor?: string;
      startTime?: number;
      endTime?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const position = options.position || 'bottom-center';
    const fontSize = options.fontSize || 24;
    const fontColor = options.fontColor || 'white';
    const bgColor = options.backgroundColor || 'black@0.5';
    
    const positionMap: Record<string, string> = {
      'top-left': `x=10:y=10`,
      'top-center': `x=(w-text_w)/2:y=10`,
      'top-right': `x=w-text_w-10:y=10`,
      'center': `x=(w-text_w)/2:y=(h-text_h)/2`,
      'bottom-left': `x=10:y=h-text_h-10`,
      'bottom-center': `x=(w-text_w)/2:y=h-text_h-10`,
      'bottom-right': `x=w-text_w-10:y=h-text_h-10`
    };

    const pos = positionMap[position];
    const textEscaped = options.text.replace(/:/g, '\\:').replace(/'/g, "\\'");
    const timeFilter = options.startTime !== undefined && options.endTime !== undefined
      ? `:enable='between(t,${options.startTime},${options.endTime})'`
      : '';

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf "drawtext=text='${textEscaped}':fontsize=${fontSize}:fontcolor=${fontColor}:box=1:boxcolor=${bgColor}:${pos}${timeFilter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add fade effects to video
   * @private
   */
  async #addFadeToVideo(
    videoSource: string | Buffer,
    options: { fadeIn?: number; fadeOut?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const videoInfo = await this.getVideoInfo(videoPath, true);
    const duration = videoInfo?.duration || 0;

    const filters: string[] = [];
    
    if (options.fadeIn) {
      filters.push(`fade=t=in:st=0:d=${options.fadeIn}`);
    }
    
    if (options.fadeOut && duration > options.fadeOut) {
      filters.push(`fade=t=out:st=${duration - options.fadeOut}:d=${options.fadeOut}`);
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Reverse video playback
   * @private
   */
  async #reverseVideo(
    videoSource: string | Buffer,
    options: { outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -vf reverse -af areverse -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Create seamless video loop
   * @private
   */
  async #createVideoLoop(
    videoSource: string | Buffer,
    options: { outputPath: string; smooth?: boolean }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    // Create loop by concatenating video with itself
    const concatFile = path.join(frameDir, `loop-${timestamp}.txt`);
    const concatContent = `file '${videoPath.replace(/'/g, "\\'")}'\nfile '${videoPath.replace(/'/g, "\\'")}'`;
    fs.writeFileSync(concatFile, concatContent);

    const command = `ffmpeg -f concat -safe 0 -i "${concatFile.replace(/"/g, '\\"')}" -c copy -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      
      if (fs.existsSync(concatFile)) {
        fs.unlinkSync(concatFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (fs.existsSync(concatFile)) {
        fs.unlinkSync(concatFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Batch process multiple videos
   * @private
   */
  async #batchProcessVideos(
    options: { videos: Array<{ source: string | Buffer; operations: any }>; outputDirectory: string }
  ): Promise<Array<{ source: string; output: string; success: boolean }>> {
    if (!fs.existsSync(options.outputDirectory)) {
      fs.mkdirSync(options.outputDirectory, { recursive: true });
    }

    const results: Array<{ source: string; output: string; success: boolean }> = [];

    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      const outputPath = path.join(options.outputDirectory, `batch-${i + 1}.mp4`);
      
      try {
        // Process each video with its operations
        await this.createVideo({
          source: video.source,
          ...video.operations
        });
        
        results.push({
          source: typeof video.source === 'string' ? video.source : 'buffer',
          output: outputPath,
          success: true
        });
      } catch (error) {
        results.push({
          source: typeof video.source === 'string' ? video.source : 'buffer',
          output: outputPath,
          success: false
        });
      }
    }

    return results;
  }

  /**
   * Detect scene changes in video
   * @private
   */
  async #detectVideoScenes(
    videoSource: string | Buffer,
    options: { threshold?: number; outputPath?: string }
  ): Promise<Array<{ time: number; scene: number }>> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const threshold = options.threshold || 0.3;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const sceneFile = path.join(frameDir, `scenes-${timestamp}.txt`);

    // Use FFmpeg's scene detection
    const command = `ffmpeg -i "${escapedVideoPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null - 2>&1 | grep "pts_time" | awk '{print $6}' | sed 's/time=//'`;

    try {
      const { stdout } = await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      const times = stdout.toString().trim().split('\n').filter(t => t).map(parseFloat);
      
      const scenes = times.map((time, index) => ({ time, scene: index + 1 }));

      if (options.outputPath && scenes.length > 0) {
        fs.writeFileSync(options.outputPath, JSON.stringify(scenes, null, 2));
      }

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (fs.existsSync(sceneFile)) {
        fs.unlinkSync(sceneFile);
      }

      return scenes;
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (fs.existsSync(sceneFile)) {
        fs.unlinkSync(sceneFile);
      }
      // Return empty array if detection fails
      return [];
    }
  }

  /**
   * Stabilize video (reduce shake)
   * @private
   */
  async #stabilizeVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; smoothing?: number }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const smoothing = options.smoothing || 10;
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    // Two-pass stabilization
    const transformsFile = path.join(frameDir, `transforms-${timestamp}.trf`);
    
    // Pass 1: Analyze
    const analyzeCommand = `ffmpeg -i "${escapedVideoPath}" -vf vidstabdetect=shakiness=5:accuracy=15:result="${transformsFile.replace(/"/g, '\\"')}" -f null -`;
    
    // Pass 2: Transform
    const transformCommand = `ffmpeg -i "${escapedVideoPath}" -vf vidstabtransform=smoothing=${smoothing}:input="${transformsFile.replace(/"/g, '\\"')}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(analyzeCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      await execAsync(transformCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      
      if (fs.existsSync(transformsFile)) {
        fs.unlinkSync(transformsFile);
      }
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      // Fallback to simple deshake if vidstab is not available
      const simpleCommand = `ffmpeg -i "${escapedVideoPath}" -vf "hqdn3d=4:3:6:4.5" -y "${escapedOutputPath}"`;
      try {
        await execAsync(simpleCommand, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        return { outputPath: options.outputPath, success: true };
      } catch (fallbackError) {
        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        throw error;
      }
    }
  }

  /**
   * Color correct video
   * @private
   */
  async #colorCorrectVideo(
    videoSource: string | Buffer,
    options: {
      brightness?: number;
      contrast?: number;
      saturation?: number;
      hue?: number;
      temperature?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const filters: string[] = [];
    
    if (options.brightness !== undefined) {
      filters.push(`eq=brightness=${(options.brightness / 100).toFixed(2)}`);
    }
    if (options.contrast !== undefined) {
      filters.push(`eq=contrast=${1 + (options.contrast / 100)}`);
    }
    if (options.saturation !== undefined) {
      filters.push(`eq=saturation=${1 + (options.saturation / 100)}`);
    }
    if (options.hue !== undefined) {
      filters.push(`hue=h=${options.hue}`);
    }
    if (options.temperature !== undefined) {
      // Temperature adjustment using colorbalance
      const temp = options.temperature;
      if (temp > 0) {
        filters.push(`colorbalance=rs=${temp/100}:gs=-${temp/200}:bs=-${temp/100}`);
      } else {
        filters.push(`colorbalance=rs=${temp/100}:gs=${-temp/200}:bs=${-temp/100}`);
      }
    }

    const filterChain = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" ${filterChain} -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Add picture-in-picture
   * @private
   */
  async #addPictureInPicture(
    videoSource: string | Buffer,
    options: {
      overlayVideo: string | Buffer;
      position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
      size?: { width: number; height: number };
      opacity?: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let overlayPath: string;
    let shouldCleanupVideo = false;
    let shouldCleanupOverlay = false;
    const timestamp = Date.now();

    // Handle main video
    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    // Handle overlay video
    if (Buffer.isBuffer(options.overlayVideo)) {
      overlayPath = path.join(frameDir, `temp-overlay-${timestamp}.mp4`);
      fs.writeFileSync(overlayPath, options.overlayVideo);
      shouldCleanupOverlay = true;
    } else {
      let resolvedPath = options.overlayVideo;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Overlay video file not found: ${options.overlayVideo}`);
      }
      overlayPath = resolvedPath;
    }

    const position = options.position || 'bottom-right';
    const size = options.size || { width: 320, height: 180 };
    const opacity = options.opacity || 1.0;

    const positionMap: Record<string, string> = {
      'top-left': '10:10',
      'top-right': 'W-w-10:10',
      'bottom-left': '10:H-h-10',
      'bottom-right': 'W-w-10:H-h-10',
      'center': '(W-w)/2:(H-h)/2'
    };

    const overlay = positionMap[position];
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOverlayPath = overlayPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const filter = `[1:v]scale=${size.width}:${size.height},format=rgba,colorchannelmixer=aa=${opacity}[overlay];[0:v][overlay]overlay=${overlay}`;
    const command = `ffmpeg -i "${escapedVideoPath}" -i "${escapedOverlayPath}" -filter_complex "${filter}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (shouldCleanupOverlay && fs.existsSync(overlayPath)) {
        fs.unlinkSync(overlayPath);
      }
      
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      if (shouldCleanupOverlay && fs.existsSync(overlayPath)) {
        fs.unlinkSync(overlayPath);
      }
      throw error;
    }
  }

  /**
   * Create split screen video
   * @private
   */
  async #createSplitScreen(
    options: {
      videos: Array<string | Buffer>;
      layout?: 'side-by-side' | 'top-bottom' | 'grid';
      grid?: { cols: number; rows: number };
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const videoPaths: string[] = [];
    const shouldCleanup: boolean[] = [];

    // Prepare all video files
    for (let i = 0; i < options.videos.length; i++) {
      const video = options.videos[i];
      if (Buffer.isBuffer(video)) {
        const tempPath = path.join(frameDir, `temp-video-${timestamp}-${i}.mp4`);
        fs.writeFileSync(tempPath, video);
        videoPaths.push(tempPath);
        shouldCleanup.push(true);
      } else {
        let resolvedPath = video;
        if (!/^https?:\/\//i.test(resolvedPath)) {
          resolvedPath = path.join(process.cwd(), resolvedPath);
        }
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`Video file not found: ${video}`);
        }
        videoPaths.push(resolvedPath);
        shouldCleanup.push(false);
      }
    }

    const layout = options.layout || 'side-by-side';
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
    const escapedPaths = videoPaths.map(vp => vp.replace(/"/g, '\\"'));

    let command: string;

    if (layout === 'side-by-side' && videoPaths.length >= 2) {
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (layout === 'top-bottom' && videoPaths.length >= 2) {
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -filter_complex "[0:v][1:v]vstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else if (layout === 'grid' && videoPaths.length >= 4) {
      const grid = options.grid || { cols: 2, rows: 2 };
      // Simplified 2x2 grid
      command = `ffmpeg -i "${escapedPaths[0]}" -i "${escapedPaths[1]}" -i "${escapedPaths[2]}" -i "${escapedPaths[3]}" -filter_complex "[0:v][1:v]hstack=inputs=2[top];[2:v][3:v]hstack=inputs=2[bottom];[top][bottom]vstack=inputs=2[v]" -map "[v]" -y "${escapedOutputPath}"`;
    } else {
      throw new Error(`Invalid layout or insufficient videos for ${layout}`);
    }

    try {
      await execAsync(command, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });
      
      // Cleanup
      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      // Cleanup on error
      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      throw error;
    }
  }

  /**
   * Create time-lapse video
   * @private
   */
  async #createTimeLapseVideo(
    videoSource: string | Buffer,
    options: { speed?: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const speed = options.speed || 10;
    // Time-lapse is essentially speeding up the video
    return await this.#changeVideoSpeed(videoSource, { speed, outputPath: options.outputPath });
  }

  /**
   * Mute video (remove audio)
   * @private
   */
  async #muteVideo(
    videoSource: string | Buffer,
    options: { outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -c copy -an -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Adjust video volume
   * @private
   */
  async #adjustVideoVolume(
    videoSource: string | Buffer,
    options: { volume: number; outputPath: string }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    let videoPath: string;
    let shouldCleanupVideo = false;
    const timestamp = Date.now();

    if (Buffer.isBuffer(videoSource)) {
      videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
      fs.writeFileSync(videoPath, videoSource);
      shouldCleanupVideo = true;
    } else {
      let resolvedPath = videoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Video file not found: ${videoSource}`);
      }
      videoPath = resolvedPath;
    }

    const volume = Math.max(0, Math.min(10, options.volume)); // Clamp between 0 and 10
    const escapedVideoPath = videoPath.replace(/"/g, '\\"');
    const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

    const command = `ffmpeg -i "${escapedVideoPath}" -af "volume=${volume}" -y "${escapedOutputPath}"`;

    try {
      await execAsync(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      return { outputPath: options.outputPath, success: true };
    } catch (error) {
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }
      throw error;
    }
  }

  /**
   * Extracts a frame at a specific time in seconds
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param timeSeconds - Time in seconds
   * @param outputFormat - Output format ('jpg' or 'png', default: 'jpg')
   * @param quality - JPEG quality 1-31 (lower = better, default: 2)
   * @returns Buffer containing the frame image
   */
  async extractFrameAtTime(
    videoSource: string | Buffer,
    timeSeconds: number,
    outputFormat: 'jpg' | 'png' = 'jpg',
    quality: number = 2
  ): Promise<Buffer | null> {
    return this.#extractVideoFrame(videoSource, 0, timeSeconds, outputFormat, quality);
  }

  /**
   * Extracts a frame by frame number (converts to time using video FPS)
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param frameNumber - Frame number to extract (1-based: frame 1 = first frame)
   * @param outputFormat - Output format ('jpg' or 'png', default: 'jpg')
   * @param quality - JPEG quality 1-31 (lower = better, default: 2)
   * @returns Buffer containing the frame image
   */
  async extractFrameByNumber(
    videoSource: string | Buffer,
    frameNumber: number,
    outputFormat: 'jpg' | 'png' = 'jpg',
    quality: number = 2
  ): Promise<Buffer | null> {
    // Get video info to convert frame number to time
    const videoInfo = await this.getVideoInfo(videoSource, true);
    if (!videoInfo || videoInfo.fps <= 0) {
      throw new Error('Could not get video FPS to convert frame number to time');
    }
    
    // Convert frame number to time (frame 1 = 0 seconds, frame 2 = 1/fps, etc.)
    // For 1-based frame numbers: frame 1 = time 0, frame 2 = time 1/fps
    const timeSeconds = (frameNumber - 1) / videoInfo.fps;
    
    return this.#extractVideoFrame(videoSource, frameNumber - 1, timeSeconds, outputFormat, quality);
  }

  /**
   * Extracts multiple frames at specific times
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param times - Array of times in seconds
   * @param outputFormat - Output format ('jpg' or 'png', default: 'jpg')
   * @param quality - JPEG quality 1-31 (lower = better, default: 2)
   * @returns Array of buffers containing frame images
   */
  async extractMultipleFrames(
    videoSource: string | Buffer,
    times: number[],
    outputFormat: 'jpg' | 'png' = 'jpg',
    quality: number = 2
  ): Promise<Buffer[]> {
    const frames: Buffer[] = [];
    for (const time of times) {
      const frame = await this.extractFrameAtTime(videoSource, time, outputFormat, quality);
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  }

  /**
   * Extracts ALL frames from a video and saves them as image files
   * @param videoSource - Video source (path, URL, or Buffer)
   * @param options - Extraction options
   * @returns Array of frame file paths
   */
  async extractAllFrames(
    videoSource: string | Buffer,
    options?: {
      outputFormat?: 'jpg' | 'png';
      outputDirectory?: string;
      quality?: number; // JPEG quality 1-31 (lower = better, default: 2)
      prefix?: string; // Filename prefix (default: 'frame')
      startTime?: number; // Start time in seconds (default: 0)
      endTime?: number; // End time in seconds (default: video duration)
    }
  ): Promise<Array<{ source: string; frameNumber: number; time: number }>> {
    try {
      const ffmpegAvailable = await this.#checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        const errorMessage = 
          '❌ FFMPEG NOT FOUND\n' +
          'Video processing features require FFmpeg to be installed on your system.\n' +
          this.#getFFmpegInstallInstructions();
        
        throw new Error(errorMessage);
      }

      // Get video info first
      const videoInfo = await this.getVideoInfo(videoSource, true);
      if (!videoInfo) {
        throw new Error('Could not get video information');
      }

      const outputFormat = options?.outputFormat || 'png';
      const outputDir = options?.outputDirectory || path.join(process.cwd(), 'extracted-frames');
      const prefix = options?.prefix || 'frame';
      const quality = options?.quality || 2;

      // Create output directory
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const frameDir = path.join(process.cwd(), '.temp-frames');
      if (!fs.existsSync(frameDir)) {
        fs.mkdirSync(frameDir, { recursive: true });
      }

      const timestamp = Date.now();
      let videoPath: string;
      let shouldCleanupVideo = false;

      // Handle video source
      if (Buffer.isBuffer(videoSource)) {
        videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
        fs.writeFileSync(videoPath, videoSource);
        shouldCleanupVideo = true;
      } else if (typeof videoSource === 'string' && videoSource.startsWith('http')) {
        const response = await axios({
          method: 'get',
          url: videoSource,
          responseType: 'arraybuffer'
        });
        videoPath = path.join(frameDir, `temp-video-${timestamp}.mp4`);
        fs.writeFileSync(videoPath, Buffer.from(response.data));
        shouldCleanupVideo = true;
      } else {
        if (!fs.existsSync(videoSource)) {
          throw new Error(`Video file not found: ${videoSource}`);
        }
        videoPath = videoSource;
      }

      // Calculate time range
      const startTime = options?.startTime ?? 0;
      const endTime = options?.endTime ?? videoInfo.duration;
      const duration = endTime - startTime;

      // Extract all frames using ffmpeg
      // Use -fps_mode passthrough to extract every frame (no frame skipping)
      // Don't use -f flag, let FFmpeg infer format from file extension
      const qualityFlag = outputFormat === 'jpg' ? `-q:v ${quality}` : '';
      const pixFmt = outputFormat === 'png' ? '-pix_fmt rgba' : '-pix_fmt rgb24';
      const outputTemplate = path.join(outputDir, `${prefix}-%06d.${outputFormat}`);
      
      const escapedVideoPath = videoPath.replace(/"/g, '\\"');
      const escapedOutputTemplate = outputTemplate.replace(/"/g, '\\"');

      // Use -fps_mode passthrough instead of deprecated -vsync 0
      // Use -ss after -i for more accurate frame extraction
      const command = `ffmpeg -i "${escapedVideoPath}" -ss ${startTime} -t ${duration} -fps_mode passthrough ${pixFmt} ${qualityFlag} -y "${escapedOutputTemplate}"`;

      await execAsync(command, { 
        timeout: 300000, // 5 minute timeout for large videos
        maxBuffer: 10 * 1024 * 1024
      });

      // Collect all extracted frame files
      const frames: Array<{ source: string; frameNumber: number; time: number }> = [];
      let frameIndex = 0;
      let currentTime = startTime;

      while (true) {
        const frameNumber = frameIndex + 1;
        const framePath = path.join(outputDir, `${prefix}-${String(frameNumber).padStart(6, '0')}.${outputFormat}`);
        
        if (fs.existsSync(framePath)) {
          frames.push({
            source: framePath,
            frameNumber: frameIndex,
            time: currentTime
          });
          currentTime += 1 / videoInfo.fps; // Increment by frame duration
          frameIndex++;
        } else {
          break; // No more frames
        }
      }

      // Cleanup temp video if created
      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      console.log(`✅ Extracted ${frames.length} frames from video`);
      return frames;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      if (errorMessage.includes('FFMPEG NOT FOUND') || errorMessage.includes('FFmpeg')) {
        throw error;
      }
      throw new Error(`extractAllFrames failed: ${errorMessage}`);
    }
  }




  
  
  


  /**
   * Validates masking inputs.
   * @private
   * @param source - Source image to validate
   * @param maskSource - Mask image to validate
   * @param options - Mask options to validate
   */
  #validateMaskingInputs(
    source: string | Buffer | PathLike | Uint8Array,
    maskSource: string | Buffer | PathLike | Uint8Array,
    options: MaskOptions
  ): void {
    if (!source) {
      throw new Error("masking: source is required.");
    }
    if (!maskSource) {
      throw new Error("masking: maskSource is required.");
    }
    if (options.type && !['alpha', 'grayscale', 'color'].includes(options.type)) {
      throw new Error("masking: type must be 'alpha', 'grayscale', or 'color'.");
    }
    if (options.type === 'color' && !options.colorKey) {
      throw new Error("masking: colorKey is required when type is 'color'.");
    }
    if (options.threshold !== undefined && (typeof options.threshold !== 'number' || options.threshold < 0 || options.threshold > 255)) {
      throw new Error("masking: threshold must be a number between 0 and 255.");
    }
  }

  async masking(
    source: string | Buffer | PathLike | Uint8Array, 
    maskSource: string | Buffer | PathLike | Uint8Array, 
    options: MaskOptions = { type: "alpha" }
  ): Promise<Buffer> {
    try {
      this.#validateMaskingInputs(source, maskSource, options);
      
      const img = await loadImage(source);
      const mask = await loadImage(maskSource);

  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext("2d") as SKRSContext2D;

  ctx.drawImage(img, 0, 0, img.width, img.height);

  const maskCanvas = createCanvas(img.width, img.height);
  const maskCtx = maskCanvas.getContext("2d") as SKRSContext2D;
  maskCtx.drawImage(mask, 0, 0, img.width, img.height);

  const maskData = maskCtx.getImageData(0, 0, img.width, img.height);
  const imgData = ctx.getImageData(0, 0, img.width, img.height);

  for (let i = 0; i < maskData.data.length; i += 4) {
      let alphaValue = 255;

      if (options.type === "grayscale") {
          const grayscale = maskData.data[i] * 0.3 + maskData.data[i + 1] * 0.59 + maskData.data[i + 2] * 0.11;
          alphaValue = grayscale >= (options.threshold ?? 128) ? 255 : 0;
      } else if (options.type === "alpha") {
          alphaValue = maskData.data[i + 3];
      } else if (options.type === "color" && options.colorKey) {
          const colorMatch =
              maskData.data[i] === parseInt(options.colorKey.slice(1, 3), 16) &&
              maskData.data[i + 1] === parseInt(options.colorKey.slice(3, 5), 16) &&
              maskData.data[i + 2] === parseInt(options.colorKey.slice(5, 7), 16);
          alphaValue = colorMatch ? 0 : 255;
      }

      if (options.invert) alphaValue = 255 - alphaValue;

        imgData.data[i + 3] = alphaValue;
      }

      ctx.putImageData(imgData, 0, 0);

      return canvas.toBuffer("image/png");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`masking failed: ${errorMessage}`);
    }
  }

  /**
   * Validates gradient blend inputs.
   * @private
   * @param source - Source image to validate
   * @param options - Blend options to validate
   */
  #validateGradientBlendInputs(source: string | Buffer | PathLike | Uint8Array, options: BlendOptions): void {
    if (!source) {
      throw new Error("gradientBlend: source is required.");
    }
    if (!options || typeof options !== 'object') {
      throw new Error("gradientBlend: options object is required.");
    }
    if (!options.colors || !Array.isArray(options.colors) || options.colors.length === 0) {
      throw new Error("gradientBlend: options.colors array with at least one color stop is required.");
    }
    if (options.type && !['linear', 'radial', 'conic'].includes(options.type)) {
      throw new Error("gradientBlend: type must be 'linear', 'radial', or 'conic'.");
    }
    for (const colorStop of options.colors) {
      if (typeof colorStop.stop !== 'number' || colorStop.stop < 0 || colorStop.stop > 1) {
        throw new Error("gradientBlend: Each color stop must have a stop value between 0 and 1.");
      }
      if (!colorStop.color || typeof colorStop.color !== 'string') {
        throw new Error("gradientBlend: Each color stop must have a valid color string.");
      }
    }
  }

  async gradientBlend(
    source: string | Buffer | PathLike | Uint8Array, 
    options: BlendOptions
  ): Promise<Buffer> {
    try {
      this.#validateGradientBlendInputs(source, options);
      
      const img = await loadImage(source);
      const canvas = createCanvas(img.width, img.height);
      const ctx = canvas.getContext("2d") as SKRSContext2D;
      if (!ctx) throw new Error("Unable to get 2D context");

  ctx.drawImage(img, 0, 0, img.width, img.height);

  let gradient: CanvasGradient;
  if (options.type === "linear") {
      const angle = options.angle ?? 0;
      const radians = (angle * Math.PI) / 180;
      const x1 = img.width / 2 - (Math.cos(radians) * img.width) / 2;
      const y1 = img.height / 2 - (Math.sin(radians) * img.height) / 2;
      const x2 = img.width / 2 + (Math.cos(radians) * img.width) / 2;
      const y2 = img.height / 2 + (Math.sin(radians) * img.height) / 2;
      gradient = ctx.createLinearGradient(x1, y1, x2, y2);
  } else if (options.type === "radial") {
      gradient = ctx.createRadialGradient(
          img.width / 2, img.height / 2, 0, img.width / 2, img.height / 2, Math.max(img.width, img.height)
      );
  } else {
      gradient = ctx.createConicGradient(Math.PI, img.width / 2, img.height / 2);
  }

  options.colors.forEach(({ stop, color }: any) => gradient.addColorStop(stop, color));
  ctx.fillStyle = gradient;

  ctx.globalCompositeOperation = options.blendMode ?? "multiply";
  ctx.fillRect(0, 0, img.width, img.height);

  if (options.maskSource) {
      const mask = await loadImage(options.maskSource);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(mask, 0, 0, img.width, img.height);
  }

      ctx.globalCompositeOperation = "source-over";

      return canvas.toBuffer("image/png");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`gradientBlend failed: ${errorMessage}`);
    }
  }

  /**
   * Validates animate inputs.
   * @private
   * @param frames - Animation frames to validate
   * @param defaultDuration - Default duration to validate
   * @param defaultWidth - Default width to validate
   * @param defaultHeight - Default height to validate
   * @param options - Animation options to validate
   */
  #validateAnimateInputs(
    frames: Frame[],
    defaultDuration: number,
    defaultWidth: number,
    defaultHeight: number,
    options?: { gif?: boolean; gifPath?: string; onStart?: () => void; onFrame?: (index: number) => void; onEnd?: () => void }
  ): void {
    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      throw new Error("animate: frames array with at least one frame is required.");
    }
    if (typeof defaultDuration !== 'number' || defaultDuration < 0) {
      throw new Error("animate: defaultDuration must be a non-negative number.");
    }
    if (typeof defaultWidth !== 'number' || defaultWidth <= 0) {
      throw new Error("animate: defaultWidth must be a positive number.");
    }
    if (typeof defaultHeight !== 'number' || defaultHeight <= 0) {
      throw new Error("animate: defaultHeight must be a positive number.");
    }
    if (options?.gif && !options.gifPath) {
      throw new Error("animate: gifPath is required when gif is enabled.");
    }
  }

  async animate(
    frames: Frame[],
    defaultDuration: number, 
    defaultWidth: number = 800,
    defaultHeight: number = 600, 
    options?: {
      gif?: boolean;  
      gifPath?: string;  
      onStart?: () => void;
      onFrame?: (index: number) => void;
      onEnd?: () => void;
    }
  ): Promise<Buffer[] | undefined> {
    try {
      this.#validateAnimateInputs(frames, defaultDuration, defaultWidth, defaultHeight, options);
      
      const buffers: Buffer[] = [];
      const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

      if (options?.onStart) options.onStart();

      let encoder: GIFEncoder | null = null;
      let gifStream: fs.WriteStream | null = null;

      if (options?.gif) {
        if (!options.gifPath) {
          throw new Error("animate: gifPath is required when gif is enabled.");
        }
        encoder = new GIFEncoder(defaultWidth, defaultHeight);
        gifStream = fs.createWriteStream(options.gifPath);
      encoder.createReadStream().pipe(gifStream);
      encoder.start();
      encoder.setRepeat(0); 
      encoder.setQuality(10); 
  }

  for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];

      const width = frame.width || defaultWidth;
      const height = frame.height || defaultHeight;
      const canvas = createCanvas(width, height);
      const ctx: SKRSContext2D = canvas.getContext('2d');

      if (!isNode) {
          canvas.width = width;
          canvas.height = height;
          document.body.appendChild(canvas as unknown as Node);
      }

      ctx.clearRect(0, 0, width, height);

      if (frame.transformations) {
          const { scaleX = 1, scaleY = 1, rotate = 0, translateX = 0, translateY = 0 } = frame.transformations;
          ctx.save(); 
          ctx.translate(translateX, translateY);
          ctx.rotate((rotate * Math.PI) / 180);
          ctx.scale(scaleX, scaleY);
      }

      let fillStyle: string | CanvasGradient | CanvasPattern | null = null;

      if (frame.gradient) {
          const { type, startX, startY, endX, endY, startRadius, endRadius, colors } = frame.gradient;
          let gradient: CanvasGradient | null = null;

          if (type === 'linear') {
              gradient = ctx.createLinearGradient(startX || 0, startY || 0, endX || width, endY || height);
          } else if (type === 'radial') {
              gradient = ctx.createRadialGradient(
                  startX || width / 2,
                  startY || height / 2,
                  startRadius || 0,
                  endX || width / 2,
                  endY || height / 2,
                  endRadius || Math.max(width, height)
              );
          }

          colors.forEach((colorStop: any) => {
              if (gradient) gradient.addColorStop(colorStop.stop, colorStop.color);
          });

          fillStyle = gradient;
      }

      if (frame.pattern) {
          const patternImage = await loadImage(frame.pattern.source);
          const pattern = ctx.createPattern(patternImage, frame.pattern.repeat || 'repeat');
          fillStyle = pattern;
      }

      if (!fillStyle && frame.backgroundColor) {
          fillStyle = frame.backgroundColor;
      }

      if (fillStyle) {
          ctx.fillStyle = fillStyle;
          ctx.fillRect(0, 0, width, height);
      }

      if (frame.source) {
          const image = await loadImage(frame.source);
          ctx.globalCompositeOperation = frame.blendMode || 'source-over';
          ctx.drawImage(image, 0, 0, width, height);
      }

      if (frame.onDrawCustom) {
          frame.onDrawCustom(ctx as unknown as SKRSContext2D, canvas);
      }

      if (frame.transformations) {
          ctx.restore();
      }

      const buffer = canvas.toBuffer('image/png');
      buffers.push(buffer);

      if (encoder) {
         
          const frameDuration = frame.duration || defaultDuration;
          encoder.setDelay(frameDuration); 
          encoder.addFrame(ctx as unknown as CanvasRenderingContext2D); 
      }

      if (options?.onFrame) options.onFrame(i);
      
      await new Promise(resolve => setTimeout(resolve, frame.duration || defaultDuration));
  }

  if (encoder) {
      encoder.finish();
  }

      if (options?.onEnd) options.onEnd();

      return options?.gif ? undefined : buffers;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`animate failed: ${errorMessage}`);
    }
  }



  /**
   * Processes multiple operations in parallel
   * @param operations - Array of operations to process
   * @returns Array of result buffers
   */
  async batch(operations: BatchOperation[]): Promise<Buffer[]> {
    try {
      return await batchOperations(this, operations);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`batch failed: ${errorMessage}`);
    }
  }

  /**
   * Chains multiple operations sequentially
   * @param operations - Array of operations to chain
   * @returns Final result buffer
   */
  async chain(operations: ChainOperation[]): Promise<Buffer> {
    try {
      return await chainOperations(this, operations);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`chain failed: ${errorMessage}`);
    }
  }

  /**
   * Stitches multiple images together
   * @param images - Array of image sources
   * @param options - Stitching options
   * @returns Stitched image buffer
   */
  async stitchImages(images: Array<string | Buffer>, options?: StitchOptions): Promise<Buffer> {
    try {
      if (!images || images.length === 0) {
        throw new Error("stitchImages: images array is required");
      }
      return await stitchImagesUtil(images, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`stitchImages failed: ${errorMessage}`);
    }
  }

  /**
   * Creates an image collage
   * @param images - Array of image sources with optional dimensions
   * @param layout - Collage layout configuration
   * @returns Collage image buffer
   */
  async createCollage(
    images: Array<{ source: string | Buffer; width?: number; height?: number }>,
    layout: CollageLayout
  ): Promise<Buffer> {
    try {
      if (!images || images.length === 0) {
        throw new Error("createCollage: images array is required");
      }
      if (!layout) {
        throw new Error("createCollage: layout configuration is required");
      }
      return await createCollage(images, layout);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`createCollage failed: ${errorMessage}`);
    }
  }

  /**
   * Compresses an image with quality control
   * @param image - Image source (path, URL, or Buffer)
   * @param options - Compression options
   * @returns Compressed image buffer
   */
  async compress(image: string | Buffer, options?: CompressionOptions): Promise<Buffer> {
    try {
      if (!image) {
        throw new Error("compress: image is required");
      }
      return await compressImage(image, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`compress failed: ${errorMessage}`);
    }
  }

  /**
   * Extracts color palette from an image
   * @param image - Image source (path, URL, or Buffer)
   * @param options - Palette extraction options
   * @returns Array of colors with percentages
   */
  async extractPalette(image: string | Buffer, options?: PaletteOptions): Promise<Array<{ color: string; percentage: number }>> {
    try {
      if (!image) {
        throw new Error("extractPalette: image is required");
      }
      return await extractPaletteUtil(image, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`extractPalette failed: ${errorMessage}`);
    }
  }

  /**
   * Validates a hexadecimal color string.
   * @param hexColor - Hexadecimal color string to validate (format: #RRGGBB)
   * @returns True if the color is valid
   * @throws Error if the color format is invalid
   * 
   * @example
   * ```typescript
   * painter.validHex('#ff0000'); // true
   * painter.validHex('#FF00FF'); // true
   * painter.validHex('invalid'); // throws Error
   * ```
   */
  public validHex(hexColor: string): boolean {
    if (typeof hexColor !== 'string') {
      throw new Error("validHex: hexColor must be a string.");
    }
    const hexPattern = /^#[0-9a-fA-F]{6}$/;
    if (!hexPattern.test(hexColor)) {
      throw new Error("validHex: Invalid hexadecimal color format. It should be in the format '#RRGGBB'.");
    }
    return true;
  }

  /**
   * Converts results to the configured output format.
   * @param results - Buffer or result to convert
   * @returns Converted result in the configured format
   * @throws Error if format is unsupported or conversion fails
   * 
   * @example
   * ```typescript
   * const painter = new ApexPainter({ type: 'base64' });
   * const result = await painter.createCanvas({ width: 100, height: 100 });
   * const base64String = await painter.outPut(result.buffer); // Returns base64 string
   * ```
   */
  public async outPut(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    try {
      if (!Buffer.isBuffer(results)) {
        throw new Error("outPut: results must be a Buffer.");
      }
      
      const formatType: string = this.format?.type || 'buffer';
      switch (formatType) {
        case 'buffer':
          return results;
        case 'url':
          return await url(results);
        case 'dataURL':
          return dataURL(results);
        case 'blob':
          return blob(results);
        case 'base64':
          return base64(results);
        case 'arraybuffer':
          return arrayBuffer(results);
        default:
          throw new Error(`outPut: Unsupported format '${formatType}'. Supported: buffer, url, dataURL, blob, base64, arraybuffer`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`outPut failed: ${errorMessage}`);
    }
  }

  /**
   * Advanced save method to save buffers to local files with extensive customization options.
   * 
   * @param buffer - Buffer to save (from createCanvas, createImage, createText, etc.)
   * @param options - Save options for file path, format, naming, etc.
   * @returns SaveResult with file path, name, size, and format
   * 
   * @example
   * ```typescript
   * // Simple save with auto-generated name
   * const canvas = await painter.createCanvas({ width: 800, height: 600 });
   * const result = await painter.save(canvas.buffer);
   * // Saves to: ./ApexPainter_output/20241220_143025_123.png
   * 
   * // Custom filename and directory
   * await painter.save(canvas.buffer, {
   *   directory: './my-images',
   *   filename: 'my-canvas',
   *   format: 'jpg',
   *   quality: 95
   * });
   * 
   * // Save with counter naming
   * await painter.save(canvas.buffer, {
   *   naming: 'counter',
   *   prefix: 'image-',
   *   counterStart: 1
   * });
   * // Saves to: ./ApexPainter_output/image-1.png, image-2.png, etc.
   * 
   * // Save multiple buffers
   * const buffers = [canvas1.buffer, canvas2.buffer, canvas3.buffer];
   * const results = await painter.saveMultiple(buffers, {
   *   prefix: 'batch-',
   *   naming: 'counter'
   * });
   * ```
   */
  public async save(buffer: Buffer, options?: SaveOptions): Promise<SaveResult> {
    try {
      if (!Buffer.isBuffer(buffer)) {
        throw new Error("save: buffer must be a Buffer.");
      }

      const opts: Required<Omit<SaveOptions, 'filename' | 'counterStart'>> & { filename?: string; counterStart?: number } = {
        directory: options?.directory ?? './ApexPainter_output',
        filename: options?.filename,
        format: options?.format ?? 'png',
        quality: options?.quality ?? 90,
        createDirectory: options?.createDirectory ?? true,
        naming: options?.naming ?? 'timestamp',
        counterStart: options?.counterStart ?? 1,
        prefix: options?.prefix ?? '',
        suffix: options?.suffix ?? '',
        overwrite: options?.overwrite ?? false
      };

      // Create directory if needed
      if (opts.createDirectory && !fs.existsSync(opts.directory)) {
        fs.mkdirSync(opts.directory, { recursive: true });
      }

      // Generate filename
      let filename: string;
      if (opts.filename) {
        filename = opts.filename;
        // Add extension if not present
        if (!filename.includes('.')) {
          filename += `.${opts.format}`;
        }
      } else {
        // Auto-generate filename based on naming pattern
        switch (opts.naming) {
          case 'timestamp':
            const now = new Date();
            const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}_${String(now.getMilliseconds()).padStart(3, '0')}`;
            filename = `${opts.prefix}${timestamp}${opts.suffix}.${opts.format}`;
            break;
          case 'counter':
            filename = `${opts.prefix}${this.saveCounter}${opts.suffix}.${opts.format}`;
            this.saveCounter++;
            break;
          case 'custom':
            filename = `${opts.prefix}${opts.suffix}.${opts.format}`;
            break;
          default:
            filename = `${opts.prefix}${Date.now()}${opts.suffix}.${opts.format}`;
        }
      }

      // Handle file overwrite
      const filePath = path.join(opts.directory, filename);
      if (!opts.overwrite && fs.existsSync(filePath)) {
        // Add number suffix if file exists
        let counter = 1;
        let newPath = filePath;
        const ext = path.extname(filePath);
        const baseName = path.basename(filePath, ext);
        const dir = path.dirname(filePath);
        
        while (fs.existsSync(newPath)) {
          newPath = path.join(dir, `${baseName}_${counter}${ext}`);
          counter++;
        }
        filename = path.basename(newPath);
      }

      // Convert buffer format if needed
      let finalBuffer = buffer;
      if (opts.format !== 'png') {
        // Use Sharp for format conversion
        const sharp = require('sharp');
        let sharpImage = sharp(buffer);
        
        switch (opts.format) {
          case 'jpg':
          case 'jpeg':
            finalBuffer = await sharpImage
              .jpeg({ quality: opts.quality, progressive: false })
              .toBuffer();
            break;
          case 'webp':
            finalBuffer = await sharpImage
              .webp({ quality: opts.quality })
              .toBuffer();
            break;
          case 'avif':
            finalBuffer = await sharpImage
              .avif({ quality: opts.quality })
              .toBuffer();
            break;
          case 'gif':
            // GIF requires special handling - keep as PNG if not already GIF
            if (!buffer.toString('ascii', 0, 3).includes('GIF')) {
              console.warn('save: Converting to GIF may not preserve quality. Consider using PNG.');
              finalBuffer = buffer; // Keep original for now
            }
            break;
        }
      }

      // Write file
      const finalPath = path.join(opts.directory, filename);
      fs.writeFileSync(finalPath, finalBuffer);

      return {
        path: finalPath,
        filename: filename,
        size: finalBuffer.length,
        format: opts.format
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`save failed: ${errorMessage}`);
    }
  }

  /**
   * Save multiple buffers at once with batch options.
   * 
   * @param buffers - Array of buffers to save
   * @param options - Save options (applied to all files)
   * @returns Array of SaveResult objects
   * 
   * @example
   * ```typescript
   * const canvas1 = await painter.createCanvas({ width: 800, height: 600 });
   * const canvas2 = await painter.createCanvas({ width: 800, height: 600 });
   * const results = await painter.saveMultiple([canvas1.buffer, canvas2.buffer], {
   *   prefix: 'batch-',
   *   naming: 'counter'
   * });
   * ```
   */
  public async saveMultiple(buffers: Buffer[], options?: SaveOptions): Promise<SaveResult[]> {
    try {
      if (!Array.isArray(buffers) || buffers.length === 0) {
        throw new Error("saveMultiple: buffers must be a non-empty array.");
      }

      const results: SaveResult[] = [];
      const baseCounter = options?.counterStart ?? this.saveCounter;

      for (let i = 0; i < buffers.length; i++) {
        const bufferOptions: SaveOptions = {
          ...options,
          counterStart: baseCounter + i,
          naming: options?.naming === 'counter' ? 'counter' : options?.naming
        };
        
        const result = await this.save(buffers[i], bufferOptions);
        results.push(result);
      }

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new Error(`saveMultiple failed: ${errorMessage}`);
    }
  }

  /**
   * Reset the save counter (useful when using 'counter' naming).
   */
  public resetSaveCounter(): void {
    this.saveCounter = 1;
  }

  /**
   * Applies stroke style to shape context
   * @private
   * @param ctx - Canvas 2D context
   * @param style - Stroke style type
   * @param width - Stroke width for calculating dash patterns
   */
  #applyShapeStrokeStyle(
    ctx: SKRSContext2D,
    style: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double',
    width: number
  ): void {
    switch (style) {
      case 'solid':
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      case 'dashed':
        ctx.setLineDash([width * 3, width * 2]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      case 'dotted':
        ctx.setLineDash([width, width]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        break;
        
      case 'groove':
      case 'ridge':
      case 'double':
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
        
      default:
        ctx.setLineDash([]);
        ctx.lineCap = 'butt';
        ctx.lineJoin = 'miter';
        break;
    }
  }

  /**
   * Applies complex shape stroke styles that require multiple passes
   * @private
   * @param ctx - Canvas 2D context
   * @param style - Complex stroke style type
   * @param width - Stroke width
   * @param color - Base stroke color
   * @param gradient - Optional gradient
   */
  #applyComplexShapeStroke(
    ctx: SKRSContext2D,
    style: 'groove' | 'ridge' | 'double',
    width: number,
    color: string,
    gradient: any
  ): void {
    const halfWidth = width / 2;
    
    switch (style) {
      case 'groove':
        // Groove: dark outer, light inner
        ctx.lineWidth = halfWidth;
        
        // Outer dark stroke
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.#darkenColor(color, 0.3);
        }
        ctx.stroke();
        
        // Inner light stroke
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.#lightenColor(color, 0.3);
        }
        ctx.stroke();
        break;
        
      case 'ridge':
        // Ridge: light outer, dark inner
        ctx.lineWidth = halfWidth;
        
        // Outer light stroke
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.#lightenColor(color, 0.3);
        }
        ctx.stroke();
        
        // Inner dark stroke
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.#darkenColor(color, 0.3);
        }
        ctx.stroke();
        break;
        
      case 'double':
        // Double: two parallel strokes
        ctx.lineWidth = halfWidth;
        
        // First stroke (outer)
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = color;
        }
        ctx.stroke();
        
        // Second stroke (inner)
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = color;
        }
        ctx.stroke();
        break;
    }
  }

  /**
   * Darkens a color by a factor
   * @private
   * @param color - Color string
   * @param factor - Darkening factor (0-1)
   * @returns Darkened color string
   */
  #darkenColor(color: string, factor: number): string {
    // Simple darkening for hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
      const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - factor)));
      const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - factor)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color; // Return original for non-hex colors
  }

  /**
   * Lightens a color by a factor
   * @private
   * @param color - Color string
   * @param factor - Lightening factor (0-1)
   * @returns Lightened color string
   */
  #lightenColor(color: string, factor: number): string {
    // Simple lightening for hex colors
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * factor));
      const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * factor));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color; // Return original for non-hex colors
  }
}