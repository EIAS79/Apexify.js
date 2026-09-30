import { createCanvas, type Canvas, type SKRSContext2D } from "@napi-rs/canvas";
import type {
  ImageDistortionOptions,
  ImageEdgeMode,
  ImageInterpolationMode,
  ImageMeshWarpOptions,
  ImageWarpControlPoint,
  ImageWarpFalloff,
} from "../types";
import { getCanvasContext } from "../core/errors";
import { ApexifyInputError } from "../runtime/errors";
import { assertCanvasResourceLimits } from "../runtime/limits";

type Point = { x: number; y: number };
type Pixel = [number, number, number, number];

export interface DistortedRasterResult {
  canvas: Canvas;
  x: number;
  y: number;
  width: number;
  height: number;
}

type Bounds = { x: number; y: number; width: number; height: number };
type Mapper = (x: number, y: number) => Point | null;

const EPSILON = 1e-8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function integerBounds(minX: number, minY: number, maxX: number, maxY: number): Bounds {
  const x = Math.floor(minX);
  const y = Math.floor(minY);
  const right = Math.ceil(maxX);
  const bottom = Math.ceil(maxY);
  const width = right - x;
  const height = bottom - y;
  if (width <= 0 || height <= 0) {
    throw new ApexifyInputError("Image distortion produced an empty destination surface.");
  }
  assertCanvasResourceLimits(width, height);
  return { x, y, width, height };
}

function sourceBounds(originX: number, originY: number, width: number, height: number): Bounds {
  return integerBounds(originX, originY, originX + width, originY + height);
}

function mirrorIndex(index: number, size: number): number {
  if (size <= 1) return 0;
  const period = 2 * (size - 1);
  const wrapped = ((index % period) + period) % period;
  return wrapped <= size - 1 ? wrapped : period - wrapped;
}

function resolveIndex(index: number, size: number, edgeMode: ImageEdgeMode): number | null {
  if (index >= 0 && index < size) return index;
  if (edgeMode === "transparent") return null;
  if (edgeMode === "clamp") return clamp(index, 0, size - 1);
  if (edgeMode === "wrap") return ((index % size) + size) % size;
  return mirrorIndex(index, size);
}

function pixelAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  edgeMode: ImageEdgeMode
): Pixel {
  const px = resolveIndex(x, width, edgeMode);
  const py = resolveIndex(y, height, edgeMode);
  if (px === null || py === null) return [0, 0, 0, 0];
  const index = (py * width + px) * 4;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

function weightedPixel(samples: Array<{ pixel: Pixel; weight: number }>): Pixel {
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const sampleValue of samples) {
    if (sampleValue.weight === 0) continue;
    const a = sampleValue.pixel[3] / 255;
    alpha += a * sampleValue.weight;
    red += sampleValue.pixel[0] * a * sampleValue.weight;
    green += sampleValue.pixel[1] * a * sampleValue.weight;
    blue += sampleValue.pixel[2] * a * sampleValue.weight;
  }
  if (Math.abs(alpha) < EPSILON) return [0, 0, 0, 0];
  return [
    byte(red / alpha),
    byte(green / alpha),
    byte(blue / alpha),
    byte(alpha * 255),
  ];
}

function cubicWeight(distance: number): number {
  const a = -0.5;
  const x = Math.abs(distance);
  if (x <= 1) return (a + 2) * x ** 3 - (a + 3) * x ** 2 + 1;
  if (x < 2) return a * x ** 3 - 5 * a * x ** 2 + 8 * a * x - 4 * a;
  return 0;
}

