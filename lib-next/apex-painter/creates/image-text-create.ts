import type { CreateImageOptions, ImageProperties, TextMetrics, TextProperties } from "../../types";
import type { CanvasResults } from "../../types";
import { ApexifyInputError } from "../../runtime/errors";
import { ImageCreator } from "../../image/image-creator";
import { validateImageInput } from "../../image/image-validation";
import { inspectDecodedImageSource } from "../../image/image-source-validation";
import { TextCreator } from "../../text/text-creator";
import { TextMetricsCreator } from "../../text/text-metrics";
import { validateTextInput, validateTextProperties } from "../../text/text-validation";

async function preflightCanvasBuffer(canvasBuffer: CanvasResults | Buffer, label: string): Promise<void> {
  const buffer = Buffer.isBuffer(canvasBuffer)
    ? canvasBuffer
    : canvasBuffer && Buffer.isBuffer(canvasBuffer.buffer)
      ? canvasBuffer.buffer
      : undefined;
  if (!buffer) {
    throw new ApexifyInputError(`${label} canvasBuffer must be a Buffer or CanvasResults containing a Buffer.`);
  }
  await inspectDecodedImageSource(buffer, { label: `${label} canvasBuffer`, requireCanvasBudget: true });
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
    await preflightCanvasBuffer(canvasBuffer, "createImage");
    return this.imageCreator.createImage(images, canvasBuffer, options);
  }

  async createText(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer
  ): Promise<Buffer> {
    validateTextInput(textArray);
    await preflightCanvasBuffer(canvasBuffer, "createText");
    return this.textCreator.createText(textArray, canvasBuffer);
  }

  measureText(textProps: TextProperties): Promise<TextMetrics> {
    validateTextProperties(textProps);
    return this.textMetricsCreator.measureText(textProps);
  }
}
