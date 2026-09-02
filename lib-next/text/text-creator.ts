import { createCanvas, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { TextProperties } from "../types";
import { assignCanvasResultsBuffer } from "../canvas/canvas-creator";
import type { CanvasResults } from "../types";
import { EnhancedTextRenderer } from "./enhanced-text-renderer";
import { getErrorMessage, getCanvasContext } from "../core/errors";
import { decodeImageSource } from "../image/image-source-validation";

/**
 * Extended class for text creation functionality
 */
export class TextCreator {
  /**
   * Validates text properties for required fields.
   * @private
   * @param textProps - Text properties to validate
   */
  private validateTextProperties(textProps: TextProperties): void {
    if (!textProps.text || textProps.x == null || textProps.y == null) {
      throw new Error("createText: text, x, and y are required.");
    }
  }

  /**
   * Validates text properties array.
   * @private
   * @param textArray - Text properties to validate
   */
  private validateTextArray(textArray: TextProperties | TextProperties[]): void {
    const textList = Array.isArray(textArray) ? textArray : [textArray];
    if (textList.length === 0) {
      throw new Error("createText: At least one text object is required.");
    }
    for (const textProps of textList) {
      this.validateTextProperties(textProps);
    }
  }

  /**
   * Renders enhanced text using the new text renderer.
   * @private
   * @param ctx - Canvas 2D context
   * @param textProps - Text properties
   */
  private async renderEnhancedText(ctx: SKRSContext2D, textProps: TextProperties): Promise<void> {
    try {
      await EnhancedTextRenderer.renderText(ctx, textProps);
    } catch (error) {
      throw new Error(`renderEnhancedText failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Renders one or more rich text objects onto an existing context (no buffer round-trip).
   * Used by scene rendering and custom pipelines.
   */
  async renderTextsOntoContext(ctx: SKRSContext2D, textArray: TextProperties | TextProperties[]): Promise<void> {
    this.validateTextArray(textArray);
    const textList = Array.isArray(textArray) ? textArray : [textArray];
    for (const textProps of textList) {
      await this.renderEnhancedText(ctx, textProps);
    }
  }

  /**
   * Creates text on an existing canvas buffer with enhanced styling options.
   *
   * @param textArray - Single TextProperties object or array of TextProperties
   * @param canvasBuffer - Existing canvas buffer (Buffer) or CanvasResults object
   * @returns Promise<Buffer> - Updated canvas buffer in PNG format
   */
  async createText(textArray: TextProperties | TextProperties[], canvasBuffer: CanvasResults | Buffer): Promise<Buffer> {
    try {
      if (!canvasBuffer) {
        throw new Error("createText: canvasBuffer is required.");
      }
      this.validateTextArray(textArray);

      const textList = Array.isArray(textArray) ? textArray : [textArray];
      const sourceBuffer = Buffer.isBuffer(canvasBuffer) ? canvasBuffer : canvasBuffer?.buffer;
      if (!sourceBuffer) {
        throw new Error("Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer");
      }

      const existingImage: Image = await decodeImageSource(sourceBuffer, {
        label: "createText canvasBuffer",
        requireCanvasBudget: true,
      });
      const canvas = createCanvas(existingImage.width, existingImage.height);
      const ctx = getCanvasContext(canvas);

      ctx.drawImage(existingImage, 0, 0);
      await this.renderTextsOntoContext(ctx, textList);

      return assignCanvasResultsBuffer(canvasBuffer, canvas.toBuffer("image/png"));
    } catch (error) {
      throw new Error(`createText failed: ${getErrorMessage(error)}`);
    }
  }
}

export { TextCreator as TextRenderer };