function sample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  interpolation: ImageInterpolationMode,
  edgeMode: ImageEdgeMode
): Pixel {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0, 0, 0];

  if (interpolation === "nearest") {
    return pixelAt(data, width, height, Math.round(x), Math.round(y), edgeMode);
  }

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (interpolation === "bilinear") {
    const fx = x - x0;
    const fy = y - y0;
    return weightedPixel([
      { pixel: pixelAt(data, width, height, x0, y0, edgeMode), weight: (1 - fx) * (1 - fy) },
      { pixel: pixelAt(data, width, height, x0 + 1, y0, edgeMode), weight: fx * (1 - fy) },
      { pixel: pixelAt(data, width, height, x0, y0 + 1, edgeMode), weight: (1 - fx) * fy },
      { pixel: pixelAt(data, width, height, x0 + 1, y0 + 1, edgeMode), weight: fx * fy },
    ]);
  }

  const samples: Array<{ pixel: Pixel; weight: number }> = [];
  for (let py = y0 - 1; py <= y0 + 2; py += 1) {
    const wy = cubicWeight(y - py);
    for (let px = x0 - 1; px <= x0 + 2; px += 1) {
      const wx = cubicWeight(x - px);
      samples.push({
        pixel: pixelAt(data, width, height, px, py, edgeMode),
        weight: wx * wy,
      });
    }
  }
  return weightedPixel(samples);
}

function solveLinearSystem(matrix: number[][], rhs: number[]): number[] {
  const n = matrix.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let column = 0; column < n; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < EPSILON) {
      throw new ApexifyInputError("Perspective transform is singular or degenerate.");
    }
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let j = column; j <= n; j += 1) augmented[column][j] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      if (factor === 0) continue;
      for (let j = column; j <= n; j += 1) {
        augmented[row][j] -= factor * augmented[column][j];
      }
    }
  }
  return augmented.map((row) => row[n]);
}

function homography(source: Point[], destination: Point[]): number[] {
  const matrix: number[][] = [];
  const rhs: number[] = [];
  for (let index = 0; index < 4; index += 1) {
    const x = source[index].x;
    const y = source[index].y;
    const u = destination[index].x;
    const v = destination[index].y;
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    rhs.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    rhs.push(v);
  }
  return [...solveLinearSystem(matrix, rhs), 1];
}

function invert3x3(matrix: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const determinant =
    a * (e * i - f * h) -
    b * (d * i - f * g) +
    c * (d * h - e * g);
  if (Math.abs(determinant) < EPSILON) {
    throw new ApexifyInputError("Perspective transform is singular or degenerate.");
  }
  const k = 1 / determinant;
  return [
    (e * i - f * h) * k,
    (c * h - b * i) * k,
    (b * f - c * e) * k,
    (f * g - d * i) * k,
    (a * i - c * g) * k,
    (c * d - a * f) * k,
    (d * h - e * g) * k,
    (b * g - a * h) * k,
    (a * e - b * d) * k,
  ];
}

function perspectiveMapper(points: Point[], width: number, height: number): Mapper {
  if (width < 2 || height < 2) {
    throw new ApexifyInputError("Perspective distortion requires an image at least 2×2 pixels.");
  }
  const source = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ];
  const inverse = invert3x3(homography(source, points));
  return (x, y) => {
    const denominator = inverse[6] * x + inverse[7] * y + inverse[8];
    if (Math.abs(denominator) < EPSILON) return null;
    return {
      x: (inverse[0] * x + inverse[1] * y + inverse[2]) / denominator,
      y: (inverse[3] * x + inverse[4] * y + inverse[5]) / denominator,
    };
  };
}

