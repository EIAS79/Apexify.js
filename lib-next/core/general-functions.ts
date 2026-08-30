import sharp from 'sharp';
import type { Sharp, ResizeOptions as SharpResizeOptions } from "sharp";
import type { cropOptions, GradientConfig, ImageFilter, ResizeOptions } from "../types";
import { createCanvas, loadImage, SKRSContext2D, Image, Canvas } from "@napi-rs/canvas";
import { getErrorMessage, getCanvasContext } from "./errors";
import { resolveMediaBuffer, resolveMediaInput } from "../media/source";
import { ApexifyDecodeError, ApexifyExternalServiceError, ApexifyInputError } from "../runtime/errors";

/** Builds a Sharp instance from Buffer, HTTP(S), data:image, or local filesystem input. */
export async function sharpFromResolvableInput(imageInput: string | Buffer): Promise<Sharp> {
  try {
    return sharp(await resolveMediaInput(imageInput, { kind: "image" }));
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Failed to load image.", { cause });
  }
}

/** Same resolution rules as {@link sharpFromResolvableInput}. */
export async function loadImages(imageInput: string | Buffer): Promise<Sharp> {
  return sharpFromResolvableInput(imageInput);
}

export async function resizingImg(resizeOptions: ResizeOptions): Promise<Buffer> {
  const src = resizeOptions.imagePath;
  if (src === undefined || src === null || (typeof src === "string" && !src.trim())) {
    throw new ApexifyInputError("Image path is required for resizing.");
  }
  if (Buffer.isBuffer(src) && src.length === 0) throw new ApexifyInputError("Image buffer is empty.");
  try {
    const image = await sharpFromResolvableInput(src);
    const resizeOptionsForSharp: SharpResizeOptions = {
      width: resizeOptions.size?.width ?? 500,
      height: resizeOptions.size?.height ?? 500,
      fit: resizeOptions.maintainAspectRatio ? sharp.fit.inside : sharp.fit.fill,
      kernel: sharp.kernel.lanczos3,
      withoutEnlargement: true,
    };
    return image.resize(resizeOptionsForSharp).png({ quality: resizeOptions.quality ?? 90 }).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Failed to resize image.", { cause });
  }
}

export async function converter(imageSource: string | Buffer, newExtension: string) {
  type SharpOutputFormat = 'jpeg' | 'png' | 'webp' | 'tiff' | 'gif' | 'avif' | 'heif' | 'raw';
  const validExtensions: readonly SharpOutputFormat[] = ['jpeg', 'png', 'webp', 'tiff', 'gif', 'avif', 'heif', 'raw'];
  const newExt = newExtension.toLowerCase();
  if (!validExtensions.includes(newExt as SharpOutputFormat)) {
    throw new ApexifyInputError(`Invalid image output format: ${newExt}`);
  }
  try {
    return await (await sharpFromResolvableInput(imageSource)).toFormat(newExt as SharpOutputFormat).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Failed to change image extension.", { cause });
  }
}

export async function applyColorFilters(imagePath: string, gradientOptions?: string | GradientConfig, opacity: number = 1): Promise<Buffer> {
  if (typeof gradientOptions !== 'string' && !gradientOptions) {
    throw new ApexifyInputError("applyColorFilters: gradientOptions must be a string or GradientConfig object.");
  }
  try {
    const image = await sharpFromResolvableInput(imagePath);
    const metadata = await image.metadata();
    const gradientImage = typeof gradientOptions === 'string'
      ? createSolidColorImage(metadata.width, metadata.height, gradientOptions, opacity)
      : createGradientImage(metadata.width, metadata.height, gradientOptions, opacity);
    return image.composite([{ input: gradientImage, blend: 'over' }]).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Failed to apply color filter.", { cause });
  }
}

function createSolidColorImage(width: number | undefined, height: number | undefined, color: string, opacity: number): Buffer {
  if (!width || !height) throw new ApexifyDecodeError("createSolidColorImage: width and height are required.");
  const solidColorCanvas = createCanvas(width, height);
  const ctx = getCanvasContext(solidColorCanvas);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return solidColorCanvas.toBuffer('image/png');
}

