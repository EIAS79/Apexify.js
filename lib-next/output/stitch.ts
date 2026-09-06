import { createCanvas, type Image } from "@napi-rs/canvas";
import type { StitchOptions, CollageLayout } from "../types";
import { getCanvasContext } from "../core/errors";
import { loadImageCached } from "../image/image-properties";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";
import { assertCollection, assertFiniteNumber, assertRecord } from "../runtime/validation";

type Source = string | Buffer;
type CollageSource = { source: Source; width?: number; height?: number };
type Loaded = { image: Image; width: number; height: number };
type Position = { x: number; y: number };

async function mapBounded<T, R>(items: readonly T[], worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const concurrency = Math.min(items.length, getDefaultApexifyRuntimeConfig().limits.maxBatchConcurrency);
  const results = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!, index);
    }
  }));
  return results;
}

function validateSources(images: unknown, name: string): asserts images is Source[] {
  assertCollection(images, name, { min: 1, limit: "maxCollectionItems" });
  for (let i = 0; i < images.length; i++) {
    const source = images[i];
    if (!(typeof source === "string" || Buffer.isBuffer(source))) throw new ApexifyInputError(`${name}[${i}] must be a string or Buffer.`);
  }
}

function validateStitchOptions(options: StitchOptions): void {
  assertRecord(options, "stitch.options");
  const direction = options.direction ?? "horizontal";
  if (!["horizontal", "vertical", "grid"].includes(direction)) throw new ApexifyInputError(`stitch.direction is unsupported: ${String(direction)}.`);
  assertFiniteNumber(options.overlap ?? 0, "stitch.overlap", { min: 0, integer: true });
  assertFiniteNumber(options.spacing ?? 0, "stitch.spacing", { min: 0, integer: true });
  if (options.blend !== undefined && typeof options.blend !== "boolean") throw new ApexifyInputError("stitch.blend must be boolean.");
  if (direction === "grid" && (options.overlap ?? 0) !== 0) throw new ApexifyInputError("stitch.overlap is not supported for grid direction.");
}

function validateCollage(images: unknown, layout: CollageLayout): asserts images is CollageSource[] {
  assertCollection(images, "collage.images", { min: 1, limit: "maxCollectionItems" });
  assertRecord(layout, "collage.layout");
  if (!["grid", "masonry", "carousel"].includes(layout.type)) throw new ApexifyInputError(`collage.layout.type is unsupported: ${String(layout.type)}.`);
  assertFiniteNumber(layout.columns ?? 3, "collage.layout.columns", { min: 1, integer: true });
  assertFiniteNumber(layout.rows ?? 3, "collage.layout.rows", { min: 1, integer: true });
  assertFiniteNumber(layout.spacing ?? 10, "collage.layout.spacing", { min: 0, integer: true });
  assertFiniteNumber(layout.borderRadius ?? 0, "collage.layout.borderRadius", { min: 0 });
  for (let i = 0; i < images.length; i++) {
    const item: unknown = images[i];
    assertRecord(item, `collage.images[${i}]`);
    if (!(typeof item.source === "string" || Buffer.isBuffer(item.source))) throw new ApexifyInputError(`collage.images[${i}].source must be a string or Buffer.`);
    if (item.width !== undefined) assertFiniteNumber(item.width, `collage.images[${i}].width`, { min: 1, integer: true });
    if (item.height !== undefined) assertFiniteNumber(item.height, `collage.images[${i}].height`, { min: 1, integer: true });
  }
}

async function loadCollageImages(images: CollageSource[]): Promise<Loaded[]> {
  return mapBounded(images, async (item) => {
    const image = await loadImageCached(item.source);
    const width = item.width ?? image.width;
    const height = item.height ?? image.height;
    assertCanvasResourceLimits(width, height);
    return { image, width, height };
  });
}

function shortestColumn(heights: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < heights.length; i++) if (heights[i]! < heights[best]!) best = i;
  return best;
}

function masonryPositions(loaded: readonly Loaded[], columns: number, spacing: number, cellWidth: number): { positions: Position[]; height: number } {
  const heights = new Array<number>(columns).fill(0);
  const positions: Position[] = [];
  for (const item of loaded) {
    const col = shortestColumn(heights);
    const y = heights[col]!;
    positions.push({ x: col * (cellWidth + spacing), y });
    heights[col] = y + item.height + spacing;
  }
  return { positions, height: Math.max(...heights) - spacing };
}

