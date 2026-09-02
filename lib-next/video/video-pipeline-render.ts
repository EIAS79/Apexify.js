import { promises as fs } from "fs";
import path from "path";
import type {
  VideoPipelineAudioLayer,
  VideoPipelineAudioTrack,
  VideoPipelineLayer,
  VideoPipelineRenderOptions,
  VideoPipelineRenderResult,
  VideoPipelineSpliceLayer,
  VideoTextOverlayClip,
  VideoPipelineTrimLayer,
} from "../types";
import type { VideoHelpers } from "./video-helpers";
import { synthesizePreset, synthesizeSequence, synthesizeSound } from "../audio-synth/synthesizer";
import { withTempWorkspace, type TempWorkspace } from "./temp-workspace";
import { validateVideoPipelineLayers, validateVideoPipelineRenderOptions } from "./video-validation";

interface ParsedPipeline {
  source: string | Buffer;
  trim?: VideoPipelineTrimLayer;
  splices: VideoPipelineSpliceLayer[];
  textOverlays: VideoTextOverlayClip[];
  audio?: VideoPipelineAudioLayer;
}

function parseLayers(layers: VideoPipelineLayer[]): ParsedPipeline {
  const sourceLayer = layers.find((layer) => layer.kind === "source");
  if (!sourceLayer || sourceLayer.kind !== "source") {
    throw new Error("videoPipeline: a source layer is required.");
  }
  const trim = layers.find((layer) => layer.kind === "trim") as VideoPipelineTrimLayer | undefined;
  const splices = layers.filter((layer) => layer.kind === "splice") as VideoPipelineSpliceLayer[];
  const textOverlays = layers
    .filter((layer) => layer.kind === "text")
    .flatMap((layer) => layer.kind === "text" ? layer.overlays : []);
  const audioLayers = layers.filter((layer) => layer.kind === "audio") as VideoPipelineAudioLayer[];
  const audio = audioLayers.length
    ? { ...audioLayers[audioLayers.length - 1]!, tracks: audioLayers.flatMap((layer) => layer.tracks) }
    : undefined;
  return { source: sourceLayer.source, trim, splices, textOverlays, audio };
}