function createGradientImage(width: number | undefined, height: number | undefined, options: GradientConfig, opacity: number): Buffer {
  if (!width || !height) throw new ApexifyDecodeError("createGradientImage: width and height are required.");
  const { type, colors, repeat = 'no-repeat' } = options;
  const gradientCanvas = createCanvas(width, height);
  const ctx = getCanvasContext(gradientCanvas);
  let gradient: CanvasGradient | CanvasPattern;

  if (type === 'linear') {
    const grad = ctx.createLinearGradient(
      options.startX ?? 0,
      options.startY ?? 0,
      options.endX ?? width,
      options.endY ?? height
    );
    colors.forEach(({ stop, color }: { stop: number; color: string }) => grad.addColorStop(stop, color));
    gradient = repeat !== 'no-repeat' ? createRepeatingGradientPattern(ctx, grad, repeat, width, height) : grad;
  } else if (type === 'radial') {
    const grad = ctx.createRadialGradient(
      options.startX ?? width / 2,
      options.startY ?? height / 2,
      options.startRadius ?? 0,
      options.endX ?? width / 2,
      options.endY ?? height / 2,
      options.endRadius ?? Math.max(width, height)
    );
    colors.forEach(({ stop, color }: { stop: number; color: string }) => grad.addColorStop(stop, color));
    gradient = repeat !== 'no-repeat' ? createRepeatingGradientPattern(ctx, grad, repeat, width, height) : grad;
  } else if (type === 'conic') {
    const centerX = options.centerX ?? width / 2;
    const centerY = options.centerY ?? height / 2;
    const startAngle = options.startAngle ?? 0;
    const grad = ctx.createConicGradient((startAngle * Math.PI) / 180, centerX, centerY);
    colors.forEach(({ stop, color }: { stop: number; color: string }) => grad.addColorStop(stop, color));
    gradient = grad;
  } else {
    throw new ApexifyInputError(`Unsupported gradient type: ${type}`);
  }

  ctx.globalAlpha = opacity;
  ctx.fillStyle = gradient as any;
  ctx.fillRect(0, 0, width, height);
  return gradientCanvas.toBuffer('image/png');
}

function createRepeatingGradientPattern(
  ctx: SKRSContext2D,
  gradient: CanvasGradient,
  repeat: 'repeat' | 'reflect',
  width: number,
  height: number
): CanvasPattern {
  const patternCanvas = createCanvas(width, height);
  const patternCtx = getCanvasContext(patternCanvas);
  patternCtx.fillStyle = gradient;
  patternCtx.fillRect(0, 0, width, height);
  const pattern = ctx.createPattern(patternCanvas, 'repeat');
  if (!pattern) throw new ApexifyDecodeError('Failed to create repeating gradient pattern');
  return pattern;
}

type LegacyImageFilter = {
  type: 'flip' | 'rotate' | 'brightness' | 'contrast' | 'invert' | 'greyscale' | 'sepia' | 'blur' | 'posterize' | 'pixelate';
  horizontal?: boolean;
  vertical?: boolean;
  deg?: number;
  value?: number;
  radius?: number;
  levels?: number;
  size?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
} | {
  type: 'brightness' | 'contrast' | 'invert' | 'grayscale' | 'sepia' | 'posterize' | 'pixelate' | 'gaussianBlur';
  value?: number;
  intensity?: number;
  radius?: number;
  levels?: number;
  size?: number;
};

export async function imgEffects(imagePath: string, filters: LegacyImageFilter[] | ImageFilter[]): Promise<Buffer> {
  try {
    const image = await loadImage(await resolveMediaBuffer(imagePath, { kind: "image" }));
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    for (const filter of filters) {
      switch (filter.type) {
        case "flip": flipCanvas(ctx, image.width, image.height, filter.horizontal, filter.vertical); break;
        case "rotate": rotateCanvas(ctx, canvas, filter.deg ?? 0); break;
        case "brightness": adjustBrightness(ctx, filter.value ?? 0); break;
        case "contrast": adjustContrast(ctx, filter.value ?? 0); break;
        case "invert": invertColors(ctx); break;
        case "greyscale": grayscale(ctx); break;
        case "sepia": applySepia(ctx); break;
        case "blur": applyBlur(ctx, filter.radius ?? 0); break;
        case "posterize": posterize(ctx, filter.levels ?? 4); break;
        case "pixelate":
          if ('x' in filter && 'y' in filter && 'w' in filter && 'h' in filter) {
            pixelate(ctx, filter.size ?? 10, filter.x ?? 0, filter.y ?? 0, filter.w ?? image.width, filter.h ?? image.height);
          } else {
            pixelate(ctx, filter.size ?? 10, 0, 0, image.width, image.height);
          }
          break;
        default: throw new ApexifyInputError(`Unsupported filter type: ${(filter as { type: string }).type}`);
      }
    }
    return canvas.toBuffer("image/png");
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError(`imgEffects failed: ${getErrorMessage(cause)}`, { cause });
  }
}

