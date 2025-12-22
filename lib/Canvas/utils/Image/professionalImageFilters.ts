import { SKRSContext2D } from '@napi-rs/canvas';
import { ImageFilter } from '../types';
import sharp from 'sharp';
import { Jimp } from 'jimp';

/**
 * Applies professional image filters using Sharp and Jimp
 * @param ctx Canvas 2D context
 * @param filters Array of filters to apply
 * @param width Canvas width
 * @param height Canvas height
 */
export async function applyProfessionalImageFilters(
  ctx: SKRSContext2D,
  filters: ImageFilter[],
  width: number,
  height: number
): Promise<void> {
  if (!filters || filters.length === 0) return;

  try {
    // Get current canvas data
    const imageData = ctx.getImageData(0, 0, width, height);
    const buffer = Buffer.from(new Uint8Array(imageData.data.buffer));

    // Convert to Sharp-compatible format
    let sharpImage = sharp(buffer, {
      raw: {
        width: width,
        height: height,
        channels: 4
      }
    });

    // Apply each filter using Sharp
    for (const filter of filters) {
      switch (filter.type) {
        case 'gaussianBlur':
          sharpImage = await applyGaussianBlurSharp(sharpImage, filter.intensity || 0);
          break;
        case 'motionBlur':
          sharpImage = await applyMotionBlurSharp(sharpImage, filter.intensity || 0, filter.angle || 0);
          break;
        case 'radialBlur':
          sharpImage = await applyRadialBlurSharp(sharpImage, filter.intensity || 0, filter.centerX || width/2, filter.centerY || height/2);
          break;
        case 'sharpen':
          sharpImage = await applySharpenSharp(sharpImage, filter.intensity || 0);
          break;
        case 'brightness':
          sharpImage = await applyBrightnessSharp(sharpImage, filter.value || 0);
          break;
        case 'contrast':
          sharpImage = await applyContrastSharp(sharpImage, filter.value || 0);
          break;
        case 'saturation':
          sharpImage = await applySaturationSharp(sharpImage, filter.value || 0);
          break;
        case 'hueShift':
          sharpImage = await applyHueShiftSharp(sharpImage, filter.value || 0);
          break;
        case 'grayscale':
          sharpImage = await applyGrayscaleSharp(sharpImage);
          break;
        case 'sepia':
          sharpImage = await applySepiaSharp(sharpImage);
          break;
        case 'invert':
          sharpImage = await applyInvertSharp(sharpImage);
          break;
        case 'posterize':
          sharpImage = await applyPosterizeSharp(sharpImage, filter.levels || 4);
          break;
        case 'pixelate':
          sharpImage = await applyPixelateSharp(sharpImage, filter.size || 10);
          break;
        case 'noise':
          sharpImage = await applyNoiseSharp(sharpImage, filter.intensity || 0.1);
          break;
        case 'grain':
          sharpImage = await applyGrainSharp(sharpImage, filter.intensity || 0.05);
          break;
        case 'edgeDetection':
          sharpImage = await applyEdgeDetectionSharp(sharpImage, filter.intensity || 1);
          break;
        case 'emboss':
          sharpImage = await applyEmbossSharp(sharpImage, filter.intensity || 1);
          break;
      }
    }

    // Convert back to canvas format
    const { data } = await sharpImage.raw().toBuffer({ resolveWithObject: true });
    const newImageData = new ImageData(new Uint8ClampedArray(data), width, height);
    ctx.putImageData(newImageData, 0, 0);

  } catch (error) {
    console.error('Error applying professional filters:', error);
    // Fallback to basic filters if Sharp fails
    applyBasicFilters(ctx, filters, width, height);
  }
}

// Sharp-based filter implementations
async function applyGaussianBlurSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    return image.blur(intensity);
  }
  return image;
}

async function applyMotionBlurSharp(image: sharp.Sharp, intensity: number, angle: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Motion blur using convolution
    const kernel = createMotionBlurKernel(intensity, angle);
    return image.convolve(kernel);
  }
  return image;
}

async function applyRadialBlurSharp(image: sharp.Sharp, intensity: number, centerX: number, centerY: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Radial blur using custom kernel
    const kernel = createRadialBlurKernel(intensity, centerX, centerY);
    return image.convolve(kernel);
  }
  return image;
}

async function applySharpenSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    return image.sharpen(intensity, 1, 2);
  }
  return image;
}

async function applyBrightnessSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== 0) {
    const brightness = Math.max(0, Math.min(2, 1 + value / 100));
    return image.modulate({ brightness });
  }
  return image;
}

async function applyContrastSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== 0) {
    const contrast = Math.max(0, Math.min(2, 1 + value / 100));
    return image.linear(contrast, -(128 * contrast) + 128);
  }
  return image;
}

async function applySaturationSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== 0) {
    const saturation = Math.max(0, Math.min(2, 1 + value / 100));
    return image.modulate({ saturation });
  }
  return image;
}

async function applyHueShiftSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== 0) {
    return image.modulate({ hue: value });
  }
  return image;
}

async function applyGrayscaleSharp(image: sharp.Sharp): Promise<sharp.Sharp> {
  return image.grayscale();
}

async function applySepiaSharp(image: sharp.Sharp): Promise<sharp.Sharp> {
  return image.recomb([
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131]
  ]);
}

async function applyInvertSharp(image: sharp.Sharp): Promise<sharp.Sharp> {
  return image.negate();
}

async function applyPosterizeSharp(image: sharp.Sharp, levels: number): Promise<sharp.Sharp> {
  if (levels > 1) {
    const step = 255 / (levels - 1);
    return image.threshold(128).modulate({ saturation: 0 });
  }
  return image;
}

