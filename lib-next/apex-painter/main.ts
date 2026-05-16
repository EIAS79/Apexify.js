/**
 * lib-next `ApexPainter` — façade; per-domain logic lives in `./creates/*`, facets in `./facets.ts`.
 *
 * ### Named assets (`$id`, `$palette.key`)
 * **`renderScene`**, **`renderSceneToGIF`**, and **`renderSceneToVideoFrames`** resolve **`$refs`** **by default** (set **`resolveAssetRefs: false`** to skip).
 * **`SceneBuilder.render`** and imperative methods (**`createCanvas`**, **`createImage`**, **`createText`**, **`measureText`**, charts, **`createGIF`**, **`animate`**, **`createVideo`**, **`batch`** / **`chain`**) resolve only when **`{ resolveAssetRefs: true }`** is passed, or when you preprocess with **`prepareForRender`**. Templates resolve during **`TemplateHandle.render`**.
 */

import type { OutputFormat } from "../types/common";
import type { CanvasConfig } from "../types/canvas";
import type { CreateImageOptions, ImageProperties } from "../types/image";
import type { SaveOptions, SaveResult } from "../types/output";
import type { TextMetrics, TextProperties } from "../types/text";
import type { ExtractFramesOptions } from "../types/video";
import type { BatchOperation, ChainOperation } from "../types/batch";
import type { GIFOptions, GIFInputFrame, Frame } from "../types/gif";
import type {
  SceneLayer,
  SceneRenderInput,
  SceneGifInputFrame,
  SceneVideoFrameSlot,
  SceneRenderOptions,
} from "../types/scene";
import type { PieSlice, PieChartOptions } from "../types/chart";
import type { BarChartData, BarChartOptions } from "../chart/impl/barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "../chart/impl/horizontalbarchart";
import type { LineSeries, LineChartOptions } from "../chart/impl/linechart";
import type { ScatterSeries, ScatterChartOptions } from "../chart/impl/scatterchart";
import type { RadarSeries, RadarChartOptions } from "../chart/impl/radarchart";
import type { PolarAreaSlice, PolarAreaChartOptions } from "../chart/impl/polarareachart";
import type { VideoCreationOptions } from "../video/video-stack";
import type { ExtractAllFramesOptions } from "../video/extract-all-frames";
import type { SceneToVideoResult } from "../scene/render-scene-to-video";
import type { CanvasResults } from "../canvas/canvas-creator";
import type { SceneBuilder } from "../scene/scene-builder";
import { CanvasCreator } from "../canvas/canvas-creator";
import { GIFCreator } from "../gif/gif-creator";
import { ImageCreator } from "../image/image-creator";
import { TextCreator } from "../text/text-creator";
import { TextMetricsCreator } from "../text/text-metrics";
import { Path2DCreator } from "../path/path2d-creator";
import { HitDetectionCreator } from "../pixels/hit-detection-creator";
import { PixelDataCreator } from "../pixels/pixel-data-creator";
import { ChartCreator } from "../chart/chart-creator";
import { SceneCreator } from "../scene/scene-creator";
import { VideoStack } from "../video/video-stack";
import { painterImageUtils, type PainterImageUtils } from "../image/painter-image-utils";
import type { SaveCounterSession } from "../output/save-buffer";

