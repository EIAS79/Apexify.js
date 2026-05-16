import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderOptions,
  SceneGifInputFrame,
  SceneVideoFrameSlot,
} from "../../types/scene";
import type { GIFOptions, GIFInputFrame } from "../../types/gif";
import type { VideoCreationOptions } from "../../video/video-stack";
import type { SceneToVideoResult } from "../../scene/render-scene-to-video";
import { SceneCreator } from "../../scene/scene-creator";
import { SceneBuilder } from "../../scene/scene-builder";
import { validateSceneRenderInput } from "../../scene/scene-validation";
import { expandSceneGifFrames } from "../../scene/gif-scene";
import { renderSceneToVideoFrames } from "../../scene/render-scene-to-video";
import type { GIFCreator } from "../../gif/gif-creator";
import type { VideoCreator } from "../../video/video-creator";
import type { AssetResolveFn } from "../../assets/asset-strings";

/** Scene builder, render, scene→GIF, scene→video frames. */
export class SceneCreate {
  constructor(
    private readonly sceneCreator: SceneCreator,
    private readonly gifCreator: GIFCreator,
    private readonly assetResolve?: AssetResolveFn
  ) {}

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
      const { width, height: h, background, layers } = widthOrConfig;
      const b = new SceneBuilder(this.sceneCreator, width, h, layers, this.assetResolve);
      if (background !== undefined) {
        b.setBackground(background);
      }
      return b;
    }
    if (height === undefined) {
      throw new Error("createScene: height is required when the first argument is numeric width.");
    }
    return new SceneBuilder(this.sceneCreator, widthOrConfig, height, [], this.assetResolve);
  }

  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer> {
    return this.sceneCreator.render(input, options);
  }

  /**
   * Throws if `SceneRenderInput` is structurally invalid (dimensions, nested `surface` depth).
   * Use before persisting or accepting untrusted scene JSON.
   */
  validateRenderInput(
    input: SceneRenderInput,
    options?: Pick<SceneRenderOptions, "maxSurfaceDepth">
  ): void {
    validateSceneRenderInput(input, options);
  }

  async renderSceneToGIF(
    scene: SceneRenderInput,
    gif: {
      options: GIFOptions;
      gifFrames?: SceneGifInputFrame[];
      prependComposedRaster?: boolean;
      composedFrameDuration?: number;
      composedFrameRepeat?: number;
      /** Passed to {@link SceneCreator.render} for the composed raster frame. */
      sceneRender?: SceneRenderOptions;
    }
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    const composedPng = await this.sceneCreator.render(scene, gif.sceneRender);
    if (gif.options.onStart) {
      throw new Error(
        "renderSceneToGIF: use createGIF with onStart alone, or remove onStart when building from a composed scene."
      );
    }
    const prepend = gif.prependComposedRaster !== false;
    const duration =
      gif.composedFrameDuration ?? (typeof gif.options.delay === "number" ? gif.options.delay : 100);
    const composedRepeat = Math.max(1, Math.floor(gif.composedFrameRepeat ?? 1));
    const tail = expandSceneGifFrames(gif.gifFrames ?? []);
    const frames: GIFInputFrame[] = [];
    if (prepend) {
      const base: GIFInputFrame = { buffer: composedPng, duration };
      for (let i = 0; i < composedRepeat; i++) {
        frames.push({ ...base });
      }
    }
    frames.push(...tail);
    if (frames.length === 0) {
      throw new Error("renderSceneToGIF: need at least one frame (prepend and/or gifFrames).");
    }
    return this.gifCreator.createGIF(frames, gif.options);
  }

  renderSceneToVideoFrames(
    videoCreator: VideoCreator,
    scene: SceneRenderInput,
    video: {
      options: VideoCreationOptions;
      prependComposedToFrames?: boolean;
      framesWithRepeats?: SceneVideoFrameSlot[];
      sceneRender?: SceneRenderOptions;
    }
  ): Promise<SceneToVideoResult> {
    return renderSceneToVideoFrames(this.sceneCreator, videoCreator, scene, video);
  }
}
