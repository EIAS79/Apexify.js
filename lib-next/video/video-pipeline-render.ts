import { constants as fsConstants, promises as fs } from "node:fs";
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
import type { VideoOperations } from "./video-operations";
import { synthesizePreset, synthesizeSequence, synthesizeSound } from "../audio-synth/synthesizer";
import { withTempWorkspace, type TempWorkspace } from "./temp-workspace";
import { validateVideoPipelineLayers, validateVideoPipelineRenderOptions } from "./video-validation";
import { validatePhase8PipelineLayers, validatePhase8PipelineRenderOptions } from "./video-phase8-validation";
import { ApexifyInputError } from "../runtime/errors";

interface ParsedPipeline {
  source: string | Buffer;
  trim?: VideoPipelineTrimLayer;
  splices: VideoPipelineSpliceLayer[];
  textOverlays: VideoTextOverlayClip[];
  audio?: VideoPipelineAudioLayer;
}

function parseLayers(layers: VideoPipelineLayer[]): ParsedPipeline {
  const sourceLayer = layers.find((layer) => layer.kind === "source");
  if (!sourceLayer || sourceLayer.kind !== "source") throw new ApexifyInputError("videoPipeline requires a source layer.");
  const trim = layers.find((layer) => layer.kind === "trim") as VideoPipelineTrimLayer | undefined;
  const splices = (layers.filter((layer) => layer.kind === "splice") as VideoPipelineSpliceLayer[]).slice().sort((a, b) => a.targetStartTime - b.targetStartTime || (a.id ?? "").localeCompare(b.id ?? ""));
  const textOverlays = layers.filter((layer) => layer.kind === "text").flatMap((layer) => layer.kind === "text" ? layer.overlays : []);
  const audioLayers = layers.filter((layer) => layer.kind === "audio") as VideoPipelineAudioLayer[];
  const audio = audioLayers.length ? { ...audioLayers[audioLayers.length - 1]!, tracks: audioLayers.flatMap((layer) => layer.tracks) } : undefined;
  return { source: sourceLayer.source, trim, splices, textOverlays, audio };
}

async function resolveAudioTracks(tracks: VideoPipelineAudioTrack[], workspace: TempWorkspace): Promise<Array<{ source: string | Buffer; startTime: number; volume?: number; duration?: number; sourceStart?: number; speed?: number; pitchSemitones?: number; pan?: number; fadeIn?: number; fadeOut?: number }>> {
  const resolved: Array<{ source: string | Buffer; startTime: number; volume?: number; duration?: number; sourceStart?: number; speed?: number; pitchSemitones?: number; pan?: number; fadeIn?: number; fadeOut?: number }> = [];
  let sequence = 0;
  for (const track of tracks) {
    if (track.type === "file") {
      resolved.push({ source: track.source, startTime: track.startTime, duration: track.duration, sourceStart: track.sourceStart, volume: track.volume, speed: track.speed, pitchSemitones: track.pitchSemitones, pan: track.pan, fadeIn: track.fadeIn, fadeOut: track.fadeOut });
      continue;
    }
    let wav: Buffer;
    let volume: number | undefined;
    if (track.type === "preset") {
      wav = synthesizePreset(track.preset, { volume: track.volume, transpose: track.transpose });
      volume = track.gain;
    } else if (track.type === "synth") {
      wav = synthesizeSound(track.sound);
      volume = track.gain;
    } else if (track.type === "sequence") {
      wav = synthesizeSequence({ events: track.events, tail: track.tail, masterGain: track.masterGain });
    } else {
      wav = track.wav;
      volume = track.volume;
    }
    const source = await workspace.writeFile(`pipeline-audio-${String(sequence++).padStart(4, "0")}.wav`, wav);
    resolved.push({ source, startTime: track.startTime, volume });
  }
  return resolved;
}

async function copyOutput(source: string, target: string, overwrite: boolean): Promise<void> {
  if (source === target) return;
  await fs.copyFile(source, target, overwrite ? 0 : fsConstants.COPYFILE_EXCL);
}

