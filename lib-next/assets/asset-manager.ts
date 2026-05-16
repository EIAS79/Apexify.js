/**
 * Registers named images, fonts, and color palettes; resolves **`$name`** and **`$palette.key`** strings.
 */
export class AssetManager {
  private readonly images = new Map<string, string | Buffer>();
  private readonly fonts = new Map<string, string>();
  private readonly palettes = new Map<string, Record<string, string>>();

  loadImage(id: string, source: string | Buffer): this {
    this.images.set(id, source);
    return this;
  }

  loadFont(id: string, fontPath: string): this {
    this.fonts.set(id, fontPath);
    return this;
  }

  loadPalette(name: string, colors: Record<string, string>): this {
    this.palettes.set(name, { ...colors });
    return this;
  }

  /** Replace an existing registration. */
  unregisterImage(id: string): this {
    this.images.delete(id);
    return this;
  }

  unregisterFont(id: string): this {
    this.fonts.delete(id);
    return this;
  }

  unregisterPalette(name: string): this {
    this.palettes.delete(name);
    return this;
  }

  clear(): this {
    this.images.clear();
    this.fonts.clear();
    this.palettes.clear();
    return this;
  }

  /**
   * Resolves **`logo`**, **`dark.primary`**, etc. (no leading **`$`**).
   * Palette paths use dot notation; top-level names check images then fonts.
   */
  resolve(refPath: string): string | Buffer {
    const i = refPath.indexOf(".");
    if (i > 0) {
      const root = refPath.slice(0, i);
      const key = refPath.slice(i + 1);
      const pal = this.palettes.get(root);
      if (pal && key in pal) return pal[key]!;
    }
    const img = this.images.get(refPath);
    if (img !== undefined) return img;
    const font = this.fonts.get(refPath);
    if (font !== undefined) return font;
    throw new Error(`AssetManager: unknown reference "${refPath}"`);
  }
}
