import { createCanvas, SKRSContext2D } from '@napi-rs/canvas';
import type { PatternOptions, PatternViewport, RenderPatternStackOptions } from "../types";
import { validatePatternOptions } from "./canvas-validation";
import { loadImageCached } from "../image/image-properties";
import { emitDiagnostic } from "../runtime/diagnostics";
import { createGradientFill } from "../render/gradient-fill";

export type { PatternViewport, RenderPatternStackOptions };

/**
 * Enhanced pattern renderer supporting all pattern types
 */
export class EnhancedPatternRenderer {
  /**
   * Renders a pattern overlay on the canvas.
   */
  static async renderPattern(
    ctx: SKRSContext2D,
    viewport: PatternViewport,
    patternOptions: PatternOptions,
    stack?: RenderPatternStackOptions
  ): Promise<void> {
    if (!patternOptions || !patternOptions.type) return;
    validatePatternOptions(patternOptions, "pattern");

    const cw = viewport.width;
    const ch = viewport.height;
    const incomingComposite = ctx.globalCompositeOperation;
    const opacity = patternOptions.opacity ?? 1;
    const composite =
      patternOptions.blendMode ??
      (stack?.stackedInLayer ? incomingComposite : ("source-over" as GlobalCompositeOperation));

    const layer = createCanvas(cw, ch);
    const layerCtx = layer.getContext("2d") as SKRSContext2D;

    const usesGradient = patternOptions.gradient !== undefined;
    const geometryOptions: PatternOptions = usesGradient
      ? {
          ...patternOptions,
          color: "#ffffff",
          secondaryColor: "#ffffff",
          gradient: undefined,
          opacity: 1,
          blendMode: "source-over",
        }
      : {
          ...patternOptions,
          opacity: 1,
          blendMode: "source-over",
        };

    layerCtx.save();
    try {
      if (geometryOptions.offsetX !== undefined || geometryOptions.offsetY !== undefined) {
        layerCtx.translate(geometryOptions.offsetX ?? 0, geometryOptions.offsetY ?? 0);
      }

      const rotation = geometryOptions.rotation ?? 0;
      const scale =
        geometryOptions.type === "custom"
          ? 1
          : (geometryOptions.scale ?? 1);

      if (rotation !== 0 || scale !== 1) {
        const centerX = cw / 2;
        const centerY = ch / 2;
        layerCtx.translate(centerX, centerY);
        if (rotation !== 0) {
          layerCtx.rotate((rotation * Math.PI) / 180);
        }
        if (scale !== 1) {
          layerCtx.scale(scale, scale);
        }
        layerCtx.translate(-centerX, -centerY);
      }

      switch (geometryOptions.type) {
        case 'grid':
          this.renderGridPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'dots':
          this.renderDotsPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'diagonal':
          this.renderDiagonalPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'stripes':
          this.renderStripesPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'waves':
          this.renderWavesPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'crosses':
          this.renderCrossesPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'hexagons':
          this.renderHexagonsPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'checkerboard':
          this.renderCheckerboardPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'diamonds':
          this.renderDiamondsPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'triangles':
          this.renderTrianglesPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'stars':
          this.renderStarsPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'polka':
          this.renderPolkaPattern(layerCtx, cw, ch, geometryOptions);
          break;
        case 'custom':
          await this.renderCustomPattern(layerCtx, cw, ch, geometryOptions);
          break;
        default:
          emitDiagnostic({
            level: "warn",
            code: "PATTERN_TYPE_UNKNOWN",
            message: "Unknown pattern type ignored.",
            details: { type: String(geometryOptions.type) },
          });
      }
    } finally {
      layerCtx.restore();
    }

    if (patternOptions.gradient) {
      layerCtx.save();
      try {
        layerCtx.globalCompositeOperation = "source-in";
        layerCtx.fillStyle = createGradientFill(
          layerCtx,
          patternOptions.gradient,
          { x: 0, y: 0, w: cw, h: ch }
        );
        layerCtx.fillRect(0, 0, cw, ch);
      } finally {
        layerCtx.restore();
      }
    }

    ctx.save();
    try {
      ctx.globalAlpha = ctx.globalAlpha * opacity;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(layer, 0, 0);
    } finally {
      ctx.restore();
    }
  }

  private static renderGridPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';
    const secondary =
      options.secondaryColor !== undefined && options.secondaryColor !== 'transparent'
        ? options.secondaryColor
        : color;

    ctx.lineWidth = 1;

    const gridSpacing = size + spacing;

