import { SKRSContext2D, loadImage } from '@napi-rs/canvas';
import type { PatternOptions } from '../types';
import path from 'path';

/** Width/height target for procedural patterns (no full {@link Canvas} required). */
export type PatternViewport = { width: number; height: number };

export type RenderPatternStackOptions = {
  /**
   * When true (used from `bgLayers`), unset `pattern.blendMode` keeps the layer's
   * `globalCompositeOperation`. When false/omitted (`patternBg` on createCanvas),
   * missing blend defaults to `'overlay'`.
   */
  stackedInLayer?: boolean;
};

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

    const cw = viewport.width;
    const ch = viewport.height;

    ctx.save();

    try {
      /** Multiply by incoming alpha so canvas `opacity` and nested saves compose correctly */
      const opacity = patternOptions.opacity !== undefined ? patternOptions.opacity : 0.3;
      ctx.globalAlpha = ctx.globalAlpha * opacity;

      const overlayDefault: GlobalCompositeOperation | undefined = stack?.stackedInLayer
        ? undefined
        : 'overlay';
      const composite = patternOptions.blendMode ?? overlayDefault;
      if (composite !== undefined) {
        ctx.globalCompositeOperation = composite;
      }

      if (patternOptions.rotation && patternOptions.rotation !== 0) {
        const centerX = cw / 2;
        const centerY = ch / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((patternOptions.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      if (patternOptions.offsetX || patternOptions.offsetY) {
        ctx.translate(patternOptions.offsetX || 0, patternOptions.offsetY || 0);
      }

      switch (patternOptions.type) {
        case 'grid':
          this.renderGridPattern(ctx, cw, ch, patternOptions);
          break;
        case 'dots':
          this.renderDotsPattern(ctx, cw, ch, patternOptions);
          break;
        case 'diagonal':
          this.renderDiagonalPattern(ctx, cw, ch, patternOptions);
          break;
        case 'stripes':
          this.renderStripesPattern(ctx, cw, ch, patternOptions);
          break;
        case 'waves':
          this.renderWavesPattern(ctx, cw, ch, patternOptions);
          break;
        case 'crosses':
          this.renderCrossesPattern(ctx, cw, ch, patternOptions);
          break;
        case 'hexagons':
          this.renderHexagonsPattern(ctx, cw, ch, patternOptions);
          break;
        case 'checkerboard':
          this.renderCheckerboardPattern(ctx, cw, ch, patternOptions);
          break;
        case 'diamonds':
          this.renderDiamondsPattern(ctx, cw, ch, patternOptions);
          break;
        case 'triangles':
          this.renderTrianglesPattern(ctx, cw, ch, patternOptions);
          break;
        case 'stars':
          this.renderStarsPattern(ctx, cw, ch, patternOptions);
          break;
        case 'polka':
          this.renderPolkaPattern(ctx, cw, ch, patternOptions);
          break;
        case 'custom':
          await this.renderCustomPattern(ctx, cw, ch, patternOptions);
          break;
        default:
          console.warn(`Unknown pattern type: ${patternOptions.type}`);
      }
    } finally {
      ctx.restore();
    }
  }

  private static renderGridPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const secondaryColor = options.secondaryColor || 'transparent';

    for (let x = 0; x <= cw; x += size) {
      for (let y = 0; y <= ch; y += size) {
        const isEven = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isEven ? color : secondaryColor;
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  private static renderDiamondsPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';

    ctx.fillStyle = color;

    for (let x = 0; x <= cw + size; x += size + spacing) {
      for (let y = 0; y <= ch + size; y += size + spacing) {
        this.drawStar(ctx, x, y, size / 4);
      }
    }
  }

  private static renderPolkaPattern(ctx: SKRSContext2D, cw: number, ch: number, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
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
      let imagePath = options.customPatternImage;
      if (!/^https?:\/\//.test(imagePath)) {
        imagePath = path.isAbsolute(imagePath) ? imagePath : path.join(process.cwd(), imagePath);
      }

      const image = await loadImage(imagePath);
      const scale = options.scale || 1;
      const repeat = options.repeat || 'repeat';

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
      console.warn(`Failed to load custom pattern image: ${options.customPatternImage}`, error);
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
