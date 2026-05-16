import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderResult,
  SceneRenderOptions,
} from "../types/scene";
import type { SceneCreator } from "./scene-creator";
import type { AssetResolveFn } from "../assets/asset-strings";
import { resolveSceneRenderInputAssets } from "../assets/resolve-scene-assets";

/**
 * Mutable builder for incremental scene setup; call {@link SceneBuilder.render} once.
 *
 * **Layer stack:** `addLayers` / `addLayer`, `insertLayer` / `insertLayers`, `removeLayer`, `moveLayer`,
 * `replaceLayers`, `clearLayers`, `layerCount`. **Snapshot:** `toRenderInput()` for `renderScene` / GIF / video.
 * Use **`render({ resolveAssetRefs: true })`** to resolve **`$...`** asset strings (builders from {@link ApexPainter.createScene} only).
 */
export class SceneBuilder {
  private background?: SceneRenderInput["background"];
  private layers: SceneLayer[];

  constructor(
    private readonly sceneCreator: SceneCreator,
    readonly width: number,
    readonly height: number,
    initialLayers?: SceneLayer[],
    private readonly assetResolve?: AssetResolveFn
  ) {
    this.layers = initialLayers ? [...initialLayers] : [];
  }

  /** Current stack depth (paint order length). */
  get layerCount(): number {
    return this.layers.length;
  }

  setBackground(bg: NonNullable<SceneRenderInput["background"]>): this {
    this.background = bg;
    return this;
  }

  addLayer(layer: SceneLayer): this {
    return this.addLayers([layer]);
  }

  /** Appends layers in order (bottom → top). Same types as {@link SceneRenderInput.layers} (no GIF/video layers). */
  addLayers(layers: readonly SceneLayer[]): this {
    if (layers.length === 0) return this;
    this.layers.push(...layers);
    return this;
  }

  /** Replaces the entire layer stack (copied from `layers`). */
  replaceLayers(layers: readonly SceneLayer[]): this {
    this.layers = layers.length === 0 ? [] : [...layers];
    return this;
  }

  clearLayers(): this {
    this.layers = [];
    return this;
  }

  /**
   * Inserts one layer at `index` (0 = bottom). `index` may equal `layerCount` to append.
   */
  insertLayer(index: number, layer: SceneLayer): this {
    SceneBuilder.assertInsertIndex("insertLayer", index, this.layers.length);
    this.layers.splice(index, 0, layer);
    return this;
  }

  /** Inserts multiple layers at `index`, preserving their relative order. */
  insertLayers(index: number, layers: readonly SceneLayer[]): this {
    if (layers.length === 0) return this;
    SceneBuilder.assertInsertIndex("insertLayers", index, this.layers.length);
    this.layers.splice(index, 0, ...layers);
    return this;
  }

  removeLayer(index: number): this {
    SceneBuilder.assertRemoveIndex("removeLayer", index, this.layers.length);
    this.layers.splice(index, 1);
    return this;
  }

  /**
   * Moves the layer at `fromIndex` to `toIndex` (indices refer to the array **before** the move).
   * Same final order as removing then inserting manually.
   */
  moveLayer(fromIndex: number, toIndex: number): this {
    const len = this.layers.length;
    SceneBuilder.assertRemoveIndex("moveLayer (fromIndex)", fromIndex, len);
    SceneBuilder.assertRemoveIndex("moveLayer (toIndex)", toIndex, len);
    if (fromIndex === toIndex) return this;
    const [item] = this.layers.splice(fromIndex, 1);
    this.layers.splice(toIndex, 0, item!);
    return this;
  }

  private static assertInsertIndex(method: string, index: number, currentLength: number): void {
    if (!Number.isInteger(index) || index < 0 || index > currentLength) {
      throw new Error(
        `SceneBuilder.${method}: index ${index} out of range; allowed 0..${currentLength} (inclusive upper for insert).`
      );
    }
  }

  private static assertRemoveIndex(method: string, index: number, currentLength: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= currentLength) {
      throw new Error(`SceneBuilder.${method}: index ${index} out of range; allowed 0..${currentLength - 1}.`);
    }
  }

  /**
   * Snapshot of the current scene as {@link SceneRenderInput} (copied `layers` array).
   * Use for `renderScene`, GIF/video helpers, caching, or tests.
   */
  toRenderInput(): SceneRenderInput {
    return {
      width: this.width,
      height: this.height,
      ...(this.background !== undefined ? { background: this.background } : {}),
      layers: [...this.layers],
    };
  }

  /**
   * Renders this scene to PNG. Pass **`{ resolveAssetRefs: true }`** to resolve **`$...`** tokens the same way as
   * {@link ApexPainter.renderScene} when the builder was created with {@link ApexPainter.createScene} (has an internal
   * resolver). Resolving is **off by default** here so programmatic scenes stay a no-op unless you opt in.
   */
  async render(options?: SceneRenderOptions): Promise<SceneRenderResult> {
    const { resolveAssetRefs = false, ...sceneOptions } = options ?? {};
    if (resolveAssetRefs) {
      if (!this.assetResolve) {
        throw new Error(
          "SceneBuilder.render: resolveAssetRefs is true but this builder has no asset resolver — use ApexPainter#createScene(), or construct SceneBuilder with an AssetResolveFn."
        );
      }
      const input = resolveSceneRenderInputAssets(this.toRenderInput(), this.assetResolve);
      return this.sceneCreator.render(input, sceneOptions);
    }
    return this.sceneCreator.render(
      {
        width: this.width,
        height: this.height,
        background: this.background,
        layers: this.layers,
      },
      sceneOptions
    );
  }
}
