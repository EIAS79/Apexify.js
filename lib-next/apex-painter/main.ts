/** ApexPainter public façade. Cross-cutting runtime policy is inherited through async call scope. */

import type {
  OutputFormat,
  CanvasConfig,
  CreateImageOptions,
  ImageProperties,
  SaveOptions,
  SaveResult,
  TextMetrics,
  TextProperties,
  ExtractFramesOptions,
  BatchOperation,
  ChainOperation,
  GIFOptions,
  GIFInputFrame,
  Frame,
  SceneLayer,
  SceneRenderInput,
  SceneGifInputFrame,
  SceneVideoFrameSlot,
  SceneRenderOptions,
  PieSlice,
  PieChartOptions,
  PainterImageUtils,
  PainterHitDetect,
  PainterPath2D,
  PainterPixels,
  PainterOutput,
  PainterCreateAudio,
  TemplateOptions,
  TemplateSceneDefinition,
  PainterAssetRefsOptions,
  ApexifyPlugin,
  BatchChainAssetOpts,
  VideoCreationOptions,
  SceneToVideoResult,
  CanvasResults,
} from "../types";
import type { BarChartData, BarChartOptions } from "../chart/impl/barchart";
import type { HorizontalBarChartData, HorizontalBarChartOptions } from "../chart/impl/horizontalbarchart";
import type { LineSeries, LineChartOptions } from "../chart/impl/linechart";
import type { ScatterSeries, ScatterChartOptions } from "../chart/impl/scatterchart";
import type { RadarSeries, RadarChartOptions } from "../chart/impl/radarchart";
import type { PolarAreaSlice, PolarAreaChartOptions } from "../chart/impl/polarareachart";
import type { ExtractAllFramesOptions } from "../video/extract-all-frames";
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
import { createPainterImageUtils } from "../image/painter-image-utils";
import type { SaveCounterSession } from "../output/save-buffer";
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
import { AudioCreate } from "./creates/audio-create";
import { TemplateCreate } from "./creates/template-create";
import { OutputSaveCreate } from "./creates/output-save";
import { runBatch, runChain } from "./creates/batch-create";
import type { TemplateHandle } from "../template/template-handle";
import { AssetManager } from "../assets/asset-manager";
import { PluginHost } from "../plugins/plugin-host";
import { createPainterComponents, type PainterComponents } from "../components/painter-components";
import { resolveAssetRefsDeep } from "../assets/asset-strings";
import { resolveSceneRenderInputAssets } from "../assets/resolve-scene-assets";
import { ApexifyRuntime } from "../runtime/context";
import type { ApexifyRuntimeOptions } from "../runtime/config";