function bilinearPoint(points: Point[], u: number, v: number): Point {
  const p00 = points[0];
  const p10 = points[1];
  const p11 = points[2];
  const p01 = points[3];
  const topX = p00.x + (p10.x - p00.x) * u;
  const topY = p00.y + (p10.y - p00.y) * u;
  const bottomX = p01.x + (p11.x - p01.x) * u;
  const bottomY = p01.y + (p11.y - p01.y) * u;
  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

function inverseBilinear(point: Point, points: Point[]): Point | null {
  const minX = Math.min(...points.map((item) => item.x));
  const maxX = Math.max(...points.map((item) => item.x));
  const minY = Math.min(...points.map((item) => item.y));
  const maxY = Math.max(...points.map((item) => item.y));
  let u = maxX === minX ? 0.5 : (point.x - minX) / (maxX - minX);
  let v = maxY === minY ? 0.5 : (point.y - minY) / (maxY - minY);

  const p00 = points[0];
  const p10 = points[1];
  const p11 = points[2];
  const p01 = points[3];

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const current = bilinearPoint(points, u, v);
    const errorX = current.x - point.x;
    const errorY = current.y - point.y;
    if (Math.abs(errorX) + Math.abs(errorY) < 1e-4) break;

    const du = {
      x: (p10.x - p00.x) * (1 - v) + (p11.x - p01.x) * v,
      y: (p10.y - p00.y) * (1 - v) + (p11.y - p01.y) * v,
    };
    const dv = {
      x: (p01.x - p00.x) * (1 - u) + (p11.x - p10.x) * u,
      y: (p01.y - p00.y) * (1 - u) + (p11.y - p10.y) * u,
    };
    const determinant = du.x * dv.y - du.y * dv.x;
    if (Math.abs(determinant) < EPSILON) return null;
    const deltaU = (errorX * dv.y - errorY * dv.x) / determinant;
    const deltaV = (du.x * errorY - du.y * errorX) / determinant;
    u -= deltaU;
    v -= deltaV;
  }

  if (u < -1e-3 || u > 1.001 || v < -1e-3 || v > 1.001) return null;
  return { x: clamp(u, 0, 1), y: clamp(v, 0, 1) };
}

function falloff(kind: ImageWarpFalloff, normalizedDistance: number): number {
  const t = clamp(normalizedDistance, 0, 1);
  if (kind === "linear") return 1 - t;
  if (kind === "gaussian") return Math.exp(-4 * t * t) * (1 - t);
  return 1 - (3 * t * t - 2 * t * t * t);
}

function displacementAt(
  point: Point,
  handles: ImageWarpControlPoint[],
  defaultRadius: number,
  intensity: number
): Point {
  let x = 0;
  let y = 0;
  for (const handle of handles) {
    const radius = handle.radius ?? defaultRadius;
    const dx = point.x - handle.from.x;
    const dy = point.y - handle.from.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= radius) continue;
    const weight =
      falloff(handle.falloff ?? "smooth", distance / radius) *
      (handle.strength ?? 1) *
      intensity;
    x += (handle.to.x - handle.from.x) * weight;
    y += (handle.to.y - handle.from.y) * weight;
  }
  return { x, y };
}

function handleWarpMapper(
  handles: ImageWarpControlPoint[],
  originX: number,
  originY: number,
  width: number,
  height: number,
  intensity: number
): Mapper {
  const defaultRadius = Math.max(width, height) * 0.25;
  return (x, y) => {
    let source = { x, y };
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const displacement = displacementAt(source, handles, defaultRadius, intensity);
      source = { x: x - displacement.x, y: y - displacement.y };
    }
    return { x: source.x - originX, y: source.y - originY };
  };
}

function radialMapper(
  type: "bulge" | "pinch",
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number,
  width: number,
  height: number
): Mapper {
  const centerX = distortion.centerX ?? originX + width / 2;
  const centerY = distortion.centerY ?? originY + height / 2;
  const radius = distortion.radius ?? Math.min(width, height) / 2;
  const strength = clamp(distortion.intensity ?? 0.5, -4, 4);
  const exponent = Math.exp((type === "bulge" ? 1 : -1) * strength);

  return (x, y) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPSILON || distance >= radius) {
      return { x: x - originX, y: y - originY };
    }
    const t = distance / radius;
    const sourceDistance = radius * t ** exponent;
    const scale = sourceDistance / distance;
    return {
      x: centerX + dx * scale - originX,
      y: centerY + dy * scale - originY,
    };
  };
}

