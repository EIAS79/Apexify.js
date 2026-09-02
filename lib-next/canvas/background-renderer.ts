import { emitDiagnostic } from "../runtime/diagnostics";
import { createCanvas, SKRSContext2D } from "@napi-rs/canvas";
import type { Image } from "@napi-rs/canvas";
import type { CanvasConfig, gradient } from "../types";
import { EnhancedPatternRenderer } from "./pattern-renderer";
import { loadImageCached } from "../image/image-properties";
import { createGradientFill } from "../render/gradient-fill";
import { ApexifyDecodeError, ApexifyError } from "../runtime/errors";

export type AlignMode =
  | "center" | "top" | "bottom" | "left" | "right"
  | "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type FitMode = "fill" | "contain" | "cover";

export async function drawBackgroundGradient(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
) {
  if (!canvas.gradientBg) return;
  const width = canvas.width ?? 500;
  const height = canvas.height ?? 500;
  const grad = buildCanvasGradient(ctx, { gradient: canvas.gradientBg, width, height });

  if ((canvas.blur ?? 0) > 0) ctx.filter = `blur(${canvas.blur}px)`;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  ctx.filter = "none";
}

export async function drawBackgroundColor(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const width = canvas.width ?? 500;
  const height = canvas.height ?? 500;

  if ((canvas.blur ?? 0) > 0) ctx.filter = `blur(${canvas.blur}px)`;
  if (canvas.colorBg !== "transparent") {
    ctx.fillStyle = canvas.colorBg ?? "#000";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.filter = "none";
}

/** Draw one custom background. Source resolution/decoding is delegated to the authoritative image pipeline. */
export async function customBackground(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const cfg = canvas.customBg;
  if (!cfg) return;

  try {
    const img = await loadImageCached(cfg.source);
    const width = canvas.width ?? img.width;
    const height = canvas.height ?? img.height;

    if ((canvas.blur ?? 0) > 0) ctx.filter = `blur(${canvas.blur}px)`;

    if (cfg.inherit) {
      ctx.drawImage(img, 0, 0);
    } else {
      drawImageFitted(ctx, img, width, height, cfg.fit ?? "fill", cfg.align ?? "center");
    }

    ctx.filter = "none";
  } catch (error) {
    ctx.filter = "none";
    if (error instanceof ApexifyError) throw error;
    throw new ApexifyDecodeError("customBackground: image source could not be rendered.", { cause: error });
  }
}

function alignInto(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  align: AlignMode
): { dx: number; dy: number } {
  const cx = (width - imageWidth) / 2;
  const cy = (height - imageHeight) / 2;
  switch (align) {
    case "top-left": return { dx: 0, dy: 0 };
    case "top": return { dx: cx, dy: 0 };
    case "top-right": return { dx: width - imageWidth, dy: 0 };
    case "left": return { dx: 0, dy: cy };
    case "center": return { dx: cx, dy: cy };
    case "right": return { dx: width - imageWidth, dy: cy };
    case "bottom-left": return { dx: 0, dy: height - imageHeight };
    case "bottom": return { dx: cx, dy: height - imageHeight };
    case "bottom-right": return { dx: width - imageWidth, dy: height - imageHeight };
    default: return { dx: cx, dy: cy };
  }
}

/** Draw `img` into the `[0..W]×[0..H]` rect using the same rules as `customBg` (non-inherit). */
export function drawImageFitted(
  ctx: SKRSContext2D,
  img: Image,
  width: number,
  height: number,
  fit: FitMode,
  align: AlignMode
): void {
  if (fit === "contain" || fit === "cover") {
    const scale = fit === "contain"
      ? Math.min(width / img.width, height / img.height)
      : Math.max(width / img.width, height / img.height);
    const drawWidth = img.width * scale;
    const drawHeight = img.height * scale;
    const { dx, dy } = alignInto(width, height, drawWidth, drawHeight, align);
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  } else {
    ctx.drawImage(img, 0, 0, width, height);
  }
}

export function buildPathbg(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  borderRadius: number | "circular" = 0,
  borderPosition: string = "all"
): void {
  ctx.beginPath();

  if (borderRadius === "circular") {
    const r = Math.min(width, height) / 2;
    ctx.arc(x + width / 2, y + height / 2, r, 0, 2 * Math.PI);
  } else if (typeof borderRadius === "number" && borderRadius > 0) {
    const br = Math.min(borderRadius, width / 2, height / 2);
    const selected = new Set(borderPosition.toLowerCase().split(",").map((s) => s.trim()));

    const roundTL = selected.has("all") || selected.has("top-left") || (selected.has("top") && selected.has("left"));
    const roundTR = selected.has("all") || selected.has("top-right") || (selected.has("top") && selected.has("right"));
    const roundBR = selected.has("all") || selected.has("bottom-right") || (selected.has("bottom") && selected.has("right"));
    const roundBL = selected.has("all") || selected.has("bottom-left") || (selected.has("bottom") && selected.has("left"));

    const tl = roundTL ? br : 0;
    const tr = roundTR ? br : 0;
    const brR = roundBR ? br : 0;
    const bl = roundBL ? br : 0;

    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + width - tr, y);
    if (tr) ctx.arcTo(x + width, y, x + width, y + tr, tr);
    ctx.lineTo(x + width, y + height - brR);
    if (brR) ctx.arcTo(x + width, y + height, x + width - brR, y + height, brR);
    ctx.lineTo(x + bl, y + height);
    if (bl) ctx.arcTo(x, y + height, x, y + height - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
  } else {
    ctx.rect(x, y, width, height);
  }

  ctx.closePath();
}

export function applyNoise(ctx: SKRSContext2D, width: number, height: number, intensity = 0.05) {
  const noiseCanvas = createCanvas(width, height);
  const nctx = noiseCanvas.getContext("2d");
  if (!nctx) return;
  const imageData = nctx.createImageData(width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = Math.round(255 * intensity);
  }
  nctx.putImageData(imageData, 0, 0);
  ctx.drawImage(noiseCanvas, 0, 0);
}

export async function drawPattern(
  ctx: SKRSContext2D,
  { source, repeat = "repeat", opacity = 1 }: { source: string; repeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat"; opacity?: number },
  width: number,
  height: number
) {
  const img = await loadImageCached(source);
  const pattern = ctx.createPattern(img, repeat);
  if (!pattern) throw new ApexifyDecodeError("Background pattern could not be created.");
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

export function applyCanvasZoom(
  ctx: SKRSContext2D,
  width: number,
  height: number,
  zoom?: { scale?: number; centerX?: number; centerY?: number }
) {
  if (!zoom) return;

  const scale = zoom.scale ?? 1;
  if (scale === 1) return;

  const cx = zoom.centerX ?? width / 2;
  const cy = zoom.centerY ?? height / 2;

  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);
}

/** Authoritative canvas background gradient adapter. */
export function buildCanvasGradient(
  ctx: SKRSContext2D,
  cfg: { gradient: gradient; width: number; height: number }
): CanvasGradient | CanvasPattern {
  return createGradientFill(ctx, cfg.gradient, { x: 0, y: 0, w: cfg.width, h: cfg.height });
}

/** Paint `bgLayers` deterministically in array order (bottom → top). */
export async function drawBackgroundLayers(
  ctx: SKRSContext2D,
  canvas: CanvasConfig
): Promise<void> {
  const layers = canvas.bgLayers;
  if (!layers?.length) return;

  const width = canvas.width ?? 500;
  const height = canvas.height ?? 500;

  for (const layer of layers) {
    ctx.save();
    ctx.globalCompositeOperation = layer.blendMode ?? ("source-over" as GlobalCompositeOperation);
    try {
      switch (layer.type) {
        case "color":
          ctx.globalAlpha = layer.opacity ?? 1;
          ctx.fillStyle = layer.value;
          ctx.fillRect(0, 0, width, height);
          break;
        case "gradient": {
          ctx.globalAlpha = layer.opacity ?? 1;
          const grad = buildCanvasGradient(ctx, { gradient: layer.value, width, height });
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, width, height);
          break;
        }
        case "image": {
          const img = await loadImageCached(layer.source);
          ctx.globalAlpha = layer.opacity ?? 1;
          drawImageFitted(ctx, img, width, height, layer.fit ?? "fill", layer.align ?? "center");
          break;
        }
        case "pattern":
          await drawPattern(ctx, {
            source: layer.source,
            repeat: layer.repeat ?? "repeat",
            opacity: layer.opacity ?? 1,
          }, width, height);
          break;
        case "presetPattern":
          ctx.globalAlpha = layer.opacity ?? 1;
          await EnhancedPatternRenderer.renderPattern(
            ctx,
            { width, height },
            layer.pattern,
            { stackedInLayer: true }
          );
          break;
        case "noise":
          applyNoise(ctx, width, height, layer.intensity ?? 0.08);
          break;
      }
    } catch (error) {
      if (error instanceof ApexifyError) {
        ctx.restore();
        throw error;
      }
      emitDiagnostic({
        level: "warn",
        code: "APEXIFY_BACKGROUND_RENDERER_WARN",
        message: "A background layer could not be rendered.",
        details: { type: layer.type, reason: error instanceof Error ? error.message : "Unknown background error" },
      });
    }
    ctx.restore();
  }
}
