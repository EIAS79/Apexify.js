import {
  dataURL as encodeDataURL,
  base64 as encodeBase64,
  blob as encodeBlob,
  arrayBuffer as encodeArrayBuffer,
} from "../output/buffer-encoding";
import { url as uploadPngToUrl } from "../output/upload-imgur";
import type { HitDetectionCreator } from "../pixels/hit-detection-creator";
import type { Path2DCreator } from "../path/path2d-creator";
import type { PixelDataCreator } from "../pixels/pixel-data-creator";
import type { CanvasResults } from "../canvas/canvas-creator";
import type { CustomOptions } from "../types/path";
import type { PainterHitDetect, PainterPath2D, PainterPixels, PainterOutput } from "./public-types";

export function createPainterDetectFacet(h: HitDetectionCreator): PainterHitDetect {
  return {
    path: async (path, x, y, options) => h.isPointInPath(path, x, y, options),
    region: async (region, x, y, options) => h.isPointInRegion(region, x, y, options),
    anyRegion: async (regions, x, y, options) => h.isPointInAnyRegion(regions, x, y, options),
    distance: async (region, x, y) => h.getDistanceToRegion(region, x, y),
  };
}

export function createPainterPath2dFacet(
  p: Path2DCreator,
  drawCustom: (options: CustomOptions | CustomOptions[], buffer: CanvasResults | Buffer) => Promise<Buffer>
): PainterPath2D {
  return {
    create: (commands) => p.createPath2D(commands),
    draw: (canvasBuffer, path, options) => p.drawPath(canvasBuffer, path, options),
    custom: (options, buffer) => drawCustom(options, buffer),
  };
}

export function createPainterPixelsFacet(px: PixelDataCreator): PainterPixels {
  return {
    getData: (canvasBuffer, options) => px.getPixelData(canvasBuffer, options),
    setData: (canvasBuffer, pixelData, options) => px.setPixelData(canvasBuffer, pixelData, options),
    manipulate: (canvasBuffer, options) => px.manipulatePixels(canvasBuffer, options),
    getColor: (canvasBuffer, x, y) => px.getPixelColor(canvasBuffer, x, y),
    setColor: (canvasBuffer, x, y, color) => px.setPixelColor(canvasBuffer, x, y, color),
  };
}

export function createPainterOutputFacet(): PainterOutput {
  return {
    dataURL: encodeDataURL,
    base64: encodeBase64,
    blob: encodeBlob,
    arrayBuffer: encodeArrayBuffer,
    url: uploadPngToUrl,
  };
}