export interface ApexPainterOptions {
  type?: OutputFormat["type"];
  runtime?: ApexifyRuntimeOptions;
}

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
  private readonly audioCreate: AudioCreate;
  private readonly templateCreate: TemplateCreate;
  private readonly outputSaveCreate: OutputSaveCreate;

  /** Immutable runtime/security/resource configuration for this painter. */
  readonly runtime: ApexifyRuntime;
  readonly video: VideoStack;
  readonly assets: AssetManager;
  readonly plugins: PluginHost;
  readonly components: PainterComponents;
  readonly image: PainterImageUtils;
  readonly createAudio: PainterCreateAudio;

  private _detect: PainterHitDetect | undefined;
  private _path2d: PainterPath2D | undefined;
  private _pixels: PainterPixels | undefined;
  private _output: PainterOutput | undefined;
  private readonly _saveSession: SaveCounterSession = { saveCounter: 1 };
  private readonly _installedPluginNames = new Set<string>();

  constructor(options: ApexPainterOptions = {}) {
    this._outputFormat = { type: options.type ?? "buffer" } as OutputFormat;
    this.runtime = new ApexifyRuntime(options.runtime);

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
    this.video = new VideoStack({
      ffmpegPath: this.runtime.config.ffmpeg.ffmpegPath,
      ffprobePath: this.runtime.config.ffmpeg.ffprobePath,
      tempDirectory: this.runtime.config.temp.directory,
      retainTempFiles: this.runtime.config.temp.retainFiles,
    });
    this.image = createPainterImageUtils(this.runtime);
    this.canvasCreate = new CanvasCreate(this.canvasCreator);
    this.imageTextCreate = new ImageTextCreate(this.imageCreator, this.textCreator, this.textMetricsCreator);
    this.sceneCreate = new SceneCreate(this.sceneCreator, this.gifCreator, (ref) => this.assets.resolve(ref));
    this.chartCreate = new ChartCreate(this.chartCreator);
    this.gifCreate = new GifCreate(this.gifCreator);
    this.videoCreate = new VideoCreate(this.video);
    this.audioCreate = new AudioCreate();
    this.templateCreate = new TemplateCreate(this);
    this.outputSaveCreate = new OutputSaveCreate(() => this._outputFormat.type, this._saveSession);
    this.plugins = new PluginHost();
    this.components = createPainterComponents();
    this.createAudio = this.audioCreate;

    this.canvasCreator.setExtractVideoFrame((source, frameNumber, timeSeconds, outputFormat, quality) =>
      this.runtime.run(() => this.video.extractFrameAtTime(
        source,
        timeSeconds ?? (frameNumber !== undefined ? frameNumber / 30 : 0),
        outputFormat ?? "jpg",
        quality ?? 2
      ))
    );
  }

  private inRuntime<T>(operation: () => T): T {
    return this.runtime.run(operation);
  }

  get outputFormat(): OutputFormat {
    return this._outputFormat;
  }

  get detect(): PainterHitDetect {
    if (!this._detect) this._detect = createPainterDetectFacet(this.hitDetectionCreator);
    return this._detect;
  }

  get path2d(): PainterPath2D {
    if (!this._path2d) {
      this._path2d = createPainterPath2dFacet(this.path2DCreator, (options, buffer) => runDrawCustomLines(options, buffer));
    }
    return this._path2d;
  }

  get pixels(): PainterPixels {
    if (!this._pixels) this._pixels = createPainterPixelsFacet(this.pixelDataCreator);
    return this._pixels;
  }

  get output(): PainterOutput {
    if (!this._output) this._output = createPainterOutputFacet();
    return this._output;
  }

  private maybeResolveRefs<T>(value: T, resolveAssetRefs?: boolean): T {
    if (!resolveAssetRefs) return value;
    return resolveAssetRefsDeep(value, (ref) => this.assets.resolve(ref)) as T;
  }

  prepareForRender<T>(value: T): T {
    return resolveAssetRefsDeep(value, (ref) => this.assets.resolve(ref)) as T;
  }

  createCanvas(canvas: CanvasConfig, painterOpts?: PainterAssetRefsOptions): Promise<CanvasResults> {
    return this.inRuntime(() => this.canvasCreate.createCanvas(this.maybeResolveRefs(canvas, painterOpts?.resolveAssetRefs)));
  }

  createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    return this.inRuntime(() => {
      const imgs = this.maybeResolveRefs(images, painterOpts?.resolveAssetRefs);
      const opts = painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
      return this.imageTextCreate.createImage(imgs, canvasBuffer, opts);
    });
  }

  createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    return this.inRuntime(() => {
      const texts = this.maybeResolveRefs(textArray, painterOpts?.resolveAssetRefs);
      return this.imageTextCreate.createText(texts, canvasBuffer);
    });
  }

  measureText(textProps: TextProperties, painterOpts?: PainterAssetRefsOptions): Promise<TextMetrics> {
    return this.inRuntime(() => this.imageTextCreate.measureText(this.maybeResolveRefs(textProps, painterOpts?.resolveAssetRefs)));
  }

  createScene(config: {
    width: number;
    height: number;
    background?: SceneRenderInput["background"];
    layers?: SceneLayer[];
  }): SceneBuilder;
  createScene(width: number, height: number): SceneBuilder;
  createScene(
    widthOrConfig: number | {
      width: number;
      height: number;
      background?: SceneRenderInput["background"];
      layers?: SceneLayer[];
    },
    height?: number
  ): SceneBuilder {
    return this.inRuntime(() => {
      if (typeof widthOrConfig === "object") return this.sceneCreate.createScene(widthOrConfig);
      if (height === undefined) throw new Error("createScene: height is required when the first argument is numeric width.");
      return this.sceneCreate.createScene(widthOrConfig, height);
    });
  }

  createTemplate(definition: TemplateSceneDefinition, options?: TemplateOptions): TemplateHandle {
    return this.templateCreate.createTemplate(definition, options);
  }

  use(plugin: ApexifyPlugin<ApexPainter>): void {
    if (this._installedPluginNames.has(plugin.name)) {
      throw new Error(`ApexPainter.use: plugin "${plugin.name}" is already installed.`);
    }
    void plugin.install(this);
    this._installedPluginNames.add(plugin.name);
  }

  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer> {
    return this.inRuntime(() => {
      const { resolveAssetRefs = true, ...sceneOptions } = options ?? {};
      const prepared = resolveAssetRefs
        ? resolveSceneRenderInputAssets(input, (ref) => this.assets.resolve(ref))
        : input;
      return this.sceneCreate.renderScene(prepared, sceneOptions);
    });
  }

  validateSceneRenderInput(
    input: SceneRenderInput,
    options?: Pick<SceneRenderOptions, "maxSurfaceDepth">
  ): void {
    this.inRuntime(() => this.sceneCreate.validateRenderInput(input, options));
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
    return this.inRuntime(() => {
      const { resolveAssetRefs = true, ...sceneRender } = gif.sceneRender ?? {};
      const resolved = resolveAssetRefs
        ? resolveSceneRenderInputAssets(scene, (ref) => this.assets.resolve(ref))
        : scene;
      return this.sceneCreate.renderSceneToGIF(resolved, { ...gif, sceneRender });
    });
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
    return this.inRuntime(() => {
      const { resolveAssetRefs = true, ...sceneRender } = video.sceneRender ?? {};
      const resolved = resolveAssetRefs
        ? resolveSceneRenderInputAssets(scene, (ref) => this.assets.resolve(ref))
        : scene;
      return this.sceneCreate.renderSceneToVideoFrames(this.video.creator, resolved, { ...video, sceneRender });
    });
  }

  createVideo(options: VideoCreationOptions, painterOpts?: PainterAssetRefsOptions): Promise<SceneToVideoResult> {
    return this.inRuntime(() => this.videoCreate.createVideo(this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs)));
  }

  videoPipeline(
    source?: string | Buffer,
    initialLayers?: import("../types/video-pipeline").VideoPipelineLayer[]
  ) {
    return this.inRuntime(() => this.videoCreate.videoPipeline(source, initialLayers));
  }

  getVideoInfo(source: string | Buffer, skipFfmpegCheck?: boolean) {
    return this.inRuntime(() => this.videoCreate.getVideoInfo(source, skipFfmpegCheck));
  }

  extractFrames(videoSource: string | Buffer, options: ExtractFramesOptions) {
    return this.inRuntime(() => this.videoCreate.extractFrames(videoSource, options));
  }

  extractAllFrames(videoSource: string | Buffer, options?: ExtractAllFramesOptions) {
    return this.inRuntime(() => this.videoCreate.extractAllFrames(videoSource, options));
  }

  extractFrameAtTime(
    videoSource: string | Buffer,
    timeSeconds: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.inRuntime(() => this.videoCreate.extractFrameAtTime(videoSource, timeSeconds, outputFormat, quality));
  }

  extractFrameByNumber(
    videoSource: string | Buffer,
    frameNumber: number,
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.inRuntime(() => this.videoCreate.extractFrameByNumber(videoSource, frameNumber, outputFormat, quality));
  }

  extractMultipleFrames(
    videoSource: string | Buffer,
    times: number[],
    outputFormat: "jpg" | "png" = "jpg",
    quality: number = 2
  ) {
    return this.inRuntime(() => this.videoCreate.extractMultipleFrames(videoSource, times, outputFormat, quality));
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
    return this.inRuntime(() => {
      const resolvedData = this.maybeResolveRefs(data, painterOpts?.resolveAssetRefs);
      const resolvedOptions = painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
      return this.chartCreate.createChart(chartType, resolvedData as never, resolvedOptions as never);
    });
  }

  createComparisonChart(
    options: import("../chart/impl/comparisonchart").ComparisonChartOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    return this.inRuntime(() => this.chartCreate.createComparisonChart(this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs)));
  }

  createComboChart(
    options: import("../chart/impl/combochart").ComboChartOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer> {
    return this.inRuntime(() => this.chartCreate.createComboChart(this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs)));
  }

  createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    return this.inRuntime(() => {
      const frames = gifFrames !== undefined ? this.maybeResolveRefs(gifFrames, painterOpts?.resolveAssetRefs) : undefined;
      return this.gifCreate.createGIF(frames, this.maybeResolveRefs(options, painterOpts?.resolveAssetRefs));
    });
  }

  animate(
    frames: Frame[],
    defaultDuration: number,
    defaultWidth: number = 800,
    defaultHeight: number = 600,
    options?: import("../gif/animate-frames").AnimateOptions,
    painterOpts?: PainterAssetRefsOptions
  ): Promise<Buffer[] | undefined> {
    return this.inRuntime(() => {
      const resolvedFrames = this.maybeResolveRefs(frames, painterOpts?.resolveAssetRefs);
      const resolvedOptions = painterOpts?.resolveAssetRefs && options !== undefined ? this.prepareForRender(options) : options;
      return this.gifCreate.animate(resolvedFrames, defaultDuration, defaultWidth, defaultHeight, resolvedOptions);
    });
  }

  batch(operations: BatchOperation[], opts?: BatchChainAssetOpts): Promise<Buffer[]> {
    return this.inRuntime(() => runBatch(this, operations, {
      resolveAssetRefs: opts?.resolveAssetRefs,
      resolve: opts?.resolveAssetRefs ? opts.resolve ?? ((ref: string) => this.assets.resolve(ref)) : undefined,
    }));
  }

  chain(operations: ChainOperation[], opts?: BatchChainAssetOpts): Promise<Buffer> {
    return this.inRuntime(() => runChain(this, operations, {
      resolveAssetRefs: opts?.resolveAssetRefs,
      resolve: opts?.resolveAssetRefs ? opts.resolve ?? ((ref: string) => this.assets.resolve(ref)) : undefined,
    }));
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
