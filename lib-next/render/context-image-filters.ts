import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import type { ImageFilter } from "../types";
import sharp from "sharp";
import type { Sharp } from "sharp";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";

/** Apply a validated filter stack without PNG/Jimp encode-decode cycles. */
export async function applyContextImageFilters(
  ctx: SKRSContext2D,
  filters: ImageFilter[],
  width: number,
  height: number
): Promise<void> {
  if (!filters?.length) return;
  assertCanvasResourceLimits(width, height);
  filters.forEach((filter, index) => validateFilter(filter, `filters[${index}]`, width, height));

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    let image = sharp(Buffer.from(imageData.data), { raw: { width, height, channels: 4 } }).ensureAlpha();

    for (const filter of filters) {
      switch (filter.type) {
        case "gaussianBlur":
          if ((filter.intensity ?? 0) > 0) image = image.blur(filter.intensity);
          break;
        case "motionBlur":
          if ((filter.intensity ?? 0) > 0) image = image.convolve(createMotionBlurKernel(filter.intensity!, filter.angle ?? 0));
          break;
        case "radialBlur":
          if ((filter.intensity ?? 0) > 0) image = await applyRadialBlur(image, width, height, filter.intensity!, filter.centerX ?? width / 2, filter.centerY ?? height / 2);
          break;
        case "sharpen":
          if ((filter.intensity ?? 0) > 0) image = image.sharpen({ sigma: Math.max(0.000001, filter.intensity!), m1: 1, m2: 2 });
          break;
        case "brightness":
          if ((filter.value ?? 0) !== 0) image = image.modulate({ brightness: Math.max(0, 1 + filter.value! / 100) });
          break;
        case "contrast":
          if ((filter.value ?? 0) !== 0) {
            const factor = Math.max(0, 1 + filter.value! / 100);
            image = image.linear(factor, 128 - 128 * factor);
          }
          break;
        case "saturation":
          if ((filter.value ?? 0) !== 0) image = image.modulate({ saturation: Math.max(0, 1 + filter.value! / 100) });
          break;
        case "hueShift":
          if ((filter.value ?? 0) !== 0) image = image.modulate({ hue: ((filter.value! % 360) + 360) % 360 });
          break;
        case "grayscale":
          image = image.grayscale();
          break;
        case "sepia":
          image = image.recomb([
            [0.393, 0.769, 0.189],
            [0.349, 0.686, 0.168],
            [0.272, 0.534, 0.131],
          ]);
          break;
        case "invert":
          image = image.negate({ alpha: false });
          break;
        case "posterize":
          image = await applyRawTransform(image, posterizeTransform(filter.levels ?? 4));
          break;
        case "pixelate":
          if ((filter.size ?? 1) > 1) image = await applyPixelate(image, width, height, filter.size!);
          break;
        case "noise":
          if ((filter.intensity ?? 0) > 0) image = await applyRawTransform(image, noiseTransform(filter.intensity!, false));
          break;
        case "grain":
          if ((filter.intensity ?? 0) > 0) image = await applyRawTransform(image, noiseTransform(filter.intensity!, true));
          break;
        case "edgeDetection":
          if ((filter.intensity ?? 0) > 0) image = image.convolve(createSobelKernel(filter.intensity!)).grayscale();
          break;
        case "emboss":
          if ((filter.intensity ?? 0) > 0) image = image.convolve(createEmbossKernel(filter.intensity!));
          break;
      }
    }

    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.width !== width || info.height !== height || info.channels !== 4) {
      throw new ApexifyDecodeError(`Filter stack changed raster geometry unexpectedly to ${info.width}×${info.height}×${info.channels}.`);
    }
    const output = ctx.createImageData(width, height);
    output.data.set(data);
    ctx.putImageData(output, 0, 0);
    ctx.filter = "none";
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("Image filter pipeline failed.", { cause: error });
  }
}

function validateFilter(filter: ImageFilter, name: string, width: number, height: number): void {
  if (!filter || typeof filter !== "object") throw new ApexifyInputError(`${name} must be an object.`);
  const allowed = new Set<ImageFilter["type"]>([
    "gaussianBlur", "motionBlur", "radialBlur", "sharpen", "noise", "grain", "edgeDetection", "emboss",
    "invert", "grayscale", "sepia", "pixelate", "brightness", "contrast", "saturation", "hueShift", "posterize",
  ]);
  if (!allowed.has(filter.type)) throw new ApexifyInputError(`${name}.type is unsupported.`);

  const finite = (value: number | undefined, field: string, min: number, max: number) => {
    if (value === undefined) return;
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new ApexifyInputError(`${name}.${field} must be a finite number between ${min} and ${max}.`);
    }
  };

  switch (filter.type) {
    case "gaussianBlur": finite(filter.intensity, "intensity", 0, 100); break;
    case "motionBlur":
      finite(filter.intensity, "intensity", 0, 101);
      finite(filter.angle, "angle", -3600, 3600);
      break;
    case "radialBlur":
      finite(filter.intensity, "intensity", 0, 50);
      finite(filter.centerX, "centerX", 0, width);
      finite(filter.centerY, "centerY", 0, height);
      break;
    case "sharpen": finite(filter.intensity, "intensity", 0, 10); break;
    case "noise":
    case "grain": finite(filter.intensity, "intensity", 0, 1); break;
    case "edgeDetection":
    case "emboss": finite(filter.intensity, "intensity", 0, 10); break;
    case "brightness":
    case "contrast":
    case "saturation": finite(filter.value, "value", -100, 100); break;
    case "hueShift": finite(filter.value, "value", -3600, 3600); break;
    case "posterize":
      finite(filter.levels, "levels", 2, 256);
      if (filter.levels !== undefined && !Number.isInteger(filter.levels)) throw new ApexifyInputError(`${name}.levels must be an integer.`);
      break;
    case "pixelate":
      finite(filter.size, "size", 1, Math.max(width, height));
      if (filter.size !== undefined && !Number.isInteger(filter.size)) throw new ApexifyInputError(`${name}.size must be an integer.`);
      break;
  }
}