function twirlMapper(
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number,
  width: number,
  height: number
): Mapper {
  const centerX = distortion.centerX ?? originX + width / 2;
  const centerY = distortion.centerY ?? originY + height / 2;
  const radius = distortion.radius ?? Math.min(width, height) / 2;
  const angle =
    ((distortion.angle ?? (distortion.intensity ?? 0.5) * 180) * Math.PI) / 180;
  return (x, y) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const distance = Math.hypot(dx, dy);
    if (distance <= EPSILON || distance >= radius) {
      return { x: x - originX, y: y - originY };
    }
    const t = distance / radius;
    const localAngle = Math.atan2(dy, dx) - angle * (1 - t) * (1 - t);
    return {
      x: centerX + Math.cos(localAngle) * distance - originX,
      y: centerY + Math.sin(localAngle) * distance - originY,
    };
  };
}

function waveMapper(
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number,
  width: number,
  height: number
): Mapper {
  const multiplier = distortion.intensity ?? 1;
  const amplitudeX = (distortion.amplitudeX ?? 0) * multiplier;
  const amplitudeY = (distortion.amplitudeY ?? 0) * multiplier;
  const wavelengthX = distortion.wavelengthX ?? Math.max(1, width);
  const wavelengthY = distortion.wavelengthY ?? Math.max(1, height);
  const phaseX = ((distortion.phaseX ?? 0) * Math.PI) / 180;
  const phaseY = ((distortion.phaseY ?? 0) * Math.PI) / 180;

  return (x, y) => {
    const localX = x - originX;
    const localY = y - originY;
    return {
      x:
        localX -
        amplitudeX *
          Math.sin((2 * Math.PI * localY) / wavelengthY + phaseX),
      y:
        localY -
        amplitudeY *
          Math.sin((2 * Math.PI * localX) / wavelengthX + phaseY),
    };
  };
}

function distortionBounds(
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number,
  width: number,
  height: number
): Bounds {
  if (
    (distortion.type === "perspective" || distortion.type === "warp") &&
    distortion.points?.length === 4
  ) {
    return integerBounds(
      Math.min(...distortion.points.map((point) => point.x)),
      Math.min(...distortion.points.map((point) => point.y)),
      Math.max(...distortion.points.map((point) => point.x)),
      Math.max(...distortion.points.map((point) => point.y))
    );
  }

  if (distortion.type === "warp" && distortion.controlPoints?.length) {
    let minX = originX;
    let minY = originY;
    let maxX = originX + width;
    let maxY = originY + height;
    const defaultRadius = Math.max(width, height) * 0.25;
    for (const handle of distortion.controlPoints) {
      const radius = handle.radius ?? defaultRadius;
      minX = Math.min(minX, handle.to.x - radius);
      minY = Math.min(minY, handle.to.y - radius);
      maxX = Math.max(maxX, handle.to.x + radius);
      maxY = Math.max(maxY, handle.to.y + radius);
    }
    return integerBounds(minX, minY, maxX, maxY);
  }

  if (distortion.type === "wave") {
    const multiplier = Math.abs(distortion.intensity ?? 1);
    const expandX = Math.abs(distortion.amplitudeX ?? 0) * multiplier;
    const expandY = Math.abs(distortion.amplitudeY ?? 0) * multiplier;
    return integerBounds(
      originX - expandX,
      originY - expandY,
      originX + width + expandX,
      originY + height + expandY
    );
  }

  return sourceBounds(originX, originY, width, height);
}

