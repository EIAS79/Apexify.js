import { SKRSContext2D } from '@napi-rs/canvas';
import { ShapeType, ShapeProperties, gradient } from '../types';
import { createGradientFill } from '../Image/imageProperties';

/**
 * Draws a shape on the canvas context
 * @param ctx Canvas 2D context
 * @param shapeType Type of shape to draw
 * @param x X position
 * @param y Y position
 * @param width Width of the shape
 * @param height Height of the shape
 * @param shapeProps Shape properties including fill, color, gradient
 */
export function drawShape(
  ctx: SKRSContext2D,
  shapeType: ShapeType,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  ctx.save();
  
  // Set up fill style
  if (shapeProps.gradient) {
    const gradient = createGradientFill(ctx, shapeProps.gradient, { x, y, w: width, h: height });
    ctx.fillStyle = gradient as any;
  } else {
    ctx.fillStyle = shapeProps.color || '#000000';
  }

  // Draw the shape based on type
  switch (shapeType) {
    case 'rectangle':
      drawRectangle(ctx, x, y, width, height, shapeProps);
      break;
    case 'square':
      const size = Math.min(width, height);
      drawRectangle(ctx, x, y, size, size, shapeProps);
      break;
    case 'circle':
      drawCircle(ctx, x, y, width, height, shapeProps);
      break;
    case 'triangle':
      drawTriangle(ctx, x, y, width, height, shapeProps);
      break;
    case 'trapezium':
      drawTrapezium(ctx, x, y, width, height, shapeProps);
      break;
    case 'star':
      drawStar(ctx, x, y, width, height, shapeProps);
      break;
    case 'heart':
      drawHeart(ctx, x, y, width, height, shapeProps);
      break;
    case 'polygon':
      drawPolygon(ctx, x, y, width, height, shapeProps);
      break;
    default:
      throw new Error(`Unknown shape type: ${shapeType}`);
  }

  ctx.restore();
}

/**
 * Creates a path for a shape (used for shadows and strokes)
 * @param ctx Canvas 2D context
 * @param shapeType Type of shape
 * @param x X position
 * @param y Y position
 * @param width Width of the shape
 * @param height Height of the shape
 * @param shapeProps Shape properties
 */
export function createShapePath(
  ctx: SKRSContext2D,
  shapeType: ShapeType,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  switch (shapeType) {
    case 'rectangle':
      createRectanglePath(ctx, x, y, width, height);
      break;
    case 'square':
      const size = Math.min(width, height);
      createRectanglePath(ctx, x, y, size, size);
      break;
    case 'circle':
      createCirclePath(ctx, x, y, width, height, shapeProps);
      break;
    case 'triangle':
      createTrianglePath(ctx, x, y, width, height);
      break;
    case 'trapezium':
      createTrapeziumPath(ctx, x, y, width, height);
      break;
    case 'star':
      createStarPath(ctx, x, y, width, height, shapeProps);
      break;
    case 'heart':
      createHeartPath(ctx, x, y, width, height);
      break;
    case 'polygon':
      createPolygonPath(ctx, x, y, width, height, shapeProps);
      break;
    default:
      throw new Error(`Unknown shape type: ${shapeType}`);
  }
}

/**
 * Draws a rectangle
 */
function drawRectangle(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates rectangle path
 */
function createRectanglePath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  ctx.beginPath();
  ctx.rect(x, y, width, height);
}

/**
 * Draws a circle
 */
function drawCircle(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = shapeProps.radius || Math.min(width, height) / 2;
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates circle path
 */
function createCirclePath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = shapeProps.radius || Math.min(width, height) / 2;
  
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
}

/**
 * Draws a triangle (pointing up)
 */
function drawTriangle(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const topY = y;
  const bottomY = y + height;
  const leftX = x;
  const rightX = x + width;
  
  ctx.beginPath();
  ctx.moveTo(centerX, topY);      // Top point
  ctx.lineTo(rightX, bottomY);    // Bottom right
  ctx.lineTo(leftX, bottomY);     // Bottom left
  ctx.closePath();
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates triangle path
 */
function createTrianglePath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const centerX = x + width / 2;
  const topY = y;
  const bottomY = y + height;
  const leftX = x;
  const rightX = x + width;
  
  ctx.beginPath();
  ctx.moveTo(centerX, topY);      // Top point
  ctx.lineTo(rightX, bottomY);    // Bottom right
  ctx.lineTo(leftX, bottomY);     // Bottom left
  ctx.closePath();
}

/**
 * Draws a trapezium (isosceles trapezoid)
 */