async function applyPixelateSharp(image: sharp.Sharp, size: number): Promise<sharp.Sharp> {
  if (size > 1) {
    const { width, height } = await image.metadata();
    const scale = Math.max(1, Math.floor(Math.min(width || 1, height || 1) / size));
    return image.resize({ width: scale, height: scale, kernel: sharp.kernel.nearest })
                 .resize({ width: width, height: height, kernel: sharp.kernel.nearest });
  }
  return image;
}

async function applyNoiseSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Add noise using Jimp for better control
    const buffer = await image.png().toBuffer();
    const jimpImage = await Jimp.read(buffer);
    
    jimpImage.scan(0, 0, jimpImage.width, jimpImage.height, function (this: any, x: number, y: number, idx: number) {
      const noise = (Math.random() - 0.5) * intensity * 255;
      this.bitmap.data[idx] = Math.max(0, Math.min(255, this.bitmap.data[idx] + noise));     // R
      this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, this.bitmap.data[idx + 1] + noise)); // G
      this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, this.bitmap.data[idx + 2] + noise)); // B
    });
    
    const jimpBuffer = await jimpImage.getBuffer('image/png');
    return sharp(jimpBuffer);
  }
  return image;
}

async function applyGrainSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Add grain using Jimp
    const buffer = await image.png().toBuffer();
    const jimpImage = await Jimp.read(buffer);
    
    jimpImage.scan(0, 0, jimpImage.width, jimpImage.height, function (this: any, x: number, y: number, idx: number) {
      const grain = (Math.random() - 0.5) * intensity * 100;
      this.bitmap.data[idx] = Math.max(0, Math.min(255, this.bitmap.data[idx] + grain));     // R
      this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, this.bitmap.data[idx + 1] + grain)); // G
      this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, this.bitmap.data[idx + 2] + grain)); // B
    });
    
    const jimpBuffer = await jimpImage.getBuffer('image/png');
    return sharp(jimpBuffer);
  }
  return image;
}

async function applyEdgeDetectionSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Edge detection using Sobel kernel
    const kernel = createSobelKernel(intensity);
    return image.convolve(kernel).grayscale();
  }
  return image;
}

async function applyEmbossSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  if (intensity > 0) {
    // Emboss using custom kernel
    const kernel = createEmbossKernel(intensity);
    return image.convolve(kernel);
  }
  return image;
}

// Kernel creation functions
function createMotionBlurKernel(intensity: number, angle: number): any {
  const size = Math.max(3, Math.floor(intensity));
  const kernel = Array(size * size).fill(0);
  const center = Math.floor(size / 2);
  
  // Create motion blur kernel based on angle
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians);
  const dy = Math.sin(radians);
  
  for (let i = 0; i < size; i++) {
    const x = Math.round(center + dx * (i - center));
    const y = Math.round(center + dy * (i - center));
    if (x >= 0 && x < size && y >= 0 && y < size) {
      kernel[y * size + x] = 1 / size;
    }
  }
  
  return {
    width: size,
    height: size,
    kernel: kernel,
    scale: 1,
    offset: 0
  };
}

function createRadialBlurKernel(intensity: number, centerX: number, centerY: number): any {
  const size = Math.max(3, Math.floor(intensity));
  const kernel = Array(size * size).fill(0);
  const center = Math.floor(size / 2);
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.sqrt((x - center) ** 2 + (y - center) ** 2);
      const weight = Math.max(0, 1 - distance / center);
      kernel[y * size + x] = weight;
    }
  }
  
  // Normalize kernel
  const sum = kernel.reduce((a, b) => a + b, 0);
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  return {
    width: size,
    height: size,
    kernel: kernel,
    scale: 1,
    offset: 0
  };
}

function createSobelKernel(intensity: number): any {
  // Sobel X kernel for edge detection
  const kernel = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1
  ].map(v => v * intensity);
  
  return {
    width: 3,
    height: 3,
    kernel: kernel,
    scale: 1,
    offset: 128
  };
}

function createEmbossKernel(intensity: number): any {
  const kernel = [
    -2, -1, 0,
    -1, 1, 1,
    0, 1, 2
  ].map(v => v * intensity);
  
  return {
    width: 3,
    height: 3,
    kernel: kernel,
    scale: 1,
    offset: 128
  };
}

// Fallback basic filters
function applyBasicFilters(ctx: SKRSContext2D, filters: ImageFilter[], width: number, height: number): void {
  ctx.save();
  
  for (const filter of filters) {
    switch (filter.type) {
      case 'gaussianBlur':
        if (filter.intensity && filter.intensity > 0) {
          ctx.filter = `blur(${filter.intensity}px)`;
        }
        break;
      case 'brightness':
        if (filter.value !== undefined) {
          ctx.filter = `brightness(${100 + filter.value}%)`;
        }
        break;
      case 'contrast':
        if (filter.value !== undefined) {
          ctx.filter = `contrast(${100 + filter.value}%)`;
        }
        break;
      case 'saturation':
        if (filter.value !== undefined) {
          ctx.filter = `saturate(${100 + filter.value}%)`;
        }
        break;
      case 'hueShift':
        if (filter.value !== undefined) {
          ctx.filter = `hue-rotate(${filter.value}deg)`;
        }
        break;
      case 'grayscale':
        ctx.filter = 'grayscale(100%)';
        break;
      case 'sepia':
        ctx.filter = 'sepia(100%)';
        break;
      case 'invert':
        ctx.filter = 'invert(100%)';
        break;
    }
  }
  
  ctx.restore();
}
