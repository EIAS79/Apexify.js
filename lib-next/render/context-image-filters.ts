import type { SKRSContext2D } from "@napi-rs/canvas";
import sharp, { type Sharp } from "sharp";
import type { ImageFilter } from "../types";
import { ApexifyError, ApexifyInputError } from "../runtime/errors";

interface Kernel {
  width: number;
  height: number;
  kernel: number[];
  scale?: number;
  offset?: number;
}

function motionKernel(intensity: number, angle: number): Kernel {
  const size = Math.max(3, Math.min(51, Math.floor(intensity) | 1));
  const kernel = new Array<number>(size * size).fill(0);
  const center = Math.floor(size / 2);
  const radians = ((((angle % 360) + 360) % 360) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  let hits = 0;
  for (let i = 0; i < size; i += 1) {
    const x = Math.round(center + dx * (i - center));
    const y = Math.round(center + dy * (i - center));
    if (x >= 0 && x < size && y >= 0 && y < size) {
      kernel[y * size + x] += 1;
      hits += 1;
    }
  }
  if (hits === 0) kernel[center * size + center] = 1;
  else for (let i = 0; i < kernel.length; i += 1) kernel[i] /= hits;
  return { width: size, height: size, kernel };
}

function radialKernel(intensity: number): Kernel {
  const size = Math.max(3, Math.min(31, Math.floor(intensity) | 1));
  const center = Math.floor(size / 2);
  const kernel = new Array<number>(size * size).fill(0);
  let sum = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x - center, y - center);
      const weight = Math.max(0, 1 - distance / Math.max(1, center));
      kernel[y * size + x] = weight;
      sum += weight;
    }
  }
  if (sum > 0) for (let i = 0; i < kernel.length; i += 1) kernel[i] /= sum;
  return { width: size, height: size, kernel };
}

function sobelKernel(intensity: number): Kernel {
  return {
    width: 3,
    height: 3,
    kernel: [-1, 0, 1, -2, 0, 2, -1, 0, 1].map((value) => value * intensity),
    offset: 128,
  };
}

function embossKernel(intensity: number): Kernel {
  return {
    width: 3,
    height: 3,
    kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2].map((value) => value * intensity),
    offset: 128,
  };
}

async function posterize(image: Sharp, levels: number): Promise<Sharp> {
  const normalized = Math.max(2, Math.min(256, Math.floor(levels)));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const step = 255 / (normalized - 1);
  for (let i = 0; i < data.length; i += info.channels) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
  return sharp(data, { raw: info });
}

async function pixelate(image: Sharp, size: number): Promise<Sharp> {
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const block = Math.max(2, Math.floor(size));
  return image
    .resize(Math.max(1, Math.ceil(width / block)), Math.max(1, Math.ceil(height / block)), { kernel: "nearest" })
    .resize(width, height, { kernel: "nearest" });
}

async function addNoise(image: Sharp, intensity: number, grain: boolean): Promise<Sharp> {
  const clamped = Math.max(0, Math.min(1, intensity));
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const amplitude = (grain ? 100 : 255) * clamped;
  for (let i = 0; i < data.length; i += info.channels) {
    const delta = (Math.random() - 0.5) * amplitude;
    data[i] = Math.max(0, Math.min(255, data[i] + delta));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + delta));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + delta));
  }
  return sharp(data, { raw: info });
}

async function applyFilter(image: Sharp, filter: ImageFilter): Promise<Sharp> {
  switch (filter.type) {
    case "gaussianBlur":
      return filter.intensity > 0 ? image.blur(Math.max(0.3, Math.min(1000, filter.intensity))) : image;
    case "motionBlur":
      return filter.intensity > 0 ? image.convolve(motionKernel(filter.intensity, filter.angle ?? 0)) : image;
    case "radialBlur":
      return filter.intensity > 0 ? image.convolve(radialKernel(filter.intensity)) : image;
    case "sharpen":
      return filter.intensity > 0 ? image.sharpen({ sigma: Math.max(0.000001, Math.min(10, filter.intensity)) }) : image;
    case "brightness":
      return filter.value !== 0 ? image.modulate({ brightness: Math.max(0, Math.min(2, 1 + filter.value / 100)) }) : image;
    case "contrast": {
      if (filter.value === 0) return image;
      const contrast = Math.max(0, Math.min(2, 1 + filter.value / 100));
      return image.linear(contrast, -(128 * contrast) + 128);
    }
    case "saturation":
      return filter.value !== 0 ? image.modulate({ saturation: Math.max(0, Math.min(2, 1 + filter.value / 100)) }) : image;
    case "hueShift":
      return filter.value !== 0 ? image.modulate({ hue: filter.value }) : image;
    case "grayscale":
      return image.grayscale();
    case "sepia":
      return image.recomb([
        [0.393, 0.769, 0.189],
        [0.349, 0.686, 0.168],
        [0.272, 0.534, 0.131],
      ]);
    case "invert":
      return image.negate({ alpha: false }).ensureAlpha();
    case "posterize":
      return posterize(image, filter.levels ?? 4);
    case "pixelate":
      return pixelate(image, filter.size ?? 10);
    case "noise":
      return filter.intensity > 0 ? addNoise(image, filter.intensity, false) : image;
    case "grain":
      return filter.intensity > 0 ? addNoise(image, filter.intensity, true) : image;
    case "edgeDetection":
      return filter.intensity > 0 ? image.convolve(sobelKernel(filter.intensity)).grayscale() : image;
    case "emboss":
      return filter.intensity > 0 ? image.convolve(embossKernel(filter.intensity)) : image;
    default:
      throw new ApexifyInputError(`Unsupported image filter type: ${String((filter as { type?: unknown }).type)}.`);
  }
}

export async function applyContextImageFilters(
  ctx: SKRSContext2D,
  filters: ImageFilter[],
  width: number,
  height: number
): Promise<void> {
  if (!filters?.length) return;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new ApexifyInputError("applyContextImageFilters: width and height must be positive integers.");
  }

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    let pipeline = sharp(Buffer.from(imageData.data), { raw: { width, height, channels: 4 } }).ensureAlpha();
    for (const filter of filters) pipeline = await applyFilter(pipeline, filter);
    const { data, info } = await pipeline
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) {
      throw new ApexifyError("Image filter pipeline returned unexpected dimensions/channels.");
    }
    const output = ctx.createImageData(width, height);
    output.data.set(new Uint8ClampedArray(data));
    ctx.filter = "none";
    ctx.putImageData(output, 0, 0);
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyError("applyContextImageFilters failed.", {
      cause: error,
      details: { operation: "contextImageFilters" },
    });
  }
}