export async function renderVideoPipeline(operations: VideoOperations, layers: VideoPipelineLayer[], options: VideoPipelineRenderOptions): Promise<VideoPipelineRenderResult> {
  validateVideoPipelineLayers(layers);
  validatePhase8PipelineLayers(layers);
  validateVideoPipelineRenderOptions(options);
  validatePhase8PipelineRenderOptions(options);
  const plan = parseLayers(layers);
  const controls = { signal: options.signal, timeoutMs: options.timeoutMs, overwrite: options.overwrite, onProgress: options.onProgress };

  return withTempWorkspace({ ...operations.session.workspaceOptions, prefix: "apexify-pipeline-" }, async (workspace) => {
    const executionPlan: string[] = [];
    let passes = 0;
    const resolved = await operations.runtime.resolve(plan.source, workspace, "pipeline-source", controls);
    let currentPath = resolved.videoPath;

    if (plan.trim) {
      const outputPath = workspace.path("pipeline-trim.mp4");
      await operations.transcode.trim(currentPath, { startTime: plan.trim.startTime, endTime: plan.trim.endTime, outputPath, mode: "accurate" }, { ...controls, overwrite: true });
      currentPath = outputPath;
      executionPlan.push("trim");
      passes += 1;
    }

    for (let index = 0; index < plan.splices.length; index++) {
      const splice = plan.splices[index]!;
      const outputPath = workspace.path(`pipeline-splice-${String(index).padStart(4, "0")}.mp4`);
      await operations.structure.replaceSegment(currentPath, {
        targetStartTime: splice.targetStartTime,
        targetEndTime: splice.targetEndTime,
        replacementVideo: splice.replacementVideo,
        replacementStartTime: splice.replacementStartTime,
        replacementDuration: splice.replacementDuration,
        replacementFrames: splice.replacementFrames,
        replacementFps: splice.replacementFps,
        durationPolicy: splice.durationPolicy ?? "fit",
        outputPath,
      }, { ...controls, overwrite: true });
      currentPath = outputPath;
      executionPlan.push(`splice:${splice.id ?? index}`);
      passes += 1;
    }

    if (plan.textOverlays.length) {
      const outputPath = workspace.path("pipeline-text.mp4");
      await operations.overlays.text(currentPath, { overlays: plan.textOverlays, outputPath }, { ...controls, overwrite: true });
      currentPath = outputPath;
      executionPlan.push("text");
      passes += 1;
    }

    if (plan.audio?.tracks.length) {
      const overlays = await resolveAudioTracks(plan.audio.tracks, workspace);
      const outputPath = workspace.path("pipeline-audio.mp4");
      await operations.audio.mix(currentPath, {
        outputPath,
        overlays,
        keepOriginalAudio: plan.audio.keepOriginalAudio,
        originalVolume: plan.audio.originalVolume,
        originalSpeed: plan.audio.originalSpeed,
        originalPitchSemitones: plan.audio.originalPitchSemitones,
        durationPolicy: plan.audio.durationPolicy ?? "video",
      }, { ...controls, overwrite: true });
      currentPath = outputPath;
      executionPlan.push("audio");
      passes += 1;
    }

    if (options.preset === "preview") {
      const previewPath = workspace.path("pipeline-preview.mp4");
      const info = await operations.getInfo(currentPath, controls);
      const resolution = info.width >= info.height ? { width: Math.min(960, info.width), fit: "contain" as const } : { height: Math.min(960, info.height), fit: "contain" as const };
      await operations.transcode.convert(currentPath, { outputPath: previewPath, format: "mp4", videoCodec: "libx264", audioCodec: info.audio ? "aac" : "none", quality: "low", fps: Math.min(30, info.fps), resolution }, { ...controls, overwrite: true });
      currentPath = previewPath;
      executionPlan.push("preview");
      passes += 1;
    }

    await copyOutput(currentPath, options.outputPath, options.overwrite !== false);
    return { outputPath: options.outputPath, success: true, passes, executionPlan };
  });
}
