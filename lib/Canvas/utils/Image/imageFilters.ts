import { SKRSContext2D } from '@napi-rs/canvas';
import { ImageFilter } from '../types';

/**
 * Applies image filters to a canvas context
 * @param ctx Canvas 2D context
 * @param filters Array of filters to apply
 * @param width Canvas width
 * @param height Canvas height
 */
export function applyImageFilters(
  ctx: SKRSContext2D,
  filters: ImageFilter[],
  width: number,
  height: number
): void {
  if (!filters || filters.length === 0) return;

  ctx.save();

  for (const filter of filters) {
    switch (filter.type) {
      case 'gaussianBlur':
        applyGaussianBlur(ctx, filter.intensity || 0);
        break;
      case 'motionBlur':
        applyMotionBlur(ctx, filter.intensity || 0, filter.angle || 0);
        break;
      case 'radialBlur':
        applyRadialBlur(ctx, filter.intensity || 0, filter.centerX || width/2, filter.centerY || height/2);
        break;
      case 'sharpen':
        applySharpen(ctx, filter.intensity || 0);
        break;
      case 'noise':
        applyNoise(ctx, filter.intensity || 0.1);
        break;
      case 'grain':
        applyGrain(ctx, filter.intensity || 0.05);
        break;
      case 'edgeDetection':
        applyEdgeDetection(ctx, filter.intensity || 1);
        break;
      case 'emboss':
        applyEmboss(ctx, filter.intensity || 1);
        break;
      case 'invert':
        applyInvert(ctx);
        break;
      case 'grayscale':
        applyGrayscale(ctx);
        break;
      case 'sepia':
        applySepia(ctx);
        break;
      case 'pixelate':
        applyPixelate(ctx, filter.size || 10);
        break;
      case 'brightness':
        applyBrightness(ctx, filter.value || 0);
        break;
      case 'contrast':
        applyContrast(ctx, filter.value || 0);
        break;
      case 'saturation':
        applySaturation(ctx, filter.value || 0);
        break;
      case 'hueShift':
        applyHueShift(ctx, filter.value || 0);
        break;
      case 'posterize':
        applyPosterize(ctx, filter.levels || 4);
        break;
    }
  }

  ctx.restore();
}

function applyGaussianBlur(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    ctx.filter = `blur(${intensity}px)`;
  }
}

function applyMotionBlur(ctx: SKRSContext2D, intensity: number, angle: number): void {
  if (intensity > 0) {

    const radians = (angle * Math.PI) / 180;
    const blurX = Math.cos(radians) * intensity;
    const blurY = Math.sin(radians) * intensity;
    ctx.filter = `blur(${Math.abs(blurX)}px ${Math.abs(blurY)}px)`;
  }
}

function applyRadialBlur(ctx: SKRSContext2D, intensity: number, centerX: number, centerY: number): void {
  if (intensity > 0) {

    ctx.filter = `blur(${intensity}px)`;
  }
}

