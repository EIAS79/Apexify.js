import type {
  SceneLayer,
  SceneRenderInput,
  SceneRenderResult,
  SceneRenderOptions,
} from "../types";
import type { SceneCreator } from "./scene-creator";
import type { AssetResolveFn } from "../assets/asset-strings";
import { resolveSceneRenderInputAssets } from "../assets/resolve-scene-assets";
import { cloneCompositionValue } from "../composition/clone";
import { ApexifyInputError } from "../runtime/errors";

/**
 * Mutable scene builder with copy-on-ingress semantics. User-owned layer/background objects are cloned when added,
 * so later mutation of caller inputs does not silently alter an existing builder.
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
    this.layers = cloneCompositionValue(initialLayers ?? [], "SceneBuilder.initialLayers");
  }

  get layerCount(): number {
    return this.layers.length;
  }

  setBackground(background: NonNullable<SceneRenderInput["background"]>): this {
    this.background = cloneCompositionValue(background, "SceneBuilder.background");
    return this;
  }

  clearBackground(): this {
    this.background = undefined;
    return this;
  }

  addLayer(layer: SceneLayer): this {
    return this.addLayers([layer]);
  }

  addLayers(layers: readonly SceneLayer[]): this {
    if (layers.length > 0) {
      this.layers.push(...cloneCompositionValue([...layers], "SceneBuilder.addLayers"));
    }
    return this;
  }

  replaceLayers(layers: readonly SceneLayer[]): this {
    this.layers = cloneCompositionValue([...layers], "SceneBuilder.replaceLayers");
    return this;
  }

  replaceLayer(index: number, layer: SceneLayer): this {
    SceneBuilder.assertExistingIndex("replaceLayer", index, this.layers.length);
    this.layers[index] = cloneCompositionValue(layer, "SceneBuilder.replaceLayer");
    return this;
  }

  clearLayers(): this {
    this.layers = [];
    return this;
  }

  insertLayer(index: number, layer: SceneLayer): this {
    SceneBuilder.assertInsertIndex("insertLayer", index, this.layers.length);
    this.layers.splice(index, 0, cloneCompositionValue(layer, "SceneBuilder.insertLayer"));
    return this;
  }

  insertLayers(index: number, layers: readonly SceneLayer[]): this {
    if (layers.length === 0) return this;
    SceneBuilder.assertInsertIndex("insertLayers", index, this.layers.length);
    this.layers.splice(index, 0, ...cloneCompositionValue([...layers], "SceneBuilder.insertLayers"));
    return this;
  }

  insertBefore(index: number, layer: SceneLayer): this {
    SceneBuilder.assertExistingIndex("insertBefore", index, this.layers.length);
    return this.insertLayer(index, layer);
  }

  insertAfter(index: number, layer: SceneLayer): this {
    SceneBuilder.assertExistingIndex("insertAfter", index, this.layers.length);
    return this.insertLayer(index + 1, layer);
  }

  removeLayer(index: number): this {
    SceneBuilder.assertExistingIndex("removeLayer", index, this.layers.length);
    this.layers.splice(index, 1);
    return this;
  }

  /** `toIndex` is interpreted in the original pre-move array. */
  moveLayer(fromIndex: number, toIndex: number): this {
    const length = this.layers.length;
    SceneBuilder.assertExistingIndex("moveLayer (fromIndex)", fromIndex, length);
    SceneBuilder.assertExistingIndex("moveLayer (toIndex)", toIndex, length);
    if (fromIndex === toIndex) return this;
    const [item] = this.layers.splice(fromIndex, 1);
    this.layers.splice(toIndex, 0, item!);
    return this;
  }

  private static assertInsertIndex(method: string, index: number, currentLength: number): void {
    if (!Number.isInteger(index) || index < 0 || index > currentLength) {
      throw new ApexifyInputError(
        `SceneBuilder.${method}: index ${index} out of range; allowed 0..${currentLength}.`
      );
    }
  }

  private static assertExistingIndex(method: string, index: number, currentLength: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= currentLength) {
      throw new ApexifyInputError(
        `SceneBuilder.${method}: index ${index} out of range; allowed 0..${Math.max(-1, currentLength - 1)}.`
      );
    }
  }

  /** Returns an isolated snapshot; mutating it does not mutate the builder. */
  toRenderInput(): SceneRenderInput {
    return cloneCompositionValue(
      {
        width: this.width,
        height: this.height,
        ...(this.background !== undefined ? { background: this.background } : {}),
        layers: this.layers,
      },
      "SceneBuilder.snapshot"
    );
  }

  async render(options?: SceneRenderOptions): Promise<SceneRenderResult> {
    const { resolveAssetRefs = false, ...sceneOptions } = options ?? {};
    const snapshot = this.toRenderInput();
    if (resolveAssetRefs) {
      if (!this.assetResolve) {
        throw new ApexifyInputError(
          "SceneBuilder.render: resolveAssetRefs requires a builder created by ApexPainter.createScene()."
        );
      }
      return this.sceneCreator.render(resolveSceneRenderInputAssets(snapshot, this.assetResolve), sceneOptions);
    }
    return this.sceneCreator.render(snapshot, sceneOptions);
  }
}
