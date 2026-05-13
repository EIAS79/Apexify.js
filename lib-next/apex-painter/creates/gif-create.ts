import type { GIFOptions, GIFInputFrame, Frame } from "../../types/gif";
import type { AnimateOptions } from "../../gif/animate-frames";
import { animateFrames } from "../../gif/animate-frames";
import { GIFCreator } from "../../gif/gif-creator";

/** GIF encode + frame animation helpers. */
export class GifCreate {
  constructor(private readonly gifCreator: GIFCreator) {}

  createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    return this.gifCreator.createGIF(gifFrames, options);
  }

  animate(
    frames: Frame[],
    defaultDuration: number,
    defaultWidth: number = 800,
    defaultHeight: number = 600,
    options?: AnimateOptions
  ): Promise<Buffer[] | undefined> {
    return animateFrames(frames, defaultDuration, defaultWidth, defaultHeight, options);
  }
}
