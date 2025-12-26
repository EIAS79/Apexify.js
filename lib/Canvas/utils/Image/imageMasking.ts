import { createCanvas, loadImage, SKRSContext2D, Image } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import { getCanvasContext } from '../errorUtils';

/**
 * Applies a mask to an image
 * @param ctx - Canvas 2D context
 * @param image - Source image
 * @param maskSource - Mask image source (path, URL, or Buffer)
 * @param mode - Mask mode: 'alpha', 'luminance', or 'inverse'
 * @param x - X position
 * @param y - Y position
 * @param width - Image width
 * @param height - Image height
 */
export async function applyImageMask(
  ctx: SKRSContext2D,
  image: Image,
  maskSource: string | Buffer,
  mode: 'alpha' | 'luminance' | 'inverse' = 'alpha',
  x: number,
  y: number,
  width: number,
  height: number
): Promise<void> {
  try {
    // Load mask image
    let maskImage: Image;
    if (Buffer.isBuffer(maskSource)) {
      maskImage = await loadImage(maskSource);
    } else if (maskSource.startsWith('http')) {
      maskImage = await loadImage(maskSource);
    } else {
      const maskPath = path.join(process.cwd(), maskSource);
      maskImage = await loadImage(fs.readFileSync(maskPath));
    }

    // Create temporary canvas for mask processing
    const maskCanvas = createCanvas(width, height);
    const maskCtx = getCanvasContext(maskCanvas);

    // Draw mask image scaled to target size
    maskCtx.drawImage(maskImage, 0, 0, width, height);

    // Get mask image data
    const maskData = maskCtx.getImageData(0, 0, width, height);
    const maskPixels = maskData.data;

    // Get source image data
    const sourceCanvas = createCanvas(width, height);
    const sourceCtx = getCanvasContext(sourceCanvas);
    sourceCtx.drawImage(image, 0, 0, width, height);
    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const sourcePixels = sourceData.data;

    // Apply mask based on mode
    for (let i = 0; i < sourcePixels.length; i += 4) {
      const maskR = maskPixels[i];
      const maskG = maskPixels[i + 1];
      const maskB = maskPixels[i + 2];
      const maskA = maskPixels[i + 3];

      let alpha = maskA / 255;

      if (mode === 'luminance') {
        // Use luminance of mask as alpha
        const luminance = (maskR * 0.299 + maskG * 0.587 + maskB * 0.114) / 255;
        alpha = luminance;
      } else if (mode === 'inverse') {
        // Invert the alpha
        alpha = 1 - (maskA / 255);
      }
      // 'alpha' mode uses mask alpha directly (already set above)

      // Apply mask alpha to source image
      sourcePixels[i + 3] = Math.round(sourcePixels[i + 3] * alpha);
    }

    // Put masked image data back
    sourceCtx.putImageData(sourceData, 0, 0);
    ctx.drawImage(sourceCanvas, x, y);
  } catch (error) {
    console.error('Error applying image mask:', error);
    throw error;
  }
}

/**
 * Applies a clipping path to the context
 * @param ctx - Canvas 2D context
 * @param clipPath - Array of points defining the polygon
 */
export function applyClipPath(ctx: SKRSContext2D, clipPath: Array<{ x: number; y: number }>): void {
  if (!clipPath || clipPath.length < 3) {
    throw new Error('Clip path must have at least 3 points');
  }

  ctx.beginPath();
  ctx.moveTo(clipPath[0].x, clipPath[0].y);
  for (let i = 1; i < clipPath.length; i++) {
    ctx.lineTo(clipPath[i].x, clipPath[i].y);
  }
  ctx.closePath();
  ctx.clip();
}

/**
 * Applies perspective distortion to an image
 * @param ctx - Canvas 2D context
 * @param image - Source image
 * @param points - Four corner points for perspective transform
 * @param x - X position
 * @param y - Y position
 * @param width - Image width
 * @param height - Image height
 */
export function applyPerspectiveDistortion(
  ctx: SKRSContext2D,
  image: Image,
  points: Array<{ x: number; y: number }>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  if (points.length !== 4) {
    throw new Error('Perspective distortion requires exactly 4 points');
  }

  // Source corners (original image)
  const srcCorners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];

  // Destination corners (transformed)
  const dstCorners = points.map(p => ({ x: p.x - x, y: p.y - y }));

  // Calculate perspective transform matrix
  const matrix = calculatePerspectiveMatrix(srcCorners, dstCorners);

  ctx.save();
  ctx.transform(matrix[0], matrix[1], matrix[2], matrix[3], matrix[4], matrix[5]);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
}

/**
 * Calculates perspective transform matrix
 */
function calculatePerspectiveMatrix(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): [number, number, number, number, number, number] {
  // Simplified perspective transform using 2D affine approximation
  // For true perspective, we'd need a 3x3 matrix, but canvas 2D only supports 2x3
  
  // Use the first 3 points for affine transform approximation
  const x0 = src[0].x, y0 = src[0].y;
  const x1 = src[1].x, y1 = src[1].y;
  const x2 = src[2].x, y2 = src[2].y;
  
  const u0 = dst[0].x, v0 = dst[0].y;
  const u1 = dst[1].x, v1 = dst[1].y;
  const u2 = dst[2].x, v2 = dst[2].y;

  // Solve for affine transform coefficients
  const denom = (x0 - x1) * (y0 - y2) - (x0 - x2) * (y0 - y1);
  if (Math.abs(denom) < 0.0001) {
    // Fallback to identity
    return [1, 0, 0, 1, 0, 0];
  }

  const a = ((u0 - u1) * (y0 - y2) - (u0 - u2) * (y0 - y1)) / denom;
  const b = ((u0 - u1) * (x0 - x2) - (u0 - u2) * (x0 - x1)) / denom;
  const c = u0 - a * x0 - b * y0;
  const d = ((v0 - v1) * (y0 - y2) - (v0 - v2) * (y0 - y1)) / denom;
  const e = ((v0 - v1) * (x0 - x2) - (v0 - v2) * (x0 - x1)) / denom;
  const f = v0 - d * x0 - e * y0;

  return [a, b, d, e, c, f];
}

