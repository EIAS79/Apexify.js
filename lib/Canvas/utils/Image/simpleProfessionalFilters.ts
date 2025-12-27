import { SKRSContext2D } from '@napi-rs/canvas';
import { ImageFilter } from '../types';
import sharp from 'sharp';

/**
 * Applies professional image filters using Sharp (simplified version)
 * @param ctx Canvas 2D context
 * @param filters Array of filters to apply
 * @param width Canvas width
 * @param height Canvas height
 */
export async function applySimpleProfessionalFilters(
  ctx: SKRSContext2D,
  filters: ImageFilter[],
  width: number,
  height: number
): Promise<void> {
  if (!filters || filters.length === 0) return;

  try {

    const imageData = ctx.getImageData(0, 0, width, height);

    const buffer = Buffer.from(new Uint8Array(imageData.data.buffer));

    let sharpImage = sharp(buffer, {
      raw: {
        width: width,
        height: height,
        channels: 4
      }
    });

    for (const filter of filters) {
      switch (filter.type) {
        case 'gaussianBlur':
          if (filter.intensity && filter.intensity > 0) {
            sharpImage = sharpImage.blur(filter.intensity);
          }
          break;
        case 'sharpen':
          if (filter.intensity && filter.intensity > 0) {
            sharpImage = sharpImage.sharpen(filter.intensity);
          }
          break;
        case 'brightness':
          if (filter.value !== undefined && filter.value !== 0) {
            const brightness = Math.max(0, Math.min(2, 1 + filter.value / 100));
            sharpImage = sharpImage.modulate({ brightness });
          }
          break;
        case 'contrast':
          if (filter.value !== undefined && filter.value !== 0) {
            const contrast = Math.max(0, Math.min(2, 1 + filter.value / 100));
            sharpImage = sharpImage.linear(contrast, -(128 * contrast) + 128);
          }
          break;
        case 'saturation':
          if (filter.value !== undefined && filter.value !== 0) {
            const saturation = Math.max(0, Math.min(2, 1 + filter.value / 100));
            sharpImage = sharpImage.modulate({ saturation });
          }
          break;
        case 'hueShift':
          if (filter.value !== undefined && filter.value !== 0) {
            sharpImage = sharpImage.modulate({ hue: filter.value });
          }
          break;
        case 'grayscale':
          sharpImage = sharpImage.grayscale();
          break;
        case 'sepia':
          sharpImage = sharpImage.recomb([
            [0.393, 0.769, 0.189],
            [0.349, 0.686, 0.168],
            [0.272, 0.534, 0.131]
          ]);
          break;
        case 'invert':
          sharpImage = sharpImage.negate();
          break;
        case 'posterize':
          if (filter.levels && filter.levels > 1) {
            sharpImage = sharpImage.threshold(128);
          }
          break;
        case 'pixelate':
          if (filter.size && filter.size > 1) {
            const { width: imgWidth, height: imgHeight } = await sharpImage.metadata();
            const scale = Math.max(1, Math.floor(Math.min(imgWidth || 1, imgHeight || 1) / filter.size));
            sharpImage = sharpImage.resize({ width: scale, height: scale, kernel: sharp.kernel.nearest })
                                 .resize({ width: imgWidth, height: imgHeight, kernel: sharp.kernel.nearest });
          }
          break;
        case 'motionBlur':
        case 'radialBlur':
        case 'noise':
        case 'grain':
        case 'edgeDetection':
        case 'emboss':

          applyBasicCanvasFilter(ctx, filter, width, height);
return;
      }
    }

    const { data } = await sharpImage.raw().toBuffer({ resolveWithObject: true });
    const newImageData = ctx.createImageData(width, height);
    newImageData.data.set(new Uint8ClampedArray(data));
    ctx.putImageData(newImageData, 0, 0);

  } catch (error) {
    console.error('Error applying professional filters:', error);

    applyBasicCanvasFilters(ctx, filters, width, height);
  }
}

function applyBasicCanvasFilter(ctx: SKRSContext2D, filter: ImageFilter, width: number, height: number): void {
  ctx.save();

  switch (filter.type) {
    case 'motionBlur':
      if (filter.intensity && filter.intensity > 0) {
        const radians = ((filter.angle || 0) * Math.PI) / 180;
        const blurX = Math.cos(radians) * filter.intensity;
        const blurY = Math.sin(radians) * filter.intensity;
        ctx.filter = `blur(${Math.abs(blurX)}px ${Math.abs(blurY)}px)`;
      }
      break;
    case 'radialBlur':
      if (filter.intensity && filter.intensity > 0) {
        ctx.filter = `blur(${filter.intensity}px)`;
      }
      break;
    case 'noise':
      if (filter.intensity && filter.intensity > 0) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const noise = (Math.random() - 0.5) * filter.intensity * 255;
data[i] = Math.max(0, Math.min(255, data[i] + noise));
data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        ctx.putImageData(imageData, 0, 0);
      }
      break;
    case 'grain':
      if (filter.intensity && filter.intensity > 0) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const grain = (Math.random() - 0.5) * filter.intensity * 100;
data[i] = Math.max(0, Math.min(255, data[i] + grain));
data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
        }

        ctx.putImageData(imageData, 0, 0);
      }
      break;
    case 'edgeDetection':
      if (filter.intensity && filter.intensity > 0) {
        ctx.filter = `contrast(${100 + filter.intensity * 50}%) brightness(${100 - filter.intensity * 20}%)`;
      }
      break;
    case 'emboss':
      if (filter.intensity && filter.intensity > 0) {
        ctx.filter = `contrast(${100 + filter.intensity * 30}%) brightness(${100 + filter.intensity * 10}%)`;
      }
      break;
  }

  ctx.restore();
}

function applyBasicCanvasFilters(ctx: SKRSContext2D, filters: ImageFilter[], width: number, height: number): void {
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
