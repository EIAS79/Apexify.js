import { SKRSContext2D, Image, loadImage } from '@napi-rs/canvas';
import path from 'path';
import fs from 'fs';

/**
 * Draws an arrow at the end of a line
 * @param ctx - Canvas 2D context
 * @param x - Arrow tip X
 * @param y - Arrow tip Y
 * @param angle - Arrow angle in radians
 * @param size - Arrow size
 * @param style - Arrow style
 * @param color - Arrow color
 */
export function drawArrow(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  angle: number,
  size: number,
  style: 'filled' | 'outline',
  color: string
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const arrowHeadLength = size;
  const arrowHeadWidth = size * 0.6;

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-arrowHeadLength, -arrowHeadWidth);
  ctx.lineTo(-arrowHeadLength * 0.7, 0);
  ctx.lineTo(-arrowHeadLength, arrowHeadWidth);
  ctx.closePath();

  if (style === 'filled') {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws a marker on a path
 * @param ctx - Canvas 2D context
 * @param x - Marker X position
 * @param y - Marker Y position
 * @param shape - Marker shape
 * @param size - Marker size
 * @param color - Marker color
 */
export function drawMarker(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  shape: 'circle' | 'square' | 'diamond' | 'arrow',
  size: number,
  color: string
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);

  switch (shape) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
      ctx.fill();
      break;

    case 'square':
      ctx.fillRect(-size / 2, -size / 2, size, size);
      break;

    case 'diamond':
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, 0);
      ctx.lineTo(0, size / 2);
      ctx.lineTo(-size / 2, 0);
      ctx.closePath();
      ctx.fill();
      break;

    case 'arrow':
      ctx.beginPath();
      ctx.moveTo(0, -size / 2);
      ctx.lineTo(size / 2, size / 2);
      ctx.lineTo(-size / 2, size / 2);
      ctx.closePath();
      ctx.fill();
      break;
  }

  ctx.restore();
}

/**
 * Creates a smooth path from points using Cardinal Spline (graph-like smoothness)
 * @param ctx - Canvas 2D context
 * @param points - Array of points
 * @param tension - Smoothness (0-1, default 0.5, lower = smoother)
 * @param closed - Whether path is closed
 */
export function createSmoothPath(
  ctx: SKRSContext2D,
  points: Array<{ x: number; y: number }>,
  tension: number = 0.5,
  closed: boolean = false
): void {
  if (points.length < 2) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

const segmentsPerCurve = 50;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : (closed ? points[points.length - 1] : points[i]);
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : (closed ? points[0] : p2);

const t = (1 - tension) * 0.5;

    const cp1x = p1.x + t * (p2.x - p0.x);
    const cp1y = p1.y + t * (p2.y - p0.y);
    const cp2x = p2.x - t * (p3.x - p1.x);
    const cp2y = p2.y - t * (p3.y - p1.y);

    for (let s = 0; s <= segmentsPerCurve; s++) {
      const t = s / segmentsPerCurve;
      const point = cubicBezier(p1, { x: cp1x, y: cp1y }, { x: cp2x, y: cp2y }, p2, t);

      if (s === 0 && i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
  }

  if (closed) {
    ctx.closePath();
  }
}

/**
 * Cubic Bezier interpolation helper
 */
function cubicBezier(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
  };
}

/**
 * Creates a Catmull-Rom spline path (ultra-smooth, passes through all points - best for graphs)
 * @param ctx - Canvas 2D context
 * @param points - Array of points
 * @param tension - Tension (0-1, default 0.5, lower = tighter curves)
 * @param closed - Whether path is closed
 */
export function createCatmullRomPath(
  ctx: SKRSContext2D,
  points: Array<{ x: number; y: number }>,
  tension: number = 0.5,
  closed: boolean = false
): void {
  if (points.length < 2) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  if (points.length === 2) {
    ctx.lineTo(points[1].x, points[1].y);
    return;
  }

  const segments = closed ? points.length : points.length - 1;
const segmentsPerCurve = 60;

  for (let i = 0; i < segments; i++) {
    const p0 = closed && i === 0 ? points[points.length - 1] : (i > 0 ? points[i - 1] : points[i]);
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const p3 = closed && i === segments - 1 ? points[0] : (i < points.length - 2 ? points[i + 2] : p2);

    for (let s = 0; s <= segmentsPerCurve; s++) {
      const t = s / segmentsPerCurve;
      const point = catmullRom(p0, p1, p2, p3, t, tension);

      if (s === 0 && i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
  }

  if (closed) {
    ctx.closePath();
  }
}

/**
 * Catmull-Rom spline interpolation (corrected formula)
 * This creates curves that pass through all control points
 */
function catmullRom(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
  tension: number
): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;

  const s = (1 - tension) * 0.5;

  const x = (2 * p1.x) +
    s * ((-p0.x + p2.x) * t +
         (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
         (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

  const y = (2 * p1.y) +
    s * ((-p0.y + p2.y) * t +
         (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
         (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

  return { x: x * 0.5, y: y * 0.5 };
}

/**
 * Applies line pattern
 * @param ctx - Canvas 2D context
 * @param pattern - Pattern configuration
 */
export function applyLinePattern(
  ctx: SKRSContext2D,
  pattern: {
    type: 'dots' | 'dashes' | 'custom';
    segments?: number[];
    offset?: number;
  }
): void {
  switch (pattern.type) {
    case 'dots':
      ctx.setLineDash([2, 4]);
      break;

    case 'dashes':
      ctx.setLineDash([10, 5]);
      break;

    case 'custom':
      if (pattern.segments && pattern.segments.length > 0) {
        ctx.setLineDash(pattern.segments);
      }
      break;
  }

  if (pattern.offset !== undefined) {
    ctx.lineDashOffset = pattern.offset;
  }
}

/**
 * Applies texture to line
 * @param ctx - Canvas 2D context
 * @param textureSource - Texture image source
 * @param lineWidth - Line width
 * @param lineLength - Approximate line length
 */
export async function applyLineTexture(
  ctx: SKRSContext2D,
  textureSource: string | Buffer,
  lineWidth: number,
  lineLength: number
): Promise<void> {
  try {
    let textureImage: Image;
    if (Buffer.isBuffer(textureSource)) {
      textureImage = await loadImage(textureSource);
    } else if (textureSource.startsWith('http')) {
      textureImage = await loadImage(textureSource);
    } else {
      const texturePath = path.join(process.cwd(), textureSource);
      textureImage = await loadImage(fs.readFileSync(texturePath));
    }

    const pattern = ctx.createPattern(textureImage, 'repeat');
    if (pattern) {
      ctx.strokeStyle = pattern;
    }
  } catch (error) {
    console.error('Error applying line texture:', error);

  }
}

/**
 * Gets points along a path for marker placement
 * @param points - Path points
 * @param position - Position along path (0-1)
 */
export function getPointOnLinePath(
  points: Array<{ x: number; y: number }>,
  position: number
): { x: number; y: number } {
  if (points.length < 2) return points[0] || { x: 0, y: 0 };

  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  const targetLength = totalLength * Math.max(0, Math.min(1, position));
  let currentLength = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    if (currentLength + segmentLengths[i] >= targetLength) {
      const segmentT = (targetLength - currentLength) / segmentLengths[i];
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      return {
        x: points[i].x + dx * segmentT,
        y: points[i].y + dy * segmentT
      };
    }
    currentLength += segmentLengths[i];
  }

  return points[points.length - 1];
}

