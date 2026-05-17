import type { CanvasConfig } from "../../types";
import { CanvasCreator } from "../../canvas/canvas-creator";
import type { CanvasResults } from "../../types";

/** Canvas surface creation (`createCanvas`). */
export class CanvasCreate {
  constructor(private readonly creator: CanvasCreator) {}

  createCanvas(canvas: CanvasConfig): Promise<CanvasResults> {
    return this.creator.createCanvas(canvas);
  }
}
