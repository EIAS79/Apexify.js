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

    const imageData = ctx.getImageData(0, 0, width, height);
    const buffer = Buffer.from(new Uint8Array(imageData.data.buffer));

    // Create Sharp image with exact dimensions, ensuring alpha channel
    let sharpImage = sharp(buffer, {
      raw: {
        width: width,
        height: height,
        channels: 4
      }
    }).ensureAlpha();

    for (const filter of filters) {
      switch (filter.type) {
        case 'gaussianBlur':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applyGaussianBlurSharp(sharpImage, filter.intensity);
          }
          break;
        case 'motionBlur':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            const angle = filter.angle !== undefined ? filter.angle : 0;
            sharpImage = await applyMotionBlurSharp(sharpImage, filter.intensity, angle);
          }
          break;
        case 'radialBlur':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            const centerX = filter.centerX !== undefined ? filter.centerX : width / 2;
            const centerY = filter.centerY !== undefined ? filter.centerY : height / 2;
            sharpImage = await applyRadialBlurSharp(sharpImage, filter.intensity, centerX, centerY);
          }
          break;
        case 'sharpen':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applySharpenSharp(sharpImage, filter.intensity);
          }
          break;
        case 'brightness':
          if (filter.value !== undefined && filter.value !== 0) {
            sharpImage = await applyBrightnessSharp(sharpImage, filter.value);
          }
          break;
        case 'contrast':
          if (filter.value !== undefined && filter.value !== 0) {
            sharpImage = await applyContrastSharp(sharpImage, filter.value);
          }
          break;
        case 'saturation':
          if (filter.value !== undefined && filter.value !== 0) {
            sharpImage = await applySaturationSharp(sharpImage, filter.value);
          }
          break;
        case 'hueShift':
          if (filter.value !== undefined && filter.value !== 0) {
            sharpImage = await applyHueShiftSharp(sharpImage, filter.value);
          }
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
          const levels = filter.levels !== undefined && filter.levels > 1 ? filter.levels : 4;
          sharpImage = await applyPosterizeSharp(sharpImage, levels);
          break;
        case 'pixelate':
          const size = filter.size !== undefined && filter.size > 1 ? filter.size : 10;
          sharpImage = await applyPixelateSharp(sharpImage, size);
          break;
        case 'noise':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applyNoiseSharp(sharpImage, Math.min(1, Math.max(0, filter.intensity)));
          }
          break;
        case 'grain':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applyGrainSharp(sharpImage, Math.min(1, Math.max(0, filter.intensity)));
          }
          break;
        case 'edgeDetection':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applyEdgeDetectionSharp(sharpImage, filter.intensity);
          }
          break;
        case 'emboss':
          if (filter.intensity !== undefined && filter.intensity > 0) {
            sharpImage = await applyEmbossSharp(sharpImage, filter.intensity);
          }
          break;
      }
    }

    // Ensure output dimensions match input dimensions exactly
    const { data, info } = await sharpImage
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Verify dimensions match
    if (info.width !== width || info.height !== height) {
      // If dimensions don't match, resize to exact dimensions
      const resized = await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: 4
        }
      })
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
      
      const newImageData = ctx.createImageData(width, height);
      newImageData.data.set(new Uint8ClampedArray(resized.data));
      ctx.putImageData(newImageData, 0, 0);
    } else {
      // Dimensions match, use directly
      const newImageData = ctx.createImageData(width, height);
      newImageData.data.set(new Uint8ClampedArray(data));
      ctx.putImageData(newImageData, 0, 0);
    }

  } catch (error) {
    console.error('Error applying professional filters:', error);

    applyBasicFilters(ctx, filters, width, height);
  }
}

async function applyGaussianBlurSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  // Intensity: blur radius in pixels (0-100+)
  // Sharp's blur accepts sigma value, we use intensity directly
  const sigma = Math.max(0.3, Math.min(1000, intensity));
  return image.blur(sigma);
}

async function applyMotionBlurSharp(image: sharp.Sharp, intensity: number, angle: number): Promise<sharp.Sharp> {
  // Intensity: blur strength (0-100+)
  // Angle: direction in degrees (0-360)
  const normalizedAngle = ((angle % 360) + 360) % 360; // Normalize to 0-360
  const kernel = createMotionBlurKernel(intensity, normalizedAngle);
  return image.convolve(kernel);
}