    ctx.strokeStyle = color;
    for (let x = 0; x <= cw; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ch);
      ctx.stroke();
    }

    ctx.strokeStyle = secondary;
    for (let y = 0; y <= ch; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cw, y);
      ctx.stroke();
    }
  }

  private static renderDotsPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.fillStyle = color;

    const dotSpacing = size + spacing;
    const dotRadius = size / 4;

    for (let x = spacing; x <= cw; x += dotSpacing) {
      for (let y = spacing; y <= ch; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private static renderDiagonalPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const diagonalSpacing = size + spacing;

    for (let i = -ch; i <= cw; i += diagonalSpacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + ch, ch);
      ctx.stroke();
    }
  }

  private static renderStripesPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';
    const secondary =
      options.secondaryColor !== undefined && options.secondaryColor !== 'transparent'
        ? options.secondaryColor
        : color;

    const stripeSpacing = size + spacing;

    for (let y = 0, row = 0; y <= ch; y += stripeSpacing, row++) {
      ctx.fillStyle = row % 2 === 0 ? color : secondary;
      ctx.fillRect(0, y, cw, size);
    }
  }

  private static renderWavesPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    for (let y = 0; y <= ch; y += size + spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);

      for (let x = 0; x <= cw; x += 10) {
        const waveY = y + Math.sin(x * 0.1) * (size / 4);
        ctx.lineTo(x, waveY);
      }

      ctx.stroke();
    }
  }

  private static renderCrossesPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';
    const secondary =
      options.secondaryColor !== undefined && options.secondaryColor !== 'transparent'
        ? options.secondaryColor
        : color;

    ctx.lineWidth = 2;

    for (let x = 0; x <= cw; x += size + spacing) {
      for (let y = 0; y <= ch; y += size + spacing) {
        const crossSize = size / 2;

        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x - crossSize, y);
        ctx.lineTo(x + crossSize, y);
        ctx.stroke();

        ctx.strokeStyle = secondary;
        ctx.beginPath();
        ctx.moveTo(x, y - crossSize);
        ctx.lineTo(x, y + crossSize);
        ctx.stroke();
      }
    }
  }

  private static renderHexagonsPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const hexWidth = size;
    const hexHeight = size * Math.sqrt(3) / 2;

    for (let x = 0; x <= cw + hexWidth; x += hexWidth + spacing) {
      for (let y = 0; y <= ch + hexHeight; y += hexHeight * 1.5 + spacing) {
        this.drawHexagon(ctx, x, y, hexWidth / 2);
      }
    }
  }

  private static renderCheckerboardPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const color = options.color || '#ffffff';
    const secondaryColor = options.secondaryColor ?? 'transparent';

    for (let x = 0; x <= cw; x += size) {
      for (let y = 0; y <= ch; y += size) {
        const isEven = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isEven ? color : secondaryColor;
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  private static renderDiamondsPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    for (let x = 0; x <= cw + size; x += size + spacing) {
      for (let y = 0; y <= ch + size; y += size + spacing) {
        this.drawDiamond(ctx, x, y, size / 2);
      }
    }
  }

  private static renderTrianglesPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    for (let x = 0; x <= cw + size; x += size + spacing) {
      for (let y = 0; y <= ch + size; y += size + spacing) {
        this.drawTriangle(ctx, x, y, size / 2);
      }
    }
  }

  private static renderStarsPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.fillStyle = color;

    for (let x = 0; x <= cw + size; x += size + spacing) {
      for (let y = 0; y <= ch + size; y += size + spacing) {
        this.drawStar(ctx, x, y, size / 4);
      }
    }
  }

  private static renderPolkaPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size ?? 20;
    const spacing = options.spacing ?? 10;
    const color = options.color || '#ffffff';

    ctx.fillStyle = color;

    for (let x = 0; x <= cw; x += size + spacing) {
      for (let y = 0; y <= ch; y += size + spacing) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private static async renderCustomPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): Promise<void> {
    if (!options.customPatternImage) return;

    try {
      const image = await loadImageCached(options.customPatternImage);
      const scale = options.scale ?? 1;
      const repeat = options.repeat ?? 'repeat';

      const scaledWidth = image.width * scale;
      const scaledHeight = image.height * scale;

      switch (repeat) {
        case 'repeat':
          for (let x = 0; x <= cw; x += scaledWidth) {
            for (let y = 0; y <= ch; y += scaledHeight) {
              ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
            }
          }
          break;
        case 'repeat-x':
          for (let x = 0; x <= cw; x += scaledWidth) {
            ctx.drawImage(image, x, 0, scaledWidth, scaledHeight);
          }
          break;
        case 'repeat-y':
          for (let y = 0; y <= ch; y += scaledHeight) {
            ctx.drawImage(image, 0, y, scaledWidth, scaledHeight);
          }
          break;
        case 'no-repeat':
          ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
          break;
      }
    } catch (error) {
      emitDiagnostic({
        level: "warn",
        code: "PATTERN_IMAGE_LOAD_FAILED",
        message: "Custom pattern image could not be loaded.",
        details: { reason: error instanceof Error ? error.message : "Unknown pattern image error" },
      });
    }
  }

  private static drawHexagon(ctx: SKRSContext2D, x: number, y: number, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }

  private static drawDiamond(ctx: SKRSContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size, y);
    ctx.closePath();
    ctx.stroke();
  }

  private static drawTriangle(ctx: SKRSContext2D, x: number, y: number, size: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.lineTo(x - size, y + size);
    ctx.closePath();
    ctx.stroke();
  }

  private static drawStar(ctx: SKRSContext2D, x: number, y: number, radius: number): void {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (i * 4 * Math.PI) / 5;
      const px = x + radius * Math.cos(angle);
      const py = y + radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }
}
