import type { SceneCreator } from "./scene-creator";
import type { SceneRenderInput, SceneVideoFrameSlot } from "../types/scene";
import type { VideoCreationOptions, VideoCreator } from "../video/video-creator";
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
  }
): Promise<SceneToVideoResult> {
  const composedPng = await sceneCreator.render(scene);
  const opt = video.options;
  if (!opt.createFromFrames) {
    throw new Error("renderSceneToVideoFrames: options.createFromFrames is required.");
  }
  const cf = opt.createFromFrames;
  const prepend = video.prependComposedToFrames !== false;
  const body =
    video.framesWithRepeats != null ? expandSceneVideoFrames(video.framesWithRepeats) : [...cf.frames];
  const frames = prepend ? [composedPng, ...body] : body;
  if (frames.length === 0) {
    throw new Error("renderSceneToVideoFrames: no frames after expansion.");
  }
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
