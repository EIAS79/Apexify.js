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
    customLines,
    converter, resizingImg, applyColorFilters, imgEffects, cropInner, cropOuter, bgRemoval, detectColors, removeColor, dataURL,
    base64, arrayBuffer, blob, url, GradientConfig, Frame,
    ExtractFramesOptions, ResizeOptions, MaskOptions, BlendOptions,
    ImageFilter,
    batchOperations, chainOperations,
    stitchImages as stitchImagesUtil, createCollage,
    compressImage, extractPalette as extractPaletteUtil,
    BatchOperation, ChainOperation, StitchOptions, CollageLayout, CompressionOptions, PaletteOptions,
    SaveOptions, SaveResult,
    CreateImageOptions, GroupTransformOptions,
    TextMetrics, PixelData, PixelManipulationOptions,

    PathCommand, Path2DDrawOptions, HitRegion, HitDetectionOptions, HitDetectionResult,
    getErrorMessage, getCanvasContext
    } from "./utils/utils";
    import { CanvasCreator, type CanvasResults } from "./extended/CanvasCreator";
    import { ImageCreator } from "./extended/ImageCreator";
    import { TextCreator } from "./extended/TextCreator";
    import { GIFCreator } from "./extended/GIFCreator";
    import { ChartCreator } from "./extended/ChartCreator";
    import { VideoCreator, VideoCreationOptions } from "./extended/VideoCreator";
    import { TextMetricsCreator } from "./extended/TextMetricsCreator";
    import { PixelDataCreator } from "./extended/PixelDataCreator";
    import { Path2DCreator } from "./extended/Path2DCreator";
    import { HitDetectionCreator } from "./extended/HitDetectionCreator";
    import { VideoHelpers } from "./utils/Video/videoHelpers";
import type { PieSlice, PieChartOptions } from "./utils/Charts/piechart";
import type { BarChartData, BarChartOptions } from "./utils/Charts/barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "./utils/Charts/horizontalbarchart";
import type { LineSeries, LineChartOptions } from "./utils/Charts/linechart";

export class ApexPainter {
  private format?: OutputFormat;
  private saveCounter: number = 1;

  // Extended handlers
  private canvasCreator: CanvasCreator;
  private imageCreator: ImageCreator;
  private textCreator: TextCreator;
  private gifCreator: GIFCreator;
  private chartCreator: ChartCreator;
  private videoCreator: VideoCreator;
  private videoHelpers: VideoHelpers;
  private textMetricsCreator: TextMetricsCreator;
  private pixelDataCreator: PixelDataCreator;
  private path2DCreator: Path2DCreator;
  private hitDetectionCreator: HitDetectionCreator;

