import { createCanvas, type Canvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  ImageDistortionOptions,
  ImageProperties,
  ShapeType,
  ShapeProperties,
  CreateImageOptions,
  StrokeOptions,
  ShadowOptions,
  BoxBackground,
  ImageFilter,
  gradient,
} from "../types";
import { assignCanvasResultsBuffer } from "../canvas/canvas-creator";
import type { CanvasResults } from "../types";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import { isShapeSource, drawShape, createShapePath } from "./shapes/shapes";
import { loadImageCached, fitInto, drawBoxBackground } from "./image-properties";
import { decodeImageSource } from "./image-source-validation";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { buildPath, applyRotation } from "../render/clip-path";
import { applyShadow } from "../render/shadow-renderer";
import { applyStroke } from "../render/stroke-renderer";
import { createGradientFill } from "../render/gradient-fill";
import { applyClipPath } from "./image-mask";
import { processImageRaster } from "./image-raster-pipeline";
import {
  applyVignette,
  applyLensFlare,
  applyChromaticAberration,
  applyFilmGrain,
} from "./image-effects";
import { applyContextImageFilters } from "../render/context-image-filters";

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
      throw new ApexifyInputError("createImage: source, x, and y are required.");
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
      throw new ApexifyInputError("createImage: At least one image/shape is required.");
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
    gradient: gradient | undefined,
    rect: { x: number; y: number; w: number; h: number }
  ): void {
    const halfWidth = width / 2;

    switch (style) {
      case 'groove':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
        } else {
          ctx.strokeStyle = this.darkenColor(color, 0.3);
        }
        ctx.stroke();
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
        } else {
          ctx.strokeStyle = this.lightenColor(color, 0.3);
        }
        ctx.stroke();
        break;
      case 'ridge':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
        } else {
          ctx.strokeStyle = this.lightenColor(color, 0.3);
        }
        ctx.stroke();
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
        } else {
          ctx.strokeStyle = this.darkenColor(color, 0.3);
        }
        ctx.stroke();
        break;
      case 'double':
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
        } else {
          ctx.strokeStyle = color;
        }
        ctx.stroke();
        ctx.lineWidth = halfWidth;
        if (gradient) {
          const gstroke = createGradientFill(ctx, gradient, rect);
          ctx.strokeStyle = gstroke;
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
    shadow: ShadowOptions,
    shapeProps: ShapeProperties
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
      ctx.fillStyle = gfill;
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
    stroke: StrokeOptions,
    shapeProps: ShapeProperties
  ): void {
    /**
     * Rectangles/squares were stroked via {@link createShapePath} → `ctx.rect()`, which ignores
     * `stroke.borderRadius` / `stroke.roundedCorners`. Bitmaps use {@link applyStroke} + `buildPath`.
     * Delegate here so rounded strokes match `StrokeOptions` (same as `createImage` bitmap layers).
     */
    if (shapeType === "rectangle" || shapeType === "square") {
      const w = shapeType === "square" ? Math.min(width, height) : width;
      const h = shapeType === "square" ? Math.min(width, height) : height;
      applyStroke(ctx, { x, y, w, h }, stroke as StrokeOptions);
      return;
    }

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
      ctx.strokeStyle = gstroke;
    } else {
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = strokeWidth;
    this.applyShapeStrokeStyle(ctx, style, strokeWidth);

    createShapePath(ctx, shapeType, x, y, width, height, shapeProps);

    const strokeGradientRect = { x, y, w: width, h: height };
    if (style === 'groove' || style === 'ridge' || style === 'double') {
      this.applyComplexShapeStroke(ctx, style, strokeWidth, color, gradient, strokeGradientRect);
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
      shadow?: ShadowOptions;
      stroke?: StrokeOptions;
      boxBackground?: BoxBackground;
      fill?: boolean;
      color?: string;
      gradient?: gradient;
      radius?: number;
      sides?: number;
      innerRadius?: number;
      outerRadius?: number;
      filters?: ImageFilter[];
      points?: Array<{ x: number; y: number }>;
      startAngle?: number;
      endAngle?: number;
      centerX?: number;
      centerY?: number;
      blendMode?: GlobalCompositeOperation;
    }
  ): Promise<void> {
    const box = { x, y, w: width, h: height };

    ctx.save();

    if (options.blendMode) {
      ctx.globalCompositeOperation = options.blendMode;
    }

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
      await applyContextImageFilters(ctx, options.filters, width, height);
    }

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

    if (options.stroke) {
      const shapeStrokeProps = this.collectShapeStrokeProps(options);
      this.applyShapeStroke(ctx, shapeType, x, y, width, height, options.stroke, shapeStrokeProps);
    }

    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  private collectShapeStrokeProps(options: {
      radius?: number;
      sides?: number;
      innerRadius?: number;
      outerRadius?: number;
      points?: ShapeProperties["points"];
      startAngle?: number;
      endAngle?: number;
      centerX?: number;
      centerY?: number;
    }
  ): ShapeProperties {
    return {
      radius: options.radius,
      sides: options.sides,
      innerRadius: options.innerRadius,
      outerRadius: options.outerRadius,
      points: options.points,
      startAngle: options.startAngle,
      endAngle: options.endAngle,
      centerX: options.centerX,
      centerY: options.centerY,
    };
  }

  private localizeShapeProperties(
    shape: ShapeProperties | undefined,
    x: number,
    y: number
  ): ShapeProperties {
    return {
      ...(shape ?? {}),
      points: shape?.points?.map((point) => ({ x: point.x - x, y: point.y - y })),
      centerX: shape?.centerX === undefined ? undefined : shape.centerX - x,
      centerY: shape?.centerY === undefined ? undefined : shape.centerY - y,
    };
  }

  private requiresRasterShapePipeline(ip: ImageProperties): boolean {
    return Boolean(
      ip.filters?.length ||
      ip.filterIntensity !== undefined ||
      ip.filterOrder !== undefined ||
      ip.mask ||
      ip.clipPath ||
      ip.distortion ||
      ip.meshWarp ||
      ip.effects
    );
  }

  private async drawRasterShape(
    ctx: SKRSContext2D,
    shapeType: ShapeType,
    ip: ImageProperties
  ): Promise<void> {
    const width = Math.max(1, Math.round(ip.width ?? 100));
    const height = Math.max(1, Math.round(ip.height ?? 100));
    const box = { x: ip.x, y: ip.y, w: width, h: height };
    const sourceCanvas = createCanvas(width, height);
    const sourceCtx = getCanvasContext(sourceCanvas);
    drawShape(
      sourceCtx,
      shapeType,
      0,
      0,
      width,
      height,
      this.localizeShapeProperties(ip.shape, ip.x, ip.y)
    );

    const processed = await processImageRaster(sourceCanvas, ip.x, ip.y, {
      filters: ip.filters,
      filterIntensity: ip.filterIntensity,
      filterOrder: ip.filterOrder,
      meshWarp: ip.meshWarp,
      distortion: ip.distortion,
      mask: ip.mask,
      effects: ip.effects,
    });

    ctx.save();
    if (ip.blendMode) ctx.globalCompositeOperation = ip.blendMode;
    applyRotation(ctx, ip.rotation ?? 0, box.x, box.y, box.w, box.h);

    if (ip.shadow && this.isComplexShape(shapeType)) {
      this.applyShapeShadow(ctx, shapeType, box.x, box.y, box.w, box.h, ip.shadow, ip.shape ?? {});
    } else {
      applyShadow(ctx, box, ip.shadow);
    }
    drawBoxBackground(ctx, box, ip.boxBackground, ip.borderRadius, ip.borderPosition);

    ctx.save();
    if (ip.clipPath) {
      applyClipPath(ctx, ip.clipPath);
    } else if (ip.borderRadius) {
      buildPath(ctx, box.x, box.y, box.w, box.h, ip.borderRadius, ip.borderPosition ?? "all");
      ctx.clip();
    }
    ctx.globalAlpha = ip.opacity ?? 1;
    if ((ip.blur ?? 0) > 0) ctx.filter = `blur(${ip.blur}px)`;
    ctx.drawImage(processed.canvas, processed.x, processed.y);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();

    if (ip.stroke) {
      this.applyShapeStroke(ctx, shapeType, box.x, box.y, box.w, box.h, ip.stroke, ip.shape ?? {});
    }
    ctx.restore();
  }

  private async drawImageBitmap(ctx: SKRSContext2D, ip: ImageProperties): Promise<void> {
    const {
      source, x, y, width, height, inherit,
      fit = "fill", align = "center",
      rotation = 0, opacity = 1, blur = 0,
      borderRadius = 0, borderPosition = "all",
      shadow, stroke, boxBackground, shape,
      filters, filterIntensity, filterOrder,
      mask, clipPath, distortion, meshWarp, effects, blendMode,
    } = ip;

    this.validateImageProperties(ip);

    if (isShapeSource(source)) {
      if (this.requiresRasterShapePipeline(ip)) {
        await this.drawRasterShape(ctx, source, ip);
      } else {
        await this.drawShape(ctx, source, x, y, width ?? 100, height ?? 100, {
          ...shape,
          rotation, opacity, blur, borderRadius, borderPosition,
          shadow, stroke, boxBackground, blendMode,
        });
      }
      return;
    }

    const img = await loadImageCached(source);
    const boxW = inherit && !width ? img.width : (width ?? img.width);
    const boxH = inherit && !height ? img.height : (height ?? img.height);
    const box = { x, y, w: boxW, h: boxH };
    const { dx, dy, dw, dh, sx, sy, sw, sh } =
      fitInto(box.x, box.y, box.w, box.h, img.width, img.height, fit, align);

    const rasterWidth = Math.max(1, Math.round(dw));
    const rasterHeight = Math.max(1, Math.round(dh));
    const sourceCanvas = createCanvas(rasterWidth, rasterHeight);
    const sourceCtx = getCanvasContext(sourceCanvas);
    sourceCtx.drawImage(img, sx, sy, sw, sh, 0, 0, rasterWidth, rasterHeight);

    const processed = await processImageRaster(sourceCanvas, dx, dy, {
      filters, filterIntensity, filterOrder, meshWarp, distortion, mask, effects,
    });

    ctx.save();
    if (blendMode) ctx.globalCompositeOperation = blendMode;
    applyRotation(ctx, rotation, box.x, box.y, box.w, box.h);
    applyShadow(ctx, box, shadow);
    drawBoxBackground(ctx, box, boxBackground, borderRadius, borderPosition);

    ctx.save();
    if (clipPath) {
      applyClipPath(ctx, clipPath);
    } else if (borderRadius) {
      buildPath(ctx, box.x, box.y, box.w, box.h, borderRadius, borderPosition);
      ctx.clip();
    }
    ctx.globalAlpha = opacity;
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(processed.canvas, processed.x, processed.y);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();

    applyStroke(ctx, box, stroke);
    ctx.restore();
  }

  private offsetDistortion(
    distortion: ImageDistortionOptions | undefined,
    offsetX: number,
    offsetY: number
  ): ImageDistortionOptions | undefined {
    if (!distortion) return undefined;
    return {
      ...distortion,
      centerX:
        distortion.centerX === undefined ? undefined : distortion.centerX + offsetX,
      centerY:
        distortion.centerY === undefined ? undefined : distortion.centerY + offsetY,
      points: distortion.points?.map((point) => ({
        x: point.x + offsetX,
        y: point.y + offsetY,
      })),
      controlPoints: distortion.controlPoints?.map((handle) => ({
        ...handle,
        from: {
          x: handle.from.x + offsetX,
          y: handle.from.y + offsetY,
        },
        to: {
          x: handle.to.x + offsetX,
          y: handle.to.y + offsetY,
        },
      })),
    };
  }

  private groupLocalImage(
    image: ImageProperties,
    groupX: number,
    groupY: number
  ): ImageProperties {
    return {
      ...image,
      x: image.x - groupX,
      y: image.y - groupY,
      rotation: 0,
      clipPath: image.clipPath?.map((point) => ({
        x: point.x - groupX,
        y: point.y - groupY,
      })),
      distortion: this.offsetDistortion(image.distortion, -groupX, -groupY),
    };
  }

  async paintImageLayersOntoContext(
    ctx: SKRSContext2D,
    images: ImageProperties | ImageProperties[],
    _canvasSize: { width: number; height: number },
    options?: CreateImageOptions
  ): Promise<void> {
    this.validateImageArray(images);
    const list = Array.isArray(images) ? images : [images];
    const isGrouped = options?.isGrouped && list.length > 1;
    const groupTransform = options?.groupTransform;

    if (isGrouped && groupTransform) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const image of list) {
        const width = image.width ?? 100;
        const height = image.height ?? 100;
        minX = Math.min(minX, image.x);
        minY = Math.min(minY, image.y);
        maxX = Math.max(maxX, image.x + width);
        maxY = Math.max(maxY, image.y + height);
      }

      const groupBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      const groupWidth = Math.max(1, Math.round(groupBox.w));
      const groupHeight = Math.max(1, Math.round(groupBox.h));
      const pivotX = groupTransform.pivotX ?? groupBox.x + groupBox.w / 2;
      const pivotY = groupTransform.pivotY ?? groupBox.y + groupBox.h / 2;
      const sourceCanvas = createCanvas(groupWidth, groupHeight);
      const sourceCtx = getCanvasContext(sourceCanvas);

      if (groupTransform.boxBackground) {
        drawBoxBackground(
          sourceCtx,
          { x: 0, y: 0, w: groupWidth, h: groupHeight },
          groupTransform.boxBackground,
          groupTransform.borderRadius,
          groupTransform.borderPosition
        );
      }

      sourceCtx.save();
      if (groupTransform.clipPath) {
        applyClipPath(
          sourceCtx,
          groupTransform.clipPath.map((point) => ({
            x: point.x - groupBox.x,
            y: point.y - groupBox.y,
          }))
        );
      } else if (groupTransform.borderRadius) {
        buildPath(
          sourceCtx, 0, 0, groupWidth, groupHeight,
          groupTransform.borderRadius,
          groupTransform.borderPosition ?? "all"
        );
        sourceCtx.clip();
      }
      for (const image of list) {
        await this.drawImageBitmap(sourceCtx, this.groupLocalImage(image, groupBox.x, groupBox.y));
      }
      sourceCtx.restore();

      const processed = await processImageRaster(sourceCanvas, 0, 0, {
        filters: groupTransform.filters,
        filterIntensity: groupTransform.filterIntensity,
        filterOrder: groupTransform.filterOrder,
        meshWarp: groupTransform.meshWarp,
        distortion: this.offsetDistortion(groupTransform.distortion, -groupBox.x, -groupBox.y),
        mask: groupTransform.mask,
        effects: groupTransform.effects,
      });

      ctx.save();
      if (groupTransform.blendMode) ctx.globalCompositeOperation = groupTransform.blendMode;
      ctx.globalAlpha = groupTransform.opacity ?? 1;
      if ((groupTransform.blur ?? 0) > 0) ctx.filter = `blur(${groupTransform.blur}px)`;

      ctx.translate(pivotX, pivotY);
      if ((groupTransform.rotation ?? 0) !== 0) {
        ctx.rotate(((groupTransform.rotation ?? 0) * Math.PI) / 180);
      }
      ctx.scale(groupTransform.scaleX ?? 1, groupTransform.scaleY ?? 1);
      ctx.translate(groupTransform.translateX ?? 0, groupTransform.translateY ?? 0);
      ctx.translate(-pivotX, -pivotY);

      const renderedBox = {
        x: groupBox.x + processed.x,
        y: groupBox.y + processed.y,
        w: processed.width,
        h: processed.height,
      };
      applyShadow(ctx, renderedBox, groupTransform.shadow);
      ctx.drawImage(processed.canvas, renderedBox.x, renderedBox.y);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      applyStroke(ctx, renderedBox, groupTransform.stroke);
      ctx.restore();
      return;
    }

    for (const image of list) {
      await this.drawImageBitmap(ctx, image);
    }
  }

  async createImage(
  async createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions
  ): Promise<Buffer> {
    try {
      if (!canvasBuffer) {
        throw new ApexifyInputError("createImage: canvasBuffer is required.");
      }
      this.validateImageArray(images);

      const list = Array.isArray(images) ? images : [images];
      const sourceBuffer = Buffer.isBuffer(canvasBuffer)
        ? canvasBuffer
        : (canvasBuffer as CanvasResults).buffer;
      const base: Image = await decodeImageSource(sourceBuffer, {
        label: "createImage canvasBuffer",
        requireCanvasBudget: true,
      });

      const cv = createCanvas(base.width, base.height);
      const ctx = getCanvasContext(cv);
      ctx.drawImage(base, 0, 0);

      await this.paintImageLayersOntoContext(
        ctx,
        list,
        { width: base.width, height: base.height },
        options
      );

      return assignCanvasResultsBuffer(canvasBuffer, cv.toBuffer("image/png"));
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError(`createImage failed: ${getErrorMessage(error)}`, { cause: error });
    }
  }
}
