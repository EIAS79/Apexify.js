import { ApexifyInputError } from "../../runtime/errors";

export function finiteNumber(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new ApexifyInputError(`${label} must be finite.`);
  return value;
}

export function positiveNumber(value: number, label: string): number {
  finiteNumber(value, label);
  if (value <= 0) throw new ApexifyInputError(`${label} must be greater than zero.`);
  return value;
}

export function nonNegativeNumber(value: number, label: string): number {
  finiteNumber(value, label);
  if (value < 0) throw new ApexifyInputError(`${label} must be non-negative.`);
  return value;
}

export function evenDimension(value: number): number {
  const integer = Math.max(2, Math.round(value));
  return integer % 2 === 0 ? integer : integer - 1;
}

export function buildScaleFilter(options: { width?: number; height?: number; fit?: "contain" | "cover" | "stretch" }): string | undefined {
  const { width, height, fit = "contain" } = options;
  if (width === undefined && height === undefined) return undefined;
  if (width !== undefined) positiveNumber(width, "video width");
  if (height !== undefined) positiveNumber(height, "video height");
  const w = width === undefined ? -2 : evenDimension(width);
  const h = height === undefined ? -2 : evenDimension(height);
  if (fit === "stretch") return `scale=${w}:${h}`;
  if (width === undefined || height === undefined) return `scale=${w}:${h}`;
  if (fit === "cover") return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`;
}

export function buildAtempoChain(factor: number): string {
  positiveNumber(factor, "audio tempo");
  let remaining = factor;
  const parts: string[] = [];
  while (remaining > 2 + 1e-9) { parts.push("atempo=2"); remaining /= 2; }
  while (remaining < 0.5 - 1e-9) { parts.push("atempo=0.5"); remaining /= 0.5; }
  if (Math.abs(remaining - 1) > 1e-9) parts.push(`atempo=${Number(remaining.toFixed(8))}`);
  return parts.length ? parts.join(",") : "anull";
}

export function buildGridLayout(count: number, cols: number, rows: number, cellWidth: number, cellHeight: number, gap = 0): string {
  if (!Number.isInteger(count) || count < 1) throw new ApexifyInputError("grid input count must be a positive integer.");
  if (!Number.isInteger(cols) || cols < 1 || !Number.isInteger(rows) || rows < 1 || cols * rows < count) {
    throw new ApexifyInputError("grid rows × columns must be at least the input count.");
  }
  positiveNumber(cellWidth, "grid cellWidth");
  positiveNumber(cellHeight, "grid cellHeight");
  nonNegativeNumber(gap, "grid gap");
  const layout: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layout.push(`${col * (cellWidth + gap)}_${row * (cellHeight + gap)}`);
  }
  return layout.join("|");
}

export function watermarkPosition(position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center", marginX: number, marginY: number): string {
  nonNegativeNumber(marginX, "watermark marginX");
  nonNegativeNumber(marginY, "watermark marginY");
  switch (position) {
    case "top-left": return `${marginX}:${marginY}`;
    case "top-right": return `W-w-${marginX}:${marginY}`;
    case "bottom-left": return `${marginX}:H-h-${marginY}`;
    case "center": return "(W-w)/2:(H-h)/2";
    default: return `W-w-${marginX}:H-h-${marginY}`;
  }
}