function mapperFor(
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number,
  width: number,
  height: number
): Mapper {
  if (distortion.type === "perspective") {
    return perspectiveMapper(distortion.points!, width, height);
  }

  if (distortion.type === "warp") {
    if (distortion.points?.length === 4) {
      return (x, y) => {
        const uv = inverseBilinear({ x, y }, distortion.points!);
        return uv
          ? { x: uv.x * (width - 1), y: uv.y * (height - 1) }
          : null;
      };
    }
    return handleWarpMapper(
      distortion.controlPoints!,
      originX,
      originY,
      width,
      height,
      distortion.intensity ?? 1
    );
  }

  if (distortion.type === "bulge" || distortion.type === "pinch") {
    return radialMapper(distortion.type, distortion, originX, originY, width, height);
  }

  if (distortion.type === "twirl") {
    return twirlMapper(distortion, originX, originY, width, height);
  }

  return waveMapper(distortion, originX, originY, width, height);
}

/**
 * Inverse-map a raster through an editor-style distortion.
 *
 * Inverse mapping writes every destination pixel once, avoiding the holes and
 * overwrite collisions produced by forward-pixel splatting.
 */
export function createDistortedRaster(
  sourceCtx: SKRSContext2D,
  width: number,
  height: number,
  distortion: ImageDistortionOptions,
  originX: number,
  originY: number
): DistortedRasterResult {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  assertCanvasResourceLimits(sourceWidth, sourceHeight);

  const source = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const bounds = distortionBounds(
    distortion,
    originX,
    originY,
    sourceWidth,
    sourceHeight
  );
  const mapper = mapperFor(
    distortion,
    originX,
    originY,
    sourceWidth,
    sourceHeight
  );
  const interpolation = distortion.interpolation ?? "bilinear";
  const edgeMode = distortion.edgeMode ?? "transparent";

  const outputCanvas = createCanvas(bounds.width, bounds.height);
  const outputCtx = getCanvasContext(outputCanvas);
  const output = outputCtx.createImageData(bounds.width, bounds.height);

  for (let py = 0; py < bounds.height; py += 1) {
    const globalY = bounds.y + py + 0.5;
    for (let px = 0; px < bounds.width; px += 1) {
      const globalX = bounds.x + px + 0.5;
      const mapped = mapper(globalX, globalY);
      if (!mapped) continue;
      const rgba = sample(
        source,
        sourceWidth,
        sourceHeight,
        mapped.x,
        mapped.y,
        interpolation,
        edgeMode
      );
      const index = (py * bounds.width + px) * 4;
      output.data[index] = rgba[0];
      output.data[index + 1] = rgba[1];
      output.data[index + 2] = rgba[2];
      output.data[index + 3] = rgba[3];
    }
  }

  outputCtx.putImageData(output, 0, 0);
  return {
    canvas: outputCanvas,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}


function normalizeMeshVertices(
  mesh: ImageMeshWarpOptions,
  width: number,
  height: number
): { gridX: number; gridY: number; vertices: Point[][] } {
  const points = mesh.controlPoints;
  if (!points?.length || !points[0]?.length) {
    throw new ApexifyInputError("meshWarp.controlPoints must define a non-empty mesh.");
  }
  const rows = points.length;
  const columns = points[0].length;
  for (let row = 1; row < rows; row += 1) {
    if (points[row].length !== columns) {
      throw new ApexifyInputError("meshWarp.controlPoints must be a rectangular grid.");
    }
  }

  const gridX = mesh.gridX ?? Math.max(1, columns - 1);
  const gridY = mesh.gridY ?? Math.max(1, rows - 1);

  if (rows === gridY + 1 && columns === gridX + 1) {
    return { gridX, gridY, vertices: points.map((row) => row.map((point) => ({ ...point }))) };
  }

  if (rows === gridY && columns === gridX) {
    const cellWidth = width / gridX;
    const cellHeight = height / gridY;
    const vertices: Point[][] = Array.from({ length: gridY + 1 }, (_, y) =>
      Array.from({ length: gridX + 1 }, (_, x) => ({ x: x * cellWidth, y: y * cellHeight }))
    );
    for (let y = 0; y < gridY; y += 1) {
      for (let x = 0; x < gridX; x += 1) vertices[y][x] = { ...points[y][x] };
    }
    return { gridX, gridY, vertices };
  }

  throw new ApexifyInputError(
    `meshWarp.controlPoints must be ${gridY + 1}×${gridX + 1} vertices (or legacy ${gridY}×${gridX} anchors).`
  );
}

function meshBounds(vertices: Point[][], originX: number, originY: number): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const row of vertices) {
    for (const point of row) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  return integerBounds(originX + minX, originY + minY, originX + maxX, originY + maxY);
}

