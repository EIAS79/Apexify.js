import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderOptions,
  SceneGifInputFrame,
  SceneVideoFrameSlot,
  GIFOptions,
  GIFInputFrame,
} from "../../types";
import type { VideoCreationOptions, SceneToVideoResult } from "../../types";
import { SceneCreator } from "../../scene/scene-creator";
import { SceneBuilder } from "../../scene/scene-builder";
import { validateSceneRenderInput } from "../../scene/scene-validation";
import { expandSceneGifFrames } from "../../scene/gif-scene";
import { renderSceneToVideoFrames } from "../../scene/render-scene-to-video";
import type { GIFCreator } from "../../gif/gif-creator";
import { validateGIFInputFrames, validateGIFOptions } from "../../gif/gif-validation";
import type { VideoCreator } from "../../video/video-creator";
import type { AssetResolveFn } from "../../assets/asset-strings";
import { ApexifyInputError } from "../../runtime/errors";
import { assertWithinLimit } from "../../runtime/limits";
import { assertFiniteNumber } from "../../runtime/validation";

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
      validateSceneRenderInput({ width, height: h, background, layers: layers ?? [] });
      const b = new SceneBuilder(this.sceneCreator, width, h, layers, this.assetResolve);
      if (background !== undefined) b.setBackground(background);
      return b;
    }
    if (height === undefined) {
      throw new ApexifyInputError("createScene: height is required when the first argument is numeric width.");
    }
    validateSceneRenderInput({ width: widthOrConfig, height, layers: [] });
    return new SceneBuilder(this.sceneCreator, widthOrConfig, height, [], this.assetResolve);
  }

  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer> {
    return this.sceneCreator.render(input, options);
  }

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
      sceneRender?: SceneRenderOptions;
    }
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    if (gif.options.onStart) {
      throw new ApexifyInputError(
        "renderSceneToGIF: use createGIF with onStart alone, or remove onStart when building from a composed scene."
      );
    }

    const prepend = gif.prependComposedRaster !== false;
    const duration = gif.composedFrameDuration ?? gif.options.delay ?? 100;
    assertFiniteNumber(duration, "renderSceneToGIF.composedFrameDuration", { min: 0, exclusiveMin: true });

    const repeatRaw = gif.composedFrameRepeat ?? 1;
    assertFiniteNumber(repeatRaw, "renderSceneToGIF.composedFrameRepeat", { min: 1, integer: true });
    const composedRepeat = repeatRaw;
    assertWithinLimit("maxGifFrames", composedRepeat);

    // Expand and validate user-supplied tail before rendering the scene to avoid wasted raster work.
    const tail = expandSceneGifFrames(gif.gifFrames ?? []);
    if (tail.length > 0) validateGIFInputFrames(tail);
    const totalFrames = (prepend ? composedRepeat : 0) + tail.length;
    if (totalFrames === 0) {
      throw new ApexifyInputError("renderSceneToGIF: need at least one frame (prepend and/or gifFrames).");
    }
    assertWithinLimit("maxGifFrames", totalFrames);
    validateGIFOptions(gif.options, totalFrames);
    validateSceneRenderInput(scene, { maxSurfaceDepth: gif.sceneRender?.maxSurfaceDepth });

    const composedPng = await this.sceneCreator.render(scene, gif.sceneRender);
    const frames: GIFInputFrame[] = [];
    if (prepend) {
      const base: GIFInputFrame = { buffer: composedPng, duration };
      for (let i = 0; i < composedRepeat; i++) frames.push({ ...base });
    }
    frames.push(...tail);
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
    validateSceneRenderInput(scene, { maxSurfaceDepth: video.sceneRender?.maxSurfaceDepth });
    return renderSceneToVideoFrames(this.sceneCreator, videoCreator, scene, video);
  }
}