export async function cropInner(options: cropOptions): Promise<Buffer> {
  const image = await loadImage(await resolveMediaBuffer(options.imageSource, { kind: "image" }));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const coord of options.coordinates) {
    xs.push(coord.from.x, coord.to.x);
    ys.push(coord.from.y, coord.to.y);
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cropWidth = maxX - minX;
  const cropHeight = maxY - minY;
  const canvas = createCanvas(cropWidth, cropHeight);
  const ctx = getCanvasContext(canvas);

  if (options.radius !== undefined && options.radius !== null) {
    if (options.radius === "circular") {
      const radius = Math.min(cropWidth, cropHeight) / 2;
      ctx.beginPath();
      ctx.arc(cropWidth / 2, cropHeight / 2, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
    } else if (typeof options.radius === 'number' && options.radius >= 0) {
      ctx.beginPath();
      ctx.moveTo(options.radius, 0);
      ctx.lineTo(cropWidth - options.radius, 0);
      ctx.quadraticCurveTo(cropWidth, 0, cropWidth, options.radius);
      ctx.lineTo(cropWidth, cropHeight - options.radius);
      ctx.quadraticCurveTo(cropWidth, cropHeight, cropWidth - options.radius, cropHeight);
      ctx.lineTo(options.radius, cropHeight);
      ctx.quadraticCurveTo(0, cropHeight, 0, cropHeight - options.radius);
      ctx.lineTo(0, options.radius);
      ctx.quadraticCurveTo(0, 0, options.radius, 0);
      ctx.closePath();
      ctx.clip();
    } else {
      throw new ApexifyInputError('The "radius" option can only be "circular" or a non-negative number.');
    }
  }
  ctx.drawImage(image, minX, minY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas.toBuffer('image/png');
}

export async function cropOuter(options: cropOptions): Promise<Buffer> {
  const image = await loadImage(await resolveMediaBuffer(options.imageSource, { kind: "image" }));
  const canvas = createCanvas(image.width, image.height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0);
  ctx.beginPath();
  ctx.moveTo(options.coordinates[0].from.x, options.coordinates[0].from.y);
  for (let i = 0; i < options.coordinates.length; i++) {
    const coord = options.coordinates[i];
    const nextCoord = options.coordinates[(i + 1) % options.coordinates.length];
    const tension = coord.tension ?? 0;
    const cp1x = coord.from.x + (nextCoord.from.x - coord.from.x) * tension;
    const cp1y = coord.from.y + (nextCoord.from.y - coord.from.y) * tension;
    const cp2x = coord.to.x - (nextCoord.to.x - coord.to.x) * tension;
    const cp2y = coord.to.y - (nextCoord.to.y - coord.to.y) * tension;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, coord.to.x, coord.to.y);
  }
  ctx.closePath();
  ctx.clip();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return canvas.toBuffer('image/png');
}

export async function detectColors(imagePath: string): Promise<{ color: string; frequency: string }[]> {
  const image = await loadImage(await resolveMediaBuffer(imagePath, { kind: "image" }));
  const canvas = createCanvas(image.width, image.height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const colorFrequency: Record<string, number> = {};
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 50) continue;
    const color = `${r},${g},${b}`;
    colorFrequency[color] = (colorFrequency[color] ?? 0) + 1;
  }
  const totalPixels = canvas.width * canvas.height;
  return Object.entries(colorFrequency)
    .map(([color, frequency]) => ({ color, frequency: ((frequency / totalPixels) * 100).toFixed(2) }))
    .filter(colorObj => parseFloat(colorObj.frequency) >= 0.1)
    .sort((a, b) => parseFloat(b.frequency) - parseFloat(a.frequency));
}

export async function removeColor(inputImagePath: string, colorToRemove: { red: number; green: number; blue: number }): Promise<Buffer | undefined> {
  const image = await loadImage(await resolveMediaBuffer(inputImagePath, { kind: "image" }));
  const canvas = createCanvas(image.width, image.height);
  const ctx = getCanvasContext(canvas);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i] === colorToRemove.red && imageData.data[i + 1] === colorToRemove.green && imageData.data[i + 2] === colorToRemove.blue) {
      imageData.data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toBuffer('image/png');
}

export async function bgRemoval(imgURL: string, API_KEY: string): Promise<Buffer | undefined> {
  if (!API_KEY) {
    throw new ApexifyInputError("API_KEY is required for remove.bg.");
  }
  try {
    // PHASE3-JUSTIFIED-FETCH: fixed remove.bg external-service endpoint; the user-controlled image URL is sent as JSON and is not fetched by Apexify.
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imgURL, size: 'auto' }),
    });
    if (!response.ok) {
      throw new ApexifyExternalServiceError(`remove.bg request failed with HTTP ${response.status}.`, { details: { status: response.status } });
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (cause) {
    if (cause instanceof ApexifyExternalServiceError) throw cause;
    throw new ApexifyExternalServiceError("remove.bg request failed.", { cause });
  }
}

