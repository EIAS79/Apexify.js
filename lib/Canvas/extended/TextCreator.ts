import { createCanvas, loadImage, Image, SKRSContext2D } from "@napi-rs/canvas";
import type { TextProperties } from "../utils/utils";
import type { CanvasResults } from "./CanvasCreator";
import { EnhancedTextRenderer } from "../utils/Texts/enhancedTextRenderer";
import { renderTextOnPath } from "../utils/utils";
import { getErrorMessage, getCanvasContext } from "../utils/errorUtils";

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

    if (textProps.path && textProps.textOnPath) {
      renderTextOnPath(ctx, textProps.text, textProps.path, textProps.path.offset ?? 0);
    } else {
      await EnhancedTextRenderer.renderText(ctx, textProps);
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

      let existingImage: Image;

      if (Buffer.isBuffer(canvasBuffer)) {
        existingImage = await loadImage(canvasBuffer);
      } else if (canvasBuffer && canvasBuffer.buffer) {
        existingImage = await loadImage(canvasBuffer.buffer);
      } else {
        throw new Error('Invalid canvasBuffer provided. It should be a Buffer or CanvasResults object with a buffer');
      }

      if (!existingImage) {
        throw new Error('Unable to load image from buffer');
      }

      const canvas = createCanvas(existingImage.width, existingImage.height);
      const ctx = getCanvasContext(canvas);

      ctx.drawImage(existingImage, 0, 0);

      for (const textProps of textList) {
        await this.renderEnhancedText(ctx, textProps);
      }

      return canvas.toBuffer("image/png");
    } catch (error) {
      throw new Error(`createText failed: ${getErrorMessage(error)}`);
    }
  }
}

