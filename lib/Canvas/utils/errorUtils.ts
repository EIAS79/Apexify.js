import { createCanvas, SKRSContext2D, Canvas } from "@napi-rs/canvas";

/**
 * Extracts error message from unknown error type
 * @param error - Error object of unknown type
 * @returns Error message string
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error occurred';
}

/**
 * Gets canvas 2D rendering context with standardized error handling
 * @param canvas - Canvas object
 * @returns SKRSContext2D context
 * @throws Error if context cannot be obtained
 */
export function getCanvasContext(canvas: Canvas): SKRSContext2D {
  const ctx = canvas.getContext('2d') as SKRSContext2D;
  if (!ctx) {
    throw new Error('Unable to get 2D rendering context');
  }
  return ctx;
}

