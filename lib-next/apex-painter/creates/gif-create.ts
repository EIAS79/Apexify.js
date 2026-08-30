import type { GIFOptions, GIFInputFrame, GIFEncodedFrame, Frame } from "../../types";
import type { AnimateOptions } from "../../gif/animate-frames";
import { animateFrames } from "../../gif/animate-frames";
import { GIFCreator } from "../../gif/gif-creator";
import {
  validateGeneratedGIFFrame,
  validateGIFInputFrames,
  validateGIFOptions,
} from "../../gif/gif-validation";

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
  return value != null && typeof (value as AsyncIterable<T>)[Symbol.asyncIterator] === "function";
}

function guardGeneratedFrames(options: GIFOptions): GIFOptions {
  if (!options.onStart) return options;
  const original = options.onStart;
  return {
    ...options,
    onStart: async (frameCountHint, painter) => {
      const generated = await original(frameCountHint, painter);
      if (isAsyncIterable<GIFEncodedFrame>(generated)) {
        return {
          async *[Symbol.asyncIterator]() {
            let index = 0;
            for await (const frame of generated) {
              validateGeneratedGIFFrame(frame, index++);
              yield frame;
            }
          },
        } as AsyncIterable<GIFEncodedFrame>;
      }
      const frames = generated as GIFEncodedFrame[];
      frames.forEach((frame, index) => validateGeneratedGIFFrame(frame, index));
      return frames;
    },
  };
}

/** GIF encode + frame animation helpers. */
export class GifCreate {
  constructor(private readonly gifCreator: GIFCreator) {}

  createGIF(
    gifFrames: GIFInputFrame[] | undefined,
    options: GIFOptions
  ): Promise<Awaited<ReturnType<GIFCreator["createGIF"]>>> {
    validateGIFOptions(options, gifFrames?.length ?? 0);
    if (!options.onStart) validateGIFInputFrames(gifFrames ?? []);
    return this.gifCreator.createGIF(gifFrames, guardGeneratedFrames(options));
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
