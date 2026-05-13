/**
 * Facet types attached to {@link ApexPainter} (`detect`, `path2d`, `pixels`, `output`).
 */
import type { Path2D } from "@napi-rs/canvas";
import type { CanvasResults } from "../canvas/canvas-creator";
import type { PathCommand } from "../foundation/path-cmd";
import type { Path2DDrawOptions } from "../types/path2d-draw";
import type { CustomOptions } from "../types/path";
import type { HitRegion, HitDetectionOptions, HitDetectionResult } from "../types/hit-detection";
import type { PixelData, PixelManipulationOptions } from "../types/pixels";

/** Grouped hit-testing API: `await painter.detect.path(…)`, `.region(…)`, etc. */
export interface PainterHitDetect {
  path(
    path: Path2D | PathCommand[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult>;
  region(
    region: HitRegion,
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult>;
  anyRegion(
    regions: HitRegion[],
    x: number,
    y: number,
    options?: HitDetectionOptions
  ): Promise<HitDetectionResult>;
  distance(region: HitRegion, x: number, y: number): Promise<number>;
}

/** Path2D + custom lines: `painter.path2d.create(…)`, `.draw(…)`, `.custom(…)`. */
export interface PainterPath2D {
  create(commands: PathCommand[]): Path2D;
  draw(
    canvasBuffer: CanvasResults | Buffer,
    path: Path2D | PathCommand[],
    options?: Path2DDrawOptions
  ): Promise<Buffer>;
  custom(options: CustomOptions | CustomOptions[], buffer: CanvasResults | Buffer): Promise<Buffer>;
}

/** Pixel read/write: `await painter.pixels.getData(…)`, `.setData`, `.manipulate`, `.getColor`, `.setColor`. */
export interface PainterPixels {
  getData(
    canvasBuffer: CanvasResults | Buffer,
    options?: { x?: number; y?: number; width?: number; height?: number }
  ): Promise<PixelData>;
  setData(
    canvasBuffer: CanvasResults | Buffer,
    pixelData: PixelData,
    options?: {
      x?: number;
      y?: number;
      dirtyX?: number;
      dirtyY?: number;
      dirtyWidth?: number;
      dirtyHeight?: number;
    }
  ): Promise<Buffer>;
  manipulate(canvasBuffer: CanvasResults | Buffer, options: PixelManipulationOptions): Promise<Buffer>;
  getColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number
  ): Promise<{ r: number; g: number; b: number; a: number }>;
  setColor(
    canvasBuffer: CanvasResults | Buffer,
    x: number,
    y: number,
    color: { r: number; g: number; b: number; a?: number }
  ): Promise<Buffer>;
}

/** Encode / transfer finished PNG buffers: `painter.output.dataURL(buf)`, `.url(buf)`, etc. */
export interface PainterOutput {
  /** `data:image/png;base64,…` */
  dataURL(buffer: Buffer | Uint8Array): string;
  /** Base64 string without a data-URL prefix. */
  base64(buffer: Buffer | Uint8Array): string;
  blob(buffer: Buffer | Uint8Array): Blob;
  arrayBuffer(buffer: Buffer): ArrayBuffer;
  /**
   * Upload PNG bytes to Imgur and return the public link.
   * Requires `IMGUR_CLIENT_ID`, `IMGUR_CLIENT_SECRET`, `IMGUR_ACCESS_TOKEN`, `IMGUR_REFRESH_TOKEN`.
   */
  url(buffer: Buffer): Promise<string>;
}
