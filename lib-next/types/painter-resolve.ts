/**
 * Opt-in **`$name`** / **`$palette.key`** resolution for imperative {@link ApexPainter} methods.
 * Scene APIs default resolution **on**; these flags default **off** unless noted.
 */
export interface PainterAssetRefsOptions {
  /**
   * When **true**, string leaves in the payload are resolved via {@link AssetManager.resolve} (same rules as
   * {@link ApexPainter.prepareForRender} / {@link ApexPainter.renderScene}).
   */
  resolveAssetRefs?: boolean;
}
