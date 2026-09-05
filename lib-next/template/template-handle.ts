import type {
  TemplateData,
  TemplateRenderOptions,
  TemplateOptions,
  TemplateSceneDefinition,
  SceneRenderInput,
  SceneRenderOptions,
  TemplateRenderHost,
} from "../types";
import { resolveTemplateToSceneInput, type ResolveContext, TemplateResolveError } from "./resolve-template";
import { cloneCompositionValue } from "../composition/clone";

export type { TemplateRenderHost } from "../types";

export class TemplateHandle {
  private readonly definition: TemplateSceneDefinition;

  constructor(
    private readonly host: TemplateRenderHost,
    definition: TemplateSceneDefinition,
    private readonly templateOptions?: TemplateOptions
  ) {
    this.definition = cloneCompositionValue(definition, "template definition");
  }

  async toRenderInput(data: TemplateData, options?: TemplateRenderOptions): Promise<SceneRenderInput> {
    const dataSnapshot = cloneCompositionValue(data, "template data");
    return resolveTemplateToSceneInput(
      this.definition,
      this.buildContext(dataSnapshot),
      options?.overrides,
      (props) => this.host.measureText(props),
      options?.insertions
    );
  }

  async render(
    data: TemplateData,
    options?: TemplateRenderOptions & SceneRenderOptions
  ): Promise<Buffer> {
    const { overrides, insertions, ...sceneOptions } = options ?? {};
    const input = await this.toRenderInput(data, { overrides, insertions });
    return this.host.renderScene(input, { ...sceneOptions, resolveAssetRefs: false });
  }

  private buildContext(data: TemplateData): ResolveContext {
    const hook = this.templateOptions?.resolveAssetRef;
    const assets = this.host.assets;
    return {
      data,
      resolveAssetRef: hook ?? ((ref: string) => {
        try {
          return assets.resolve(ref);
        } catch (error) {
          throw new TemplateResolveError(
            `Template render failed: asset "${ref}" is not registered on painter.assets.`,
            ref,
            { cause: error }
          );
        }
      }),
    };
  }
}
