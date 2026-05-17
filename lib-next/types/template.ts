import type { SceneRenderInput, SceneRenderOptions } from "./scene";
import type { TextMetrics, TextProperties } from "./text";

/**
 * Data bag for {@link ApexPainter.createTemplate} render passes. Keys match `{{key}}` placeholders.
 */
export type TemplateData = Record<string, unknown>;

/**
 * Per-layer overrides keyed by optional layer **`id`** (set on template layer objects).
 */
export type TemplateLayerOverrides = Record<string, Record<string, unknown>>;

export interface TemplateRenderOptions {
  /** Deep-merge into resolved layers that declare a matching **`id`**. */
  overrides?: TemplateLayerOverrides;
}

export interface TemplateOptions {
  /**
   * Optional hook: transform asset refs (`$logo`, `$theme.text`) after placeholders, before scene render.
   * When omitted, the painter’s built-in **assets** registry is used when present.
   */
  resolveAssetRef?: (value: string) => string | Buffer;
}

/**
 * Root template definition: same shape as {@link SceneRenderInput}, with string placeholders allowed
 * in any leaf string field, optional **`id`** / **`visible`** on layer objects, and optional **`layout`** nodes.
 */
export type TemplateSceneDefinition = Omit<SceneRenderInput, "layers"> & {
  layers: TemplateLayerInput[];
};

/**
 * Layer description before resolution: JSON-like, may include shorthand (`text`/`source`), **`id`**, **`visible`**, or **`type: "layout"`**.
 */
export type TemplateLayerInput = Record<string, unknown>;

/** Minimal façade required by template render (implemented by {@link ApexPainter}). */
export interface TemplateRenderHost {
  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer>;
  measureText(props: TextProperties): Promise<TextMetrics>;
  assets: { resolve(refPath: string): string | Buffer };
}

export interface PlaceholderResolveContext {
  data: Record<string, unknown>;
}

export interface ResolveContext {
  data: TemplateData;
  resolveAssetRef?: (refPath: string) => string | Buffer;
}