function flipCanvas(ctx: SKRSContext2D, width: number, height: number, horizontal = false, vertical = false): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const newData = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIndex = (y * width + x) * 4;
      const destX = horizontal ? width - x - 1 : x;
      const destY = vertical ? height - y - 1 : y;
      const destIndex = (destY * width + destX) * 4;
      newData[destIndex] = pixels[srcIndex];
      newData[destIndex + 1] = pixels[srcIndex + 1];
      newData[destIndex + 2] = pixels[srcIndex + 2];
      newData[destIndex + 3] = pixels[srcIndex + 3];
    }
  }
  const newImageData = ctx.createImageData(width, height);
  newImageData.data.set(newData);
  ctx.putImageData(newImageData, 0, 0);
}

function rotateCanvas(ctx: SKRSContext2D, canvas: Canvas, degrees: number): void {
  const radians = (degrees * Math.PI) / 180;
  const newCanvas = createCanvas(canvas.width, canvas.height);
  const newCtx = getCanvasContext(newCanvas);
  newCtx.translate(canvas.width / 2, canvas.height / 2);
  newCtx.rotate(radians);
  newCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(newCanvas, 0, 0);
}

function adjustBrightness(ctx: SKRSContext2D, value: number): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] += 255 * value;
    pixels[i + 1] += 255 * value;
    pixels[i + 2] += 255 * value;
  }
  ctx.putImageData(imageData, 0, 0);
}

function adjustContrast(ctx: SKRSContext2D, value: number): void {
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = factor * (pixels[i] - 128) + 128;
    pixels[i + 1] = factor * (pixels[i + 1] - 128) + 128;
    pixels[i + 2] = factor * (pixels[i + 2] - 128) + 128;
  }
  ctx.putImageData(imageData, 0, 0);
}

function invertColors(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 255 - pixels[i];
    pixels[i + 1] = 255 - pixels[i + 1];
    pixels[i + 2] = 255 - pixels[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

function grayscale(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const avg = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = avg;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applySepia(ctx: SKRSContext2D): void {
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    pixels[i] = r * 0.393 + g * 0.769 + b * 0.189;
    pixels[i + 1] = r * 0.349 + g * 0.686 + b * 0.168;
    pixels[i + 2] = r * 0.272 + g * 0.534 + b * 0.131;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyBlur(ctx: SKRSContext2D, radius: number): void {
  if (radius <= 0) return;
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const blurSize = Math.floor(radius);
  for (let y = blurSize; y < height - blurSize; y++) {
    for (let x = blurSize; x < width - blurSize; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -blurSize; dy <= blurSize; dy++) {
        for (let dx = -blurSize; dx <= blurSize; dx++) {
          const index = ((y + dy) * width + (x + dx)) * 4;
          r += pixels[index];
          g += pixels[index + 1];
          b += pixels[index + 2];
          count++;
        }
      }
      const index = (y * width + x) * 4;
      pixels[index] = r / count;
      pixels[index + 1] = g / count;
      pixels[index + 2] = b / count;
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

function posterize(ctx: SKRSContext2D, levels: number): void {
  if (levels < 2 || levels > 255) return;
  const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  const pixels = imageData.data;
  const factor = 255 / (levels - 1);
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round(pixels[i] / factor) * factor;
    pixels[i + 1] = Math.round(pixels[i + 1] / factor) * factor;
    pixels[i + 2] = Math.round(pixels[i + 2] / factor) * factor;
  }
  ctx.putImageData(imageData, 0, 0);
}

function pixelate(ctx: SKRSContext2D, size: number, startX = 0, startY = 0, width = ctx.canvas.width, height = ctx.canvas.height): void {
  if (size < 1) return;
  const imageData = ctx.getImageData(startX, startY, width, height);
  const pixels = imageData.data;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (x + dx < width && y + dy < height) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            r += pixels[index]; g += pixels[index + 1]; b += pixels[index + 2]; count++;
          }
        }
      }
      r = Math.floor(r / count); g = Math.floor(g / count); b = Math.floor(b / count);
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          if (x + dx < width && y + dy < height) {
            const index = ((y + dy) * width + (x + dx)) * 4;
            pixels[index] = r; pixels[index + 1] = g; pixels[index + 2] = b;
          }
        }
      }
    }
  }
  ctx.putImageData(imageData, startX, startY);
}