import type { PainterHitDetect, PainterPath2D, PainterPixels, PainterOutput } from "./public-types";
import {
  createPainterDetectFacet,
  createPainterPath2dFacet,
  createPainterPixelsFacet,
  createPainterOutputFacet,
} from "./facets";
import { runDrawCustomLines } from "./path-custom-lines";
import { CanvasCreate } from "./creates/canvas-create";
import { ImageTextCreate } from "./creates/image-text-create";
import { SceneCreate } from "./creates/scene-create";
import { ChartCreate } from "./creates/chart-create";
import { GifCreate } from "./creates/gif-create";
import { VideoCreate } from "./creates/video-create";
import { OutputSaveCreate } from "./creates/output-save";
import { runBatch, runChain } from "./creates/batch-create";
import type { TemplateOptions, TemplateSceneDefinition } from "../types/template";
import { TemplateHandle } from "../template/template-handle";
import { AssetManager } from "../assets/asset-manager";
import { PluginHost } from "../plugins/plugin-host";
import { createPainterComponents, type PainterComponents } from "../components/painter-components";
import { resolveAssetRefsDeep } from "../assets/asset-strings";
import { resolveSceneRenderInputAssets } from "../assets/resolve-scene-assets";
import type { PainterAssetRefsOptions } from "../types/painter-resolve";
import type { ApexifyPlugin } from "../plugins/apexify-plugin";
import type { BatchChainAssetOpts } from "../batch/batch-operations";

export class ApexPainter {
  private readonly _outputFormat: OutputFormat;
  private readonly canvasCreator: CanvasCreator;
  private readonly imageCreator: ImageCreator;
  private readonly textCreator: TextCreator;
  private readonly textMetricsCreator: TextMetricsCreator;
  private readonly path2DCreator: Path2DCreator;
  private readonly hitDetectionCreator: HitDetectionCreator;
  private readonly pixelDataCreator: PixelDataCreator;
  private readonly gifCreator: GIFCreator;
  private readonly chartCreator: ChartCreator;
  private readonly sceneCreator: SceneCreator;

  private readonly canvasCreate: CanvasCreate;
  private readonly imageTextCreate: ImageTextCreate;
  private readonly sceneCreate: SceneCreate;
  private readonly chartCreate: ChartCreate;
  private readonly gifCreate: GifCreate;
  private readonly videoCreate: VideoCreate;
  private readonly outputSaveCreate: OutputSaveCreate;

  /**
   * Shared FFmpeg session + {@link VideoCreator}. Prefer {@link createVideo}, {@link getVideoInfo},
   * {@link extractFrameAtTime}, etc.; use `video` when you need the stack object itself.
   */
  readonly video: VideoStack;
  /**
   * Named images, fonts, and palettes for **`$id`** resolution (templates, scenes, and opt-in imperative APIs).
   */
  readonly assets: AssetManager;
  /**
   * Optional extension APIs registered with {@link ApexPainter.plugins.use}.
   */
  readonly plugins: PluginHost;
  /**
   * Reusable scene fragments (**`badge`**, **`progressBar`**, **`avatar`**, **`card`**, **`watermark`**) returning {@link SceneLayer}[].
   */
  readonly components: PainterComponents;
  /**
   * Stitch, collage, compress, palette, resize, convert, filters, blend, crop, mask, gradient, hex check.
   */
  readonly image: PainterImageUtils = painterImageUtils;

  private _detect: PainterHitDetect | undefined;
  private _path2d: PainterPath2D | undefined;
  private _pixels: PainterPixels | undefined;
  private _output: PainterOutput | undefined;
  private readonly _saveSession: SaveCounterSession = { saveCounter: 1 };
  private readonly _installedPluginNames = new Set<string>();

  constructor({ type }: OutputFormat = { type: "buffer" }) {
    this._outputFormat = { type: type || "buffer" };
    this.canvasCreator = new CanvasCreator();
    this.imageCreator = new ImageCreator();
    this.textCreator = new TextCreator();
    this.textMetricsCreator = new TextMetricsCreator();
    this.path2DCreator = new Path2DCreator();
    this.hitDetectionCreator = new HitDetectionCreator();
    this.pixelDataCreator = new PixelDataCreator();
    this.gifCreator = new GIFCreator();
    this.gifCreator.setPainter(this);
    this.chartCreator = new ChartCreator();
    this.sceneCreator = new SceneCreator({
      canvasCreator: this.canvasCreator,
      imageCreator: this.imageCreator,
      textCreator: this.textCreator,
      path2DCreator: this.path2DCreator,
      chartCreator: this.chartCreator,
    });

    this.assets = new AssetManager();

    this.video = new VideoStack();
    this.canvasCreate = new CanvasCreate(this.canvasCreator);
    this.imageTextCreate = new ImageTextCreate(this.imageCreator, this.textCreator, this.textMetricsCreator);
    this.sceneCreate = new SceneCreate(this.sceneCreator, this.gifCreator, (ref) => this.assets.resolve(ref));
    this.chartCreate = new ChartCreate(this.chartCreator);
    this.gifCreate = new GifCreate(this.gifCreator);
    this.videoCreate = new VideoCreate(this.video);
    this.outputSaveCreate = new OutputSaveCreate(
      () => this._outputFormat?.type || "buffer",
      this._saveSession
    );

    this.plugins = new PluginHost();
    this.components = createPainterComponents();
  }

