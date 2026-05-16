import type { SceneRenderInput } from "../types/scene";
import type { AssetResolveFn } from "./asset-strings";
import { resolveAssetRefsDeep } from "./asset-strings";

/**
 * Returns a deep clone of **`scene`** with **`$name`** / **`$palette.key`** resolved via **`resolve`**.
 */
export function resolveSceneRenderInputAssets(input: SceneRenderInput, resolve: AssetResolveFn): SceneRenderInput {
  return resolveAssetRefsDeep(input, resolve) as SceneRenderInput;
}
