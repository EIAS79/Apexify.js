import type { PathCommand } from "../types";
import { ApexifyInputError } from "../runtime/errors";
import { assertWithinLimit } from "../runtime/limits";
import { assertFiniteNumber, assertRecord } from "../runtime/validation";

function finite(value: unknown, name: string): asserts value is number {
  assertFiniteNumber(value, name);
}

function positive(value: unknown, name: string, allowZero = false): asserts value is number {
  assertFiniteNumber(value, name, { min: 0, exclusiveMin: !allowZero });
}

function validateRadiusObject(
  value: unknown,
  name: string
): asserts value is { tl?: number; tr?: number; br?: number; bl?: number } {
  assertRecord(value, name);
  for (const key of ["tl", "tr", "br", "bl"] as const) {
    if (value[key] !== undefined) positive(value[key], `${name}.${key}`, true);
  }
}

/**
 * Runtime-validates every public PathCommand before any native Path2D call.
 * Numeric inputs must be finite; radii are non-negative; star/polygon cardinality is bounded.
 */
export function validatePathCommand(command: unknown, name = "path.command"): asserts command is PathCommand {
  assertRecord(command, name);
  if (typeof command.type !== "string") throw new ApexifyInputError(`${name}.type must be a string.`);

  switch (command.type) {
    case "moveTo":
    case "lineTo":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      return;
    case "arc":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      positive(command.radius, `${name}.radius`, true);
      finite(command.startAngle, `${name}.startAngle`);
      finite(command.endAngle, `${name}.endAngle`);
      if (command.counterclockwise !== undefined && typeof command.counterclockwise !== "boolean") {
        throw new ApexifyInputError(`${name}.counterclockwise must be boolean.`);
      }
      return;
    case "arcTo":
      finite(command.x1, `${name}.x1`);
      finite(command.y1, `${name}.y1`);
      finite(command.x2, `${name}.x2`);
      finite(command.y2, `${name}.y2`);
      positive(command.radius, `${name}.radius`, true);
      return;
    case "quadraticCurveTo":
      finite(command.cpx, `${name}.cpx`);
      finite(command.cpy, `${name}.cpy`);
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      return;
    case "bezierCurveTo":
      finite(command.cp1x, `${name}.cp1x`);
      finite(command.cp1y, `${name}.cp1y`);
      finite(command.cp2x, `${name}.cp2x`);
      finite(command.cp2y, `${name}.cp2y`);
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      return;
    case "rect":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      finite(command.width, `${name}.width`);
      finite(command.height, `${name}.height`);
      return;
    case "ellipse":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      positive(command.radiusX, `${name}.radiusX`, true);
      positive(command.radiusY, `${name}.radiusY`, true);
      if (command.rotation !== undefined) finite(command.rotation, `${name}.rotation`);
      if (command.startAngle !== undefined) finite(command.startAngle, `${name}.startAngle`);
      if (command.endAngle !== undefined) finite(command.endAngle, `${name}.endAngle`);
      if (command.counterclockwise !== undefined && typeof command.counterclockwise !== "boolean") {
        throw new ApexifyInputError(`${name}.counterclockwise must be boolean.`);
      }
      return;
    case "closePath":
      return;
    case "circle":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      positive(command.radius, `${name}.radius`, true);
      return;
    case "roundedRect":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      finite(command.width, `${name}.width`);
      finite(command.height, `${name}.height`);
      if (typeof command.radius === "number") positive(command.radius, `${name}.radius`, true);
      else validateRadiusObject(command.radius, `${name}.radius`);
      return;
    case "polygon": {
      if (!Array.isArray(command.points)) throw new ApexifyInputError(`${name}.points must be an array.`);
      assertWithinLimit("maxCollectionItems", command.points.length);
      for (let i = 0; i < command.points.length; i++) {
        assertRecord(command.points[i], `${name}.points[${i}]`);
        finite(command.points[i].x, `${name}.points[${i}].x`);
        finite(command.points[i].y, `${name}.points[${i}].y`);
      }
      return;
    }
    case "star":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      positive(command.outerRadius, `${name}.outerRadius`);
      positive(command.innerRadius, `${name}.innerRadius`);
      assertFiniteNumber(command.points, `${name}.points`, { min: 2, integer: true });
      assertWithinLimit("maxCollectionItems", command.points * 2);
      return;
    case "arrow":
      finite(command.x, `${name}.x`);
      finite(command.y, `${name}.y`);
      positive(command.length, `${name}.length`, true);
      finite(command.angle, `${name}.angle`);
      if (command.headLength !== undefined) positive(command.headLength, `${name}.headLength`, true);
      if (command.headAngle !== undefined) finite(command.headAngle, `${name}.headAngle`);
      return;
    default:
      throw new ApexifyInputError(`${name}.type is unsupported: ${String(command.type)}.`);
  }
}

export function validatePathCommands(commands: unknown, name = "path.commands"): asserts commands is PathCommand[] {
  if (!Array.isArray(commands)) throw new ApexifyInputError(`${name} must be an array.`);
  assertWithinLimit("maxCollectionItems", commands.length);
  for (let i = 0; i < commands.length; i++) validatePathCommand(commands[i], `${name}[${i}]`);
}
