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

    let maskImage: Image;
    if (Buffer.isBuffer(maskSource)) {
      maskImage = await loadImage(maskSource);
    } else if (maskSource.startsWith('http')) {
      maskImage = await loadImage(maskSource);
    } else {
      const maskPath = path.join(process.cwd(), maskSource);
      maskImage = await loadImage(fs.readFileSync(maskPath));
    }

    const maskCanvas = createCanvas(width, height);
    const maskCtx = getCanvasContext(maskCanvas);

    maskCtx.drawImage(maskImage, 0, 0, width, height);

    const maskData = maskCtx.getImageData(0, 0, width, height);
    const maskPixels = maskData.data;

    const sourceCanvas = createCanvas(width, height);
    const sourceCtx = getCanvasContext(sourceCanvas);
    sourceCtx.drawImage(image, 0, 0, width, height);
    const sourceData = sourceCtx.getImageData(0, 0, width, height);
    const sourcePixels = sourceData.data;

    for (let i = 0; i < sourcePixels.length; i += 4) {
      const maskR = maskPixels[i];
      const maskG = maskPixels[i + 1];
      const maskB = maskPixels[i + 2];
      const maskA = maskPixels[i + 3];

      let alpha = maskA / 255;

      if (mode === 'luminance') {

        const luminance = (maskR * 0.299 + maskG * 0.587 + maskB * 0.114) / 255;
        alpha = luminance;
      } else if (mode === 'inverse') {

        alpha = 1 - (maskA / 255);
      }

      sourcePixels[i + 3] = Math.round(sourcePixels[i + 3] * alpha);
    }

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

  // Create a temporary canvas for the source image
  const tempCanvas = createCanvas(width, height);
  const tempCtx = getCanvasContext(tempCanvas);
  tempCtx.drawImage(image, 0, 0, width, height);

  // Get image data
  const sourceData = tempCtx.getImageData(0, 0, width, height);
  const sourcePixels = sourceData.data;

  // Calculate bounding box of destination points
  const minX = Math.min(points[0].x, points[1].x, points[2].x, points[3].x);
  const maxX = Math.max(points[0].x, points[1].x, points[2].x, points[3].x);
  const minY = Math.min(points[0].y, points[1].y, points[2].y, points[3].y);
  const maxY = Math.max(points[0].y, points[1].y, points[2].y, points[3].y);

  const destWidth = Math.ceil(maxX - minX);
  const destHeight = Math.ceil(maxY - minY);

  // Create destination canvas
  const destCanvas = createCanvas(destWidth, destHeight);
  const destCtx = getCanvasContext(destCanvas);
  const destData = destCtx.createImageData(destWidth, destHeight);
  const destPixels = destData.data;

  // Calculate inverse perspective transform matrix (from destination to source)
  const srcCorners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];

  const dstCorners = points.map(p => ({ x: p.x - minX, y: p.y - minY }));

  // Calculate homography matrix (perspective transform)
  const H = calculateHomographyMatrix(srcCorners, dstCorners);
  const Hinv = invertHomographyMatrix(H);

  // Warp pixels
  for (let dy = 0; dy < destHeight; dy++) {
    for (let dx = 0; dx < destWidth; dx++) {
      // Transform destination pixel to source coordinates
      const denom = Hinv[6] * dx + Hinv[7] * dy + Hinv[8];
      if (Math.abs(denom) < 0.0001) continue;

      const sx = (Hinv[0] * dx + Hinv[1] * dy + Hinv[2]) / denom;
      const sy = (Hinv[3] * dx + Hinv[4] * dy + Hinv[5]) / denom;

      // Bilinear interpolation
      const x1 = Math.floor(sx);
      const y1 = Math.floor(sy);
      const x2 = x1 + 1;
      const y2 = y1 + 1;

      if (x1 >= 0 && x2 < width && y1 >= 0 && y2 < height) {
        const fx = sx - x1;
        const fy = sy - y1;

        const getPixel = (px: number, py: number) => {
          const idx = (py * width + px) * 4;
          return [
            sourcePixels[idx],
            sourcePixels[idx + 1],
            sourcePixels[idx + 2],
            sourcePixels[idx + 3]
          ];
        };

        const p11 = getPixel(x1, y1);
        const p21 = getPixel(x2, y1);
        const p12 = getPixel(x1, y2);
        const p22 = getPixel(x2, y2);

        const interpolate = (a: number, b: number, c: number, d: number, fx: number, fy: number) => {
          return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
        };

        const destIdx = (dy * destWidth + dx) * 4;
        destPixels[destIdx] = Math.round(interpolate(p11[0], p21[0], p12[0], p22[0], fx, fy));
        destPixels[destIdx + 1] = Math.round(interpolate(p11[1], p21[1], p12[1], p22[1], fx, fy));
        destPixels[destIdx + 2] = Math.round(interpolate(p11[2], p21[2], p12[2], p22[2], fx, fy));
        destPixels[destIdx + 3] = Math.round(interpolate(p11[3], p21[3], p12[3], p22[3], fx, fy));
      }
    }
  }

  destCtx.putImageData(destData, 0, 0);
  ctx.drawImage(destCanvas, minX, minY);
}