async function applyRadialBlurSharp(image: sharp.Sharp, intensity: number, centerX: number, centerY: number): Promise<sharp.Sharp> {
  // Intensity: blur strength (0-100+)
  // CenterX, CenterY: center point coordinates
  const kernel = createRadialBlurKernel(intensity, centerX, centerY);
  return image.convolve(kernel);
}

async function applySharpenSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  // Intensity: sharpening strength (0-100+)
  // Sharp's sharpen: (sigma, flat, jagged)
  const sigma = Math.max(0.3, Math.min(1000, intensity));
  return image.sharpen(sigma, 1, 2);
}

async function applyBrightnessSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== undefined && value !== 0) {
    // Value is expected to be a percentage (-100 to 100)
    const brightness = Math.max(0, Math.min(2, 1 + value / 100));
    return image.modulate({ brightness });
  }
  return image;
}

async function applyContrastSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== undefined && value !== 0) {
    // Value is expected to be a percentage (-100 to 100)
    const contrast = Math.max(0, Math.min(2, 1 + value / 100));
    return image.linear(contrast, -(128 * contrast) + 128);
  }
  return image;
}

async function applySaturationSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== undefined && value !== 0) {
    // Value is expected to be a percentage (-100 to 100)
    const saturation = Math.max(0, Math.min(2, 1 + value / 100));
    return image.modulate({ saturation });
  }
  return image;
}

async function applyHueShiftSharp(image: sharp.Sharp, value: number): Promise<sharp.Sharp> {
  if (value !== undefined && value !== 0) {
    // Value is expected to be degrees (0-360, can be negative for reverse rotation)
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
  // Invert colors using Sharp's negate
  // Ensure we preserve dimensions and alpha channel
  return image.negate({ alpha: false }).ensureAlpha();
}

async function applyPosterizeSharp(image: sharp.Sharp, levels: number): Promise<sharp.Sharp> {
  // Levels: 2-256 (number of color levels)
  const clampedLevels = Math.max(2, Math.min(256, Math.floor(levels)));
  // Sharp doesn't have direct posterize, use threshold approximation
  // Better implementation would use quantization
  return image.threshold(128).modulate({ saturation: 0 });
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
  // Intensity: 0-1 (noise amount)
  // Clamp intensity to valid range
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  
  const buffer = await image.png().toBuffer();
  const jimpImage = await Jimp.read(buffer);

  jimpImage.scan(0, 0, jimpImage.width, jimpImage.height, function (this: any, x: number, y: number, idx: number) {
    const noise = (Math.random() - 0.5) * clampedIntensity * 255;
    this.bitmap.data[idx] = Math.max(0, Math.min(255, this.bitmap.data[idx] + noise));
    this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, this.bitmap.data[idx + 1] + noise));
    this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, this.bitmap.data[idx + 2] + noise));
  });

  const jimpBuffer = await jimpImage.getBuffer('image/png');
  return sharp(jimpBuffer);
}

async function applyGrainSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  // Intensity: 0-1 (grain amount)
  // Clamp intensity to valid range
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  
  const buffer = await image.png().toBuffer();
  const jimpImage = await Jimp.read(buffer);

  jimpImage.scan(0, 0, jimpImage.width, jimpImage.height, function (this: any, x: number, y: number, idx: number) {
    const grain = (Math.random() - 0.5) * clampedIntensity * 100;
    this.bitmap.data[idx] = Math.max(0, Math.min(255, this.bitmap.data[idx] + grain));
    this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, this.bitmap.data[idx + 1] + grain));
    this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, this.bitmap.data[idx + 2] + grain));
  });

  const jimpBuffer = await jimpImage.getBuffer('image/png');
  return sharp(jimpBuffer);
}

async function applyEdgeDetectionSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  // Intensity: edge detection strength (0-10+)
  const kernel = createSobelKernel(intensity);
  return image.convolve(kernel).grayscale();
}

async function applyEmbossSharp(image: sharp.Sharp, intensity: number): Promise<sharp.Sharp> {
  // Intensity: emboss strength (0-10+)
  const kernel = createEmbossKernel(intensity);
  return image.convolve(kernel);
}

function createMotionBlurKernel(intensity: number, angle: number): any {
  const size = Math.max(3, Math.floor(intensity));
  const kernel = Array(size * size).fill(0);
  const center = Math.floor(size / 2);

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
