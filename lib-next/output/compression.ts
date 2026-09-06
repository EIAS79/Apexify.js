import sharp from "sharp";
import type { Sharp } from "sharp";
import type { CompressionOptions, PaletteOptions } from "../types";
import { inspectImageSource } from "../image/image-source-validation";
import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumber } from "../runtime/validation";

type WeightedColor = { r: number; g: number; b: number; count: number };
type Accumulator = { r: number; g: number; b: number; count: number };

async function sharpFromMedia(image: string | Buffer, label: string): Promise<Sharp> {
  const inspected = await inspectImageSource(image, { label });
  return sharp(inspected.resolved);
}

function validateCompression(options: CompressionOptions): void {
  const quality = options.quality ?? 90;
  assertFiniteNumber(quality, "compression.quality", { min: 1, max: 100, integer: true });
  const format = options.format ?? "jpeg";
  if (!["jpeg", "webp", "avif"].includes(format)) throw new ApexifyInputError(`compression.format is unsupported: ${String(format)}.`);
  for (const [key, value] of [["maxWidth", options.maxWidth], ["maxHeight", options.maxHeight]] as const) {
    if (value !== undefined) {
      assertFiniteNumber(value, `compression.${key}`, { min: 1, integer: true });
      assertWithinLimit("maxCanvasDimension", value);
    }
  }
  if (options.progressive !== undefined && typeof options.progressive !== "boolean") {
    throw new ApexifyInputError("compression.progressive must be boolean.");
  }
}

function validatePalette(options: PaletteOptions): void {
  const count = options.count ?? 10;
  assertFiniteNumber(count, "palette.count", { min: 1, max: 256, integer: true });
  const method = options.method ?? "kmeans";
  if (!["kmeans", "median-cut", "octree"].includes(method)) throw new ApexifyInputError(`palette.method is unsupported: ${String(method)}.`);
  const format = options.format ?? "hex";
  if (!["hex", "rgb", "hsl"].includes(format)) throw new ApexifyInputError(`palette.format is unsupported: ${String(format)}.`);
}

/** Compress an image in one Sharp pipeline with validated quality/dimension bounds. */
export async function compressImage(image: string | Buffer, options: CompressionOptions = {}): Promise<Buffer> {
  validateCompression(options);
  const { quality = 90, format = "jpeg", maxWidth, maxHeight, progressive = false } = options;
  try {
    let sharpImage = await sharpFromMedia(image, "compress source");
    if (maxWidth !== undefined || maxHeight !== undefined) {
      sharpImage = sharpImage.resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true });
    }
    switch (format) {
      case "jpeg": return await sharpImage.jpeg({ quality, progressive }).toBuffer();
      case "webp": return await sharpImage.webp({ quality }).toBuffer();
      case "avif": return await sharpImage.avif({ quality }).toBuffer();
    }
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("Image compression failed.", { cause, details: { format } });
  }
}

/** Extract a deterministic bounded palette from a <=128x128 weighted histogram. */
export async function extractPalette(image: string | Buffer, options: PaletteOptions = {}): Promise<Array<{ color: string; percentage: number }>> {
  validatePalette(options);
  const { count = 10, method = "kmeans", format = "hex" } = options;
  try {
    const sharpImage = await sharpFromMedia(image, "palette source");
    const { data, info } = await sharpImage
      .resize(128, 128, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const samples = buildQuantizedHistogram(data, info.channels);
    if (samples.length === 0) return [];
    const desired = Math.min(count, samples.length);
    let colors: WeightedColor[];
    if (method === "median-cut") colors = medianCut(samples, desired);
    else if (method === "octree") colors = octreeQuantization(samples, desired);
    else colors = weightedKMeans(samples, desired);
    const total = colors.reduce((sum, color) => sum + color.count, 0);
    return colors
      .filter((color) => color.count > 0)
      .sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b)
      .map((color) => ({ color: formatColor(color, format), percentage: (color.count / total) * 100 }));
  } catch (cause) {
    if (cause instanceof ApexifyError) throw cause;
    throw new ApexifyDecodeError("Palette extraction failed.", { cause });
  }
}

function buildQuantizedHistogram(data: Buffer, channels: number): WeightedColor[] {
  const bins = new Map<number, Accumulator>();
  for (let i = 0; i + 2 < data.length; i += channels) {
    const alpha = channels >= 4 ? data[i + 3] : 255;
    if (alpha < 16) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const weight = alpha / 255;
    const bin = bins.get(key);
    if (bin) { bin.r += r * weight; bin.g += g * weight; bin.b += b * weight; bin.count += weight; }
    else bins.set(key, { r: r * weight, g: g * weight, b: b * weight, count: weight });
  }
  return [...bins.values()].map((bin) => ({ r: Math.round(bin.r / bin.count), g: Math.round(bin.g / bin.count), b: Math.round(bin.b / bin.count), count: bin.count }));
}

