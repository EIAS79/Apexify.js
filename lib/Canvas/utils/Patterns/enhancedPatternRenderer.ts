import { SKRSContext2D, Canvas } from '@napi-rs/canvas';
import { PatternOptions, GradientConfig } from '../types';
import { createGradientFill } from '../Image/imageProperties';
import { loadImage } from '@napi-rs/canvas';
import path from 'path';

/**
 * Enhanced pattern renderer supporting all pattern types
 */
export class EnhancedPatternRenderer {
  /**
   * Renders a pattern overlay on the canvas
   * @param ctx - Canvas 2D context
   * @param canvas - Canvas instance
   * @param patternOptions - Pattern configuration
   */
  static async renderPattern(
    ctx: SKRSContext2D, 
    canvas: Canvas, 
    patternOptions: PatternOptions
  ): Promise<void> {
    if (!patternOptions || !patternOptions.type) return;

    ctx.save();

    try {
      // Set pattern opacity
      const opacity = patternOptions.opacity !== undefined ? patternOptions.opacity : 0.3;
      ctx.globalAlpha = opacity;

      // Set blend mode
      const blendMode = patternOptions.blendMode || 'overlay';
      ctx.globalCompositeOperation = blendMode;

      // Apply rotation if specified
      if (patternOptions.rotation && patternOptions.rotation !== 0) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((patternOptions.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      // Apply offset if specified
      if (patternOptions.offsetX || patternOptions.offsetY) {
        ctx.translate(patternOptions.offsetX || 0, patternOptions.offsetY || 0);
      }

      // Render based on pattern type
      switch (patternOptions.type) {
        case 'grid':
          this.renderGridPattern(ctx, canvas, patternOptions);
          break;
        case 'dots':
          this.renderDotsPattern(ctx, canvas, patternOptions);
          break;
        case 'diagonal':
          this.renderDiagonalPattern(ctx, canvas, patternOptions);
          break;
        case 'stripes':
          this.renderStripesPattern(ctx, canvas, patternOptions);
          break;
        case 'waves':
          this.renderWavesPattern(ctx, canvas, patternOptions);
          break;
        case 'crosses':
          this.renderCrossesPattern(ctx, canvas, patternOptions);
          break;
        case 'hexagons':
          this.renderHexagonsPattern(ctx, canvas, patternOptions);
          break;
        case 'checkerboard':
          this.renderCheckerboardPattern(ctx, canvas, patternOptions);
          break;
        case 'diamonds':
          this.renderDiamondsPattern(ctx, canvas, patternOptions);
          break;
        case 'triangles':
          this.renderTrianglesPattern(ctx, canvas, patternOptions);
          break;
        case 'stars':
          this.renderStarsPattern(ctx, canvas, patternOptions);
          break;
        case 'polka':
          this.renderPolkaPattern(ctx, canvas, patternOptions);
          break;
        case 'custom':
          await this.renderCustomPattern(ctx, canvas, patternOptions);
          break;
        default:
          console.warn(`Unknown pattern type: ${patternOptions.type}`);
      }
    } finally {
      ctx.restore();
    }
  }

  /**
   * Renders grid pattern
   */
  private static renderGridPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    
    // Calculate proper grid spacing
    const gridSpacing = size + spacing;
    
    // Vertical lines - start from 0 and go to canvas width
    for (let x = 0; x <= canvas.width; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    // Horizontal lines - start from 0 and go to canvas height
    for (let y = 0; y <= canvas.height; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  /**
   * Renders dots pattern
   */
  private static renderDotsPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.fillStyle = color;
    
    // Calculate proper dot spacing
    const dotSpacing = size + spacing;
    const dotRadius = size / 4;
    
    // Start from spacing offset to center first dot, then continue with full spacing
    for (let x = spacing; x <= canvas.width; x += dotSpacing) {
      for (let y = spacing; y <= canvas.height; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Renders diagonal pattern
   */
  private static renderDiagonalPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    const diagonalSpacing = size + spacing;
    
    // Diagonal lines going up-right
    for (let i = -canvas.height; i <= canvas.width; i += diagonalSpacing) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + canvas.height, canvas.height);
      ctx.stroke();
    }
  }

  /**
   * Renders stripes pattern
   */
  private static renderStripesPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.fillStyle = color;
    
    // Calculate proper stripe spacing
    const stripeSpacing = size + spacing;
    
    for (let y = 0; y <= canvas.height; y += stripeSpacing) {
      ctx.fillRect(0, y, canvas.width, size);
    }
  }

  /**
   * Renders waves pattern
   */
  private static renderWavesPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for (let y = 0; y <= canvas.height; y += size + spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      
      for (let x = 0; x <= canvas.width; x += 10) {
        const waveY = y + Math.sin(x * 0.1) * (size / 4);
        ctx.lineTo(x, waveY);
      }
      
      ctx.stroke();
    }
  }

  /**
   * Renders crosses pattern
   */
  private static renderCrossesPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for (let x = 0; x <= canvas.width; x += size + spacing) {
      for (let y = 0; y <= canvas.height; y += size + spacing) {
        const crossSize = size / 2;
        
        // Horizontal line
        ctx.beginPath();
        ctx.moveTo(x - crossSize, y);
        ctx.lineTo(x + crossSize, y);
        ctx.stroke();
        
        // Vertical line
        ctx.beginPath();
        ctx.moveTo(x, y - crossSize);
        ctx.lineTo(x, y + crossSize);
        ctx.stroke();
      }
    }
  }

