import type { CanvasConfig } from "../../types/canvas";
import { CanvasCreator, type CanvasResults } from "../../canvas/canvas-creator";

/** Canvas surface creation (`createCanvas`). */
export class CanvasCreate {
  constructor(private readonly creator: CanvasCreator) {}

  createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    return this.creator.createCanvas(canvas);
  }
}