  constructor({ type }: OutputFormat = { type: 'buffer' }) {
    this.format = { type: type || 'buffer' };


    this.canvasCreator = new CanvasCreator();
    this.imageCreator = new ImageCreator();
    this.textCreator = new TextCreator();
    this.gifCreator = new GIFCreator();
this.gifCreator.setPainter(this);
    this.chartCreator = new ChartCreator();
    this.videoCreator = new VideoCreator();
    this.textMetricsCreator = new TextMetricsCreator();
    this.pixelDataCreator = new PixelDataCreator();
    this.path2DCreator = new Path2DCreator();
    this.hitDetectionCreator = new HitDetectionCreator();


    this.canvasCreator.setExtractVideoFrame(
      (videoSource, frameNumber, timeSeconds, outputFormat, quality) =>
        this.#extractVideoFrame(videoSource, frameNumber ?? 0, timeSeconds, outputFormat ?? 'jpg', quality ?? 2)
    );


    this.videoCreator.setDependencies({
      checkFFmpegAvailable: () => this.#checkFFmpegAvailable(),
      getFFmpegInstallInstructions: () => this.#getFFmpegInstallInstructions(),
      getVideoInfo: (videoSource, skipFFmpegCheck) => this.getVideoInfo(videoSource, skipFFmpegCheck),
      extractVideoFrame: (videoSource, frameNumber, timeSeconds, outputFormat, quality) =>
        this.#extractVideoFrame(videoSource, frameNumber ?? 0, timeSeconds, outputFormat ?? 'jpg', quality ?? 2),
      extractFrames: (videoSource, options) => this.extractFrames(videoSource, options),
      extractAllFrames: (videoSource, options) => this.extractAllFrames(videoSource, options)
    });


    this.videoHelpers = new VideoHelpers({
      checkFFmpegAvailable: () => this.#checkFFmpegAvailable(),
      getFFmpegInstallInstructions: () => this.#getFFmpegInstallInstructions(),
      getVideoInfo: (videoSource, skipFFmpegCheck) => this.getVideoInfo(videoSource, skipFFmpegCheck),
      extractVideoFrame: (videoSource, frameNumber, timeSeconds, outputFormat, quality) =>
        this.#extractVideoFrame(videoSource, frameNumber ?? 0, timeSeconds, outputFormat ?? 'jpg', quality ?? 2),
      createVideo: (options) => this.createVideo(options)
    });


    this.videoCreator.setHelperMethods({
      generateVideoThumbnail: (videoSource, options, videoInfo) =>
        this.#generateVideoThumbnail(videoSource, options, videoInfo),
      convertVideo: (videoSource, options) =>
        this.#convertVideo(videoSource, options),
      trimVideo: (videoSource, options) =>
        this.#trimVideo(videoSource, options),
      extractAudio: (videoSource, options) =>
        this.#extractAudio(videoSource, options),
      addWatermarkToVideo: (videoSource, options) =>
        this.#addWatermarkToVideo(videoSource, options),
      changeVideoSpeed: (videoSource, options) =>
        this.#changeVideoSpeed(videoSource, options),
      generateVideoPreview: (videoSource, options, videoInfo) =>
        this.#generateVideoPreview(videoSource, options, videoInfo),
      applyVideoEffects: (videoSource, options) =>
        this.#applyVideoEffects(videoSource, options),
      mergeVideos: (options) =>
        this.#mergeVideos(options),
      replaceVideoSegment: (videoSource, options) =>
        this.#replaceVideoSegment(videoSource, options),
      rotateVideo: (videoSource, options) =>
        this.#rotateVideo(videoSource, options),
      cropVideo: (videoSource, options) =>
        this.#cropVideo(videoSource, options),
      compressVideo: (videoSource, options) =>
        this.#compressVideo(videoSource, options),
      addTextToVideo: (videoSource, options) =>
        this.#addTextToVideo(videoSource, options),
      addFadeToVideo: (videoSource, options) =>
        this.#addFadeToVideo(videoSource, options),
      reverseVideo: (videoSource, options) =>
        this.#reverseVideo(videoSource, options),
      createVideoLoop: (videoSource, options) =>
        this.#createVideoLoop(videoSource, options),
      batchProcessVideos: (options) =>
        this.#batchProcessVideos(options),
      detectVideoScenes: (videoSource, options) =>
        this.#detectVideoScenes(videoSource, options),
      stabilizeVideo: (videoSource, options) =>
        this.#stabilizeVideo(videoSource, options),
      colorCorrectVideo: (videoSource, options) =>
        this.#colorCorrectVideo(videoSource, options),
      addPictureInPicture: (videoSource, options) =>
        this.#addPictureInPicture(videoSource, options),
      createSplitScreen: (options) =>
        this.#createSplitScreen(options),
      createTimeLapseVideo: (videoSource, options) =>
        this.#createTimeLapseVideo(videoSource, options),
      muteVideo: (videoSource, options) =>
        this.#muteVideo(videoSource, options),
      adjustVideoVolume: (videoSource, options) =>
        this.#adjustVideoVolume(videoSource, options),
      createVideoFromFrames: (options) =>
        this.#createVideoFromFrames(options),
      freezeVideoFrame: (videoSource, options, onProgress) =>
        this.videoHelpers.freezeVideoFrame(videoSource, options, onProgress),
      exportVideoPreset: (videoSource, options, onProgress) =>
        this.videoHelpers.exportVideoPreset(videoSource, options, onProgress),
      normalizeVideoAudio: (videoSource, options, onProgress) =>
        this.videoHelpers.normalizeVideoAudio(videoSource, options, onProgress),
      applyLUTToVideo: (videoSource, options, onProgress) =>
        this.videoHelpers.applyLUTToVideo(videoSource, options, onProgress),
      addVideoTransition: (videoSource, options, onProgress) =>
        this.videoHelpers.addVideoTransition(videoSource, options, onProgress),
      addAnimatedTextToVideo: (videoSource, options, onProgress) =>
        this.videoHelpers.addAnimatedTextToVideo(videoSource, options, onProgress)
    });
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

  async createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    return this.canvasCreator.createCanvas(canvas);
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

  async createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions
  ): Promise<Buffer> {
    return this.imageCreator.createImage(images, canvasBuffer, options);
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

  async createText(textArray: TextProperties | TextProperties[], canvasBuffer: CanvasResults | Buffer): Promise<Buffer> {
    return this.textCreator.createText(textArray, canvasBuffer);
  }

  /**
   * Measures text dimensions and properties (advanced text metrics API)
   *
   * @param textProps - Text properties to measure (same as createText)
   * @returns Comprehensive text metrics including width, height, bounding boxes, and more
   *
   * @example
   * ```typescript
   * const metrics = await painter.measureText({
   *   text: "Hello World",
   *   fontSize: 24,
   *   font: { family: 'Arial' },
   *   bold: true,
   *   includeCharMetrics: true // Get per-character metrics
   * });
   *
   * console.log(metrics.width); // Text width
   * console.log(metrics.height); // Text height
   * console.log(metrics.lines); // Multi-line metrics if maxWidth provided
   *
   * // Optional: Customize measurement canvas size (for memory optimization)
   * const metrics2 = await painter.measureText({
   *   text: "Very long text...",
   *   fontSize: 24,
   *   measurementCanvas: { width: 5000, height: 2000 } // Optional
   * });
   * ```
   */
  async measureText(textProps: TextProperties): Promise<TextMetrics> {
    const result = await this.textMetricsCreator.measureText(textProps);
    return result as TextMetrics;
  }

  /**
   * Gets pixel data from a canvas buffer (advanced pixel manipulation API)
   *
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param options - Options for pixel data extraction (x, y, width, height)
   * @returns Pixel data with RGBA values
   *
   * @example
   * ```typescript
   * const pixelData = await painter.getPixelData(canvasBuffer, {
   *   x: 0, y: 0, width: 100, height: 100
   * });
   *
   * // Access RGBA values
   * const r = pixelData.data[0]; // Red
   * const g = pixelData.data[1]; // Green
   * const b = pixelData.data[2]; // Blue
   * const a = pixelData.data[3]; // Alpha
   * ```
   */
  async getPixelData(
    canvasBuffer: CanvasResults | Buffer,
    options?: {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
    }
  ): Promise<PixelData> {
    return this.pixelDataCreator.getPixelData(canvasBuffer, options);
  }

  /**
   * Sets pixel data to a canvas buffer
   *
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param pixelData - Pixel data to set (from getPixelData)
   * @param options - Options for setting pixel data (x, y, dirty region)
   * @returns New canvas buffer with updated pixels
   *
   * @example
   * ```typescript
   * // Modify pixels
   * pixelData.data[0] = 255; // Set first pixel to red
   *
   * // Set back to canvas
   * const updated = await painter.setPixelData(canvasBuffer, pixelData, {
   *   x: 0, y: 0
   * });
   * ```
   */
  async setPixelData(
    canvasBuffer: CanvasResults | Buffer,
    pixelData: PixelData,
    options?: {
      x?: number;
      y?: number;
      dirtyX?: number;
      dirtyY?: number;
      dirtyWidth?: number;
      dirtyHeight?: number;
    }
  ): Promise<Buffer> {
    return this.pixelDataCreator.setPixelData(canvasBuffer, pixelData, options);
  }

  /**
   * Manipulates pixels using custom processor or built-in filters (advanced pixel manipulation)
   *
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param options - Manipulation options (processor function or filter)
   * @returns New canvas buffer with manipulated pixels
   *
   * @example
   * ```typescript
   * // Custom processor
   * const processed = await painter.manipulatePixels(canvasBuffer, {
   *   processor: (r, g, b, a, x, y) => {
   *     // Invert colors
   *     return [255 - r, 255 - g, 255 - b, a];
   *   }
   * });
   *
   * // Built-in filter
   * const grayscale = await painter.manipulatePixels(canvasBuffer, {
   *   filter: 'grayscale',
   *   intensity: 1.0
   * });
   *
   * // Apply to specific region
   * const region = await painter.manipulatePixels(canvasBuffer, {
   *   filter: 'brightness',
   *   intensity: 0.8,
   *   region: { x: 100, y: 100, width: 200, height: 200 }
   * });
   * ```
   */
  async manipulatePixels(
    canvasBuffer: CanvasResults | Buffer,
    options: PixelManipulationOptions
  ): Promise<Buffer> {
    return this.pixelDataCreator.manipulatePixels(canvasBuffer, options);
  }

  /**
   * Gets pixel color at specific coordinates
   *
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns RGBA color values
   *
   * @example
   * ```typescript
   * const color = await painter.getPixelColor(canvasBuffer, 100, 200);
   * console.log(color.r, color.g, color.b, color.a);
   * ```
   */
  async getPixelColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number
  ): Promise<{ r: number; g: number; b: number; a: number }> {
    return this.pixelDataCreator.getPixelColor(canvasBuffer, x, y);
  }

