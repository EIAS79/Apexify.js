import type { CreateImageOptions, ImageProperties } from "../../types/image";
import type { TextMetrics, TextProperties } from "../../types/text";
import type { CanvasResults } from "../../canvas/canvas-creator";
import { ImageCreator } from "../../image/image-creator";
import { TextCreator } from "../../text/text-creator";
import { TextMetricsCreator } from "../../text/text-metrics";

/** `createImage`, `createText`, `measureText`. */
export class ImageTextCreate {
  constructor(
    private readonly imageCreator: ImageCreator,
    private readonly textCreator: TextCreator,
    private readonly textMetricsCreator: TextMetricsCreator
  ) {}

  createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions
  ): Promise<Buffer> {
    return this.imageCreator.createImage(images, canvasBuffer, options);
  }

  createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer
  ): Promise<Buffer> {
    return this.textCreator.createText(textArray, canvasBuffer);
  }

  measureText(textProps: TextProperties): Promise<TextMetrics> {
    return this.textMetricsCreator.measureText(textProps);
  }
}
