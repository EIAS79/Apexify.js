import sharp from "sharp";
import type { Sharp } from "sharp";
import type { CompressionOptions, PaletteOptions } from "../types";
import type { ApexifyRuntime } from "../runtime/context";
import { defaultApexifyRuntime } from "../runtime/context";
import { ApexifyInputError } from "../runtime/errors";
import { resolveImageInput } from "../media/source";

interface Pixel {
  r: number;
  g: number;
  b: number;
}

interface CountedColor extends Pixel {
  count: number;
}

async function sharpForImage(
  image: string | Buffer,
  runtime: ApexifyRuntime
): Promise<Sharp> {
  return sharp(await resolveImageInput(image, runtime));
}

export async function compressImage(
  image: string | Buffer,
  options: CompressionOptions = {},
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Buffer> {
  const {
    quality = 90,
    format = "jpeg",
    maxWidth,
    maxHeight,
    progressive = false,
  } = options;

  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new ApexifyInputError("compress: quality must be between 1 and 100.");
  }

  let sharpImage = await sharpForImage(image, runtime);
  if (maxWidth || maxHeight) {
    sharpImage = sharpImage.resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  switch (format) {
    case "jpeg": return sharpImage.jpeg({ quality, progressive }).toBuffer();
    case "webp": return sharpImage.webp({ quality }).toBuffer();
    case "avif": return sharpImage.avif({ quality }).toBuffer();
    default: throw new ApexifyInputError(`compress: unsupported format ${String(format)}.`);
  }
}

export async function extractPalette(
  image: string | Buffer,
  options: PaletteOptions = {},
  runtime: ApexifyRuntime = defaultApexifyRuntime
): Promise<Array<{ color: string; percentage: number }>> {
  const { count = 10, method = "kmeans", format = "hex" } = options;
  if (!Number.isInteger(count) || count < 1 || count > 256) {
    throw new ApexifyInputError("extractPalette: count must be an integer between 1 and 256.");
  }

  const { data, info } = await (await sharpForImage(image, runtime))
    .resize(200, 200, { fit: "inside", withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: Pixel[] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  if (pixels.length === 0) return [];

  let colors: CountedColor[];
  if (method === "median-cut") colors = medianCut(pixels, count);
  else if (method === "octree") colors = octreeQuantization(pixels, count);
  else colors = kmeansClustering(pixels, count);

  return colors
    .map((color) => ({
      color: formatColor(color, format),
      percentage: (color.count / pixels.length) * 100,
    }))
    .sort((a, b) => b.percentage - a.percentage);
}

function formatColor(color: Pixel, format: string): string {
  if (format === "hex") {
    return `#${[color.r, color.g, color.b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  if (format === "rgb") return `rgb(${color.r}, ${color.g}, ${color.b})`;
  const hsl = rgbToHsl(color.r, color.g, color.b);
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}

function squaredDistance(a: Pixel, b: Pixel): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Deterministic k-means seed selection keeps tests/repeated renders stable. */
function kmeansClustering(pixels: Pixel[], requested: number): CountedColor[] {
  const k = Math.min(requested, pixels.length);
  const centroids: Pixel[] = [];
  for (let i = 0; i < k; i += 1) {
    const index = k === 1 ? 0 : Math.floor((i * (pixels.length - 1)) / (k - 1));
    const pixel = pixels[index];
    centroids.push({ ...pixel });
  }

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sums = new Array(k).fill(null).map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (const pixel of pixels) {
      let nearest = 0;
      let minimum = Number.POSITIVE_INFINITY;
      for (let i = 0; i < centroids.length; i += 1) {
        const distance = squaredDistance(pixel, centroids[i]);
        if (distance < minimum) {
          minimum = distance;
          nearest = i;
        }
      }
      const sum = sums[nearest];
      sum.r += pixel.r;
      sum.g += pixel.g;
      sum.b += pixel.b;
      sum.count += 1;
    }
    for (let i = 0; i < k; i += 1) {
      const sum = sums[i];
      if (sum.count === 0) continue;
      centroids[i] = {
        r: Math.round(sum.r / sum.count),
        g: Math.round(sum.g / sum.count),
        b: Math.round(sum.b / sum.count),
      };
    }
  }

  const counts = new Array<number>(k).fill(0);
  for (const pixel of pixels) {
    let nearest = 0;
    let minimum = Number.POSITIVE_INFINITY;
    for (let i = 0; i < centroids.length; i += 1) {
      const distance = squaredDistance(pixel, centroids[i]);
      if (distance < minimum) {
        minimum = distance;
        nearest = i;
      }
    }
    counts[nearest] += 1;
  }

  return centroids
    .map((centroid, index) => ({ ...centroid, count: counts[index] }))
    .filter((entry) => entry.count > 0);
}

function medianCut(pixels: Pixel[], count: number): CountedColor[] {
  const buckets: Pixel[][] = [pixels.slice()];
  while (buckets.length < count) {
    let largestIndex = -1;
    let largestLength = 1;
    for (let i = 0; i < buckets.length; i += 1) {
      if (buckets[i].length > largestLength) {
        largestLength = buckets[i].length;
        largestIndex = i;
      }
    }
    if (largestIndex < 0) break;

    const bucket = buckets[largestIndex];
    const ranges = {
      r: Math.max(...bucket.map((p) => p.r)) - Math.min(...bucket.map((p) => p.r)),
      g: Math.max(...bucket.map((p) => p.g)) - Math.min(...bucket.map((p) => p.g)),
      b: Math.max(...bucket.map((p) => p.b)) - Math.min(...bucket.map((p) => p.b)),
    };
    const channel: keyof Pixel = ranges.r >= ranges.g && ranges.r >= ranges.b
      ? "r"
      : ranges.g >= ranges.b ? "g" : "b";
    bucket.sort((a, b) => a[channel] - b[channel]);
    const midpoint = Math.floor(bucket.length / 2);
    buckets.splice(largestIndex, 1, bucket.slice(0, midpoint), bucket.slice(midpoint));
  }

  return buckets.map((bucket) => ({
    r: Math.round(bucket.reduce((sum, p) => sum + p.r, 0) / bucket.length),
    g: Math.round(bucket.reduce((sum, p) => sum + p.g, 0) / bucket.length),
    b: Math.round(bucket.reduce((sum, p) => sum + p.b, 0) / bucket.length),
    count: bucket.length,
  }));
}

function octreeQuantization(pixels: Pixel[], count: number): CountedColor[] {
  // Existing public behavior used the same approximation; preserve it behind the same option.
  return kmeansClustering(pixels, count);
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  let red = r / 255;
  let green = g / 255;
  let blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const delta = max - min;
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === red) h = ((green - blue) / delta + (green < blue ? 6 : 0)) / 6;
    else if (max === green) h = ((blue - red) / delta + 2) / 6;
    else h = ((red - green) / delta + 4) / 6;
  }
  red = green = blue = 0;
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}
