import fs from "fs";
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
import {
  synthesizePreset,
  synthesizeSequence,
  synthesizeSound,
} from "../audio-synth/synthesizer";

interface ParsedPipeline {
  source: string | Buffer;
  trim?: VideoPipelineTrimLayer;
  splices: VideoPipelineSpliceLayer[];
  textOverlays: VideoTextOverlayClip[];
  audio?: VideoPipelineAudioLayer;
}

function parseLayers(layers: VideoPipelineLayer[]): ParsedPipeline {
  const sourceLayer = layers.find((l) => l.kind === "source");
  if (!sourceLayer || sourceLayer.kind !== "source") {
    throw new Error("videoPipeline: a source layer is required (call .source() or pass source in constructor).");
  }

  const trim = layers.find((l) => l.kind === "trim") as VideoPipelineTrimLayer | undefined;
  const splices = layers.filter((l) => l.kind === "splice") as VideoPipelineSpliceLayer[];

  const textOverlays: VideoTextOverlayClip[] = [];
  for (const l of layers) {
    if (l.kind === "text") textOverlays.push(...l.overlays);
  }

  const audioLayers = layers.filter((l) => l.kind === "audio") as VideoPipelineAudioLayer[];
  const audio =
    audioLayers.length > 0
      ? {
          ...audioLayers[audioLayers.length - 1]!,
          tracks: audioLayers.flatMap((a) => a.tracks),
        }
      : undefined;

  if (trim && trim.startTime >= trim.endTime) {
    throw new Error("videoPipeline: trim startTime must be less than endTime.");
  }

  return { source: sourceLayer.source, trim, splices, textOverlays, audio };
}

async function resolveSynthTracks(
  tracks: VideoPipelineAudioTrack[],
  frameDir: string,
  timestamp: number
): Promise<Array<{ path: string; startTime: number; volume?: number; sourceStart?: number; duration?: number }>> {
  const resolved: Array<{
    path: string;
    startTime: number;
    volume?: number;
    sourceStart?: number;
    duration?: number;
  }> = [];

  let seq = 0;
  for (const track of tracks) {
    if (track.type === "file") {
      resolved.push({
        path: track.source as string,
        startTime: track.startTime,
        volume: track.volume,
        sourceStart: track.sourceStart,
        duration: track.duration,
      });
      continue;
    }

    let wav: Buffer;
    if (track.type === "preset") {
      wav = synthesizePreset(track.preset, {
        volume: track.volume,
        transpose: track.transpose,
      });
    } else if (track.type === "synth") {
      wav = synthesizeSound(track.sound);
    } else if (track.type === "sequence") {
      wav = synthesizeSequence({
        events: track.events,
        tail: track.tail,
        masterGain: track.masterGain,
      });
    } else if (track.type === "wav") {
      wav = track.wav;
    } else {
      continue;
    }

    const gain = "gain" in track ? track.gain : undefined;
    const vol = gain ?? 1;
    const outPath = path.join(frameDir, `pipeline-synth-${timestamp}-${seq++}.wav`);
    fs.writeFileSync(outPath, wav);
    resolved.push({
      path: outPath,
      startTime: track.startTime,
      volume: vol,
    });
  }

  return resolved;
}

async function renderTrimAndSplicePass(
  helpers: VideoHelpers,
  mainPath: string,
  trim: VideoPipelineTrimLayer | undefined,
  splice: VideoPipelineSpliceLayer,
  outputPath: string,
  frameDir: string,
  timestamp: number
): Promise<void> {
  if (!splice.replacementVideo && !splice.replacementFrames) {
    throw new Error("videoPipeline: splice requires replacementVideo or replacementFrames.");
  }

  let base = mainPath;

  if (trim) {
    const trimmedPath = path.join(frameDir, `pipeline-trim-${timestamp}.mp4`);
    await helpers.trimVideo(mainPath, {
      startTime: trim.startTime,
      endTime: trim.endTime,
      outputPath: trimmedPath,
    });
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

  if (trim && base !== mainPath && fs.existsSync(base)) {
    fs.unlinkSync(base);
  }
}

async function resolveSourceToPath(
  source: string | Buffer,
  frameDir: string,
  timestamp: number
): Promise<{ path: string; cleanup: boolean }> {
  if (Buffer.isBuffer(source)) {
    const p = path.join(frameDir, `pipeline-src-${timestamp}.mp4`);
    fs.writeFileSync(p, source);
    return { path: p, cleanup: true };
  }
  let resolved = source;
  if (!path.isAbsolute(resolved)) {
    resolved = path.join(process.cwd(), resolved);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`videoPipeline: source not found: ${source}`);
  }
  return { path: resolved, cleanup: false };
}

