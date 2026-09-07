import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { TextProperties } from "../types";
import { assignCanvasResultsBuffer } from "../canvas/canvas-creator";
import type { CanvasResults } from "../types";
import { EnhancedTextRenderer } from "./enhanced-text-renderer";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "../image/image-properties";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";

/** Extended class for text creation functionality. */
export class TextCreator {
  private validateTextProperties(textProps: TextProperties): void {
    if (!textProps.text || textProps.x == null || textProps.y == null) {
      throw new ApexifyInputError("createText: text, x, and y are required.");
    }
  }

  private validateTextArray(textArray: TextProperties | TextProperties[]): TextProperties[] {
    const textList = Array.isArray(textArray) ? textArray : [textArray];
    if (textList.length === 0) throw new ApexifyInputError("createText: At least one text object is required.");
    for (const textProps of textList) this.validateTextProperties(textProps);
    return textList;
  }

  private async renderEnhancedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    try {
      await EnhancedTextRenderer.renderText(ctx, textProps);
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("renderEnhancedText failed.", { cause: error });
    }
  }

  private async renderValidatedTextsOntoContext(ctx: SKRSContext2D, textList: TextProperties[]): Promise<void> {
    for (const textProps of textList) await this.renderEnhancedText(ctx, textProps);
  }

  /** Renders one or more rich text objects onto an existing context (no buffer round-trip). */
  async renderTextsOntoContext(ctx: SKRSContext2D, textArray: TextProperties | TextProperties[]): Promise<void> {
    const textList = this.validateTextArray(textArray);
    await this.renderValidatedTextsOntoContext(ctx, textList);
  }

  /** Trusted internal path used after the public facade validated text and decoded the base once. */
  async createTextFromDecodedBase(
    textArray: TextProperties | TextProperties[],
    canvasBuffer: CanvasResults | Buffer,
    existingImage: Image
  ): Promise<Buffer> {
    const textList = Array.isArray(textArray) ? textArray : [textArray];
    assertCanvasResourceLimits(existingImage.width, existingImage.height);
    const canvas = createCanvas(existingImage.width, existingImage.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(existingImage, 0, 0);
    await this.renderValidatedTextsOntoContext(ctx, textList);
    return assignCanvasResultsBuffer(canvasBuffer, canvas.toBuffer("image/png"));
  }

  /** Creates text on an existing canvas buffer with enhanced styling options. */
  async createText(textArray: TextProperties | TextProperties[], canvasBuffer: CanvasResults | Buffer): Promise<Buffer> {
    try {
      if (!canvasBuffer) throw new ApexifyInputError("createText: canvasBuffer is required.");
      this.validateTextArray(textArray);
      const sourceBuffer = Buffer.isBuffer(canvasBuffer) ? canvasBuffer : canvasBuffer?.buffer;
      if (!sourceBuffer) throw new ApexifyInputError("Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer.");
      const existingImage = await loadImageCached(sourceBuffer);
      assertCanvasResourceLimits(existingImage.width, existingImage.height);
      return await this.createTextFromDecodedBase(textArray, canvasBuffer, existingImage);
    } catch (error) {
      if (error instanceof ApexifyError) throw error;
      throw new ApexifyDecodeError("createText failed.", { cause: error });
    }
  }
}

export { TextCreator as TextRenderer };
