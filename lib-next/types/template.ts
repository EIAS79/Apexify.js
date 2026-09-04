import type { SceneRenderInput, SceneRenderOptions } from "./scene";
import type { TextMetrics, TextProperties } from "./text";
import type { AssetValue } from "./assets";

export type TemplateData = Record<string, unknown>;
export type TemplateLayerOverrides = Record<string, Record<string, unknown>>;

export interface TemplateLayerInsertion {
  targetId: string;
  position: "before" | "after";
  layers: TemplateLayerInput | TemplateLayerInput[];
}

export interface TemplateRenderOptions {
  /** Deep-merge into resolved layers with matching unique `id` values. Unknown IDs are rejected. */
  overrides?: TemplateLayerOverrides;
  /** Deterministically insert reusable layer definitions immediately before/after a uniquely identified layer. */
  insertions?: TemplateLayerInsertion[];
}

export interface TemplateOptions {
  /** Optional asset resolver override; painter.assets is used when omitted. */
  resolveAssetRef?: (value: string) => AssetValue;
}

export type TemplateSceneDefinition = Omit<SceneRenderInput, "layers"> & {
  layers: TemplateLayerInput[];
};

export type TemplateLayerInput = Record<string, unknown>;

export interface TemplateRenderHost {
  renderScene(input: SceneRenderInput, options?: SceneRenderOptions): Promise<Buffer>;
  measureText(props: TextProperties): Promise<TextMetrics>;
  assets: { resolve(refPath: string): AssetValue };
}

export interface PlaceholderResolveContext {
  data: Record<string, unknown>;
}

export interface ResolveContext {
  data: TemplateData;
  resolveAssetRef?: (refPath: string) => AssetValue;
}
