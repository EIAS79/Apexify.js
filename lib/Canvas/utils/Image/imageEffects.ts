import { SKRSContext2D, Image } from '@napi-rs/canvas';

/**
 * Applies vignette effect to the canvas
 * @param ctx - Canvas 2D context
 * @param intensity - Vignette intensity (0-1)
 * @param size - Vignette size (0-1, where 1 = full canvas)
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function applyVignette(
  ctx: SKRSContext2D,
  intensity: number,
  size: number,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
  const vignetteRadius = maxDistance * size;

  for (let i = 0; i < pixels.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor((i / 4) / width);
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > vignetteRadius) {
      const vignetteAmount = Math.min(1, (distance - vignetteRadius) / (maxDistance - vignetteRadius));
      const darken = 1 - (vignetteAmount * intensity);

pixels[i] = Math.round(pixels[i] * darken);
pixels[i + 1] = Math.round(pixels[i + 1] * darken);
pixels[i + 2] = Math.round(pixels[i + 2] * darken);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Applies lens flare effect to the canvas
 * @param ctx - Canvas 2D context
 * @param flareX - Flare center X position
 * @param flareY - Flare center Y position
 * @param intensity - Flare intensity (0-1)
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function applyLensFlare(
  ctx: SKRSContext2D,
  flareX: number,
  flareY: number,
  intensity: number,
  width: number,
  height: number
): void {
  ctx.save();

  const gradient = ctx.createRadialGradient(
    flareX, flareY, 0,
    flareX, flareY, Math.max(width, height) * 0.5
  );

  const flareColor = `rgba(255, 255, 255, ${intensity * 0.6})`;
  gradient.addColorStop(0, flareColor);
  gradient.addColorStop(0.3, `rgba(255, 255, 255, ${intensity * 0.3})`);
  gradient.addColorStop(0.6, `rgba(255, 255, 200, ${intensity * 0.1})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  const flareElements = [
    { x: flareX * 0.7, y: flareY * 0.7, size: 30, opacity: intensity * 0.4 },
    { x: flareX * 1.3, y: flareY * 1.1, size: 20, opacity: intensity * 0.3 },
    { x: flareX * 0.9, y: flareY * 1.2, size: 15, opacity: intensity * 0.2 }
  ];

  for (const element of flareElements) {
    if (element.x >= 0 && element.x < width && element.y >= 0 && element.y < height) {
      const elementGradient = ctx.createRadialGradient(
        element.x, element.y, 0,
        element.x, element.y, element.size
      );
      elementGradient.addColorStop(0, `rgba(255, 255, 255, ${element.opacity})`);
      elementGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = elementGradient;
      ctx.fillRect(element.x - element.size, element.y - element.size, element.size * 2, element.size * 2);
    }
  }

  ctx.restore();
}

/**
 * Applies chromatic aberration effect
 * @param ctx - Canvas 2D context
 * @param intensity - Aberration intensity (0-1)
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function applyChromaticAberration(
  ctx: SKRSContext2D,
  intensity: number,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const newPixels = new Uint8ClampedArray(pixels.length);
const offset = Math.round(intensity * 5);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      const redX = Math.max(0, Math.min(width - 1, x - offset));
      const redIdx = (y * width + redX) * 4;
      newPixels[idx] = pixels[redIdx];

      newPixels[idx + 1] = pixels[idx + 1];

      const blueX = Math.max(0, Math.min(width - 1, x + offset));
      const blueIdx = (y * width + blueX) * 4;
      newPixels[idx + 2] = pixels[blueIdx];

      newPixels[idx + 3] = pixels[idx + 3];
    }
  }

  ctx.putImageData(new ImageData(newPixels, width, height), 0, 0);
}

/**
 * Applies film grain effect
 * @param ctx - Canvas 2D context
 * @param intensity - Grain intensity (0-1)
 * @param width - Canvas width
 * @param height - Canvas height
 */
export function applyFilmGrain(
  ctx: SKRSContext2D,
  intensity: number,
  width: number,
  height: number
): void {
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
const grainAmount = intensity * 30;

  for (let i = 0; i < pixels.length; i += 4) {

    const grain = (Math.random() - 0.5) * grainAmount;

pixels[i] = Math.max(0, Math.min(255, pixels[i] + grain));
pixels[i + 1] = Math.max(0, Math.min(255, pixels[i + 1] + grain));
pixels[i + 2] = Math.max(0, Math.min(255, pixels[i + 2] + grain));

  }

  ctx.putImageData(imageData, 0, 0);
}

