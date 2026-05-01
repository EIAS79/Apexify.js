import { Path2D } from "@napi-rs/canvas";

/**
 * Returns the Path2D constructor from @napi-rs/canvas for use in Node.
 */
export function getPathConstructor(): typeof Path2D | null {
  return Path2D;
}
