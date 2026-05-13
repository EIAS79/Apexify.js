import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error occurred";
}

export function getCanvasContext(canvas: Canvas): SKRSContext2D {
  const ctx = canvas.getContext("2d") as SKRSContext2D;
  if (!ctx) {
    throw new Error("Unable to get 2D rendering context");
  }
  return ctx;
}