function distanceSquared(a: WeightedColor, b: Pick<WeightedColor, "r" | "g" | "b">): number {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function weightedKMeans(samples: WeightedColor[], k: number): WeightedColor[] {
  const ordered = [...samples].sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b);
  const centroids: WeightedColor[] = [{ ...ordered[0]! }];
  while (centroids.length < k) {
    let candidate = ordered[0]!;
    let bestScore = -1;
    for (const sample of ordered) {
      let nearest = Infinity;
      for (const centroid of centroids) nearest = Math.min(nearest, distanceSquared(sample, centroid));
      const score = nearest * Math.sqrt(sample.count);
      if (score > bestScore) { bestScore = score; candidate = sample; }
    }
    if (bestScore <= 0) break;
    centroids.push({ ...candidate });
  }
  for (let iteration = 0; iteration < 8; iteration++) {
    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const sample of samples) {
      let nearestIndex = 0, nearestDistance = Infinity;
      for (let i = 0; i < centroids.length; i++) {
        const distance = distanceSquared(sample, centroids[i]!);
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = i; }
      }
      const sum = sums[nearestIndex]!;
      sum.r += sample.r * sample.count; sum.g += sample.g * sample.count; sum.b += sample.b * sample.count; sum.count += sample.count;
    }
    let changed = false;
    for (let i = 0; i < centroids.length; i++) {
      const sum = sums[i]!;
      if (sum.count <= 0) continue;
      const next = { r: Math.round(sum.r / sum.count), g: Math.round(sum.g / sum.count), b: Math.round(sum.b / sum.count), count: sum.count };
      if (next.r !== centroids[i]!.r || next.g !== centroids[i]!.g || next.b !== centroids[i]!.b) changed = true;
      centroids[i] = next;
    }
    if (!changed) break;
  }
  return assignClusterCounts(samples, centroids);
}

function assignClusterCounts(samples: WeightedColor[], centroids: WeightedColor[]): WeightedColor[] {
  const counts = new Array<number>(centroids.length).fill(0);
  for (const sample of samples) {
    let nearestIndex = 0, nearestDistance = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      const distance = distanceSquared(sample, centroids[i]!);
      if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = i; }
    }
    counts[nearestIndex]! += sample.count;
  }
  return centroids.map((centroid, index) => ({ ...centroid, count: counts[index]! })).filter((color) => color.count > 0);
}

function medianCut(samples: WeightedColor[], count: number): WeightedColor[] {
  const buckets: WeightedColor[][] = [[...samples]];
  while (buckets.length < count) {
    let splitIndex = -1, splitScore = -1;
    for (let i = 0; i < buckets.length; i++) {
      const bucket = buckets[i]!;
      if (bucket.length <= 1) continue;
      const range = channelRange(bucket);
      const population = bucket.reduce((sum, color) => sum + color.count, 0);
      const score = Math.max(range.r, range.g, range.b) * population;
      if (score > splitScore) { splitScore = score; splitIndex = i; }
    }
    if (splitIndex < 0) break;
    const bucket = buckets[splitIndex]!;
    const range = channelRange(bucket);
    const channel: "r" | "g" | "b" = range.r >= range.g && range.r >= range.b ? "r" : range.g >= range.b ? "g" : "b";
    const sorted = [...bucket].sort((a, b) => a[channel] - b[channel]);
    const total = sorted.reduce((sum, color) => sum + color.count, 0);
    let running = 0, cut = 1;
    for (; cut < sorted.length; cut++) { running += sorted[cut - 1]!.count; if (running >= total / 2) break; }
    buckets.splice(splitIndex, 1, sorted.slice(0, cut), sorted.slice(cut));
  }
  return buckets.filter((bucket) => bucket.length > 0).map(weightedAverage);
}

function channelRange(samples: WeightedColor[]): { r: number; g: number; b: number } {
  let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0;
  for (const color of samples) {
    minR = Math.min(minR, color.r); maxR = Math.max(maxR, color.r);
    minG = Math.min(minG, color.g); maxG = Math.max(maxG, color.g);
    minB = Math.min(minB, color.b); maxB = Math.max(maxB, color.b);
  }
  return { r: maxR - minR, g: maxG - minG, b: maxB - minB };
}

function octreeQuantization(samples: WeightedColor[], count: number): WeightedColor[] {
  let groups = new Map<number, WeightedColor[]>();
  for (let depth = 1; depth <= 8; depth++) {
    groups = new Map<number, WeightedColor[]>();
    const shift = 8 - depth;
    for (const color of samples) {
      const key = ((color.r >> shift) << (depth * 2)) | ((color.g >> shift) << depth) | (color.b >> shift);
      const group = groups.get(key);
      if (group) group.push(color); else groups.set(key, [color]);
    }
    if (groups.size >= count || depth === 8) break;
  }
  const candidates = [...groups.values()].map(weightedAverage);
  if (candidates.length <= count) return candidates;
  return candidates.sort((a, b) => b.count - a.count || a.r - b.r || a.g - b.g || a.b - b.b).slice(0, count);
}

function weightedAverage(samples: WeightedColor[]): WeightedColor {
  let r = 0, g = 0, b = 0, count = 0;
  for (const color of samples) { r += color.r * color.count; g += color.g * color.count; b += color.b * color.count; count += color.count; }
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count), count };
}

function formatColor(color: Pick<WeightedColor, "r" | "g" | "b">, format: "hex" | "rgb" | "hsl"): string {
  if (format === "hex") return `#${[color.r, color.g, color.b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  if (format === "rgb") return `rgb(${color.r}, ${color.g}, ${color.b})`;
  const hsl = rgbToHsl(color.r, color.g, color.b);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