function applySharpen(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const originalData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        let r = 0, g = 0, b = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            const kernelValue = (ky === 0 && kx === 0) ? 5 : -1;

            r += originalData[kidx] * kernelValue;
            g += originalData[kidx + 1] * kernelValue;
            b += originalData[kidx + 2] * kernelValue;
          }
        }

        data[idx] = Math.max(0, Math.min(255, originalData[idx] + (r - originalData[idx]) * intensity));
        data[idx + 1] = Math.max(0, Math.min(255, originalData[idx + 1] + (g - originalData[idx + 1]) * intensity));
        data[idx + 2] = Math.max(0, Math.min(255, originalData[idx + 2] + (b - originalData[idx + 2]) * intensity));
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyNoise(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * intensity * 255;
data[i] = Math.max(0, Math.min(255, data[i] + noise));
data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyGrain(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const grain = (Math.random() - 0.5) * intensity * 100;
data[i] = Math.max(0, Math.min(255, data[i] + grain));
data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyEdgeDetection(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const originalData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        let gx = 0, gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            const gray = (originalData[kidx] + originalData[kidx + 1] + originalData[kidx + 2]) / 3;

            const sobelX = (kx === -1) ? -1 : (kx === 0) ? 0 : 1;
            const sobelY = (ky === -1) ? -1 : (ky === 0) ? 0 : 1;

            gx += gray * sobelX;
            gy += gray * sobelY;
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy) * intensity;
        const edgeValue = Math.min(255, magnitude);

data[idx] = edgeValue;
data[idx + 1] = edgeValue;
data[idx + 2] = edgeValue;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyEmboss(ctx: SKRSContext2D, intensity: number): void {
  if (intensity > 0) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    const originalData = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;

        let r = 0, g = 0, b = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const kidx = ((y + ky) * width + (x + kx)) * 4;
            let kernelValue = 0;

            if (ky === -1 && kx === -1) kernelValue = -2;
            else if (ky === -1 && kx === 0) kernelValue = -1;
            else if (ky === -1 && kx === 1) kernelValue = 0;
            else if (ky === 0 && kx === -1) kernelValue = -1;
            else if (ky === 0 && kx === 0) kernelValue = 1;
            else if (ky === 0 && kx === 1) kernelValue = 1;
            else if (ky === 1 && kx === -1) kernelValue = 0;
            else if (ky === 1 && kx === 0) kernelValue = 1;
            else if (ky === 1 && kx === 1) kernelValue = 2;

            r += originalData[kidx] * kernelValue;
            g += originalData[kidx + 1] * kernelValue;
            b += originalData[kidx + 2] * kernelValue;
          }
        }

        data[idx] = Math.max(0, Math.min(255, 128 + r * intensity));
        data[idx + 1] = Math.max(0, Math.min(255, 128 + g * intensity));
        data[idx + 2] = Math.max(0, Math.min(255, 128 + b * intensity));
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyInvert(ctx: SKRSContext2D): void {
  ctx.filter = 'invert(100%)';
}

function applyGrayscale(ctx: SKRSContext2D): void {
  ctx.filter = 'grayscale(100%)';
}

function applySepia(ctx: SKRSContext2D): void {
  ctx.filter = 'sepia(100%)';
}

function applyPixelate(ctx: SKRSContext2D, size: number): void {
  if (size > 1) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    for (let y = 0; y < height; y += size) {
      for (let x = 0; x < width; x += size) {

        let r = 0, g = 0, b = 0, count = 0;

        for (let dy = 0; dy < size && y + dy < height; dy++) {
          for (let dx = 0; dx < size && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }

        r = Math.round(r / count);
        g = Math.round(g / count);
        b = Math.round(b / count);

        for (let dy = 0; dy < size && y + dy < height; dy++) {
          for (let dx = 0; dx < size && x + dx < width; dx++) {
            const idx = ((y + dy) * width + (x + dx)) * 4;
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }
}

function applyBrightness(ctx: SKRSContext2D, value: number): void {
  ctx.filter = `brightness(${100 + value}%)`;
}

function applyContrast(ctx: SKRSContext2D, value: number): void {
  ctx.filter = `contrast(${100 + value}%)`;
}

function applySaturation(ctx: SKRSContext2D, value: number): void {
  ctx.filter = `saturate(${100 + value}%)`;
}

function applyHueShift(ctx: SKRSContext2D, value: number): void {
  ctx.filter = `hue-rotate(${value}deg)`;
}

function applyPosterize(ctx: SKRSContext2D, levels: number): void {
  if (levels > 1) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const data = imageData.data;
    const step = 255 / (levels - 1);

    for (let i = 0; i < data.length; i += 4) {
data[i] = Math.round(data[i] / step) * step;
data[i + 1] = Math.round(data[i + 1] / step) * step;
data[i + 2] = Math.round(data[i + 2] / step) * step;
    }

    ctx.putImageData(imageData, 0, 0);
  }
}
