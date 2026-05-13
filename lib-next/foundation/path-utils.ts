import { Path2D } from "@napi-rs/canvas";

/** Returns the Path2D constructor from `@napi-rs/canvas` (Node / native canvas). */
export function getPathConstructor(): typeof Path2D | null {
  return Path2D;
}
