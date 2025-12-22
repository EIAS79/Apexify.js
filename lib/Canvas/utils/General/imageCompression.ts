import sharp from 'sharp';
import path from 'path';
import { CompressionOptions, PaletteOptions } from '../types';

/**
 * Compresses an image with quality control
 * @param image - Image source (path, URL, or Buffer)
 * @param options - Compression options
 * @returns Compressed image buffer
 */
export async function compressImage(
  image: string | Buffer,
  options: CompressionOptions = {}
): Promise<Buffer> {
  const {
    quality = 90,
    format = 'jpeg',
    maxWidth,
    maxHeight,
    progressive = false
  } = options;

  let sharpImage: sharp.Sharp;

  if (Buffer.isBuffer(image)) {
    sharpImage = sharp(image);
  } else if (typeof image === 'string' && image.startsWith('http')) {
    const response = await fetch(image);
    const buffer = await response.arrayBuffer();
    sharpImage = sharp(Buffer.from(buffer));
  } else {
    const imagePath = path.join(process.cwd(), image);
    sharpImage = sharp(imagePath);
  }

  // Resize if needed
  if (maxWidth || maxHeight) {
    sharpImage = sharpImage.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  // Convert and compress
  switch (format) {
    case 'jpeg':
      return await sharpImage
        .jpeg({ quality, progressive })
        .toBuffer();
        
    case 'webp':
      return await sharpImage
        .webp({ quality })
        .toBuffer();
        
    case 'avif':
      return await sharpImage
        .avif({ quality })
        .toBuffer();
        
    default:
      return await sharpImage
        .jpeg({ quality, progressive })
        .toBuffer();
  }
}

/**
 * Extracts color palette from an image
 * @param image - Image source (path, URL, or Buffer)
 * @param options - Palette extraction options
 * @returns Array of colors with percentages
 */
export async function extractPalette(
  image: string | Buffer,
  options: PaletteOptions = {}
): Promise<Array<{ color: string; percentage: number }>> {
  const {
    count = 10,
    method = 'kmeans',
    format = 'hex'
  } = options;

  let sharpImage: sharp.Sharp;

  if (Buffer.isBuffer(image)) {
    sharpImage = sharp(image);
  } else if (typeof image === 'string' && image.startsWith('http')) {
    const response = await fetch(image);
    const buffer = await response.arrayBuffer();
    sharpImage = sharp(Buffer.from(buffer));
  } else {
    const imagePath = path.join(process.cwd(), image);
    sharpImage = sharp(imagePath);
  }

  // Resize for faster processing
  const { data, info } = await sharpImage
    .resize(200, 200, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels: Array<{ r: number; g: number; b: number }> = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push({
      r: data[i],
      g: data[i + 1],
      b: data[i + 2]
    });
  }

  // Extract colors based on method
  let colors: Array<{ r: number; g: number; b: number; count: number }> = [];

  if (method === 'median-cut') {
    colors = medianCut(pixels, count);
  } else if (method === 'octree') {
    colors = octreeQuantization(pixels, count);
  } else {
    // kmeans (default)
    colors = kmeansClustering(pixels, count);
  }

  // Convert to requested format and calculate percentages
  const totalPixels = pixels.length;
  const palette = colors.map(color => {
    let colorString: string;
    
    if (format === 'hex') {
      colorString = `#${[color.r, color.g, color.b].map(c => 
        c.toString(16).padStart(2, '0')
      ).join('')}`;
    } else if (format === 'rgb') {
      colorString = `rgb(${color.r}, ${color.g}, ${color.b})`;
    } else {
      // hsl
      const hsl = rgbToHsl(color.r, color.g, color.b);
      colorString = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    }

    return {
      color: colorString,
      percentage: (color.count / totalPixels) * 100
    };
  });

  // Sort by percentage descending
  return palette.sort((a, b) => b.percentage - a.percentage);
}

/**
 * K-means clustering for color extraction
 */
function kmeansClustering(
  pixels: Array<{ r: number; g: number; b: number }>,
  k: number
): Array<{ r: number; g: number; b: number; count: number }> {
  // Initialize centroids randomly
  const centroids: Array<{ r: number; g: number; b: number }> = [];
  for (let i = 0; i < k; i++) {
    const randomPixel = pixels[Math.floor(Math.random() * pixels.length)];
    centroids.push({ r: randomPixel.r, g: randomPixel.g, b: randomPixel.b });
  }

  // Iterate
  for (let iter = 0; iter < 10; iter++) {
    const clusters: Array<Array<{ r: number; g: number; b: number }>> = 
      new Array(k).fill(null).map(() => []);

    // Assign pixels to nearest centroid
    for (const pixel of pixels) {
      let minDist = Infinity;
      let nearestCluster = 0;
      
      for (let i = 0; i < centroids.length; i++) {
        const dist = Math.sqrt(
          Math.pow(pixel.r - centroids[i].r, 2) +
          Math.pow(pixel.g - centroids[i].g, 2) +
          Math.pow(pixel.b - centroids[i].b, 2)
        );
        if (dist < minDist) {
          minDist = dist;
          nearestCluster = i;
        }
      }
      clusters[nearestCluster].push(pixel);
    }

    // Update centroids
    for (let i = 0; i < k; i++) {
      if (clusters[i].length > 0) {
        const avgR = clusters[i].reduce((sum, p) => sum + p.r, 0) / clusters[i].length;
        const avgG = clusters[i].reduce((sum, p) => sum + p.g, 0) / clusters[i].length;
        const avgB = clusters[i].reduce((sum, p) => sum + p.b, 0) / clusters[i].length;
        centroids[i] = { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) };
      }
    }
  }

  // Count pixels in each cluster
  const counts: number[] = new Array(k).fill(0);
  for (const pixel of pixels) {
    let minDist = Infinity;
    let nearestCluster = 0;
    
    for (let i = 0; i < centroids.length; i++) {
      const dist = Math.sqrt(
        Math.pow(pixel.r - centroids[i].r, 2) +
        Math.pow(pixel.g - centroids[i].g, 2) +
        Math.pow(pixel.b - centroids[i].b, 2)
      );
      if (dist < minDist) {
        minDist = dist;
        nearestCluster = i;
      }
    }
    counts[nearestCluster]++;
  }

  return centroids.map((centroid, i) => ({
    ...centroid,
    count: counts[i]
  })).filter(c => c.count > 0);
}

