import type { VideoOperations } from "./video-operations";
import type { VideoCreationOptions } from "./video-options";
import { validateVideoCreationOptions } from "./video-validation";

export type {
  MixAudioOperation,
  MixAudioOverlayClip,
  VideoCreationOptions,
  VideoOperationControls,
  VideoOutputFormat,
  VideoQuality,
  VideoFit,
  VideoAudioPolicy,
  VideoSource,
} from "./video-options";

/**
 * Public video router. Validation always runs before source resolution, temporary files,
 * ffprobe, or FFmpeg. Domain behavior lives in the cohesive VideoOperations modules.
 */
export class VideoCreator {
  constructor(private readonly operations: VideoOperations) {}

  createVideo(options: VideoCreationOptions): Promise<unknown> {
    validateVideoCreationOptions(options);
    return this.operations.create(options);
  }
}
