import { loadImage, type Image } from "@napi-rs/canvas";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import type { MediaSource } from "../media/source";
import { resolveMediaInput } from "../media/source";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import {
  ApexifyDecodeError,
  ApexifyError,
  ApexifyInputError,
  ApexifyResourceLimitError,
} from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";

const DIRECT_CANVAS_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);
const SUPPORTED_RASTER_FORMATS = new Set(["jpeg", "png", "webp", "gif", "tiff", "heif", "avif", "jp2", "jxl", "svg"]);

export interface DecodedImageDimensions {
  width: number;
  height: number;
  pages: number;
  format: string;
  orientation?: number;
}

export interface InspectedImageSource extends DecodedImageDimensions {
  resolved: string | Buffer;
  sourceBytes?: number;
  svg: boolean;
}

function effectiveDimensions(width: number, height: number, orientation?: number): { width: number; height: number } {
  if (orientation !== undefined && orientation >= 5 && orientation <= 8) return { width: height, height: width };
  return { width, height };
}

function looksLikeSvg(buffer: Buffer): boolean {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 4096)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  return /^(?:<\?xml\b[^>]*>\s*)?(?:<!--[^]*?-->\s*)*<svg\b/i.test(prefix);
}

function assertSvgPolicy(text: string, label: string): void {
  const limits = getDefaultApexifyRuntimeConfig().limits;
  const elementCount = (text.match(/<(?:svg|g|defs|path|rect|circle|ellipse|line|polyline|polygon|text|image|use|mask|clipPath|filter|linearGradient|radialGradient|pattern)\b/gi) ?? []).length;
  if (elementCount > limits.maxSvgElements) {
    throw new ApexifyResourceLimitError("maxSvgElements", limits.maxSvgElements, elementCount);
  }

  if (/<(?:script|foreignObject)\b/i.test(text)) {
    throw new ApexifyDecodeError(`${label} contains active SVG content that is not supported.`);
  }
  if (/@import\b/i.test(text)) {
    throw new ApexifyDecodeError(`${label} contains an external SVG stylesheet reference.`);
  }

  const hrefPattern = /\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of text.matchAll(hrefPattern)) {
    const ref = match[2].trim();
    if (ref.startsWith("#") || /^data:/i.test(ref)) continue;
    throw new ApexifyDecodeError(`${label} contains an external SVG resource reference.`);
  }

  const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gi;
  for (const match of text.matchAll(urlPattern)) {
    const ref = match[2].trim();
    if (ref.startsWith("#") || /^data:/i.test(ref)) continue;
    throw new ApexifyDecodeError(`${label} contains an external SVG URL reference.`);
  }
}

async function sourceSizeAndSvgText(resolved: string | Buffer, label: string): Promise<{ bytes: number; svgText?: string }> {
  const limits = getDefaultApexifyRuntimeConfig().limits;
  let bytes: number;
  let sourceBuffer: Buffer | undefined;

  if (Buffer.isBuffer(resolved)) {
    bytes = resolved.byteLength;
    sourceBuffer = resolved;
  } else {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) throw new ApexifyInputError(`${label} must resolve to a regular file.`);
    bytes = stat.size;
  }

  if (bytes <= 0) throw new ApexifyInputError(`${label} must not be empty.`);
  if (bytes > limits.maxImageSourceBytes) {
    throw new ApexifyResourceLimitError("maxImageSourceBytes", limits.maxImageSourceBytes, bytes);
  }

  if (!sourceBuffer) {
    const handle = await fs.open(resolved as string, "r");
    try {
      const prefix = Buffer.alloc(Math.min(bytes, 4096));
      await handle.read(prefix, 0, prefix.length, 0);
      if (looksLikeSvg(prefix)) sourceBuffer = await fs.readFile(resolved as string);
    } finally {
      await handle.close();
    }
  }

  return {
    bytes,
    svgText: sourceBuffer && looksLikeSvg(sourceBuffer) ? sourceBuffer.toString("utf8") : undefined,
  };
}

/**
 * Authoritative raster-image preflight. It resolves through the shared media layer,
 * bounds source bytes, inspects native metadata before full decode, applies decoded
 * dimension/pixel/frame limits, and enforces the explicit safe-SVG policy.
 */
