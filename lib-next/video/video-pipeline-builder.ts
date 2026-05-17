import type {
  VideoPipelineAudioLayer,
  VideoPipelineAudioTrack,
  VideoPipelineLayer,
  VideoPipelineRenderOptions,
  VideoPipelineRenderResult,
  VideoPipelineSnapshot,
  VideoPipelineSpliceLayer,
  VideoPipelineSourceLayer,
  VideoPipelineTextLayer,
  VideoPipelineTrimLayer,
  VideoTextOverlayClip
} from "../types";
import type { VideoHelpers } from "./video-helpers";
import { renderVideoPipeline } from "./video-pipeline-render";

function assertId(id: string | undefined, method: string): void {
  if (id != null && id.length === 0) {
    throw new Error(`${method}: id must be a non-empty string when provided.`);
  }
}

/**
 * Declarative video edit pipeline (layer stack). Same `id` on a layer **replaces** the previous layer
 * with that id — safe for editor undo/redo and avoiding duplicate trims/splices.
 *
 * Prefer {@link ApexPainter.videoPipeline} over chaining many `createVideo` calls.
 */
export class VideoPipeline {
  private layers: VideoPipelineLayer[] = [];

  constructor(
    private readonly helpers: VideoHelpers,
    source?: string | Buffer,
    initialLayers?: VideoPipelineLayer[]
  ) {
    if (source != null) {
      this.source(source, "main");
    }
    if (initialLayers?.length) {
      for (const layer of initialLayers) {
        this.pushLayer(layer);
      }
    }
  }

  /** Current layer stack (copy). */
  getLayers(): VideoPipelineLayer[] {
    return [...this.layers];
  }

  /** JSON-serializable snapshot for editors / APIs. */
  toJSON(): VideoPipelineSnapshot {
    return { layers: this.getLayers() };
  }

  static fromJSON(
    helpers: VideoHelpers,
    snapshot: VideoPipelineSnapshot
  ): VideoPipeline {
    return new VideoPipeline(helpers, undefined, snapshot.layers);
  }

  /**
   * Upsert by `layer.id` when set; otherwise append.
   * `text` / `audio` layers with the same id **merge** tracks/overlays unless `replace: true`.
   */
  pushLayer(layer: VideoPipelineLayer, opts?: { replace?: boolean }): this {
    assertId(layer.id, "pushLayer");

    if (layer.id) {
      const idx = this.layers.findIndex((l) => l.id === layer.id);
      if (idx >= 0) {
        const prev = this.layers[idx]!;
        if (!opts?.replace && layer.kind === "text" && prev.kind === "text") {
          this.layers[idx] = {
            ...layer,
            overlays: [...prev.overlays, ...layer.overlays],
          };
          return this;
        }
        if (!opts?.replace && layer.kind === "audio" && prev.kind === "audio") {
          this.layers[idx] = {
            ...layer,
            tracks: [...prev.tracks, ...layer.tracks],
          };
          return this;
        }
        this.layers[idx] = layer;
        return this;
      }
    }

    if (layer.kind === "source") {
      const existing = this.layers.findIndex((l) => l.kind === "source");
      if (existing >= 0) {
        this.layers[existing] = layer;
        return this;
      }
    }

    this.layers.push(layer);
    return this;
  }

  source(source: string | Buffer, id = "source"): this {
    return this.pushLayer({ kind: "source", id, source } satisfies VideoPipelineSourceLayer);
  }

  trim(startTime: number, endTime: number, id = "trim"): this {
    return this.pushLayer({
      kind: "trim",
      id,
      startTime,
      endTime,
    } satisfies VideoPipelineTrimLayer);
  }

  splice(
    options: Omit<VideoPipelineSpliceLayer, "kind" | "id">,
    id = "splice"
  ): this {
    return this.pushLayer({ kind: "splice", id, ...options } satisfies VideoPipelineSpliceLayer);
  }

  /** Timed captions — same fields as `createText` + timeline. Call again with same `id` to append overlays. */
  text(overlays: VideoTextOverlayClip | VideoTextOverlayClip[], id = "text"): this {
    const list = Array.isArray(overlays) ? overlays : [overlays];
    return this.pushLayer({ kind: "text", id, overlays: list } satisfies VideoPipelineTextLayer);
  }

  /** External files + procedural audio (`preset` / `synth` / `sequence` / `wav`). Merges tracks when `id` matches. */
  audio(
    tracks: VideoPipelineAudioTrack | VideoPipelineAudioTrack[],
    options?: Omit<VideoPipelineAudioLayer, "kind" | "id" | "tracks">,
    id = "audio"
  ): this {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    return this.pushLayer({
      kind: "audio",
      id,
      tracks: list,
      ...options,
    } satisfies VideoPipelineAudioLayer);
  }

  removeLayer(id: string): this {
    this.layers = this.layers.filter((l) => l.id !== id);
    return this;
  }

  clearLayers(kind?: VideoPipelineLayer["kind"]): this {
    if (kind) {
      this.layers = this.layers.filter((l) => l.kind !== kind);
    } else {
      const src = this.layers.find((l) => l.kind === "source");
      this.layers = src ? [src] : [];
    }
    return this;
  }

  async render(options: VideoPipelineRenderOptions): Promise<VideoPipelineRenderResult> {
    return renderVideoPipeline(this.helpers, this.layers, options);
  }
}