async function applyRawTransform(
  image: Sharp,
  transform: (data: Buffer, width: number, height: number) => void
): Promise<Sharp> {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  transform(data, info.width, info.height);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
}

function posterizeTransform(levels: number) {
  const step = 255 / (levels - 1);
  return (data: Buffer) => {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.round(data[i] / step) * step;
      data[i + 1] = Math.round(data[i + 1] / step) * step;
      data[i + 2] = Math.round(data[i + 2] / step) * step;
    }
  };
}

function noiseTransform(intensity: number, monochrome: boolean) {
  return (data: Buffer) => {
    let state = monochrome ? 0x6d2b79f5 : 0x9e3779b9;
    const random = () => {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 0xffffffff;
    };
    const amplitude = (monochrome ? 100 : 255) * intensity;
    for (let i = 0; i < data.length; i += 4) {
      if (monochrome) {
        const delta = (random() - 0.5) * amplitude;
        data[i] = clampByte(data[i] + delta);
        data[i + 1] = clampByte(data[i + 1] + delta);
        data[i + 2] = clampByte(data[i + 2] + delta);
      } else {
        data[i] = clampByte(data[i] + (random() - 0.5) * amplitude);
        data[i + 1] = clampByte(data[i + 1] + (random() - 0.5) * amplitude);
        data[i + 2] = clampByte(data[i + 2] + (random() - 0.5) * amplitude);
      }
    }
  };
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function applyPixelate(image: Sharp, width: number, height: number, size: number): Promise<Sharp> {
  const smallWidth = Math.max(1, Math.ceil(width / size));
  const smallHeight = Math.max(1, Math.ceil(height / size));
  return image
    .resize(smallWidth, smallHeight, { fit: "fill", kernel: sharp.kernel.nearest })
    .resize(width, height, { fit: "fill", kernel: sharp.kernel.nearest });
}

async function applyRadialBlur(
  image: Sharp,
  width: number,
  height: number,
  intensity: number,
  centerX: number,
  centerY: number
): Promise<Sharp> {
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const source = createCanvas(width, height);
  const sourceCtx = source.getContext("2d") as SKRSContext2D;
  const sourceData = sourceCtx.createImageData(width, height);
  sourceData.data.set(data);
  sourceCtx.putImageData(sourceData, 0, 0);

  const output = createCanvas(width, height);
  const outputCtx = output.getContext("2d") as SKRSContext2D;
  const steps = Math.max(2, Math.min(16, Math.ceil(intensity / 3)));
  const maxExpansion = intensity / 100;
  for (let i = 0; i < steps; i++) {
    const progress = steps === 1 ? 0 : i / (steps - 1);
    const scale = 1 + maxExpansion * progress;
    outputCtx.save();
    outputCtx.globalAlpha = i === 0 ? 1 : 1 / (i + 1);
    outputCtx.translate(centerX, centerY);
    outputCtx.scale(scale, scale);
    outputCtx.drawImage(source, -centerX, -centerY);
    outputCtx.restore();
  }

  const blurred = outputCtx.getImageData(0, 0, width, height).data;
  return sharp(Buffer.from(blurred), { raw: { width, height, channels: 4 } });
}

function createMotionBlurKernel(intensity: number, angle: number) {
  let size = Math.max(3, Math.min(101, Math.round(intensity)));
  if (size % 2 === 0) size += 1;
  const kernel = new Array<number>(size * size).fill(0);
  const center = Math.floor(size / 2);
  const radians = ((((angle % 360) + 360) % 360) * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  for (let i = 0; i < size; i++) {
    const x = Math.round(center + dx * (i - center));
    const y = Math.round(center + dy * (i - center));
    if (x >= 0 && x < size && y >= 0 && y < size) kernel[y * size + x] += 1;
  }
  const sum = kernel.reduce((total, value) => total + value, 0) || 1;
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  return { width: size, height: size, kernel, scale: 1, offset: 0 };
}

function createSobelKernel(intensity: number) {
  const kernel = [-1, 0, 1, -2, 0, 2, -1, 0, 1].map((value) => value * intensity);
  return { width: 3, height: 3, kernel, scale: 1, offset: 128 };
}

function createEmbossKernel(intensity: number) {
  const kernel = [-2, -1, 0, -1, 1, 1, 0, 1, 2].map((value) => value * intensity);
  return { width: 3, height: 3, kernel, scale: 1, offset: 128 };
}
