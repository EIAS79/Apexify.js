import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import type { GradientConfig, ImageFilter } from "../types";
import { getCanvasContext } from "./errors";
import { resolveMediaBuffer, resolveMediaInput } from "../media/source";
import { fetchRemoteMedia } from "../media/remote-fetch";
import { ApexifyDecodeError, ApexifyExternalServiceError, ApexifyInputError } from "../runtime/errors";

/** Apply a solid color or gradient overlay to a resolved image source. */
export async function applyColorFilters(
  imagePath: string,
  gradientOptions?: string | GradientConfig,
  opacity = 1
): Promise<Buffer> {
  if (typeof gradientOptions !== "string" && !gradientOptions) {
    throw new ApexifyInputError("applyColorFilters: gradientOptions must be a string or GradientConfig object.");
  }
  try {
    const input = await resolveMediaInput(imagePath, { kind: "image" });
    const image = sharp(input);
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) throw new ApexifyDecodeError("Image dimensions could not be determined.");
    const overlay = typeof gradientOptions === "string"
      ? createSolidOverlay(metadata.width, metadata.height, gradientOptions, opacity)
      : createGradientOverlay(metadata.width, metadata.height, gradientOptions, opacity);
    return image.composite([{ input: overlay, blend: "over" }]).toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("Failed to apply color filter.", { cause });
  }
}

function createSolidOverlay(width: number, height: number, color: string, opacity: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

function createGradientOverlay(width: number, height: number, options: GradientConfig, opacity: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = getCanvasContext(canvas);
  let gradient: CanvasGradient;
  if (options.type === "linear") {
    gradient = ctx.createLinearGradient(
      options.startX ?? 0,
      options.startY ?? 0,
      options.endX ?? width,
      options.endY ?? height
    );
  } else if (options.type === "radial") {
    gradient = ctx.createRadialGradient(
      options.startX ?? width / 2,
      options.startY ?? height / 2,
      options.startRadius ?? 0,
      options.endX ?? width / 2,
      options.endY ?? height / 2,
      options.endRadius ?? Math.max(width, height)
    );
  } else if (options.type === "conic") {
    gradient = ctx.createConicGradient(
      ((options.startAngle ?? 0) * Math.PI) / 180,
      options.centerX ?? width / 2,
      options.centerY ?? height / 2
    );
  } else {
    throw new ApexifyInputError(`Unsupported gradient type: ${String(options.type)}`);
  }
  options.colors.forEach(({ stop, color }) => gradient.addColorStop(stop, color));
  ctx.globalAlpha = opacity;
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer("image/png");
}

/** Apply supported raster effects through Sharp after central source resolution. */
export async function imgEffects(imagePath: string, filters: ImageFilter[]): Promise<Buffer> {
  if (!Array.isArray(filters) || filters.length === 0) {
    throw new ApexifyInputError("imgEffects: at least one filter is required.");
  }
  try {
    let image = sharp(await resolveMediaInput(imagePath, { kind: "image" })).ensureAlpha();
    for (const filter of filters) {
      switch (filter.type) {
        case "brightness":
          image = image.modulate({ brightness: Math.max(0, Math.min(2, 1 + (filter.value ?? 0) / 100)) });
          break;
        case "contrast": {
          const contrast = Math.max(0, Math.min(2, 1 + (filter.value ?? 0) / 100));
          image = image.linear(contrast, -(128 * contrast) + 128);
          break;
        }
        case "saturation":
          image = image.modulate({ saturation: Math.max(0, Math.min(2, 1 + (filter.value ?? 0) / 100)) });
          break;
        case "hueShift":
          image = image.modulate({ hue: filter.value ?? 0 });
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
        case "gaussianBlur":
          if ((filter.intensity ?? 0) > 0) image = image.blur(Math.max(0.3, Math.min(1000, filter.intensity ?? 0.3)));
          break;
        case "sharpen":
          if ((filter.intensity ?? 0) > 0) image = image.sharpen({ sigma: Math.max(0.000001, Math.min(10, filter.intensity ?? 1)) });
          break;
        case "posterize":
          image = image.threshold(128).modulate({ saturation: 0 });
          break;
        case "pixelate": {
          const metadata = await image.metadata();
          const width = metadata.width ?? 1;
          const height = metadata.height ?? 1;
          const size = Math.max(2, filter.size ?? 10);
          const scale = Math.max(1, Math.floor(Math.min(width, height) / size));
          image = image.resize(scale, scale, { kernel: sharp.kernel.nearest }).resize(width, height, { kernel: sharp.kernel.nearest });
          break;
        }
        default:
          throw new ApexifyInputError(`imgEffects: unsupported filter type ${String((filter as { type: string }).type)}.`);
      }
    }
    return image.png().toBuffer();
  } catch (cause) {
    if (cause instanceof ApexifyInputError || cause instanceof ApexifyDecodeError) throw cause;
    throw new ApexifyDecodeError("imgEffects failed.", { cause });
  }
}

/** Return exact visible colors and their frequency, retaining historical response shape. */
export async function detectColors(imagePath: string): Promise<Array<{ color: string; frequency: string }>> {
  try {
    const image = await loadImage(await resolveMediaBuffer(imagePath, { kind: "image" }));
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map<string, number>();
    const totalPixels = canvas.width * canvas.height;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 50) continue;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (totalPixels === 0) return [];
    return [...counts.entries()]
      .map(([color, frequency]) => ({ color, frequency: ((frequency / totalPixels) * 100).toFixed(2) }))
      .filter(({ frequency }) => Number(frequency) >= 0.1)
      .sort((a, b) => Number(b.frequency) - Number(a.frequency));
  } catch (cause) {
    throw new ApexifyDecodeError("Color analysis failed.", { cause });
  }
}

/** Remove one exact RGB color from a resolved image. */
export async function removeColor(
  inputImagePath: string,
  colorToRemove: { red: number; green: number; blue: number }
): Promise<Buffer> {
  try {
    const image = await loadImage(await resolveMediaBuffer(inputImagePath, { kind: "image" }));
    const canvas = createCanvas(image.width, image.height);
    const ctx = getCanvasContext(canvas);
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      if (
        imageData.data[i] === colorToRemove.red &&
        imageData.data[i + 1] === colorToRemove.green &&
        imageData.data[i + 2] === colorToRemove.blue
      ) {
        imageData.data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toBuffer("image/png");
  } catch (cause) {
    throw new ApexifyDecodeError("Color removal failed.", { cause });
  }
}

/** remove.bg uses the same bounded remote transport as all other network I/O. */
export async function bgRemoval(imgURL: string, API_KEY: string): Promise<Buffer> {
  if (!API_KEY) throw new ApexifyInputError("API_KEY is required for remove.bg.");
  try {
    const body = JSON.stringify({ image_url: imgURL, size: "auto" });
    const result = await fetchRemoteMedia("https://api.remove.bg/v1.0/removebg", {
      kind: "image",
      method: "POST",
      attempts: 1,
      headers: { "X-Api-Key": API_KEY, "Content-Type": "application/json" },
      body,
    });
    return result.buffer;
  } catch (cause) {
    throw new ApexifyExternalServiceError("remove.bg request failed.", { cause });
  }
}