/**
 * Median cut algorithm for color extraction
 */
function medianCut(
  pixels: Array<{ r: number; g: number; b: number }>,
  count: number
): Array<{ r: number; g: number; b: number; count: number }> {
  // Simplified median cut - divide color space
  const buckets: Array<Array<{ r: number; g: number; b: number }>> = [pixels];
  
  while (buckets.length < count && buckets.length < 8) {
    const largestBucket = buckets.reduce((max, bucket, i) => 
      bucket.length > buckets[max].length ? i : max, 0
    );
    
    const bucket = buckets[largestBucket];
    if (bucket.length <= 1) break;
    
    // Find color channel with largest range
    const ranges = {
      r: Math.max(...bucket.map(p => p.r)) - Math.min(...bucket.map(p => p.r)),
      g: Math.max(...bucket.map(p => p.g)) - Math.min(...bucket.map(p => p.g)),
      b: Math.max(...bucket.map(p => p.b)) - Math.min(...bucket.map(p => p.b))
    };
    
    const channel = ranges.r > ranges.g && ranges.r > ranges.b ? 'r' :
                   ranges.g > ranges.b ? 'g' : 'b';
    
    // Sort by channel and split at median
    bucket.sort((a, b) => a[channel] - b[channel]);
    const median = Math.floor(bucket.length / 2);
    
    buckets.splice(largestBucket, 1, bucket.slice(0, median), bucket.slice(median));
  }

  // Calculate average color for each bucket
  return buckets.map(bucket => {
    const avgR = Math.round(bucket.reduce((sum, p) => sum + p.r, 0) / bucket.length);
    const avgG = Math.round(bucket.reduce((sum, p) => sum + p.g, 0) / bucket.length);
    const avgB = Math.round(bucket.reduce((sum, p) => sum + p.b, 0) / bucket.length);
    return {
      r: avgR,
      g: avgG,
      b: avgB,
      count: bucket.length
    };
  });
}

/**
 * Octree quantization (simplified)
 */
function octreeQuantization(
  pixels: Array<{ r: number; g: number; b: number }>,
  count: number
): Array<{ r: number; g: number; b: number; count: number }> {
  // Simplified octree - use kmeans as fallback
  return kmeansClustering(pixels, count);
}

/**
 * Converts RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
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

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