  /**
   * Renders hexagons pattern
   */
  private static renderHexagonsPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    const hexWidth = size;
    const hexHeight = size * Math.sqrt(3) / 2;
    
    for (let x = 0; x <= canvas.width + hexWidth; x += hexWidth + spacing) {
      for (let y = 0; y <= canvas.height + hexHeight; y += hexHeight * 1.5 + spacing) {
        this.drawHexagon(ctx, x, y, hexWidth / 2);
      }
    }
  }

  /**
   * Renders checkerboard pattern
   */
  private static renderCheckerboardPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const color = options.color || '#ffffff';
    const secondaryColor = options.secondaryColor || 'transparent';
    
    for (let x = 0; x <= canvas.width; x += size) {
      for (let y = 0; y <= canvas.height; y += size) {
        const isEven = ((x / size) + (y / size)) % 2 === 0;
        ctx.fillStyle = isEven ? color : secondaryColor;
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  /**
   * Renders diamonds pattern
   */
  private static renderDiamondsPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for (let x = 0; x <= canvas.width + size; x += size + spacing) {
      for (let y = 0; y <= canvas.height + size; y += size + spacing) {
        this.drawDiamond(ctx, x, y, size / 2);
      }
    }
  }

  /**
   * Renders triangles pattern
   */
  private static renderTrianglesPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for (let x = 0; x <= canvas.width + size; x += size + spacing) {
      for (let y = 0; y <= canvas.height + size; y += size + spacing) {
        this.drawTriangle(ctx, x, y, size / 2);
      }
    }
  }

  /**
   * Renders stars pattern
   */
  private static renderStarsPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.fillStyle = color;
    
    for (let x = 0; x <= canvas.width + size; x += size + spacing) {
      for (let y = 0; y <= canvas.height + size; y += size + spacing) {
        this.drawStar(ctx, x, y, size / 4);
      }
    }
  }

  /**
   * Renders polka pattern (larger dots)
   */
  private static renderPolkaPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): void {
    const size = options.size || 20;
    const spacing = options.spacing || 10;
    const color = options.color || '#ffffff';
    
    ctx.fillStyle = color;
    
    for (let x = 0; x <= canvas.width; x += size + spacing) {
      for (let y = 0; y <= canvas.height; y += size + spacing) {
        ctx.beginPath();
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * Renders custom pattern from image
   */
  private static async renderCustomPattern(ctx: SKRSContext2D, canvas: Canvas, options: PatternOptions): Promise<void> {
    if (!options.customPatternImage) return;

    try {
      let imagePath = options.customPatternImage;
      if (!/^https?:\/\//i.test(imagePath)) {
        imagePath = path.join(process.cwd(), imagePath);
      }

      const image = await loadImage(imagePath);
      const scale = options.scale || 1;
      const repeat = options.repeat || 'repeat';

      const scaledWidth = image.width * scale;
      const scaledHeight = image.height * scale;

      switch (repeat) {
        case 'repeat':
          for (let x = 0; x <= canvas.width; x += scaledWidth) {
            for (let y = 0; y <= canvas.height; y += scaledHeight) {
              ctx.drawImage(image, x, y, scaledWidth, scaledHeight);
            }
          }
          break;
        case 'repeat-x':
          for (let x = 0; x <= canvas.width; x += scaledWidth) {
            ctx.drawImage(image, x, 0, scaledWidth, scaledHeight);
          }
          break;
        case 'repeat-y':
          for (let y = 0; y <= canvas.height; y += scaledHeight) {
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

  // === HELPER DRAWING FUNCTIONS ===

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
