export {
  renderApexifyWebPreview,
  type WebStudioPreviewResult,
  type WebVirtualAsset,
} from './studio-preview';

export type ApexifyWebCapabilities = Readonly<{
  runtime: '@apexify/web';
  directCanvas2D: boolean;
  offscreenCanvas: boolean;
  imageBitmap: boolean;
  fontFace: boolean;
  webAudio: boolean;
  webCodecs: boolean;
  devicePixelRatio: number;
}>;

export type ApexifyWebFontRegistration = {
  name: string;
  family: string;
  ok: boolean;
  error?: string;
};

export function apexifyWebFontFamily(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').trim();
  const normalized = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized || 'Apexify Web Font';
}

function assetDataUrl(asset: { mime: string; base64: string }): string {
  return `data:${asset.mime || 'application/octet-stream'};base64,${asset.base64}`;
}

export async function registerApexifyWebFonts(
  assets: readonly import('./studio-preview').WebVirtualAsset[],
): Promise<ApexifyWebFontRegistration[]> {
  if (
    typeof document === 'undefined' ||
    typeof FontFace === 'undefined' ||
    !('fonts' in document)
  ) {
    return [];
  }

  const results: ApexifyWebFontRegistration[] = [];
  for (const asset of assets) {
    const fontLike =
      asset.mime.startsWith('font/') ||
      /\.(?:ttf|otf|woff2?|woff)$/i.test(asset.name);
    if (!fontLike) continue;

    const family = apexifyWebFontFamily(asset.name);
    try {
      const existing = Array.from(document.fonts).some((face) => face.family === family);
      if (!existing) {
        const font = new FontFace(family, `url("${assetDataUrl(asset)}")`);
        await font.load();
        document.fonts.add(font);
      }
      results.push({ name: asset.name, family, ok: true });
    } catch (error) {
      results.push({
        name: asset.name,
        family,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

export function getApexifyWebCapabilities(): ApexifyWebCapabilities {
  return Object.freeze({
    runtime: '@apexify/web' as const,
    directCanvas2D:
      typeof document !== 'undefined' &&
      typeof document.createElement === 'function',
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    imageBitmap: typeof createImageBitmap === 'function',
    fontFace: typeof FontFace !== 'undefined',
    webAudio:
      typeof globalThis !== 'undefined' &&
      ('AudioContext' in globalThis || 'webkitAudioContext' in (globalThis as unknown as Record<string, unknown>)),
    webCodecs:
      typeof globalThis !== 'undefined' &&
      ('VideoFrame' in globalThis || 'VideoDecoder' in globalThis),
    devicePixelRatio:
      typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio)
        ? Math.max(1, window.devicePixelRatio)
        : 1,
  });
}

export class ApexifyWebRuntime {
  private disposed = false;

  capabilities(): ApexifyWebCapabilities {
    return getApexifyWebCapabilities();
  }

  async registerFonts(
    assets: readonly import('./studio-preview').WebVirtualAsset[],
  ): Promise<ApexifyWebFontRegistration[]> {
    this.assertActive();
    return registerApexifyWebFonts(assets);
  }

  async renderStudioSource(
    source: string,
    assets: readonly import('./studio-preview').WebVirtualAsset[] = [],
  ): Promise<import('./studio-preview').WebStudioPreviewResult> {
    this.assertActive();
    const { renderApexifyWebPreview } = await import('./studio-preview');
    return renderApexifyWebPreview(source, assets);
  }

  reset(): void {
    this.assertActive();
  }

  dispose(): void {
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error('@apexify/web runtime has been disposed.');
    }
  }
}

export function createApexifyWebRuntime(): ApexifyWebRuntime {
  return new ApexifyWebRuntime();
}
