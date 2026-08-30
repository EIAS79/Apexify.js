import type { CanvasConfig } from "../../types";
import { CanvasCreator } from "../../canvas/canvas-creator";
import { validateCanvasConfig } from "../../canvas/canvas-validation";
import type { CanvasResults } from "../../types";

/** Canvas surface creation (`createCanvas`). */
export class CanvasCreate {
  constructor(private readonly creator: CanvasCreator) {}

  createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    validateCanvasConfig(canvas);
    return this.creator.createCanvas(canvas);
  }
}
