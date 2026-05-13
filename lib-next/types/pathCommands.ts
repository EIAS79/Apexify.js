/**
 * Path command types for building Path2D objects (shared by Path2DCreator and hit testing).
 */
export type PathCommand =
  | { type: "moveTo"; x: number; y: number }
  | { type: "lineTo"; x: number; y: number }
  | {
      type: "arc";
      x: number;
      y: number;
      radius: number;
      startAngle: number;
      endAngle: number;
      counterclockwise?: boolean;
    }
  | { type: "arcTo"; x1: number; y1: number; x2: number; y2: number; radius: number }
  | { type: "quadraticCurveTo"; cpx: number; cpy: number; x: number; y: number }
  | {
      type: "bezierCurveTo";
      cp1x: number;
      cp1y: number;
      cp2x: number;
      cp2y: number;
      x: number;
      y: number;
    }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | {
      type: "ellipse";
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
      rotation?: number;
      startAngle?: number;
      endAngle?: number;
      counterclockwise?: boolean;
    }
  | { type: "closePath" }
  | { type: "circle"; x: number; y: number; radius: number }
  | {
      type: "roundedRect";
      x: number;
      y: number;
      width: number;
      height: number;
      radius: number | { tl?: number; tr?: number; br?: number; bl?: number };
    }
  | { type: "polygon"; points: Array<{ x: number; y: number }> }
  | { type: "star"; x: number; y: number; outerRadius: number; innerRadius: number; points: number }
  | {
      type: "arrow";
      x: number;
      y: number;
      length: number;
      angle: number;
      headLength?: number;
      headAngle?: number;
    };
