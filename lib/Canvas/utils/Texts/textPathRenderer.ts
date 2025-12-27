import { SKRSContext2D } from '@napi-rs/canvas';

/**
 * Renders text along a path
 * @param ctx - Canvas 2D context
 * @param text - Text to render
 * @param pathConfig - Path configuration
 * @param offset - Distance from path
 */
export function renderTextOnPath(
  ctx: SKRSContext2D,
  text: string,
  pathConfig: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
    offset?: number;
  },
  offset: number = 0
): void {
  const path = createPath(ctx, pathConfig);
  const pathLength = getPathLength(path, pathConfig);

  ctx.save();

  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;
  const charWidth = textWidth / text.length;

  let currentDistance = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const charDistance = currentDistance + charWidth / 2;

    if (charDistance <= pathLength) {
      const point = getPointOnPath(path, pathConfig, charDistance);
      const angle = getAngleOnPath(path, pathConfig, charDistance);

      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(angle);
      ctx.fillText(char, 0, offset);
      ctx.restore();
    }

    currentDistance += charWidth;
  }

  ctx.restore();
}

/**
 * Creates a path based on configuration
 */
function createPath(
  ctx: SKRSContext2D,
  pathConfig: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
  }
): Path2D {
  const path = new Path2D();

  switch (pathConfig.type) {
    case 'line':
      if (pathConfig.points.length >= 2) {
        path.moveTo(pathConfig.points[0].x, pathConfig.points[0].y);
        for (let i = 1; i < pathConfig.points.length; i++) {
          path.lineTo(pathConfig.points[i].x, pathConfig.points[i].y);
        }
      }
      break;

    case 'arc':
      if (pathConfig.points.length >= 3) {
        const center = pathConfig.points[0];
        const start = pathConfig.points[1];
        const end = pathConfig.points[2];
        const radius = Math.sqrt(
          Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2)
        );
        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
        path.arc(center.x, center.y, radius, startAngle, endAngle);
      }
      break;

    case 'bezier':
      if (pathConfig.points.length >= 4) {
        path.moveTo(pathConfig.points[0].x, pathConfig.points[0].y);
        for (let i = 1; i < pathConfig.points.length - 2; i += 3) {
          if (i + 2 < pathConfig.points.length) {
            path.bezierCurveTo(
              pathConfig.points[i].x, pathConfig.points[i].y,
              pathConfig.points[i + 1].x, pathConfig.points[i + 1].y,
              pathConfig.points[i + 2].x, pathConfig.points[i + 2].y
            );
          }
        }
      }
      break;

    case 'quadratic':
      if (pathConfig.points.length >= 3) {
        path.moveTo(pathConfig.points[0].x, pathConfig.points[0].y);
        for (let i = 1; i < pathConfig.points.length - 1; i += 2) {
          if (i + 1 < pathConfig.points.length) {
            path.quadraticCurveTo(
              pathConfig.points[i].x, pathConfig.points[i].y,
              pathConfig.points[i + 1].x, pathConfig.points[i + 1].y
            );
          }
        }
      }
      break;
  }

  return path;
}

/**
 * Gets approximate path length
 */
function getPathLength(
  path: Path2D,
  pathConfig: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
  }
): number {
  let length = 0;

  switch (pathConfig.type) {
    case 'line':
      for (let i = 0; i < pathConfig.points.length - 1; i++) {
        const dx = pathConfig.points[i + 1].x - pathConfig.points[i].x;
        const dy = pathConfig.points[i + 1].y - pathConfig.points[i].y;
        length += Math.sqrt(dx * dx + dy * dy);
      }
      break;

    case 'arc':
      if (pathConfig.points.length >= 3) {
        const center = pathConfig.points[0];
        const start = pathConfig.points[1];
        const end = pathConfig.points[2];
        const radius = Math.sqrt(
          Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2)
        );
        const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
        const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
        let angle = endAngle - startAngle;
        if (angle < 0) angle += Math.PI * 2;
        length = radius * angle;
      }
      break;

    case 'bezier':
    case 'quadratic':

      const samples = 100;
      let prevPoint = pathConfig.points[0];
      for (let i = 1; i <= samples; i++) {
        const t = i / samples;
const point = getPointOnPath(path, pathConfig, t * 1000);
        const dx = point.x - prevPoint.x;
        const dy = point.y - prevPoint.y;
        length += Math.sqrt(dx * dx + dy * dy);
        prevPoint = point;
      }
      break;
  }

  return length;
}

/**
 * Gets a point on the path at a given distance
 */
function getPointOnPath(
  path: Path2D,
  pathConfig: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
  },
  distance: number
): { x: number; y: number } {
  const pathLength = getPathLength(path, pathConfig);
  const t = Math.min(1, distance / pathLength);

  switch (pathConfig.type) {
    case 'line':
      return getPointOnLine(pathConfig.points, t);

    case 'arc':
      return getPointOnArc(pathConfig.points, t);

    case 'bezier':
      return getPointOnBezier(pathConfig.points, t);

    case 'quadratic':
      return getPointOnQuadratic(pathConfig.points, t);

    default:
      return { x: 0, y: 0 };
  }
}

/**
 * Gets angle on path at a given distance
 */
function getAngleOnPath(
  path: Path2D,
  pathConfig: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
  },
  distance: number
): number {
  const pathLength = getPathLength(path, pathConfig);
  const t = Math.min(1, distance / pathLength);
  const epsilon = 0.01;
  const t2 = Math.min(1, (distance + epsilon) / pathLength);

  const p1 = getPointOnPath(path, pathConfig, distance);
  const p2 = getPointOnPath(path, pathConfig, distance + epsilon);

  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
}

function getPointOnLine(points: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 };

  const totalLength = points.reduce((sum, p, i) => {
    if (i === 0) return 0;
    const dx = p.x - points[i - 1].x;
    const dy = p.y - points[i - 1].y;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);

  let currentLength = 0;
  const targetLength = totalLength * t;

  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    const segmentLength = Math.sqrt(dx * dx + dy * dy);

    if (currentLength + segmentLength >= targetLength) {
      const segmentT = (targetLength - currentLength) / segmentLength;
      return {
        x: points[i - 1].x + dx * segmentT,
        y: points[i - 1].y + dy * segmentT
      };
    }

    currentLength += segmentLength;
  }

  return points[points.length - 1];
}

function getPointOnArc(points: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
  if (points.length < 3) return { x: 0, y: 0 };

  const center = points[0];
  const start = points[1];
  const end = points[2];
  const radius = Math.sqrt(
    Math.pow(start.x - center.x, 2) + Math.pow(start.y - center.y, 2)
  );
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  let angle = startAngle + (endAngle - startAngle) * t;

  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

function getPointOnBezier(points: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
  if (points.length < 4) return { x: 0, y: 0 };

  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];
  const p3 = points[3];

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

function getPointOnQuadratic(points: Array<{ x: number; y: number }>, t: number): { x: number; y: number } {
  if (points.length < 3) return { x: 0, y: 0 };

  const p0 = points[0];
  const p1 = points[1];
  const p2 = points[2];

  const mt = 1 - t;
  const mt2 = mt * mt;
  const t2 = t * t;

  return {
    x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
    y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
  };
}

