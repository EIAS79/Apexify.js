export { ApexPainter } from "../lib-next/index";
export {
  ApexifyAssetError,
  ApexifyInputError,
  ApexifyPluginError,
  ApexifyResourceLimitError,
} from "../lib-next/runtime/errors";
export { AssetManager } from "../lib-next/assets/asset-manager";
export { resolveAssetRefsDeep, resolveAssetStringLeaf } from "../lib-next/assets/asset-strings";
export { TemplateResolveError } from "../lib-next/template/resolve-template";
export { cloneCompositionValue } from "../lib-next/composition/clone";
export { clearDecodedImageCache, getDecodedImageCacheStats } from "../lib-next/image/image-properties";
export {
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
  getDefaultApexifyRuntimeConfig,
} from "../lib-next/runtime/config";
