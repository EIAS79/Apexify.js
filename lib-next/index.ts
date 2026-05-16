/**
 * Apexify.js — {@link ApexPainter} plus every type under `./types`.
 */

export { ApexPainter } from "./apex-painter";
export { validateSceneRenderInput } from "./scene/scene-validation";
export { TemplateHandle, type TemplateRenderHost } from "./template/template-handle";
export { AssetManager } from "./assets/asset-manager";
export { PluginHost } from "./plugins/plugin-host";
export type { ApexifyPlugin } from "./plugins/apexify-plugin";
export type {
  BadgeToLayersOptions,
  ProgressBarToLayersOptions,
  AvatarToLayersOptions,
  CardToLayersOptions,
  WatermarkToLayersOptions,
} from "./components/types";
export type { BatchChainAssetOpts } from "./batch/batch-operations";

export type * from "./types";
