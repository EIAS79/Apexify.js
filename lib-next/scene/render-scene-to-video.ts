import type { SceneCreator } from "./scene-creator";
import type { SceneRenderInput, SceneRenderOptions, SceneVideoFrameSlot } from "../types";
import type { VideoCreationOptions, VideoCreator } from "../video/video-creator";
import { ApexifyInputError } from "../runtime/errors";
import { expandSceneVideoFrames } from "./video-scene";

export type SceneToVideoResult = Awaited<ReturnType<VideoCreator["createVideo"]>>;

/**
 * Compose a scene to PNG, merge with optional extra frames, then encode via {@link VideoCreator.createVideo}.
 * Scene orchestration only — generic FFmpeg ops stay under `lib-next/video/`.
 */
export async function renderSceneToVideoFrames(
  sceneCreator: SceneCreator,
  videoCreator: VideoCreator,
  scene: SceneRenderInput,
  video: {
    options: VideoCreationOptions;
    prependComposedToFrames?: boolean;
    framesWithRepeats?: SceneVideoFrameSlot[];
    /** Passed to {@link SceneCreator.render} when composing the scene PNG. */
    sceneRender?: SceneRenderOptions;
  }
): Promise<SceneToVideoResult> {
  const opt = video.options;
  if (!opt.createFromFrames) {
    throw new ApexifyInputError("renderSceneToVideoFrames: options.createFromFrames is required.");
  }

  const cf = opt.createFromFrames;
  const prepend = video.prependComposedToFrames !== false;
  const body =
    video.framesWithRepeats != null ? expandSceneVideoFrames(video.framesWithRepeats) : [...cf.frames];
  if (!prepend && body.length === 0) {
    throw new ApexifyInputError("renderSceneToVideoFrames: no frames after expansion.");
  }

  // Render only after cheap structural validation so invalid video configuration does not waste raster work.
  const composedPng = await sceneCreator.render(scene, video.sceneRender);
  const frames = prepend ? [composedPng, ...body] : body;
  const merged: VideoCreationOptions = {
    ...opt,
    source: opt.source ?? composedPng,
    createFromFrames: {
      ...cf,
      frames,
    },
  };
  return videoCreator.createVideo(merged);
}
