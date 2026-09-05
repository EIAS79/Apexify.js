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
  VideoTextOverlayClip,
} from "../types";
import type { VideoOperations } from "./video-operations";
import { renderVideoPipeline } from "./video-pipeline-render";
import { validateVideoPipelineLayers } from "./video-validation";
import { validatePhase8PipelineLayers } from "./video-phase8-validation";
import { ApexifyInputError } from "../runtime/errors";

const HISTORY_LIMIT = 256;

function assertId(id: string | undefined, method: string): void {
  if (id != null && id.length === 0) throw new ApexifyInputError(`${method}: id must be a non-empty string when provided.`);
}

function cloneLayer(layer: VideoPipelineLayer): VideoPipelineLayer {
  if (layer.kind === "text") return { ...layer, overlays: [...layer.overlays] };
  if (layer.kind === "audio") return { ...layer, tracks: [...layer.tracks] };
  if (layer.kind === "splice" && layer.replacementFrames) return { ...layer, replacementFrames: [...layer.replacementFrames] };
  return { ...layer };
}

function cloneLayers(layers: readonly VideoPipelineLayer[]): VideoPipelineLayer[] {
  return layers.map(cloneLayer);
}

function reviveSerializedBuffers(value: unknown): unknown {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(reviveSerializedBuffers);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (record.type === "Buffer" && Array.isArray(record.data)) {
    const bytes = record.data;
    if (!bytes.every((item) => typeof item === "number" && Number.isInteger(item) && item >= 0 && item <= 255)) {
      throw new ApexifyInputError("videoPipeline snapshot contains an invalid serialized Buffer.");
    }
    return Buffer.from(bytes);
  }
  return Object.fromEntries(Object.entries(record).map(([key, item]) => [key, reviveSerializedBuffers(item)]));
}

export class VideoPipeline {
  private layers: VideoPipelineLayer[] = [];
  private undoStack: VideoPipelineLayer[][] = [];
  private redoStack: VideoPipelineLayer[][] = [];

  constructor(
    private readonly operations: VideoOperations,
    source?: string | Buffer,
    initialLayers?: VideoPipelineLayer[]
  ) {
    if (source != null) this.applyLayer({ kind: "source", id: "source", source });
    if (initialLayers?.length) for (const layer of initialLayers) this.applyLayer(layer);
    if (this.layers.some((layer) => layer.kind === "source")) this.validateRenderable();
  }

  getLayers(): VideoPipelineLayer[] { return cloneLayers(this.layers); }
  toJSON(): VideoPipelineSnapshot { return { version: 1, layers: this.getLayers() }; }

  static fromJSON(operations: VideoOperations, snapshot: VideoPipelineSnapshot): VideoPipeline {
    if (!snapshot || typeof snapshot !== "object") throw new ApexifyInputError("videoPipeline snapshot must be an object.");
    const revived = reviveSerializedBuffers(snapshot) as VideoPipelineSnapshot;
    if (!Array.isArray(revived.layers)) throw new ApexifyInputError("videoPipeline snapshot must contain a layers array.");
    if (revived.version !== undefined && revived.version !== 1) throw new ApexifyInputError(`Unsupported videoPipeline snapshot version: ${String(revived.version)}.`);
    validateVideoPipelineLayers(revived.layers);
    validatePhase8PipelineLayers(revived.layers);
    return new VideoPipeline(operations, undefined, revived.layers);
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): boolean {
    const previous = this.undoStack.pop();
    if (!previous) return false;
    this.redoStack.push(cloneLayers(this.layers));
    this.layers = cloneLayers(previous);
    return true;
  }

  redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(cloneLayers(this.layers));
    this.layers = cloneLayers(next);
    return true;
  }

  pushLayer(layer: VideoPipelineLayer, opts?: { replace?: boolean }): this {
    assertId(layer.id, "pushLayer");
    const previous = cloneLayers(this.layers);
    this.applyLayer(layer, opts);
    try {
      this.validateIfRenderable();
    } catch (error) {
      this.layers = previous;
      throw error;
    }
    this.recordMutation(previous);
    return this;
  }

  private applyLayer(layer: VideoPipelineLayer, opts?: { replace?: boolean }): void {
    if (layer.id) {
      const idx = this.layers.findIndex((item) => item.id === layer.id);
      if (idx >= 0) {
        const prev = this.layers[idx]!;
        if (!opts?.replace && layer.kind === "text" && prev.kind === "text") {
          this.layers[idx] = { ...layer, overlays: [...prev.overlays, ...layer.overlays] };
          return;
        }
        if (!opts?.replace && layer.kind === "audio" && prev.kind === "audio") {
          this.layers[idx] = { ...layer, tracks: [...prev.tracks, ...layer.tracks] };
          return;
        }
        this.layers[idx] = cloneLayer(layer);
        return;
      }
    }
    if (layer.kind === "source") {
      const existing = this.layers.findIndex((item) => item.kind === "source");
      if (existing >= 0) {
        this.layers[existing] = cloneLayer(layer);
        return;
      }
    }
    this.layers.push(cloneLayer(layer));
  }

  private recordMutation(previous: VideoPipelineLayer[]): void {
    this.undoStack.push(previous);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  private validateRenderable(): void {
    validateVideoPipelineLayers(this.layers);
    validatePhase8PipelineLayers(this.layers);
  }

  private validateIfRenderable(): void {
    if (this.layers.some((layer) => layer.kind === "source")) this.validateRenderable();
    else validatePhase8PipelineLayers(this.layers);
  }

  source(source: string | Buffer, id = "source"): this { return this.pushLayer({ kind: "source", id, source } satisfies VideoPipelineSourceLayer); }
  trim(startTime: number, endTime: number, id = "trim"): this { return this.pushLayer({ kind: "trim", id, startTime, endTime } satisfies VideoPipelineTrimLayer); }
  splice(options: Omit<VideoPipelineSpliceLayer, "kind" | "id">, id = "splice"): this { return this.pushLayer({ kind: "splice", id, ...options } satisfies VideoPipelineSpliceLayer); }
  text(overlays: VideoTextOverlayClip | VideoTextOverlayClip[], id = "text"): this {
    const list = Array.isArray(overlays) ? overlays : [overlays];
    return this.pushLayer({ kind: "text", id, overlays: list } satisfies VideoPipelineTextLayer);
  }
  audio(tracks: VideoPipelineAudioTrack | VideoPipelineAudioTrack[], options?: Omit<VideoPipelineAudioLayer, "kind" | "id" | "tracks">, id = "audio"): this {
    const list = Array.isArray(tracks) ? tracks : [tracks];
    return this.pushLayer({ kind: "audio", id, tracks: list, ...options } satisfies VideoPipelineAudioLayer);
  }

  removeLayer(id: string): this {
    assertId(id, "removeLayer");
    const next = this.layers.filter((layer) => layer.id !== id);
    if (next.length === this.layers.length) return this;
    const previous = cloneLayers(this.layers);
    this.layers = next;
    try { this.validateIfRenderable(); } catch (error) { this.layers = previous; throw error; }
    this.recordMutation(previous);
    return this;
  }

  clearLayers(kind?: VideoPipelineLayer["kind"]): this {
    const next = kind ? this.layers.filter((layer) => layer.kind !== kind) : (() => {
      const source = this.layers.find((layer) => layer.kind === "source");
      return source ? [source] : [];
    })();
    const unchanged = next.length === this.layers.length && next.every((layer, index) => layer === this.layers[index]);
    if (unchanged) return this;
    const previous = cloneLayers(this.layers);
    this.layers = cloneLayers(next);
    try { this.validateIfRenderable(); } catch (error) { this.layers = previous; throw error; }
    this.recordMutation(previous);
    return this;
  }

  render(options: VideoPipelineRenderOptions): Promise<VideoPipelineRenderResult> {
    return renderVideoPipeline(this.operations, this.layers, options);
  }
}