import type { CreateImageOptions, ImageProperties, TextMetrics, TextProperties } from "../../types";
import type { CanvasResults } from "../../types";
import { ApexifyInputError } from "../../runtime/errors";
import { assertCanvasResourceLimits } from "../../runtime/limits";
import { ImageCreator } from "../../image/image-creator";
import { loadImageCached } from "../../image/image-properties";
import { validateImageInput } from "../../image/image-validation";
import { TextCreator } from "../../text/text-creator";
import { TextMetricsCreator } from "../../text/text-metrics";
import { validateTextInput, validateTextProperties } from "../../text/text-validation";

function canvasBufferOf(canvasBuffer: CanvasResults | Buffer, label: string): Buffer {
  const buffer = Buffer.isBuffer(canvasBuffer)
    ? canvasBuffer
    : canvasBuffer && Buffer.isBuffer(canvasBuffer.buffer)
      ? canvasBuffer.buffer
      : undefined;
  if (!buffer) throw new ApexifyInputError(`${label} canvasBuffer must be a Buffer or CanvasResults containing a Buffer.`);
  return buffer;
}

/** `createImage`, `createText`, `measureText`. */
export class ImageTextCreate {
  constructor(
    private readonly imageCreator: ImageCreator,
    private readonly textCreator: TextCreator,
    private readonly textMetricsCreator: TextMetricsCreator
  ) {}

  async createImage(
    images: ImageProperties | ImageProperties[],
    canvasBuffer: CanvasResults | Buffer,
    options?: CreateImageOptions
  ): Promise<Buffer> {
    validateImageInput(images, options);
    return this.imageCreator.createImage(images, canvasBuffer, options);
  }

  async createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer
  ): Promise<Buffer> {
    validateTextInput(textArray);
    const buffer = canvasBufferOf(canvasBuffer, "createText");
    const decoded = await loadImageCached(buffer);
    assertCanvasResourceLimits(decoded.width, decoded.height);
    return this.textCreator.createTextFromDecodedBase(textArray, canvasBuffer, decoded);
  }

  measureText(textProps: TextProperties): Promise<TextMetrics> {
    validateTextProperties(textProps);
    return this.textMetricsCreator.measureValidatedText(textProps);
  }
}