export async function renderVideoPipeline(
  helpers: VideoHelpers,
  layers: VideoPipelineLayer[],
  options: VideoPipelineRenderOptions
): Promise<VideoPipelineRenderResult> {
  const plan = parseLayers(layers);
  const frameDir = path.join(process.cwd(), ".temp-frames");
  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }

  const timestamp = Date.now();
  const temps: string[] = [];
  let passes = 0;

  const { path: sourcePath, cleanup: cleanupSource } = await resolveSourceToPath(
    plan.source,
    frameDir,
    timestamp
  );
  if (cleanupSource) temps.push(sourcePath);

  let currentPath = sourcePath;

  try {
    if (plan.trim && plan.splices.length === 0) {
      const out = path.join(frameDir, `pipeline-trim-${timestamp}.mp4`);
      await helpers.trimVideo(currentPath, {
        startTime: plan.trim.startTime,
        endTime: plan.trim.endTime,
        outputPath: out,
      });
      currentPath = out;
      temps.push(out);
      passes++;
    } else if (plan.splices.length > 0) {
      const splice = plan.splices[0]!;
      const out = path.join(frameDir, `pipeline-struct-${timestamp}.mp4`);
      await renderTrimAndSplicePass(
        helpers,
        currentPath,
        plan.trim,
        splice,
        out,
        frameDir,
        timestamp
      );
      currentPath = out;
      temps.push(out);
      passes++;

      for (let i = 1; i < plan.splices.length; i++) {
        const sp = plan.splices[i]!;
        const next = path.join(frameDir, `pipeline-splice-${timestamp}-${i}.mp4`);
        await helpers.replaceVideoSegment(currentPath, {
          targetStartTime: sp.targetStartTime,
          targetEndTime: sp.targetEndTime,
          replacementVideo: sp.replacementVideo,
          replacementStartTime: sp.replacementStartTime,
          replacementDuration: sp.replacementDuration,
          replacementFrames: sp.replacementFrames,
          replacementFps: sp.replacementFps,
          outputPath: next,
        });
        currentPath = next;
        temps.push(next);
        passes++;
      }
    }

    const hasText = plan.textOverlays.length > 0;
    const hasAudio = plan.audio != null && plan.audio.tracks.length > 0;

    if (hasText) {
      const textOut =
        hasAudio || options.outputPath !== currentPath
          ? path.join(frameDir, `pipeline-text-${timestamp}.mp4`)
          : options.outputPath;

      await helpers.addTextOverlayToVideo(
        currentPath,
        { overlays: plan.textOverlays, outputPath: textOut },
        options.onProgress
      );
      if (textOut !== currentPath) {
        currentPath = textOut;
        temps.push(textOut);
      }
      passes++;
    }

    if (hasAudio) {
      const audioTracks = plan.audio!.tracks;
      const synthResolved = await resolveSynthTracks(audioTracks, frameDir, timestamp);

      const overlays: Array<{
        source: string | Buffer;
        startTime: number;
        duration?: number;
        sourceStart?: number;
        volume?: number;
        speed?: number;
        pitchSemitones?: number;
      }> = [];

      for (const t of audioTracks) {
        if (t.type === "file") {
          overlays.push({
            source: t.source,
            startTime: t.startTime,
            duration: t.duration,
            sourceStart: t.sourceStart,
            volume: t.volume,
            speed: t.speed,
            pitchSemitones: t.pitchSemitones,
          });
        }
      }

      for (const s of synthResolved) {
        overlays.push({
          source: s.path,
          startTime: s.startTime,
          volume: s.volume,
          duration: s.duration,
          sourceStart: s.sourceStart,
        });
        temps.push(s.path);
      }

      await helpers.mixVideoAudio(currentPath, {
        outputPath: options.outputPath,
        overlays,
        keepOriginalAudio: plan.audio!.keepOriginalAudio,
        originalVolume: plan.audio!.originalVolume,
        originalSpeed: plan.audio!.originalSpeed,
        originalPitchSemitones: plan.audio!.originalPitchSemitones,
      });
      passes++;
    } else if (currentPath !== options.outputPath) {
      fs.copyFileSync(currentPath, options.outputPath);
    }

    return { outputPath: options.outputPath, success: true, passes };
  } finally {
    for (const f of temps) {
      if (f !== options.outputPath && fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          /* ignore */
        }
      }
    }
  }
}