  /**
   * Sets pixel color at specific coordinates
   *
   * @param canvasBuffer - Canvas buffer or CanvasResults
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param color - RGBA color values
   * @returns New canvas buffer
   *
   * @example
   * ```typescript
   * const updated = await painter.setPixelColor(canvasBuffer, 100, 200, {
   *   r: 255, g: 0, b: 0, a: 255 // Red pixel
   * });
   * ```
   */
  async setPixelColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number,
    color: { r: number; g: number; b: number; a?: number }
  ): Promise<Buffer> {
    return this.pixelDataCreator.setPixelColor(canvasBuffer, x, y, color);
  }

  /**
   * Creates a Path2D object from commands (advanced path API)
   */
  createPath2D(commands: PathCommand[]): any {
    return this.path2DCreator.createPath2D(commands);
  }

  /**
   * Draws a Path2D object onto a canvas buffer
   */
  async drawPath(
    canvasBuffer: CanvasResults | Buffer,
    path: any | PathCommand[],
    options?: Path2DDrawOptions
  ): Promise<Buffer> {
    return this.path2DCreator.drawPath(canvasBuffer, path, options);
  }

  /**
   * Checks if a point is inside a Path2D object (hit detection)
   */
  async isPointInPath(
    path: any | PathCommand[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult> {
    return this.hitDetectionCreator.isPointInPath(path, x, y, options);
  }

  /**
   * Checks if a point is inside a custom region (advanced hit detection)
   */
  async isPointInRegion(
    region: HitRegion,
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult> {
    return this.hitDetectionCreator.isPointInRegion(region, x, y, options);
  }

  /**
   * Checks if a point is inside any of multiple regions
   */
  async isPointInAnyRegion(
    regions: HitRegion[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult> {
    return this.hitDetectionCreator.isPointInAnyRegion(regions, x, y, options);
  }

  /**
   * Gets the distance from a point to the nearest edge of a region
   */
  async getDistanceToRegion(region: HitRegion, x: number, y: number): Promise<number> {
    return this.hitDetectionCreator.getDistanceToRegion(region, x, y);
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
      throw new Error(`createCustom failed: ${getErrorMessage(error)}`);
    }
  }

  async createGIF(
    gifFrames: { background: string; duration: number }[] | undefined,
    options: GIFOptions
  ): Promise<GIFResults | Buffer | string | Array<{ attachment: NodeJS.ReadableStream | any; name: string }> | { gif: Buffer | string; static: Buffer } | undefined> {
    return this.gifCreator.createGIF(gifFrames, options);
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
      throw new Error(`resize failed: ${getErrorMessage(error)}`);
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
      throw new Error(`imgConverter failed: ${getErrorMessage(error)}`);
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
      throw new Error(`effects failed: ${getErrorMessage(error)}`);
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
      throw new Error(`colorsFilter failed: ${getErrorMessage(error)}`);
    }
  }

  async colorAnalysis(source: string): Promise<{ color: string; frequency: string }[]> {
    try {
      if (!source) {
        throw new Error("colorAnalysis: source is required.");
      }
      return await detectColors(source);
    } catch (error) {
      throw new Error(`colorAnalysis failed: ${getErrorMessage(error)}`);
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
      throw new Error(`colorsRemover failed: ${getErrorMessage(error)}`);
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
      throw new Error(`removeBackground failed: ${getErrorMessage(error)}`);
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
      const ctx = getCanvasContext(canvas);

      ctx.globalCompositeOperation = defaultBlendMode;
      ctx.drawImage(baseImage, 0, 0);

      for (const layer of layers) {
        const layerImage = await loadImage(layer.image);
        ctx.globalAlpha = layer.opacity !== undefined ? layer.opacity : 1.0;

        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(layerImage, layer.position?.x || 0, layer.position?.y || 0);
      }

      ctx.globalAlpha = 1.0;
      ctx.globalCompositeOperation = defaultBlendMode;

      return canvas.toBuffer('image/png');
    } catch (error) {
      throw new Error(`blend failed: ${getErrorMessage(error)}`);
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
      throw new Error(`cropImage failed: ${getErrorMessage(error)}`);
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

      await execAsync('ffmpeg -version', {
        timeout: 5000,
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      this._ffmpegAvailable = true;
      this._ffmpegChecked = true;
      this._ffmpegPath = 'ffmpeg';
      return true;
    } catch {

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

      if (videoPath === tempVideoPath && fs.existsSync(tempVideoPath)) {
        fs.unlinkSync(tempVideoPath);
      }

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
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

      let time: number;
      if (timeSeconds !== undefined) {
        time = timeSeconds;
      } else if (frameNumber === 0) {
        // Frame 0 = start of video
        time = 0;
      } else {

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

          console.warn(`Could not get video info, assuming 30 FPS for frame ${frameNumber}`);
          time = frameNumber / 30;
        }
      }

      // Use -frames:v 1 instead of -vframes 1 (more explicit)

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

        if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
        if (shouldCleanupVideo && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);

        return buffer;
      } catch (error) {

        if (fs.existsSync(frameOutputPath)) fs.unlinkSync(frameOutputPath);
        if (shouldCleanupVideo && fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
        throw error;
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
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


      const startFrame = options.frameSelection?.start || 0;
      const endFrame = options.frameSelection?.end !== undefined
        ? Math.min(options.frameSelection.end, totalFrames - 1)
        : totalFrames - 1;

      const outputFileTemplate = path.join(frameDir, `frame-%03d.${outputFormat}`);
      const qualityFlag = outputFormat === 'jpg' ? '-q:v 2' : '';
      const pixFmt = outputFormat === 'png' ? '-pix_fmt rgba' : '-pix_fmt yuvj420p';


      const startTime = startFrame / fps;
      const endTime = (endFrame + 1) / fps;
      const durationToExtract = endTime - startTime;

      const escapedOutputTemplate = outputFileTemplate.replace(/"/g, '\\"');

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

        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }

        return frames;
      } catch (error) {

        if (shouldCleanupVideo && fs.existsSync(videoPath)) {
          fs.unlinkSync(videoPath);
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = getErrorMessage(error);
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
  async createVideo(options: VideoCreationOptions): Promise<any> {
    return this.videoCreator.createVideo(options);
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

    const thumbnailWidth = frameWidth * grid.cols;
    const thumbnailHeight = frameHeight * grid.rows;
    const canvas = createCanvas(thumbnailWidth, thumbnailHeight);
    const ctx = getCanvasContext(canvas);

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

      if (options.speed > 2.0) {
        const atempoCount = Math.ceil(Math.log2(options.speed));
        const atempoValue = Math.pow(2, Math.log2(options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else if (options.speed < 0.5) {

        const atempoCount = Math.ceil(Math.log2(1 / options.speed));
        const atempoValue = Math.pow(0.5, Math.log2(1 / options.speed) / atempoCount);
        const atempoFilters = Array(atempoCount).fill(atempoValue).map(v => `atempo=${v}`).join(',');
        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]${atempoFilters}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      } else {

        command = `ffmpeg -i "${escapedVideoPath}" -filter_complex "[0:v]setpts=${1/options.speed}*PTS[v];[0:a]atempo=${options.speed}[a]" -map "[v]" -map "[a]" -y "${escapedOutputPath}"`;
      }
    } else {

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


      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }
      throw error;
    }
  }

  /**
   * Replace segment in video with segment from another video
   * @private
   */
  async #replaceVideoSegment(
    mainVideoSource: string | Buffer,
    options: {
      replacementVideo?: string | Buffer;
      replacementStartTime?: number;
      replacementDuration?: number;
      replacementFrames?: Array<string | Buffer>;
      replacementFps?: number;
      targetStartTime: number;
      targetEndTime: number;
      outputPath: string;
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const tempFiles: string[] = [];
    let shouldCleanupMain = false;
    let shouldCleanupReplacement = false;

    let mainVideoPath: string;
    if (Buffer.isBuffer(mainVideoSource)) {
      mainVideoPath = path.join(frameDir, `main-video-${timestamp}.mp4`);
      fs.writeFileSync(mainVideoPath, mainVideoSource);
      shouldCleanupMain = true;
      tempFiles.push(mainVideoPath);
    } else {
      let resolvedPath = mainVideoSource;
      if (!/^https?:\/\//i.test(resolvedPath)) {
        resolvedPath = path.join(process.cwd(), resolvedPath);
      }
      if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Main video file not found: ${mainVideoSource}`);
      }
      mainVideoPath = resolvedPath;
    }

    if (!options.replacementVideo && !options.replacementFrames) {
      throw new Error('Either replacementVideo or replacementFrames must be provided');
    }

    if (options.replacementVideo && options.replacementFrames) {
      throw new Error('Cannot specify both replacementVideo and replacementFrames');
    }

    const mainVideoInfo = await this.getVideoInfo(mainVideoPath, true);
    if (!mainVideoInfo) {
      throw new Error('Failed to get main video information');
    }

    if (options.targetStartTime < 0 || options.targetEndTime > mainVideoInfo.duration) {
      throw new Error(`Target time range (${options.targetStartTime}-${options.targetEndTime}s) is outside video duration (${mainVideoInfo.duration}s)`);
    }

    if (options.targetStartTime >= options.targetEndTime) {
      throw new Error('targetStartTime must be less than targetEndTime');
    }

    const targetDuration = options.targetEndTime - options.targetStartTime;
    const escapedMainPath = mainVideoPath.replace(/"/g, '\\"');

    try {
      // Step 1: Extract part before the segment to replace
      const part1Path = path.join(frameDir, `part1-${timestamp}.mp4`);
      tempFiles.push(part1Path);

      if (options.targetStartTime > 0) {
        const escapedPart1 = part1Path.replace(/"/g, '\\"');
        const part1Command = `ffmpeg -i "${escapedMainPath}" -t ${options.targetStartTime} -c copy -y "${escapedPart1}"`;
        await execAsync(part1Command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      }

      // Step 2: Create replacement segment (from video or frames)
      const replacementSegmentPath = path.join(frameDir, `replacement-segment-${timestamp}.mp4`);
      tempFiles.push(replacementSegmentPath);

      if (options.replacementVideo) {
        // Extract replacement segment from replacement video
        let replacementVideoPath: string;
        if (Buffer.isBuffer(options.replacementVideo)) {
          replacementVideoPath = path.join(frameDir, `replacement-video-${timestamp}.mp4`);
          fs.writeFileSync(replacementVideoPath, options.replacementVideo);
          shouldCleanupReplacement = true;
          tempFiles.push(replacementVideoPath);
        } else {
          let resolvedPath = options.replacementVideo;
          if (!/^https?:\/\//i.test(resolvedPath)) {
            resolvedPath = path.join(process.cwd(), resolvedPath);
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Replacement video file not found: ${options.replacementVideo}`);
          }
          replacementVideoPath = resolvedPath;
        }

        const replacementStartTime = options.replacementStartTime || 0;
        const replacementDuration = options.replacementDuration || targetDuration;

        const escapedReplacementPath = replacementVideoPath.replace(/"/g, '\\"');
        const escapedSegment = replacementSegmentPath.replace(/"/g, '\\"');
        const segmentCommand = `ffmpeg -i "${escapedReplacementPath}" -ss ${replacementStartTime} -t ${replacementDuration} -c copy -y "${escapedSegment}"`;
        await execAsync(segmentCommand, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      } else if (options.replacementFrames) {

        const replacementFps = options.replacementFps || 30;
        await this.#createVideoFromFrames({
          frames: options.replacementFrames,
          outputPath: replacementSegmentPath,
          fps: replacementFps,
          format: 'mp4',
          quality: 'high'
        });
      }

      // Step 3: Extract part after the segment to replace
      const part3Path = path.join(frameDir, `part3-${timestamp}.mp4`);
      tempFiles.push(part3Path);

      const remainingDuration = mainVideoInfo.duration - options.targetEndTime;
      if (remainingDuration > 0) {
        const escapedPart3 = part3Path.replace(/"/g, '\\"');
        const part3Command = `ffmpeg -i "${escapedMainPath}" -ss ${options.targetEndTime} -t ${remainingDuration} -c copy -y "${escapedPart3}"`;
        await execAsync(part3Command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 });
      } else {

      }

      // Step 4: Create concat file and merge all parts
      const concatFile = path.join(frameDir, `concat-${timestamp}.txt`);
      tempFiles.push(concatFile);

      const concatParts: string[] = [];


      if (options.targetStartTime > 0 && fs.existsSync(part1Path) && fs.statSync(part1Path).size > 0) {
        concatParts.push(part1Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }


      if (fs.existsSync(replacementSegmentPath) && fs.statSync(replacementSegmentPath).size > 0) {
        concatParts.push(replacementSegmentPath.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }


      if (remainingDuration > 0 && fs.existsSync(part3Path) && fs.statSync(part3Path).size > 0) {
        concatParts.push(part3Path.replace(/\\/g, '/').replace(/'/g, "\\'"));
      }

      if (concatParts.length === 0) {
        throw new Error('No valid video segments to concatenate');
      }

      const concatContent = concatParts.map(p => `file '${p}'`).join('\n');
      fs.writeFileSync(concatFile, concatContent);

      // Step 5: Concatenate all parts
      const escapedConcatFile = concatFile.replace(/"/g, '\\"');
      const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');
      const concatCommand = `ffmpeg -f concat -safe 0 -i "${escapedConcatFile}" -c copy -y "${escapedOutputPath}"`;

      await execAsync(concatCommand, { timeout: 600000, maxBuffer: 20 * 1024 * 1024 });

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
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


      for (let i = 0; i < videoPaths.length; i++) {
        if (shouldCleanup[i] && fs.existsSync(videoPaths[i])) {
          fs.unlinkSync(videoPaths[i]);
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

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
   * Mute video (remove audio) - supports full mute or partial mute with time ranges
   * @private
   */
  async #muteVideo(
    videoSource: string | Buffer,
    options: { outputPath: string; ranges?: Array<{ start: number; end: number }> }
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

    if (!options.ranges || options.ranges.length === 0) {
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

    // Partial mute: mute specific time ranges

    const videoInfo = await this.getVideoInfo(videoPath, true);
    if (!videoInfo) {
      throw new Error('Failed to get video information for partial mute');
    }

    const volumeFilters = options.ranges.map((range, index) => {
      return `volume=enable='between(t,${range.start},${range.end})':volume=0`;
    }).join(',');

    // Use complex filter to apply volume changes at specific times
    const command = `ffmpeg -i "${escapedVideoPath}" -af "${volumeFilters}" -c:v copy -y "${escapedOutputPath}"`;

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
   * Create video from frames/images
   * @private
   */
  async #createVideoFromFrames(
    options: {
      frames: Array<string | Buffer>;
      outputPath: string;
      fps?: number;
      format?: 'mp4' | 'webm' | 'avi' | 'mov' | 'mkv';
      quality?: 'low' | 'medium' | 'high' | 'ultra';
      bitrate?: number;
      resolution?: { width: number; height: number };
    }
  ): Promise<{ outputPath: string; success: boolean }> {
    if (!options.frames || options.frames.length === 0) {
      throw new Error('createFromFrames: At least one frame is required');
    }

    const frameDir = path.join(process.cwd(), '.temp-frames');
    if (!fs.existsSync(frameDir)) {
      fs.mkdirSync(frameDir, { recursive: true });
    }

    const timestamp = Date.now();
    const fps = options.fps || 30;
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

    const framePaths: string[] = [];
    const tempFiles: string[] = [];
    const frameSequenceDir = path.join(frameDir, `frames-${timestamp}`);

    try {

      let frameWidth: number | undefined;
      let frameHeight: number | undefined;

      if (options.resolution) {
        frameWidth = options.resolution.width;
        frameHeight = options.resolution.height;
      } else {
        // Load first frame to get dimensions
        const firstFrame = options.frames[0];
        let firstFramePath: string;

        if (Buffer.isBuffer(firstFrame)) {
          firstFramePath = path.join(frameDir, `frame-${timestamp}-0.png`);
          fs.writeFileSync(firstFramePath, firstFrame);
          tempFiles.push(firstFramePath);
        } else {
          let resolvedPath = firstFrame;
          if (!/^https?:\/\//i.test(resolvedPath)) {
            resolvedPath = path.join(process.cwd(), resolvedPath);
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Frame file not found: ${firstFrame}`);
          }
          firstFramePath = resolvedPath;
        }

        try {
          const { loadImage } = require('@napi-rs/canvas');
          const img = await loadImage(firstFramePath);
          frameWidth = img.width;
          frameHeight = img.height;
        } catch {
          // Fallback: try to get from ffprobe
          const escapedPath = firstFramePath.replace(/"/g, '\\"');
          try {
            const { stdout } = await execAsync(
              `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of default=noprint_wrappers=1:nokey=1 "${escapedPath}"`,
              { timeout: 10000, maxBuffer: 1024 * 1024 }
            );
            const [w, h] = stdout.toString().trim().split('\n').map(Number);
            if (w && h) {
              frameWidth = w;
              frameHeight = h;
            }
          } catch {
            throw new Error('Could not determine frame dimensions. Please specify resolution.');
          }
        }
      }

      if (!fs.existsSync(frameSequenceDir)) {
        fs.mkdirSync(frameSequenceDir, { recursive: true });
      }

      for (let i = 0; i < options.frames.length; i++) {
        const frame = options.frames[i];
        let frameBuffer: Buffer;

        if (Buffer.isBuffer(frame)) {
          frameBuffer = frame;
        } else {
          let resolvedPath = frame;
          if (!/^https?:\/\//i.test(resolvedPath)) {
            resolvedPath = path.join(process.cwd(), resolvedPath);
          }
          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Frame file not found: ${frame}`);
          }
          frameBuffer = fs.readFileSync(resolvedPath);
        }

        // Save with sequential naming (frame-000000.png, frame-000001.png, etc.)
        const frameNumber = i.toString().padStart(6, '0');
        const framePath = path.join(frameSequenceDir, `frame-${frameNumber}.png`);
        fs.writeFileSync(framePath, frameBuffer);
        tempFiles.push(framePath);
        framePaths.push(framePath);
      }

      // Use image2 pattern input for reliable frame sequence
      const patternPath = path.join(frameSequenceDir, 'frame-%06d.png').replace(/\\/g, '/');
      const escapedPattern = patternPath.replace(/"/g, '\\"');
      const escapedOutputPath = options.outputPath.replace(/"/g, '\\"');

      const resolutionFlag = frameWidth && frameHeight
        ? `-vf scale=${frameWidth}:${frameHeight}:force_original_aspect_ratio=decrease,pad=${frameWidth}:${frameHeight}:(ow-iw)/2:(oh-ih)/2`
        : '';

      // Use image2 demuxer with pattern for frame sequence
      const command = `ffmpeg -framerate ${fps} -i "${escapedPattern}" ${resolutionFlag} ${qualityFlag} -pix_fmt yuv420p -y "${escapedOutputPath}"`;

      await execAsync(command, {
        timeout: 600000, // 10 minute timeout for large frame sequences
        maxBuffer: 10 * 1024 * 1024
      });

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      if (fs.existsSync(frameSequenceDir)) {
        try {
          fs.rmSync(frameSequenceDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }

      return { outputPath: options.outputPath, success: true };
    } catch (error) {

      for (const tempFile of tempFiles) {
        if (fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
        }
      }

      if (fs.existsSync(frameSequenceDir)) {
        try {
          fs.rmSync(frameSequenceDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
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

    const videoInfo = await this.getVideoInfo(videoSource, true);
    if (!videoInfo || videoInfo.fps <= 0) {
      throw new Error('Could not get video FPS to convert frame number to time');
    }


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
      quality?: number;
      prefix?: string;
      startTime?: number;
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

      const videoInfo = await this.getVideoInfo(videoSource, true);
      if (!videoInfo) {
        throw new Error('Could not get video information');
      }

      const outputFormat = options?.outputFormat || 'png';
      const outputDir = options?.outputDirectory || path.join(process.cwd(), 'extracted-frames');
      const prefix = options?.prefix || 'frame';
      const quality = options?.quality || 2;

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

      const startTime = options?.startTime ?? 0;
      const endTime = options?.endTime ?? videoInfo.duration;
      const duration = endTime - startTime;

      // Extract all frames using ffmpeg
      // Use -fps_mode passthrough to extract every frame (no frame skipping)

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
currentTime += 1 / videoInfo.fps;
          frameIndex++;
        } else {
break;
        }
      }

      if (shouldCleanupVideo && fs.existsSync(videoPath)) {
        fs.unlinkSync(videoPath);
      }

      console.log(`✅ Extracted ${frames.length} frames from video`);
      return frames;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
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
      throw new Error(`masking failed: ${getErrorMessage(error)}`);
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
      throw new Error(`gradientBlend failed: ${getErrorMessage(error)}`);
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
      throw new Error(`animate failed: ${getErrorMessage(error)}`);
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
      throw new Error(`batch failed: ${getErrorMessage(error)}`);
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
      throw new Error(`chain failed: ${getErrorMessage(error)}`);
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
      throw new Error(`stitchImages failed: ${getErrorMessage(error)}`);
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
      throw new Error(`createCollage failed: ${getErrorMessage(error)}`);
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
      throw new Error(`compress failed: ${getErrorMessage(error)}`);
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
      throw new Error(`extractPalette failed: ${getErrorMessage(error)}`);
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
      throw new Error(`outPut failed: ${getErrorMessage(error)}`);
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

      if (opts.createDirectory && !fs.existsSync(opts.directory)) {
        fs.mkdirSync(opts.directory, { recursive: true });
      }

      let filename: string;
      if (opts.filename) {
        filename = opts.filename;

        if (!filename.includes('.')) {
          filename += `.${opts.format}`;
        }
      } else {

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

      const filePath = path.join(opts.directory, filename);
      if (!opts.overwrite && fs.existsSync(filePath)) {

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
      throw new Error(`save failed: ${getErrorMessage(error)}`);
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
      throw new Error(`saveMultiple failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Creates a chart based on the chart type.
   *
   * @param chartType - Type of chart to create ('pie', 'bar', 'horizontalBar', 'line')
   * @param data - Chart data (varies by chart type)
   * @param options - Chart options (varies by chart type)
   * @returns Promise<Buffer> - Chart image buffer
   *
   * @example
   * ```typescript
   * // Pie Chart
   * const pieChart = await painter.createChart('pie',
   *   [{ label: 'A', value: 30, color: '#ff0000' }],
   *   { dimensions: { width: 800, height: 600 } }
   * );
   *
   * // Bar Chart
   * const barChart = await painter.createChart('bar',
   *   [{ label: 'Jan', value: 20, xStart: 1, xEnd: 2, color: '#4A90E2' }],
   *   { dimensions: { height: 600 } }
   * );
   *
   * // Horizontal Bar Chart
   * const hBarChart = await painter.createChart('horizontalBar',
   *   [{ label: 'Product A', value: 150, color: '#4A90E2' }],
   *   { dimensions: { width: 800 } }
   * );
   *
   * // Line Chart
   * const lineChart = await painter.createChart('line',
   *   [{ label: 'Series 1', data: [{ x: 1, y: 10 }, { x: 2, y: 20 }], color: '#4A90E2' }],
   *   { dimensions: { width: 800, height: 600 } }
   * );
   * ```
   */
  async createChart<T extends 'pie' | 'bar' | 'horizontalBar' | 'line'>(
    chartType: T,
    data: T extends 'pie' ? PieSlice[] | any[]
      : T extends 'bar' ? BarChartData[] | any[]
      : T extends 'horizontalBar' ? HorizontalBarChartData[] | any[]
      : T extends 'line' ? LineSeries[] | any[]
      : never,
    options?: T extends 'pie' ? PieChartOptions | any
      : T extends 'bar' ? BarChartOptions | any
      : T extends 'horizontalBar' ? HorizontalBarChartOptions | any
      : T extends 'line' ? LineChartOptions | any
      : never
  ): Promise<Buffer> {
    switch (chartType) {
      case 'pie':
        return await this.chartCreator.createChart('pie', data as PieSlice[], options as PieChartOptions | undefined);
      case 'bar':
        return await this.chartCreator.createChart('bar', data as BarChartData[], options as BarChartOptions | undefined);
      case 'horizontalBar':
        return await this.chartCreator.createChart('horizontalBar', data as HorizontalBarChartData[], options as HorizontalBarChartOptions | undefined);
      case 'line':
        return await this.chartCreator.createChart('line', data as LineSeries[], options as LineChartOptions | undefined);
      default:
        throw new Error(`Unsupported chart type: ${chartType}`);
    }
  }

  /**
   * Creates a comparison chart with two charts side by side or top/bottom.
   * Each chart can be of any type (pie, bar, horizontalBar, line, donut) with its own data and config.
   *
   * @param options - Comparison chart configuration
   * @returns Promise<Buffer> - Comparison chart image buffer
   */
  async createComparisonChart(
    options: import('./utils/Charts/comparisonchart').ComparisonChartOptions
  ): Promise<Buffer> {
    return this.chartCreator.createComparisonChart(options);
  }

  public resetSaveCounter(): void {
    this.saveCounter = 1;
  }
}