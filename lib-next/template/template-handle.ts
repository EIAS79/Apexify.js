import type { SceneRenderInput, SceneRenderOptions } from "../types/scene";
import type {
  TemplateData,
  TemplateRenderOptions,
  TemplateOptions,
  TemplateSceneDefinition,
} from "../types/template";
import type { TextMetrics, TextProperties } from "../types/text";
import { resolveTemplateToSceneInput, type ResolveContext } from "./resolve-template";

/** Minimal façade required by {@link TemplateHandle} (implemented by {@link ApexPainter}). */
export interface TemplateRenderHost {
  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer>;
  measureText(props: TextProperties): Promise<TextMetrics>;
  assets: { resolve(refPath: string): string | Buffer };
}

export class TemplateHandle {
  constructor(
    private readonly host: TemplateRenderHost,
    private readonly definition: TemplateSceneDefinition,
    private readonly templateOptions?: TemplateOptions
  ) {}

  /**
   * Resolves placeholders, layout nodes, and optional overrides; returns a plain **`SceneRenderInput`** (no I/O).
   */
  async toRenderInput(
    data: TemplateData,
    options?: TemplateRenderOptions
  ): Promise<SceneRenderInput> {
    const ctx = this.buildContext(data);
    return resolveTemplateToSceneInput(
      this.definition,
      ctx,
      options?.overrides,
      (p) => this.host.measureText(p)
    );
  }

  async render(
    data: TemplateData,
    options?: TemplateRenderOptions & SceneRenderOptions
  ): Promise<Buffer> {
    const { overrides, ...sceneOpts } = options ?? {};
    const input = await this.toRenderInput(data, { overrides });
    return this.host.renderScene(input, { ...sceneOpts, resolveAssetRefs: false });
  }

  private buildContext(data: TemplateData): ResolveContext {
    const hook = this.templateOptions?.resolveAssetRef;
    const assets = this.host.assets;
    return {
      data,
      resolveAssetRef:
        hook ??
        ((ref: string) => {
          try {
            return assets.resolve(ref);
          } catch {
            throw new Error(
              `Template render failed: asset "${ref}" is not registered on painter.assets (use assets.loadImage / loadFont / loadPalette).`
            );
          }
        }),
    };
  }
}
