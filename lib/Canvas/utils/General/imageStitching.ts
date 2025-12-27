import { createCanvas, loadImage, SKRSContext2D, Image } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';
import { StitchOptions, CollageLayout } from '../types';
import { getCanvasContext } from '../errorUtils';

/**
 * Stitches multiple images together
 * @param images - Array of image sources
 * @param options - Stitching options
 * @returns Stitched image buffer
 */
export async function stitchImages(
  images: Array<string | Buffer>,
  options: StitchOptions = {}
): Promise<Buffer> {
  if (!images || images.length === 0) {
    throw new Error('stitchImages: images array is required');
  }

  const {
    direction = 'horizontal',
    overlap = 0,
    blend = false,
    spacing = 0
  } = options;

  const loadedImages: Image[] = [];
  for (const imgSource of images) {
    let img: Image;
    if (Buffer.isBuffer(imgSource)) {
      img = await loadImage(imgSource);
    } else if (imgSource.startsWith('http')) {
      img = await loadImage(imgSource);
    } else {
      const imgPath = path.join(process.cwd(), imgSource);
      img = await loadImage(fs.readFileSync(imgPath));
    }
    loadedImages.push(img);
  }

  if (loadedImages.length === 0) {
    throw new Error('stitchImages: No valid images loaded');
  }

  let canvasWidth = 0;
  let canvasHeight = 0;
  let maxWidth = 0;
  let maxHeight = 0;

  for (const img of loadedImages) {
    maxWidth = Math.max(maxWidth, img.width);
    maxHeight = Math.max(maxHeight, img.height);
  }

  if (direction === 'horizontal') {
    canvasWidth = loadedImages.reduce((sum, img) => sum + img.width, 0);
    canvasWidth -= overlap * (loadedImages.length - 1);
    canvasWidth += spacing * (loadedImages.length - 1);
    canvasHeight = maxHeight;
  } else if (direction === 'vertical') {
    canvasWidth = maxWidth;
    canvasHeight = loadedImages.reduce((sum, img) => sum + img.height, 0);
    canvasHeight -= overlap * (loadedImages.length - 1);
    canvasHeight += spacing * (loadedImages.length - 1);
  } else if (direction === 'grid') {
    const cols = Math.ceil(Math.sqrt(loadedImages.length));
    const rows = Math.ceil(loadedImages.length / cols);
    canvasWidth = maxWidth * cols + spacing * (cols - 1);
    canvasHeight = maxHeight * rows + spacing * (rows - 1);
  }

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = getCanvasContext(canvas);

  let currentX = 0;
  let currentY = 0;

  for (let i = 0; i < loadedImages.length; i++) {
    const img = loadedImages[i];

    if (direction === 'horizontal') {
      if (i > 0) {
        currentX -= overlap;
        currentX += spacing;
      }
      ctx.drawImage(img, currentX, 0, img.width, img.height);
      currentX += img.width;
    } else if (direction === 'vertical') {
      if (i > 0) {
        currentY -= overlap;
        currentY += spacing;
      }
      ctx.drawImage(img, 0, currentY, img.width, img.height);
      currentY += img.height;
    } else if (direction === 'grid') {
      const cols = Math.ceil(Math.sqrt(loadedImages.length));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * (maxWidth + spacing);
      const y = row * (maxHeight + spacing);
      ctx.drawImage(img, x, y, img.width, img.height);
    }

    if (blend && i > 0 && overlap > 0) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 0.5;
      if (direction === 'horizontal') {
        ctx.drawImage(img, currentX - img.width - spacing + overlap, 0, img.width, img.height);
      } else if (direction === 'vertical') {
        ctx.drawImage(img, 0, currentY - img.height - spacing + overlap, img.width, img.height);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return canvas.toBuffer('image/png');
}

/**
 * Creates an image collage
 * @param images - Array of image sources with optional dimensions
 * @param layout - Collage layout configuration
 * @returns Collage image buffer
 */
export async function createCollage(
  images: Array<{ source: string | Buffer; width?: number; height?: number }>,
  layout: CollageLayout
): Promise<Buffer> {
  if (!images || images.length === 0) {
    throw new Error('createCollage: images array is required');
  }

  const {
    type = 'grid',
    columns = 3,
    rows = 3,
    spacing = 10,
    background = '#ffffff',
    borderRadius = 0
  } = layout;

  const loadedImages: Array<{ image: Image; width: number; height: number }> = [];
  for (const imgConfig of images) {
    let img: Image;
    if (Buffer.isBuffer(imgConfig.source)) {
      img = await loadImage(imgConfig.source);
    } else if (typeof imgConfig.source === 'string' && imgConfig.source.startsWith('http')) {
      img = await loadImage(imgConfig.source);
    } else {
      const imgPath = path.join(process.cwd(), imgConfig.source as string);
      img = await loadImage(fs.readFileSync(imgPath));
    }

    loadedImages.push({
      image: img,
      width: imgConfig.width || img.width,
      height: imgConfig.height || img.height
    });
  }

  let canvasWidth = 0;
  let canvasHeight = 0;

  if (type === 'grid') {
    const cellWidth = Math.max(...loadedImages.map(img => img.width));
    const cellHeight = Math.max(...loadedImages.map(img => img.height));
    canvasWidth = cellWidth * columns + spacing * (columns - 1);
    canvasHeight = cellHeight * rows + spacing * (rows - 1);
  } else if (type === 'masonry') {

    const colWidths: number[] = new Array(columns).fill(0);
    const colHeights: number[] = new Array(columns).fill(0);

    for (let i = 0; i < loadedImages.length; i++) {
      const col = i % columns;
      colWidths[col] = Math.max(colWidths[col], loadedImages[i].width);
      colHeights[col] += loadedImages[i].height + (i >= columns ? spacing : 0);
    }

    canvasWidth = Math.max(...colWidths) * columns + spacing * (columns - 1);
    canvasHeight = Math.max(...colHeights);
  } else if (type === 'carousel') {

    canvasWidth = loadedImages.reduce((sum, img) => sum + img.width, 0) + spacing * (loadedImages.length - 1);
    canvasHeight = Math.max(...loadedImages.map(img => img.height));
  } else {

    canvasWidth = 800;
    canvasHeight = 600;
  }

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = getCanvasContext(canvas);

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  let currentX = 0;
  let currentY = 0;
  const colHeights: number[] = new Array(columns).fill(0);

  for (let i = 0; i < loadedImages.length; i++) {
    const imgData = loadedImages[i];

    if (type === 'grid') {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const cellWidth = Math.max(...loadedImages.map(img => img.width));
      const cellHeight = Math.max(...loadedImages.map(img => img.height));
      currentX = col * (cellWidth + spacing);
      currentY = row * (cellHeight + spacing);
    } else if (type === 'masonry') {
      const col = i % columns;
      currentX = col * (Math.max(...loadedImages.map(img => img.width)) + spacing);
      currentY = colHeights[col];
      colHeights[col] += imgData.height + spacing;
    } else if (type === 'carousel') {
      if (i > 0) currentX += spacing;
      currentY = (canvasHeight - imgData.height) / 2;
    }

    if (borderRadius > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(currentX, currentY, imgData.width, imgData.height, borderRadius);
      ctx.clip();
    }

    ctx.drawImage(imgData.image, currentX, currentY, imgData.width, imgData.height);

    if (borderRadius > 0) {
      ctx.restore();
    }
  }

  return canvas.toBuffer('image/png');
}

