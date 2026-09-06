import { Path2D } from "@napi-rs/canvas";
import type { PathCommand } from "../types";
import { ApexifyConfigError } from "../runtime/errors";
import { validatePathCommands } from "../path/path-validation";
import { getPathConstructor } from "./path-utils";

export type { PathCommand };

function appendRoundedRectPath(
  path: Path2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number | { tl?: number; tr?: number; br?: number; bl?: number }
): void {
  const maxRadius = Math.max(0, Math.min(Math.abs(width) / 2, Math.abs(height) / 2));
  if (typeof radius === "number") {
    const r = Math.min(radius, maxRadius);
    path.moveTo(x + r, y);
    path.lineTo(x + width - r, y);
    path.quadraticCurveTo(x + width, y, x + width, y + r);
    path.lineTo(x + width, y + height - r);
    path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    path.lineTo(x + r, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - r);
    path.lineTo(x, y + r);
    path.quadraticCurveTo(x, y, x + r, y);
  } else {
    const tl = Math.min(radius.tl ?? 0, maxRadius);
    const tr = Math.min(radius.tr ?? 0, maxRadius);
    const br = Math.min(radius.br ?? 0, maxRadius);
    const bl = Math.min(radius.bl ?? 0, maxRadius);
    path.moveTo(x + tl, y);
    path.lineTo(x + width - tr, y);
    path.quadraticCurveTo(x + width, y, x + width, y + tr);
    path.lineTo(x + width, y + height - br);
    path.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    path.lineTo(x + bl, y + height);
    path.quadraticCurveTo(x, y + height, x, y + height - bl);
    path.lineTo(x, y + tl);
    path.quadraticCurveTo(x, y, x + tl, y);
  }
  path.closePath();
}

function appendStarPath(path: Path2D, x: number, y: number, outerRadius: number, innerRadius: number, points: number): void {
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) path.moveTo(px, py);
    else path.lineTo(px, py);
  }
  path.closePath();
}

function appendArrowPath(
  path: Path2D,
  x: number,
  y: number,
  length: number,
  angle: number,
  headLength?: number,
  headAngle?: number
): void {
  const headLen = headLength ?? length * 0.3;
  const headAng = ((headAngle ?? 45) * Math.PI) / 180;
  const rad = (angle * Math.PI) / 180;
  const endX = x + Math.cos(rad) * length;
  const endY = y + Math.sin(rad) * length;
  path.moveTo(x, y);
  path.lineTo(endX, endY);
  const leftX = endX - Math.cos(rad - headAng) * headLen;
  const leftY = endY - Math.sin(rad - headAng) * headLen;
  const rightX = endX - Math.cos(rad + headAng) * headLen;
  const rightY = endY - Math.sin(rad + headAng) * headLen;
  path.moveTo(endX, endY);
  path.lineTo(leftX, leftY);
  path.moveTo(endX, endY);
  path.lineTo(rightX, rightY);
}

/** Applies validated path commands to an existing Path2D instance. */
export function appendPathCommands(path: Path2D, commands: PathCommand[]): void {
  validatePathCommands(commands);
  for (const cmd of commands) {
    switch (cmd.type) {
      case "moveTo": path.moveTo(cmd.x, cmd.y); break;
      case "lineTo": path.lineTo(cmd.x, cmd.y); break;
      case "arc": path.arc(cmd.x, cmd.y, cmd.radius, cmd.startAngle, cmd.endAngle, cmd.counterclockwise ?? false); break;
      case "arcTo": path.arcTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.radius); break;
      case "quadraticCurveTo": path.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y); break;
      case "bezierCurveTo": path.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y); break;
      case "rect": path.rect(cmd.x, cmd.y, cmd.width, cmd.height); break;
      case "ellipse":
        path.ellipse(cmd.x, cmd.y, cmd.radiusX, cmd.radiusY, cmd.rotation ?? 0, cmd.startAngle ?? 0, cmd.endAngle ?? Math.PI * 2, cmd.counterclockwise ?? false);
        break;
      case "closePath": path.closePath(); break;
      case "circle": path.arc(cmd.x, cmd.y, cmd.radius, 0, Math.PI * 2); break;
      case "roundedRect": appendRoundedRectPath(path, cmd.x, cmd.y, cmd.width, cmd.height, cmd.radius); break;
      case "polygon":
        if (cmd.points.length > 0) {
          path.moveTo(cmd.points[0]!.x, cmd.points[0]!.y);
          for (let i = 1; i < cmd.points.length; i++) path.lineTo(cmd.points[i]!.x, cmd.points[i]!.y);
          path.closePath();
        }
        break;
      case "star": appendStarPath(path, cmd.x, cmd.y, cmd.outerRadius, cmd.innerRadius, cmd.points); break;
      case "arrow": appendArrowPath(path, cmd.x, cmd.y, cmd.length, cmd.angle, cmd.headLength, cmd.headAngle); break;
    }
  }
}

/** Builds a validated Path2D from a command list (shared by drawing and hit-testing). */
export function buildPath2DFromCommands(commands: PathCommand[]): Path2D {
  validatePathCommands(commands);
  const PathCtor = getPathConstructor();
  if (!PathCtor) throw new ApexifyConfigError("Path2D implementation is unavailable in this runtime.");
  const path = new PathCtor();
  appendPathCommands(path, commands);
  return path;
}