async function materializePipelineSource(source: string | Buffer, workspace: TempWorkspace): Promise<string> {
  if (Buffer.isBuffer(source)) return workspace.writeFile("pipeline-source.mp4", source);
  if (/^https?:\/\//i.test(source)) return source;
  const resolved = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  await fs.access(resolved);
  return resolved;
}

async function resolveSynthTracks(
  tracks: VideoPipelineAudioTrack[],
  workspace: TempWorkspace
): Promise<Array<{ path: string; startTime: number; volume?: number; sourceStart?: number; duration?: number }>> {
  const resolved: Array<{ path: string; startTime: number; volume?: number; sourceStart?: number; duration?: number }> = [];
  let seq = 0;
  for (const track of tracks) {
    if (track.type === "file") continue;
    let wav: Buffer;
    if (track.type === "preset") {
      wav = synthesizePreset(track.preset, { volume: track.volume, transpose: track.transpose });
    } else if (track.type === "synth") {
      wav = synthesizeSound(track.sound);
    } else if (track.type === "sequence") {
      wav = synthesizeSequence({ events: track.events, tail: track.tail, masterGain: track.masterGain });
    } else if (track.type === "wav") {
      wav = track.wav;
    } else {
      continue;
    }
    const outPath = await workspace.writeFile(`pipeline-synth-${seq++}.wav`, wav);
    resolved.push({ path: outPath, startTime: track.startTime, volume: "gain" in track ? track.gain ?? 1 : 1 });
  }
  return resolved;
}

async function renderTrimAndSplicePass(
  helpers: VideoHelpers,
  mainPath: string,
  trim: VideoPipelineTrimLayer | undefined,
  splice: VideoPipelineSpliceLayer,
  outputPath: string,
  workspace: TempWorkspace
): Promise<void> {
  let base = mainPath;
  if (trim) {
    const trimmedPath = workspace.path("pipeline-trim.mp4");
    await helpers.trimVideo(mainPath, { startTime: trim.startTime, endTime: trim.endTime, outputPath: trimmedPath });
    base = trimmedPath;
  }
  await helpers.replaceVideoSegment(base, {
    targetStartTime: splice.targetStartTime,
    targetEndTime: splice.targetEndTime,
    replacementVideo: splice.replacementVideo,
    replacementStartTime: splice.replacementStartTime,
    replacementDuration: splice.replacementDuration,
    replacementFrames: splice.replacementFrames,
    replacementFps: splice.replacementFps,
    outputPath,
  });
}

export async function renderVideoPipeline(
  helpers: VideoHelpers,
  layers: VideoPipelineLayer[],
  options: VideoPipelineRenderOptions
): Promise<VideoPipelineRenderResult> {
  // Mandatory before source materialization, synth allocation, temp files, or FFmpeg.
  validateVideoPipelineLayers(layers);
  validateVideoPipelineRenderOptions(options);
  const plan = parseLayers(layers);

  return withTempWorkspace({ prefix: "apexify-pipeline-" }, async (workspace) => {
    let passes = 0;
    let currentPath = await materializePipelineSource(plan.source, workspace);

    if (plan.trim && plan.splices.length === 0) {
      const out = workspace.path("pipeline-trim-only.mp4");
      await helpers.trimVideo(currentPath, { startTime: plan.trim.startTime, endTime: plan.trim.endTime, outputPath: out });
      currentPath = out;
      passes++;
    } else if (plan.splices.length > 0) {
      const first = workspace.path("pipeline-structure-0.mp4");
      await renderTrimAndSplicePass(helpers, currentPath, plan.trim, plan.splices[0]!, first, workspace);
      currentPath = first;
      passes++;
      for (let i = 1; i < plan.splices.length; i++) {
        const next = workspace.path(`pipeline-structure-${i}.mp4`);
        const splice = plan.splices[i]!;
        await helpers.replaceVideoSegment(currentPath, {
          targetStartTime: splice.targetStartTime,
          targetEndTime: splice.targetEndTime,
          replacementVideo: splice.replacementVideo,
          replacementStartTime: splice.replacementStartTime,
          replacementDuration: splice.replacementDuration,
          replacementFrames: splice.replacementFrames,
          replacementFps: splice.replacementFps,
          outputPath: next,
        });
        currentPath = next;
        passes++;
      }
    }

    const hasText = plan.textOverlays.length > 0;
    const hasAudio = !!plan.audio?.tracks.length;
    if (hasText) {
      const textOut = hasAudio ? workspace.path("pipeline-text.mp4") : options.outputPath;
      await helpers.addTextOverlayToVideo(currentPath, { overlays: plan.textOverlays, outputPath: textOut }, options.onProgress);
      currentPath = textOut;
      passes++;
    }

    if (hasAudio) {
      const tracks = plan.audio!.tracks;
      const synthResolved = await resolveSynthTracks(tracks, workspace);
      const overlays: Array<{
        source: string | Buffer;
        startTime: number;
        duration?: number;
        sourceStart?: number;
        volume?: number;
        speed?: number;
        pitchSemitones?: number;
      }> = [];
      for (const track of tracks) {
        if (track.type === "file") {
          overlays.push({
            source: track.source,
            startTime: track.startTime,
            duration: track.duration,
            sourceStart: track.sourceStart,
            volume: track.volume,
            speed: track.speed,
            pitchSemitones: track.pitchSemitones,
          });
        }
      }
      for (const track of synthResolved) overlays.push({ ...track, source: track.path });
      await helpers.mixVideoAudio(currentPath, {
        outputPath: options.outputPath,
        overlays,
        keepOriginalAudio: plan.audio!.keepOriginalAudio,
        originalVolume: plan.audio!.originalVolume,
        originalSpeed: plan.audio!.originalSpeed,
        originalPitchSemitones: plan.audio!.originalPitchSemitones,
      });
      passes++;
    } else if (!hasText && currentPath !== options.outputPath) {
      await fs.copyFile(currentPath, options.outputPath);
    }

    return { outputPath: options.outputPath, success: true, passes };
  });
}
