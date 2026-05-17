import type { TemplateOptions, TemplateSceneDefinition } from "../../types";
import { TemplateHandle, type TemplateRenderHost } from "../../template/template-handle";

/**
 * Template scenes on {@link ApexPainter} — placeholders, layout, `$` assets → {@link renderScene}.
 * Same role as {@link SceneCreate} / {@link AudioCreate} under `apex-painter/creates/`.
 */
export class TemplateCreate {
  constructor(private readonly host: TemplateRenderHost) {}

  createTemplate(
    definition: TemplateSceneDefinition,
    options?: TemplateOptions
  ): TemplateHandle {
    return new TemplateHandle(this.host, definition, options);
  }
}