function drawTrapezium(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const topWidth = width * 0.6;  // Top is 60% of bottom width
  const topOffset = (width - topWidth) / 2;
  
  ctx.beginPath();
  ctx.moveTo(x + topOffset, y);                    // Top left
  ctx.lineTo(x + topOffset + topWidth, y);         // Top right
  ctx.lineTo(x + width, y + height);               // Bottom right
  ctx.lineTo(x, y + height);                       // Bottom left
  ctx.closePath();
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates trapezium path
 */
function createTrapeziumPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const topWidth = width * 0.6;  // Top is 60% of bottom width
  const topOffset = (width - topWidth) / 2;
  
  ctx.beginPath();
  ctx.moveTo(x + topOffset, y);                    // Top left
  ctx.lineTo(x + topOffset + topWidth, y);         // Top right
  ctx.lineTo(x + width, y + height);               // Bottom right
  ctx.lineTo(x, y + height);                       // Bottom left
  ctx.closePath();
}

/**
 * Draws a star
 */
function drawStar(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const outerRadius = shapeProps.outerRadius || Math.min(width, height) / 2;
  const innerRadius = shapeProps.innerRadius || outerRadius * 0.4;
  const points = 5; // 5-pointed star
  
  ctx.beginPath();
  
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const pointX = centerX + Math.cos(angle - Math.PI / 2) * radius;
    const pointY = centerY + Math.sin(angle - Math.PI / 2) * radius;
    
    if (i === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  
  ctx.closePath();
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates star path
 */
function createStarPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const outerRadius = shapeProps.outerRadius || Math.min(width, height) / 2;
  const innerRadius = shapeProps.innerRadius || outerRadius * 0.4;
  const points = 5; // 5-pointed star
  
  ctx.beginPath();
  
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const pointX = centerX + Math.cos(angle - Math.PI / 2) * radius;
    const pointY = centerY + Math.sin(angle - Math.PI / 2) * radius;
    
    if (i === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  
  ctx.closePath();
}

/**
 * Draws a heart shape with improved bezier curves
 */
function drawHeart(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  ctx.beginPath();

  ctx.moveTo(x + width / 2, y + height * 0.9);

  ctx.bezierCurveTo(
    x + (width * 35) / 100, y + (height * 60) / 100,
    x + (width * 10) / 100, y + (height * 55) / 100,
    x + (width * 10) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 10) / 100, y + (height * 10) / 100,
    x + (width * 50) / 100, y + (height * 5) / 100,
    x + (width * 50) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 50) / 100, y + (height * 5) / 100,
    x + (width * 90) / 100, y + (height * 10) / 100,
    x + (width * 90) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 90) / 100, y + (height * 55) / 100,
    x + (width * 65) / 100, y + (height * 60) / 100,
    x + width / 2, y + height * 0.9
  );

  ctx.closePath();
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates heart path with improved bezier curves
 */
function createHeartPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  ctx.beginPath();

  ctx.moveTo(x + width / 2, y + height * 0.9);

  ctx.bezierCurveTo(
    x + (width * 35) / 100, y + (height * 60) / 100,
    x + (width * 10) / 100, y + (height * 55) / 100,
    x + (width * 10) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 10) / 100, y + (height * 10) / 100,
    x + (width * 50) / 100, y + (height * 5) / 100,
    x + (width * 50) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 50) / 100, y + (height * 5) / 100,
    x + (width * 90) / 100, y + (height * 10) / 100,
    x + (width * 90) / 100, y + (height * 33.33) / 100
  );

  ctx.bezierCurveTo(
    x + (width * 90) / 100, y + (height * 55) / 100,
    x + (width * 65) / 100, y + (height * 60) / 100,
    x + width / 2, y + height * 0.9
  );

  ctx.closePath();
}

/**
 * Draws a polygon
 */
function drawPolygon(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.min(width, height) / 2;
  const sides = shapeProps.sides || 6; // Default to hexagon
  
  ctx.beginPath();
  
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides;
    const pointX = centerX + Math.cos(angle - Math.PI / 2) * radius;
    const pointY = centerY + Math.sin(angle - Math.PI / 2) * radius;
    
    if (i === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  
  ctx.closePath();
  
  if (shapeProps.fill !== false) {
    ctx.fill();
  }
}

/**
 * Creates polygon path
 */
function createPolygonPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  shapeProps: ShapeProperties
): void {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.min(width, height) / 2;
  const sides = shapeProps.sides || 6; // Default to hexagon
  
  ctx.beginPath();
  
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides;
    const pointX = centerX + Math.cos(angle - Math.PI / 2) * radius;
    const pointY = centerY + Math.sin(angle - Math.PI / 2) * radius;
    
    if (i === 0) {
      ctx.moveTo(pointX, pointY);
    } else {
      ctx.lineTo(pointX, pointY);
    }
  }
  
  ctx.closePath();
}

/**
 * Checks if a source is a shape type
 */
export function isShapeSource(source: string | Buffer | ShapeType): source is ShapeType {
  const shapeTypes: ShapeType[] = ['rectangle', 'square', 'circle', 'triangle', 'trapezium', 'star', 'heart', 'polygon'];
  return typeof source === 'string' && shapeTypes.includes(source as ShapeType);
}