/**
 * Applies bulge distortion to an image
 * @param ctx - Canvas 2D context
 * @param image - Source image
 * @param centerX - Center X of bulge
 * @param centerY - Center Y of bulge
 * @param radius - Radius of effect
 * @param intensity - Bulge intensity (-1 to 1, positive = bulge, negative = pinch)
 * @param x - X position
 * @param y - Y position
 * @param width - Image width
 * @param height - Image height
 */
export function applyBulgeDistortion(
  ctx: SKRSContext2D,
  image: Image,
  centerX: number,
  centerY: number,
  radius: number,
  intensity: number,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Create temporary canvas for distortion
  const tempCanvas = createCanvas(width, height);
  const tempCtx = getCanvasContext(tempCanvas);

  tempCtx.drawImage(image, 0, 0, width, height);
  const imageData = tempCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const newPixels = new Uint8ClampedArray(pixels.length);

  const cx = centerX - x;
  const cy = centerY - y;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const dx = px - cx;
      const dy = py - cy;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < radius) {
        const r = distance / radius;
        const amount = intensity * (1 - r * r);
        const angle = Math.atan2(dy, dx);
        const newDistance = distance * (1 + amount);
        const newX = Math.round(cx + Math.cos(angle) * newDistance);
        const newY = Math.round(cy + Math.sin(angle) * newDistance);

        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
          const srcIdx = (py * width + px) * 4;
          const dstIdx = (newY * width + newX) * 4;
          newPixels[dstIdx] = pixels[srcIdx];
          newPixels[dstIdx + 1] = pixels[srcIdx + 1];
          newPixels[dstIdx + 2] = pixels[srcIdx + 2];
          newPixels[dstIdx + 3] = pixels[srcIdx + 3];
        }
      } else {
        const idx = (py * width + px) * 4;
        newPixels[idx] = pixels[idx];
        newPixels[idx + 1] = pixels[idx + 1];
        newPixels[idx + 2] = pixels[idx + 2];
        newPixels[idx + 3] = pixels[idx + 3];
      }
    }
  }

  tempCtx.putImageData(new ImageData(newPixels, width, height), 0, 0);
  ctx.drawImage(tempCanvas, x, y);
}

/**
 * Applies mesh warp to an image
 * @param ctx - Canvas 2D context
 * @param image - Source image
 * @param gridX - Number of grid divisions X
 * @param gridY - Number of grid divisions Y
 * @param controlPoints - Control point grid [y][x]
 * @param x - X position
 * @param y - Y position
 * @param width - Image width
 * @param height - Image height
 */
export function applyMeshWarp(
  ctx: SKRSContext2D,
  image: Image,
  gridX: number,
  gridY: number,
  controlPoints: Array<Array<{ x: number; y: number }>>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Create temporary canvas
  const tempCanvas = createCanvas(width, height);
  const tempCtx = getCanvasContext(tempCanvas);

  tempCtx.drawImage(image, 0, 0, width, height);
  const imageData = tempCtx.getImageData(0, 0, width, height);
  const pixels = imageData.data;
  const newPixels = new Uint8ClampedArray(pixels.length);

  const cellWidth = width / gridX;
  const cellHeight = height / gridY;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const gridCol = Math.floor(px / cellWidth);
      const gridRow = Math.floor(py / cellHeight);
      
      if (gridRow < gridY && gridCol < gridX && 
          gridRow < controlPoints.length && 
          gridCol < controlPoints[gridRow].length) {
        const cp = controlPoints[gridRow][gridCol];
        const localX = (px % cellWidth) / cellWidth;
        const localY = (py % cellHeight) / cellHeight;
        
        // Bilinear interpolation for smooth warping
        const newX = Math.round(cp.x + (px - cp.x) * localX);
        const newY = Math.round(cp.y + (py - cp.y) * localY);
        
        if (newX >= 0 && newX < width && newY >= 0 && newY < height) {
          const srcIdx = (py * width + px) * 4;
          const dstIdx = (newY * width + newX) * 4;
          newPixels[dstIdx] = pixels[srcIdx];
          newPixels[dstIdx + 1] = pixels[srcIdx + 1];
          newPixels[dstIdx + 2] = pixels[srcIdx + 2];
          newPixels[dstIdx + 3] = pixels[srcIdx + 3];
        }
      } else {
        const idx = (py * width + px) * 4;
        newPixels[idx] = pixels[idx];
        newPixels[idx + 1] = pixels[idx + 1];
        newPixels[idx + 2] = pixels[idx + 2];
        newPixels[idx + 3] = pixels[idx + 3];
      }
    }
  }

  tempCtx.putImageData(new ImageData(newPixels, width, height), 0, 0);
  ctx.drawImage(tempCanvas, x, y);
}