/** Stitch images horizontally, vertically, or in a square-ish grid. Differing dimensions are padded transparently. */
export async function stitchImages(images: Source[], options: StitchOptions = {}): Promise<Buffer> {
  validateSources(images, "stitch.images");
  validateStitchOptions(options);
  try {
    const loaded = await mapBounded(images, async (source) => {
      const image = await loadImageCached(source);
      assertCanvasResourceLimits(image.width, image.height);
      return image;
    });
    const direction = options.direction ?? "horizontal";
    const overlap = options.overlap ?? 0;
    const spacing = options.spacing ?? 0;
    const blend = options.blend ?? false;
    const maxWidth = Math.max(...loaded.map((image) => image.width));
    const maxHeight = Math.max(...loaded.map((image) => image.height));
    let canvasWidth: number;
    let canvasHeight: number;
    let columns = 1;

    if (direction === "horizontal") {
      canvasWidth = loaded.reduce((sum, image) => sum + image.width, 0) - overlap * (loaded.length - 1) + spacing * (loaded.length - 1);
      canvasHeight = maxHeight;
    } else if (direction === "vertical") {
      canvasWidth = maxWidth;
      canvasHeight = loaded.reduce((sum, image) => sum + image.height, 0) - overlap * (loaded.length - 1) + spacing * (loaded.length - 1);
    } else {
      columns = Math.ceil(Math.sqrt(loaded.length));
      const rows = Math.ceil(loaded.length / columns);
      canvasWidth = maxWidth * columns + spacing * (columns - 1);
      canvasHeight = maxHeight * rows + spacing * (rows - 1);
    }
    if (canvasWidth <= 0 || canvasHeight <= 0) throw new ApexifyInputError("stitch overlap produces non-positive output dimensions.");
    assertCanvasResourceLimits(canvasWidth, canvasHeight);

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = getCanvasContext(canvas);
    let x = 0, y = 0;
    for (let i = 0; i < loaded.length; i++) {
      const image = loaded[i]!;
      let drawX = x, drawY = y;
      if (direction === "grid") {
        const col = i % columns, row = Math.floor(i / columns);
        drawX = col * (maxWidth + spacing);
        drawY = row * (maxHeight + spacing);
      }
      ctx.drawImage(image, drawX, drawY, image.width, image.height);
      if (blend && i > 0 && overlap > spacing && direction !== "grid") {
        const actualOverlap = overlap - spacing;
        ctx.save();
        ctx.beginPath();
        if (direction === "horizontal") ctx.rect(drawX, drawY, actualOverlap, image.height);
        else ctx.rect(drawX, drawY, image.width, actualOverlap);
        ctx.clip();
        ctx.globalCompositeOperation = "multiply";
        ctx.globalAlpha = 0.5;
        ctx.drawImage(image, drawX, drawY, image.width, image.height);
        ctx.restore();
      }
      if (direction === "horizontal") x += image.width - overlap + spacing;
      else if (direction === "vertical") y += image.height - overlap + spacing;
    }
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("stitchImages failed.", { cause });
  }
}

/** Create a bounded grid, shortest-column masonry, or carousel collage. */
export async function createCollage(images: CollageSource[], layout: CollageLayout): Promise<Buffer> {
  validateCollage(images, layout);
  try {
    const loaded = await loadCollageImages(images);
    const type = layout.type;
    const columns = layout.columns ?? 3;
    const rows = layout.rows ?? 3;
    const spacing = layout.spacing ?? 10;
    const background = layout.background ?? "#ffffff";
    const borderRadius = layout.borderRadius ?? 0;
    const cellWidth = Math.max(...loaded.map((item) => item.width));
    const cellHeight = Math.max(...loaded.map((item) => item.height));
    let canvasWidth: number;
    let canvasHeight: number;
    let masonry: { positions: Position[]; height: number } | undefined;

    if (type === "grid") {
      const requiredRows = Math.ceil(loaded.length / columns);
      const actualRows = Math.max(rows, requiredRows);
      canvasWidth = cellWidth * columns + spacing * (columns - 1);
      canvasHeight = cellHeight * actualRows + spacing * (actualRows - 1);
    } else if (type === "masonry") {
      masonry = masonryPositions(loaded, columns, spacing, cellWidth);
      canvasWidth = cellWidth * columns + spacing * (columns - 1);
      canvasHeight = masonry.height;
    } else {
      canvasWidth = loaded.reduce((sum, item) => sum + item.width, 0) + spacing * (loaded.length - 1);
      canvasHeight = cellHeight;
    }
    assertCanvasResourceLimits(canvasWidth, canvasHeight);
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = getCanvasContext(canvas);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    let carouselX = 0;

    for (let i = 0; i < loaded.length; i++) {
      const item = loaded[i]!;
      let x: number, y: number;
      if (type === "grid") {
        const col = i % columns, row = Math.floor(i / columns);
        x = col * (cellWidth + spacing);
        y = row * (cellHeight + spacing);
      } else if (type === "masonry") {
        const position = masonry!.positions[i]!;
        x = position.x;
        y = position.y;
      } else {
        x = carouselX;
        y = (canvasHeight - item.height) / 2;
        carouselX += item.width + spacing;
      }
      if (borderRadius > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, item.width, item.height, Math.min(borderRadius, item.width / 2, item.height / 2));
        ctx.clip();
      }
      ctx.drawImage(item.image, x, y, item.width, item.height);
      if (borderRadius > 0) ctx.restore();
    }
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("createCollage failed.", { cause });
  }
}
