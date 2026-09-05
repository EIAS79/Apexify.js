import { ApexifyInputError } from "../../runtime/errors";
import { assertWithinLimit } from "../../runtime/limits";
import type { VideoAudioPolicy, VideoSource } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { buildGridLayout, evenDimension, nonNegativeNumber, positiveNumber } from "./filter-graph";

export interface VideoMergeOptions {
  videos: VideoSource[];
  outputPath: string;
  mode?: "sequential" | "side-by-side" | "grid";
  direction?: "horizontal" | "vertical";
  grid?: { cols?: number; rows?: number; cellWidth?: number; cellHeight?: number; gap?: number; background?: string };
  audioPolicy?: VideoAudioPolicy;
}

function safeColor(value: string | undefined): string {
  const color = value ?? "black";
  if (!/^(?:#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?|[a-zA-Z]{1,32})$/.test(color)) throw new ApexifyInputError("video grid background must be a named color or #RRGGBB/#RRGGBBAA value.");
  return color;
}

function autoGrid(count: number, requested?: VideoMergeOptions["grid"]): { cols: number; rows: number } {
  let cols = requested?.cols;
  let rows = requested?.rows;
  if (cols !== undefined && (!Number.isInteger(cols) || cols < 1)) throw new ApexifyInputError("grid.cols must be a positive integer.");
  if (rows !== undefined && (!Number.isInteger(rows) || rows < 1)) throw new ApexifyInputError("grid.rows must be a positive integer.");
  if (cols === undefined && rows === undefined) {
    cols = Math.ceil(Math.sqrt(count));
    rows = Math.ceil(count / cols);
  } else if (cols === undefined) cols = Math.ceil(count / rows!);
  else if (rows === undefined) rows = Math.ceil(count / cols);
  if (cols! * rows! < count) throw new ApexifyInputError("grid rows × columns must be at least the input count.");
  return { cols: cols!, rows: rows! };
}

function compositeAudioGraph(infos: Array<{ audio: boolean }>, policy: VideoAudioPolicy, outputVideoLabel: string): { graph: string; map: string[] } {
  if (policy === "none") return { graph: "", map: ["-map", `[${outputVideoLabel}]`, "-an"] };
  const audioIndices = infos.map((info, index) => info.audio ? index : -1).filter((index) => index >= 0);
  if (audioIndices.length === 0) return { graph: "", map: ["-map", `[${outputVideoLabel}]`, "-an"] };
  if (policy === "mix") {
    const pads = audioIndices.map((index, n) => `[${index}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[ma${n}]`).join(";");
    const inputs = audioIndices.map((_index, n) => `[ma${n}]`).join("");
    return { graph: `${pads};${inputs}amix=inputs=${audioIndices.length}:duration=shortest:normalize=1[aout]`, map: ["-map", `[${outputVideoLabel}]`, "-map", "[aout]", "-c:a", "aac"] };
  }
  const index = audioIndices[0]!;
  return { graph: "", map: ["-map", `[${outputVideoLabel}]`, "-map", `${index}:a:0`, "-c:a", "aac"] };
}

export class MergeOperations {
  constructor(private readonly runtime: VideoOperationRuntime) {}

  async merge(options: VideoMergeOptions, controls: VideoRunControls = {}) {
    if (!options.videos || options.videos.length < 2) throw new ApexifyInputError("video.merge requires at least two videos.");
    assertWithinLimit("maxVideoMergeInputs", options.videos.length);
    return this.runtime.withWorkspace("apexify-merge-", async (workspace) => {
      const paths: string[] = [];
      const infos = [];
      for (let i = 0; i < options.videos.length; i += 1) {
        const resolved = await this.runtime.resolve(options.videos[i]!, workspace, `input-${i}`, controls);
        paths.push(resolved.videoPath);
        infos.push(await this.runtime.probeFile(resolved.videoPath, controls));
      }
      const args: string[] = [];
      for (const input of paths) args.push("-i", input);
      const mode = options.mode ?? "sequential";
      if (mode === "sequential") return this.sequential(args, infos, options, controls);
      return this.composite(args, infos, options, controls);
    });
  }

  async splitScreen(options: Omit<VideoMergeOptions, "mode"> & { layout?: "side-by-side" | "top-bottom" | "grid" }, controls: VideoRunControls = {}) {
    const mode = options.layout === "grid" ? "grid" : "side-by-side";
    const direction = options.layout === "top-bottom" ? "vertical" : "horizontal";
    return this.merge({ ...options, mode, direction }, controls);
  }

  private async sequential(args: string[], infos: Array<{ width: number; height: number; fps: number; duration: number; audio: boolean }>, options: VideoMergeOptions, controls: VideoRunControls) {
    const policy = options.audioPolicy ?? "preserve";
    if (policy === "first" || policy === "mix") throw new ApexifyInputError("Sequential merge supports audioPolicy 'preserve' (audio follows each clip) or 'none'.");
    const width = evenDimension(Math.max(...infos.map((info) => info.width)));
    const height = evenDimension(Math.max(...infos.map((info) => info.height)));
    const fps = Math.max(...infos.map((info) => info.fps));
    const graph: string[] = [];
    const concatPads: string[] = [];
    for (let i = 0; i < infos.length; i += 1) {
      graph.push(`[${i}:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,setpts=PTS-STARTPTS[v${i}]`);
      concatPads.push(`[v${i}]`);
      if (policy === "preserve") {
        if (infos[i]!.audio) graph.push(`[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
        else graph.push(`anullsrc=r=48000:cl=stereo:d=${infos[i]!.duration}[a${i}]`);
        concatPads.push(`[a${i}]`);
      }
    }
    graph.push(`${concatPads.join("")}concat=n=${infos.length}:v=1:a=${policy === "preserve" ? 1 : 0}[vout]${policy === "preserve" ? "[aout]" : ""}`);
    args.push("-filter_complex", graph.join(";"), "-map", "[vout]");
    if (policy === "preserve") args.push("-map", "[aout]", "-c:a", "aac"); else args.push("-an");
    args.push("-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
    const duration = infos.reduce((sum, info) => sum + info.duration, 0);
    await this.runtime.runFfmpeg(args, controls, duration);
    return { outputPath: options.outputPath, success: true, mode: "sequential", audioPolicy: policy } as const;
  }

  private async composite(args: string[], infos: Array<{ width: number; height: number; fps: number; duration: number; audio: boolean }>, options: VideoMergeOptions, controls: VideoRunControls) {
    const policy = options.audioPolicy ?? "first";
    const cellWidth = evenDimension(options.grid?.cellWidth ?? Math.max(...infos.map((info) => info.width)));
    const cellHeight = evenDimension(options.grid?.cellHeight ?? Math.max(...infos.map((info) => info.height)));
    positiveNumber(cellWidth, "merge cellWidth");
    positiveNumber(cellHeight, "merge cellHeight");
    const fps = Math.max(...infos.map((info) => info.fps));
    const graph: string[] = infos.map((_info, index) => `[${index}:v:0]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,setpts=PTS-STARTPTS[v${index}]`);
    let stack: string;
    if ((options.mode ?? "side-by-side") === "grid") {
      const { cols, rows } = autoGrid(infos.length, options.grid);
      const gap = nonNegativeNumber(options.grid?.gap ?? 0, "grid gap");
      const layout = buildGridLayout(infos.length, cols, rows, cellWidth, cellHeight, gap);
      const pads = infos.map((_info, index) => `[v${index}]`).join("");
      stack = `${pads}xstack=inputs=${infos.length}:layout=${layout}:fill=${safeColor(options.grid?.background)}:shortest=1[vout]`;
    } else {
      if (infos.length !== 2) throw new ApexifyInputError("side-by-side merge requires exactly two videos; use grid for 3+ inputs.");
      const filter = options.direction === "vertical" ? "vstack" : "hstack";
      stack = `[v0][v1]${filter}=inputs=2:shortest=1[vout]`;
    }
    const audio = compositeAudioGraph(infos, policy, "vout");
    graph.push(stack);
    if (audio.graph) graph.push(audio.graph);
    args.push("-filter_complex", graph.join(";"), ...audio.map, "-c:v", "libx264", "-crf", "20", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
    const duration = Math.min(...infos.map((info) => info.duration));
    await this.runtime.runFfmpeg(args, controls, duration);
    return { outputPath: options.outputPath, success: true, mode: options.mode ?? "side-by-side", audioPolicy: policy } as const;
  }
}
