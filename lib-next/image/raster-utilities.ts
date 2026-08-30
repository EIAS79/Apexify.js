import https from "node:https";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import sharp from "sharp";
import type { GradientConfig } from "../types";
import type { ApexifyRuntime } from "../runtime/context";
import { defaultApexifyRuntime } from "../runtime/context";
import {
  ApexifyExternalServiceError,
  ApexifyInputError,
  ApexifyResourceLimitError,
} from "../runtime/errors";
import { resolveImageInput } from "../media/source";
import { redactUrl } from "../media/network-policy";

interface FilterRecord {
  type: string;
  horizontal?: boolean;
  vertical?: boolean;
  deg?: number;
  value?: number;
  intensity?: number;
  radius?: number;
  size?: number;
}

interface GradientRecord {
  type: "linear" | "radial" | "conic";
  colors: Array<{ stop: number; color: string }>;
  startX?: number;
  startY?: number;
  endX?: number;
  endY?: number;
  startRadius?: number;
  endRadius?: number;
  centerX?: number;
  centerY?: number;
  startAngle?: number;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function validateGradient(gradient: GradientRecord): void {
  if (!Array.isArray(gradient.colors) || gradient.colors.length < 2) {
    throw new ApexifyInputError("colorsFilter: gradient requires at least two color stops.");
  }
  for (const stop of gradient.colors) {
    if (!Number.isFinite(stop.stop) || stop.stop < 0 || stop.stop > 1 || typeof stop.color !== "string") {
      throw new ApexifyInputError("colorsFilter: gradient stops must use finite offsets between 0 and 1 and string colors.");
    }
  }
}

export async function applyColorFilters(
  source: string | Buffer,
  gradientOptions: string | GradientConfig,
  opacity = 1,
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Buffer> {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new ApexifyInputError("colorsFilter: opacity must be between 0 and 1.");
  }

  const input = await resolveImageInput(source, runtime);
  const normalized = await sharp(input).png().toBuffer();
  const image = await loadImage(normalized);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  ctx.globalAlpha = opacity;

  if (typeof gradientOptions === "string") {
    ctx.fillStyle = gradientOptions;
  } else {
    const options = gradientOptions as unknown as GradientRecord;
    validateGradient(options);
    let gradient: CanvasGradient;
    if (options.type === "linear") {
      gradient = ctx.createLinearGradient(
        options.startX ?? 0,
        options.startY ?? 0,
        options.endX ?? image.width,
        options.endY ?? image.height
      );
    } else if (options.type === "radial") {
      gradient = ctx.createRadialGradient(
        options.startX ?? image.width / 2,
        options.startY ?? image.height / 2,
        options.startRadius ?? 0,
        options.endX ?? image.width / 2,
        options.endY ?? image.height / 2,
        options.endRadius ?? Math.max(image.width, image.height)
      );
    } else if (options.type === "conic") {
      const angle = ((options.startAngle ?? 0) * Math.PI) / 180;
      gradient = ctx.createConicGradient(
        angle,
        options.centerX ?? image.width / 2,
        options.centerY ?? image.height / 2
      );
    } else {
      throw new ApexifyInputError(`colorsFilter: unsupported gradient type ${String(options.type)}.`);
    }
    for (const color of options.colors) gradient.addColorStop(color.stop, color.color);
    ctx.fillStyle = gradient;
  }

  ctx.fillRect(0, 0, image.width, image.height);
  return canvas.toBuffer("image/png");
}

export async function applyImageEffects(
  source: string | Buffer,
  filters: readonly unknown[],
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Buffer> {
  if (!Array.isArray(filters) || filters.length === 0) {
    throw new ApexifyInputError("effects: filters must contain at least one filter.");
  }

  const input = await resolveImageInput(source, runtime);
  let pipeline = sharp(input);

  for (const raw of filters) {
    if (!raw || typeof raw !== "object" || typeof (raw as { type?: unknown }).type !== "string") {
      throw new ApexifyInputError("effects: every filter must contain a string type.");
    }
    const filter = raw as FilterRecord;
    switch (filter.type) {
      case "flip":
        if (filter.vertical) pipeline = pipeline.flip();
        if (filter.horizontal) pipeline = pipeline.flop();
        break;
      case "rotate":
        pipeline = pipeline.rotate(filter.deg ?? 0);
        break;
      case "brightness":
        pipeline = pipeline.modulate({ brightness: Math.max(0, 1 + (filter.value ?? 0)) });
        break;
      case "contrast": {
        const requested = filter.value ?? 0;
        const factor = requested >= -1 && requested <= 1 ? 1 + requested : Math.max(0, 1 + requested / 255);
        pipeline = pipeline.linear(factor, 128 * (1 - factor));
        break;
      }
      case "invert":
        pipeline = pipeline.negate();
        break;
      case "greyscale":
      case "grayscale":
        pipeline = pipeline.grayscale();
        break;
      case "sepia":
        pipeline = pipeline.recomb([
          [0.393, 0.769, 0.189],
          [0.349, 0.686, 0.168],
          [0.272, 0.534, 0.131],
        ]);
        break;
      case "blur":
      case "gaussianBlur":
        if ((filter.radius ?? filter.intensity ?? 0) > 0) {
          pipeline = pipeline.blur(Math.max(0.3, filter.radius ?? filter.intensity ?? 1));
        }
        break;
      case "pixelate": {
        const metadata = await pipeline.metadata();
        const width = metadata.width ?? 1;
        const height = metadata.height ?? 1;
        const block = Math.max(1, Math.floor(filter.size ?? 10));
        pipeline = pipeline
          .resize(Math.max(1, Math.ceil(width / block)), Math.max(1, Math.ceil(height / block)), { kernel: "nearest" })
          .resize(width, height, { kernel: "nearest" });
        break;
      }
      case "posterize": {
        const levels = Math.max(2, Math.min(256, Math.floor(filter.value ?? 4)));
        const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const step = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += info.channels) {
          data[i] = Math.round(data[i] / step) * step;
          data[i + 1] = Math.round(data[i + 1] / step) * step;
          data[i + 2] = Math.round(data[i + 2] / step) * step;
        }
        pipeline = sharp(data, { raw: info });
        break;
      }
      default:
        throw new ApexifyInputError(`effects: unsupported filter type ${filter.type}.`);
    }
  }

  return pipeline.png().toBuffer();
}

export async function detectColors(
  source: string | Buffer,
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Array<{ color: string; frequency: string }>> {
  const input = await resolveImageInput(source, runtime);
  const { data, info } = await sharp(input)
    .resize(200, 200, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map<string, number>();
  let opaquePixels = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 50) continue;
    const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    opaquePixels += 1;
  }
  if (opaquePixels === 0) return [];

  return [...counts.entries()]
    .map(([color, count]) => ({ color, frequency: ((count / opaquePixels) * 100).toFixed(2) }))
    .filter((entry) => Number(entry.frequency) >= 0.1)
    .sort((a, b) => Number(b.frequency) - Number(a.frequency));
}

export async function removeColor(
  source: string | Buffer,
  colorToRemove: { red: number; green: number; blue: number },
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Buffer> {
  const channels = [colorToRemove.red, colorToRemove.green, colorToRemove.blue];
  if (channels.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    throw new ApexifyInputError("colorsRemover: red, green and blue must be integers from 0 to 255.");
  }
  const input = await resolveImageInput(source, runtime);
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += info.channels) {
    if (
      data[i] === colorToRemove.red &&
      data[i + 1] === colorToRemove.green &&
      data[i + 2] === colorToRemove.blue
    ) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

export async function removeBackgroundViaService(
  imageUrl: string,
  apiKey: string,
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Buffer> {
  if (!apiKey?.trim()) throw new ApexifyInputError("removeBackground: apiKey is required.");
  let source: URL;
  try {
    source = new URL(imageUrl);
  } catch (error) {
    throw new ApexifyInputError("removeBackground: imageURL must be an absolute HTTP(S) URL.", { cause: error });
  }
  if (source.protocol !== "http:" && source.protocol !== "https:") {
    throw new ApexifyInputError("removeBackground: imageURL must use HTTP or HTTPS.");
  }

  const body = Buffer.from(JSON.stringify({ image_url: imageUrl, size: "auto" }));
  const endpoint = new URL("https://api.remove.bg/v1.0/removebg");
  return new Promise<Buffer>((resolve, reject) => {
    let total = 0;
    const chunks: Buffer[] = [];
    const request = https.request(endpoint, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
        "User-Agent": runtime.config.network.userAgent,
      },
    }, (response) => {
      const status = response.statusCode ?? 0;
      response.on("data", (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += bytes.length;
        if (total > runtime.config.limits.maxRemoteImageBytes) {
          response.destroy();
          reject(new ApexifyResourceLimitError("removeBackground response exceeded maxRemoteImageBytes.", {
            limit: "maxRemoteImageBytes",
            maximum: runtime.config.limits.maxRemoteImageBytes,
            actual: total,
          }));
          return;
        }
        chunks.push(bytes);
      });
      response.once("end", () => {
        const output = Buffer.concat(chunks, total);
        if (status < 200 || status >= 300) {
          reject(new ApexifyExternalServiceError(`removeBackground service returned HTTP ${status}.`, {
            details: { service: "remove.bg", endpoint: redactUrl(endpoint) },
          }));
          return;
        }
        if (output.length === 0) {
          reject(new ApexifyExternalServiceError("removeBackground service returned an empty response.", {
            details: { service: "remove.bg" },
          }));
          return;
        }
        resolve(output);
      });
      response.once("error", reject);
    });
    request.setTimeout(runtime.config.network.timeoutMs, () => {
      request.destroy(new ApexifyExternalServiceError("removeBackground service request timed out.", {
        details: { service: "remove.bg" },
      }));
    });
    request.once("error", (error) => {
      reject(error instanceof ApexifyExternalServiceError
        ? error
        : new ApexifyExternalServiceError("removeBackground service request failed.", {
            cause: error,
            details: { service: "remove.bg" },
          }));
    });
    request.end(body);
  });
}