/**
 * Inverse-map a raster through a destination mesh. Every destination pixel is
 * sampled once, interpolation/edgeMode are honored, and mesh bounds may expand.
 */
export function createMeshWarpedRaster(
  sourceCtx: SKRSContext2D,
  width: number,
  height: number,
  mesh: ImageMeshWarpOptions,
  originX: number,
  originY: number
): DistortedRasterResult {
  const sourceWidth = Math.max(1, Math.round(width));
  const sourceHeight = Math.max(1, Math.round(height));
  assertCanvasResourceLimits(sourceWidth, sourceHeight);

  const { gridX, gridY, vertices } = normalizeMeshVertices(mesh, sourceWidth, sourceHeight);
  const bounds = meshBounds(vertices, originX, originY);
  const source = sourceCtx.getImageData(0, 0, sourceWidth, sourceHeight).data;
  const outputCanvas = createCanvas(bounds.width, bounds.height);
  const outputCtx = getCanvasContext(outputCanvas);
  const output = outputCtx.createImageData(bounds.width, bounds.height);
  const interpolation = mesh.interpolation ?? "bilinear";
  const edgeMode = mesh.edgeMode ?? "transparent";
  const cellWidth = sourceWidth / gridX;
  const cellHeight = sourceHeight / gridY;

  for (let cellY = 0; cellY < gridY; cellY += 1) {
    for (let cellX = 0; cellX < gridX; cellX += 1) {
      const quad = [
        vertices[cellY][cellX],
        vertices[cellY][cellX + 1],
        vertices[cellY + 1][cellX + 1],
        vertices[cellY + 1][cellX],
      ];
      const minX = Math.floor(Math.min(...quad.map((p) => p.x)));
      const minY = Math.floor(Math.min(...quad.map((p) => p.y)));
      const maxX = Math.ceil(Math.max(...quad.map((p) => p.x)));
      const maxY = Math.ceil(Math.max(...quad.map((p) => p.y)));
      const sourceLeft = cellX * cellWidth;
      const sourceTop = cellY * cellHeight;
      const sourceRight = Math.min(sourceWidth - 1, (cellX + 1) * cellWidth - 1);
      const sourceBottom = Math.min(sourceHeight - 1, (cellY + 1) * cellHeight - 1);

      for (let localY = minY; localY < maxY; localY += 1) {
        for (let localX = minX; localX < maxX; localX += 1) {
          const uv = inverseBilinear({ x: localX + 0.5, y: localY + 0.5 }, quad);
          if (!uv) continue;
          const rgba = sample(
            source, sourceWidth, sourceHeight,
            sourceLeft + (sourceRight - sourceLeft) * uv.x,
            sourceTop + (sourceBottom - sourceTop) * uv.y,
            interpolation, edgeMode
          );
          const outputX = Math.floor(originX + localX - bounds.x);
          const outputY = Math.floor(originY + localY - bounds.y);
          if (outputX < 0 || outputY < 0 || outputX >= bounds.width || outputY >= bounds.height) continue;
          const index = (outputY * bounds.width + outputX) * 4;
          output.data[index] = rgba[0];
          output.data[index + 1] = rgba[1];
          output.data[index + 2] = rgba[2];
          output.data[index + 3] = rgba[3];
        }
      }
    }
  }

  outputCtx.putImageData(output, 0, 0);
  return { canvas: outputCanvas, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
}