export async function inspectImageSource(
  source: MediaSource,
  options: { label?: string; requireCanvasBudget?: boolean } = {}
): Promise<InspectedImageSource> {
  const label = options.label ?? "image source";
  try {
    const resolved = await resolveMediaInput(source, { kind: "image" });
    const { bytes, svgText } = await sourceSizeAndSvgText(resolved, label);
    if (svgText !== undefined) assertSvgPolicy(svgText, label);

    const limits = getDefaultApexifyRuntimeConfig().limits;
    const metadata = await sharp(resolved, {
      limitInputPixels: limits.maxDecodedImagePixels,
      sequentialRead: true,
    }).metadata();

    const format = metadata.format ?? "unknown";
    if (!SUPPORTED_RASTER_FORMATS.has(format)) {
      throw new ApexifyDecodeError(`${label} format "${format}" is not supported by the raster pipeline.`);
    }

    const width = metadata.width ?? 0;
    const rawHeight = metadata.pageHeight ?? metadata.height ?? 0;
    const pages = metadata.pages ?? 1;
    if (!Number.isFinite(width) || !Number.isFinite(rawHeight) || width <= 0 || rawHeight <= 0) {
      throw new ApexifyDecodeError(`${label} dimensions could not be determined.`);
    }
    if (!Number.isFinite(pages) || !Number.isInteger(pages) || pages <= 0) {
      throw new ApexifyDecodeError(`${label} frame/page count could not be determined safely.`);
    }
    if (pages > limits.maxDecodedImageFrames) {
      throw new ApexifyResourceLimitError("maxDecodedImageFrames", limits.maxDecodedImageFrames, pages);
    }

    const oriented = effectiveDimensions(width, rawHeight, metadata.orientation);
    const decodedPixels = oriented.width * oriented.height * pages;
    if (!Number.isSafeInteger(decodedPixels) || decodedPixels > limits.maxDecodedImagePixels) {
      throw new ApexifyResourceLimitError("maxDecodedImagePixels", limits.maxDecodedImagePixels, decodedPixels);
    }
    if (oriented.width > limits.maxCanvasDimension || oriented.height > limits.maxCanvasDimension) {
      const actual = Math.max(oriented.width, oriented.height);
      throw new ApexifyResourceLimitError("maxCanvasDimension", limits.maxCanvasDimension, actual);
    }
    if (options.requireCanvasBudget) assertCanvasResourceLimits(oriented.width, oriented.height);

    if (format === "svg") {
      if (svgText === undefined) {
        throw new ApexifyDecodeError(`${label} uses compressed or otherwise non-inspectable SVG input, which is not supported.`);
      }
      assertSvgPolicy(svgText, label);
    }

    return {
      resolved,
      width: oriented.width,
      height: oriented.height,
      pages,
      format,
      orientation: metadata.orientation,
      sourceBytes: bytes,
      svg: format === "svg",
    };
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError(`${label} could not be inspected safely.`, { cause: error });
  }
}

/**
 * Decode a preflighted source for @napi-rs/canvas. Common canvas-native formats avoid
 * the historical Sharp→PNG→Canvas transcode; uncommon raster formats and safe SVG are
 * normalized to a single first-frame PNG only when the canvas backend needs it.
 */
export async function decodeImageSource(
  source: MediaSource,
  options: { label?: string; requireCanvasBudget?: boolean } = {}
): Promise<Image> {
  const inspected = await inspectImageSource(source, options);
  try {
    if (DIRECT_CANVAS_FORMATS.has(inspected.format) && inspected.pages === 1) {
      return await loadImage(inspected.resolved);
    }

    const limits = getDefaultApexifyRuntimeConfig().limits;
    const png = await sharp(inspected.resolved, {
      page: 0,
      pages: 1,
      limitInputPixels: limits.maxDecodedImagePixels,
      sequentialRead: true,
    }).png().toBuffer();
    return await loadImage(png);
  } catch (error) {
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError(`${options.label ?? "image source"} could not be decoded.`, { cause: error });
  }
}

/** Backward-compatible internal name used by Phase 4 preflights. */
export async function inspectDecodedImageSource(
  source: MediaSource,
  options: { label?: string; requireCanvasBudget?: boolean } = {}
): Promise<DecodedImageDimensions> {
  const inspected = await inspectImageSource(source, options);
  return {
    width: inspected.width,
    height: inspected.height,
    pages: inspected.pages,
    format: inspected.format,
    orientation: inspected.orientation,
  };
}
