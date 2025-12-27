import { createCanvas, loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import type { ImageProperties, ShapeType, CreateImageOptions } from "../utils/utils";
import type { CanvasResults } from "./CanvasCreator";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";
import {
  isShapeSource,
  loadImageCached,
  applyRotation,
  applyShadow,
  applyStroke,
  buildPath,
  drawBoxBackground,
  fitInto,
  drawShape,
  createShapePath,
  createGradientFill,
  applyImageMask,
  applyClipPath,
  applyPerspectiveDistortion,
  applyBulgeDistortion,
  applyMeshWarp,
  applyVignette,
  applyLensFlare,
  applyChromaticAberration,
  applyFilmGrain,
  applySimpleProfessionalFilters,
} from "../utils/utils";

/**
 * Extended class for image creation functionality
 */
export class ImageCreator {
  /**
   * Validates image properties for required fields.
   * @private
   * @param ip - Image properties to validate
   */
  private validateImageProperties(ip: ImageProperties): void {
    if (!ip.source || ip.x == null || ip.y == null) {
      throw new Error("createImage: source, x, and y are required.");
    }
  }

  /**
   * Validates image/shape properties array.
   * @private
   * @param images - Image properties to validate
   */
  private validateImageArray(images: ImageProperties | ImageProperties[]): void {
    const list = Array.isArray(images) ? images : [images];
    if (list.length === 0) {
      throw new Error("createImage: At least one image/shape is required.");
    }
    for (const ip of list) {
      this.validateImageProperties(ip);
    }
  }

  /**
   * Checks if shape needs custom shadow/stroke (heart, star).
   * @private
   * @param shapeType - Type of shape
   * @returns True if shape is complex and needs custom effects
   */
  private isComplexShape(shapeType: ShapeType): boolean {
    return shapeType === 'heart' || shapeType === 'star';
  }

  /**
   * Darkens a color by a factor
   * @private
   * @param color - Color string
   * @param factor - Darkening factor (0-1)
   * @returns Darkened color string
   */
  private darkenColor(color: string, factor: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.max(0, Math.floor((num >> 16) * (1 - factor)));
      const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - factor)));
      const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - factor)));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color;
  }

  /**
   * Lightens a color by a factor
   * @private
   * @param color - Color string
   * @param factor - Lightening factor (0-1)
   * @returns Lightened color string
   */
  private lightenColor(color: string, factor: number): string {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const num = parseInt(hex, 16);
      const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * factor));
      const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * factor));
      const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * factor));
      return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }
    return color;
  }

  /**
   * Applies stroke style to context
   * @private
   */
  private applyShapeStrokeStyle(
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
   */
  private applyComplexShapeStroke(
    ctx: SKRSContext2D,
    style: 'groove' | 'ridge' | 'double',
    width: number,
    color: string,
    gradient: any
  ): void {
    const halfWidth = width / 2;

    switch (style) {
      case 'groove':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.darkenColor(color, 0.3);
        }
        ctx.stroke();
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.lightenColor(color, 0.3);
        }
        ctx.stroke();
        break;
      case 'ridge':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.lightenColor(color, 0.3);
        }
        ctx.stroke();
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = this.darkenColor(color, 0.3);
        }
        ctx.stroke();
        break;
      case 'double':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, { x: 0, y: 0, w: 100, h: 100 });
          ctx.strokeStyle = gstroke as any;
        } else {
          ctx.strokeStyle = color;
        }
        ctx.stroke();
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
   * Applies custom shadow for complex shapes (heart, star).
   * @private
   */
  private applyShapeShadow(
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

    if (gradient) {
      const gfill = createGradientFill(ctx, gradient, { x: x + offsetX, y: y + offsetY, w: width, h: height });
      ctx.fillStyle = gfill as any;
    } else {
      ctx.fillStyle = color;
    }

    createShapePath(ctx, shapeType, x + offsetX, y + offsetY, width, height, shapeProps);
    ctx.fill();

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Applies custom stroke for complex shapes (heart, star).
   * @private
   */
  private applyShapeStroke(
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
      style = 'solid'
    } = stroke;

    ctx.save();
    ctx.globalAlpha = stroke.opacity ?? 1;
    if (stroke.blur && stroke.blur > 0) ctx.filter = `blur(${stroke.blur}px)`;

    if (gradient) {
      const gstroke = createGradientFill(ctx, gradient, { x, y, w: width, h: height });
      ctx.strokeStyle = gstroke as any;
    } else {
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = strokeWidth;
    this.applyShapeStrokeStyle(ctx, style, strokeWidth);

    createShapePath(ctx, shapeType, x, y, width, height, shapeProps);

    if (style === 'groove' || style === 'ridge' || style === 'double') {
      this.applyComplexShapeStroke(ctx, style, strokeWidth, color, gradient);
    } else {
      ctx.stroke();
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draws a shape with all effects (shadow, stroke, filters, etc.).
   * @private
   */
  private async drawShape(
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
points?: Array<{ x: number; y: number }>;
startAngle?: number;
endAngle?: number;
centerX?: number;
centerY?: number;
    }
  ): Promise<void> {
    const box = { x, y, w: width, h: height };

    ctx.save();

    if (options.rotation) {
      applyRotation(ctx, options.rotation, box.x, box.y, box.w, box.h);
    }

    if (options.opacity !== undefined) {
      ctx.globalAlpha = options.opacity;
    }

    if (options.blur && options.blur > 0) {
      ctx.filter = `blur(${options.blur}px)`;
    }

    if (options.shadow && this.isComplexShape(shapeType)) {
      this.applyShapeShadow(ctx, shapeType, x, y, width, height, options.shadow, {
        radius: options.radius,
        sides: options.sides,
        innerRadius: options.innerRadius,
        outerRadius: options.outerRadius
      });
    } else if (options.shadow) {
      applyShadow(ctx, box, options.shadow);
    }

    if (options.boxBackground) {
      drawBoxBackground(ctx, box, options.boxBackground, options.borderRadius, options.borderPosition);
    }

    ctx.save();
    if (options.borderRadius) {
      buildPath(ctx, box.x, box.y, box.w, box.h, options.borderRadius, options.borderPosition);
      ctx.clip();
    }

    if (options.filters && options.filters.length > 0) {
      await applySimpleProfessionalFilters(ctx, options.filters, width, height);
    }

    // Pass ALL shape properties including points, angles, centers
    drawShape(ctx, shapeType, x, y, width, height, {
      fill: options.fill,
      color: options.color,
      gradient: options.gradient,
      radius: options.radius,
      sides: options.sides,
      innerRadius: options.innerRadius,
      outerRadius: options.outerRadius,
points: options.points,
startAngle: options.startAngle,
endAngle: options.endAngle,
centerX: options.centerX,
centerY: options.centerY
    });

    ctx.restore();

    if (options.stroke && this.isComplexShape(shapeType)) {
      this.applyShapeStroke(ctx, shapeType, x, y, width, height, options.stroke, {
        radius: options.radius,
        sides: options.sides,
        innerRadius: options.innerRadius,
        outerRadius: options.outerRadius
      });
    } else if (options.stroke) {
      applyStroke(ctx, box, options.stroke);
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * Draws a single bitmap or shape with independent shadow & stroke.
   * @private
   * @param ctx - Canvas 2D context
   * @param ip - Image properties
   */
  private async drawImageBitmap(ctx: SKRSContext2D, ip: ImageProperties): Promise<void> {
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

    this.validateImageProperties(ip);

    if (isShapeSource(source)) {
      await this.drawShape(ctx, source, x, y, width ?? 100, height ?? 100, {
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

    const img = await loadImageCached(source);

    const boxW = (inherit && !width) ? img.width : (width ?? img.width);
    const boxH = (inherit && !height) ? img.height : (height ?? img.height);
    const box = { x, y, w: boxW, h: boxH };

    ctx.save();

    applyRotation(ctx, rotation, box.x, box.y, box.w, box.h);
    applyShadow(ctx, box, shadow);
    drawBoxBackground(ctx, box, boxBackground, borderRadius, borderPosition);

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

    if (filters && filters.length > 0 && filterOrder === 'pre') {
      const adjustedFilters = filters.map(f => ({
        ...f,
        intensity: f.intensity !== undefined ? f.intensity * filterIntensity : (f.intensity ?? 1) * filterIntensity,
        value: f.value !== undefined ? f.value * filterIntensity : f.value,
        radius: f.radius !== undefined ? f.radius * filterIntensity : f.radius
      }));
      await applySimpleProfessionalFilters(ctx, adjustedFilters, dw, dh);
    }

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

    if (meshWarp && meshWarp.controlPoints) {
      applyMeshWarp(ctx, img, meshWarp.gridX ?? 10, meshWarp.gridY ?? 10, meshWarp.controlPoints, dx, dy, dw, dh);
      ctx.filter = "none";
      ctx.globalAlpha = prevAlpha;
      ctx.restore();
      ctx.restore();
      return;
    }

    if (mask) {
      await applyImageMask(ctx, img, mask.source, mask.mode ?? 'alpha', dx, dy, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    }

    ctx.filter = "none";
    ctx.globalAlpha = prevAlpha;
    ctx.restore();

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

    applyStroke(ctx, box, stroke);
    ctx.restore();
  }

  /**
   * Draws one or more images (or shapes) on an existing canvas buffer.
   *
   * @param images - Single ImageProperties object or array of ImageProperties
   * @param canvasBuffer - Existing canvas buffer (Buffer) or CanvasResults object
   * @param options - Optional options for grouped drawing
   * @returns Promise<Buffer> - Updated canvas buffer in PNG format
   */
  async createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions
  ): Promise<Buffer> {
    try {
      if (!canvasBuffer) {
        throw new Error("createImage: canvasBuffer is required.");
      }
      this.validateImageArray(images);

      const list = Array.isArray(images) ? images : [images];

      const base: Image = Buffer.isBuffer(canvasBuffer)
        ? await loadImage(canvasBuffer)
        : await loadImage((canvasBuffer as CanvasResults).buffer);

      const cv = createCanvas(base.width, base.height);
      const ctx = getCanvasContext(cv);

      ctx.drawImage(base, 0, 0);

      const isGrouped = options?.isGrouped && list.length > 1;
      const groupTransform = options?.groupTransform;

      if (isGrouped && groupTransform) {
        // GROUPED MODE: Apply transformations to all elements together
        const pivotX = groupTransform.pivotX ?? base.width / 2;
        const pivotY = groupTransform.pivotY ?? base.height / 2;

        // Save context state
        ctx.save();


        // 1. Translate to pivot
        ctx.translate(pivotX, pivotY);

        // 2. Apply rotation (if specified)
        if (groupTransform.rotation !== undefined && groupTransform.rotation !== 0) {
          ctx.rotate((groupTransform.rotation * Math.PI) / 180);
        }

        // 3. Apply scale (if specified)
        if (groupTransform.scaleX !== undefined || groupTransform.scaleY !== undefined) {
          ctx.scale(groupTransform.scaleX ?? 1, groupTransform.scaleY ?? 1);
        }

        // 4. Apply translation (relative to pivot, after rotation/scale)
        if (groupTransform.translateX !== undefined || groupTransform.translateY !== undefined) {
          ctx.translate(groupTransform.translateX ?? 0, groupTransform.translateY ?? 0);
        }

        // 5. Translate back to origin
        ctx.translate(-pivotX, -pivotY);

        for (const ip of list) {

          const ipWithoutRotation = { ...ip, rotation: 0 };
          await this.drawImageBitmap(ctx, ipWithoutRotation);
        }

        ctx.restore();
      } else {

        for (const ip of list) {
          await this.drawImageBitmap(ctx, ip);
        }
      }

      return cv.toBuffer("image/png");
    } catch (error) {
      throw new Error(`createImage failed: ${getErrorMessage(error)}`);
    }
  }
}

