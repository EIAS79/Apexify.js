import type { CreateImageOptions, ImageProperties, TextMetrics, TextProperties } from "../../types";
import type { CanvasResults } from "../../types";
import { ImageCreator } from "../../image/image-creator";
import { validateImageInput } from "../../image/image-validation";
import { TextCreator } from "../../text/text-creator";
import { TextMetricsCreator } from "../../text/text-metrics";
import { validateTextInput, validateTextProperties } from "../../text/text-validation";

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
    validateImageInput(images, options);
    return this.imageCreator.createImage(images, canvasBuffer, options);
  }

  createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer
  ): Promise<Buffer> {
    validateTextInput(textArray);
    return this.textCreator.createText(textArray, canvasBuffer);
  }

  measureText(textProps: TextProperties): Promise<TextMetrics> {
    validateTextProperties(textProps);
    return this.textMetricsCreator.measureText(textProps);
  }
}