/**
 * Calculates 3x3 homography matrix for perspective transform
 */
function calculateHomographyMatrix(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): number[] {
  // Build system of equations: Ah = 0
  const A: number[][] = [];
  
  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, -u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, -v]);
  }

  // Solve using SVD (simplified - find null space)
  // For 8 equations with 9 unknowns, we can set h[8] = 1 and solve
  // Or use a simpler approach: solve the 8x8 system
  
  // Extract the 8x8 matrix (excluding last column for h[8]=1 normalization)
  const M: number[][] = [];
  const b: number[] = [];
  
  for (let i = 0; i < 8; i++) {
    M.push(A[i].slice(0, 8));
    b.push(-A[i][8]);
  }

  // Solve M * h = b using Gaussian elimination
  const h = solveLinearSystem(M, b);
  
  // Normalize so h[8] = 1
  return [...h, 1];
}

/**
 * Solves a linear system using Gaussian elimination
 */
function solveLinearSystem(M: number[][], b: number[]): number[] {
  const n = M.length;
  const augmented = M.map((row, i) => [...row, b[i]]);

  // Forward elimination
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(augmented[k][i]) > Math.abs(augmented[maxRow][i])) {
        maxRow = k;
      }
    }
    [augmented[i], augmented[maxRow]] = [augmented[maxRow], augmented[i]];

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const factor = augmented[k][i] / augmented[i][i];
      for (let j = i; j < n + 1; j++) {
        augmented[k][j] -= factor * augmented[i][j];
      }
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = augmented[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= augmented[i][j] * x[j];
    }
    x[i] /= augmented[i][i];
  }

  return x;
}

/**
 * Inverts a 3x3 homography matrix
 */
function invertHomographyMatrix(H: number[]): number[] {
  const a = H[0], b = H[1], c = H[2];
  const d = H[3], e = H[4], f = H[5];
  const g = H[6], h = H[7], i = H[8];

  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  
  if (Math.abs(det) < 0.0001) {
    // Return identity if singular
    return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  }

  const invDet = 1 / det;
  
  return [
    (e * i - f * h) * invDet,
    (c * h - b * i) * invDet,
    (b * f - c * e) * invDet,
    (f * g - d * i) * invDet,
    (a * i - c * g) * invDet,
    (c * d - a * f) * invDet,
    (d * h - e * g) * invDet,
    (b * g - a * h) * invDet,
    (a * e - b * d) * invDet
  ];
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

  const newImageData = tempCtx.createImageData(width, height);
  newImageData.data.set(newPixels);
  tempCtx.putImageData(newImageData, 0, 0);
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

  const newImageData = tempCtx.createImageData(width, height);
  newImageData.data.set(newPixels);
  tempCtx.putImageData(newImageData, 0, 0);
  ctx.drawImage(tempCanvas, x, y);
}