  get outputFormat(): OutputFormat {
    return this._outputFormat;
  }

  get detect(): PainterHitDetect {
    if (!this._detect) {
      this._detect = createPainterDetectFacet(this.hitDetectionCreator);
    }
    return this._detect;
  }

  get path2d(): PainterPath2D {
    if (!this._path2d) {
      this._path2d = createPainterPath2dFacet(this.path2DCreator, (options, buffer) =>
        runDrawCustomLines(options, buffer)
      );
    }
    return this._path2d;
  }

  get pixels(): PainterPixels {
    if (!this._pixels) {
      this._pixels = createPainterPixelsFacet(this.pixelDataCreator);
    }
    return this._pixels;
  }

  get output(): PainterOutput {
    if (!this._output) {
      this._output = createPainterOutputFacet();
    }
    return this._output;
  }

  private maybeResolveRefs<T>(value: T, resolveAssetRefs?: boolean): T {
    if (!resolveAssetRefs) return value;
    return resolveAssetRefsDeep(value, (ref) => this.assets.resolve(ref)) as T;
  }

  /**
   * Deep-resolves **`$name`** / **`$palette.key`** string leaves across a JSON-like value (cloned), using {@link assets}.
   * Use ahead of imperative calls when you keep **`resolveAssetRefs: false`** on individual methods.
   */
  prepareForRender<T>(value: T): T {
    return resolveAssetRefsDeep(value, (ref) => this.assets.resolve(ref)) as T;
  }

  createCanvas(canvas: CanvasConfig, painterOpts?: PainterAssetRefsOptions): Promise<CanvasResults> {
    return this.canvasCreate.createCanvas(this.maybeResolveRefs(canvas, painterOpts?.resolveAssetRefs));
  }

  createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    const imgs = this.maybeResolveRefs(images, painterOpts?.resolveAssetRefs);
    const opts =
      painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
    return this.imageTextCreate.createImage(imgs, canvasBuffer, opts);
  }

  createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    const texts = this.maybeResolveRefs(textArray, painterOpts?.resolveAssetRefs);
    return this.imageTextCreate.createText(texts, canvasBuffer);
  }

  measureText(textProps: TextProperties, painterOpts?: PainterAssetRefsOptions): Promise<TextMetrics> {
    const p = this.maybeResolveRefs(textProps, painterOpts?.resolveAssetRefs);
    return this.imageTextCreate.measureText(p);
  }

  /**
   * Layered scene composition (chart / image / text / path / surface). Use {@link SceneBuilder} methods
   * (`addLayers`, `insertLayer`, `moveLayer`, …); renders to one PNG on {@link SceneBuilder.render}.
   * Use **`scene.render({ resolveAssetRefs: true })`** when layer strings contain **`$...`** asset refs (same resolver as {@link renderScene}).
   */
  createScene(config: {
    width: number;
    height: number;
    background?: SceneRenderInput["background"];
    layers?: SceneLayer[];
  }): SceneBuilder;
  createScene(width: number, height: number): SceneBuilder;
  createScene(
    widthOrConfig:
      | number
      | {
          width: number;
          height: number;
          background?: SceneRenderInput["background"];
          layers?: SceneLayer[];
        },
    height?: number
  ): SceneBuilder {
    if (typeof widthOrConfig === "object") {
      return this.sceneCreate.createScene(widthOrConfig);
    }
    if (height === undefined) {
      throw new Error("createScene: height is required when the first argument is numeric width.");
    }
    return this.sceneCreate.createScene(widthOrConfig, height);
  }

  /**
   * Reusable scene design: **`{{placeholders}}`**, **`$namedAssets`**, optional flex **`layout`** nodes,
   * **`visible`** conditionals, and **`id`** + render-time **`overrides`**. Resolves to {@link renderScene}.
   */
  createTemplate(definition: TemplateSceneDefinition, options?: TemplateOptions): TemplateHandle {
    return new TemplateHandle(this, definition, options);
  }

  /**
   * Optional extensions: run **`install`** once per **`name`** (e.g. register APIs on {@link ApexPainter.plugins}).
   */
  use(plugin: ApexifyPlugin<ApexPainter>): void {
    if (this._installedPluginNames.has(plugin.name)) {
      throw new Error(`ApexPainter.use: plugin "${plugin.name}" is already installed.`);
    }
    void plugin.install(this);
    this._installedPluginNames.add(plugin.name);
  }

  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer> {
    const { resolveAssetRefs = true, ...sceneOptions } = options ?? {};
    const prepared = resolveAssetRefs
      ? resolveSceneRenderInputAssets(input, (ref) => this.assets.resolve(ref))
      : input;
    return this.sceneCreate.renderScene(prepared, sceneOptions);
  }

  /**
   * Validates a scene description (dimensions, nested `surface` depth). Throws on invalid input.
   */
  validateSceneRenderInput(
    input: SceneRenderInput,
    options?: Pick<SceneRenderOptions, "maxSurfaceDepth">
  ): void {
    this.sceneCreate.validateRenderInput(input, options);
  }

  renderSceneToGIF(
    scene: SceneRenderInput,
    gif: {
      options: GIFOptions;
      gifFrames?: SceneGifInputFrame[];
      prependComposedRaster?: boolean;
      composedFrameDuration?: number;
      composedFrameRepeat?: number;
      sceneRender?: SceneRenderOptions;
    }
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    const { resolveAssetRefs = true, ...sr } = gif.sceneRender ?? {};
    const resolved = resolveAssetRefs
      ? resolveSceneRenderInputAssets(scene, (ref) => this.assets.resolve(ref))
      : scene;
    return this.sceneCreate.renderSceneToGIF(resolved, { ...gif, sceneRender: sr });
  }

  renderSceneToVideoFrames(
    scene: SceneRenderInput,
    video: {
      options: VideoCreationOptions;
      prependComposedToFrames?: boolean;
      framesWithRepeats?: SceneVideoFrameSlot[];
      sceneRender?: SceneRenderOptions;
    }
  ): Promise<SceneToVideoResult> {
    const { resolveAssetRefs = true, ...sr } = video.sceneRender ?? {};
    const resolved = resolveAssetRefs
      ? resolveSceneRenderInputAssets(scene, (ref) => this.assets.resolve(ref))
      : scene;
    return this.sceneCreate.renderSceneToVideoFrames(this.video.creator, resolved, {
      ...video,
      sceneRender: sr,
    });
  }

  createVideo(
    options: VideoCreationOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<SceneToVideoResult> {
    const o = this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs);
    return this.videoCreate.createVideo(o);
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck?: boolean) {
    return this.videoCreate.getVideoInfo(source, skipFfmpegCheck);
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    return this.videoCreate.extractFrames(videoSource, options);
  }

  extractAllFrames(videoSource: string | Buffer, options?: ExtractAllFramesOptions) {
    return this.videoCreate.extractAllFrames(videoSource, options);
  }

  extractFrameAtTime(
    videoSource: string | Buffer,
    timeSeconds: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.videoCreate.extractFrameAtTime(videoSource, timeSeconds, outputFormat, quality);
  }

  extractFrameByNumber(
    videoSource: string | Buffer,
    frameNumber: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.videoCreate.extractFrameByNumber(videoSource, frameNumber, outputFormat, quality);
  }

  extractMultipleFrames(
    videoSource: string | Buffer,
    times: number[],
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.videoCreate.extractMultipleFrames(videoSource, times, outputFormat, quality);
  }

  createChart<T extends "pie" | "bar" | "horizontalBar" | "line" | "scatter" | "radar" | "polarArea">(
    chartType: T,
    data: T extends "pie"
      ? PieSlice[]
      : T extends "bar"
        ? BarChartData[]
        : T extends "horizontalBar"
          ? HorizontalBarChartData[]
          : T extends "line"
            ? LineSeries[]
            : T extends "scatter"
              ? ScatterSeries[]
              : T extends "radar"
                ? RadarSeries[]
                : T extends "polarArea"
                  ? PolarAreaSlice[]
                  : never,
    options?: T extends "pie"
      ? PieChartOptions
      : T extends "bar"
        ? BarChartOptions
        : T extends "horizontalBar"
          ? HorizontalBarChartOptions
          : T extends "line"
            ? LineChartOptions
            : T extends "scatter"
              ? ScatterChartOptions
              : T extends "radar"
                ? RadarChartOptions
                : T extends "polarArea"
                  ? PolarAreaChartOptions
                  : never,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    const d = this.maybeResolveRefs(data, painterOpts?.resolveAssetRefs);
    const o =
      painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
    return this.chartCreate.createChart(chartType, d as never, o as never);
  }

  createComparisonChart(
    options: import("../chart/impl/comparisonchart").ComparisonChartOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    const o = this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs);
    return this.chartCreate.createComparisonChart(o);
  }

  createComboChart(
    options: import("../chart/impl/combochart").ComboChartOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    const o = this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs);
    return this.chartCreate.createComboChart(o);
  }

  createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    const f =
      gifFrames !== undefined ? this.maybeResolveRefs(gifFrames, painterOpts?.resolveAssetRefs) : undefined;
    const o = this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs);
    return this.gifCreate.createGIF(f, o);
  }

  animate(
    frames: Frame[],
    defaultDuration: number,
    defaultWidth: number = 800,
    defaultHeight: number = 600,
    options?: import("../gif/animate-frames").AnimateOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer[] | undefined> {
    const fr = this.maybeResolveRefs(frames, painterOpts?.resolveAssetRefs);
    const opt =
      painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
    return this.gifCreate.animate(fr, defaultDuration, defaultWidth, defaultHeight, opt);
  }

  batch(operations: BatchOperation[], opts?: BatchChainAssetOpts): Promise<Buffer[]> {
    return runBatch(this, operations, {
      resolveAssetRefs: opts?.resolveAssetRefs,
      resolve:
        opts?.resolveAssetRefs
          ? opts.resolve ?? ((ref: string) => this.assets.resolve(ref))
          : undefined,
    });
  }

  chain(operations: ChainOperation[], opts?: BatchChainAssetOpts): Promise<Buffer> {
    return runChain(this, operations, {
      resolveAssetRefs: opts?.resolveAssetRefs,
      resolve:
        opts?.resolveAssetRefs
          ? opts.resolve ?? ((ref: string) => this.assets.resolve(ref))
          : undefined,
    });
  }

  outPut(results: Buffer): Promise<Buffer | string | Blob | ArrayBuffer> {
    return this.outputSaveCreate.outPut(results);
  }

  save(buffer: Buffer, options?: SaveOptions): Promise<SaveResult> {
    return this.outputSaveCreate.save(buffer, options);
  }

  saveMultiple(buffers: Buffer[], options?: SaveOptions): Promise<SaveResult[]> {
    return this.outputSaveCreate.saveMultiple(buffers, options);
  }
}
