import { ApexifyInputError } from "../../runtime/errors";
import type { VideoSource } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { FrameOperations } from "./frames";
import { buildAtempoChain, nonNegativeNumber, positiveNumber } from "./filter-graph";

function videoNormalize(label: string, width: number, height: number, fps: number): string {
  return `${label}scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1,format=yuv420p`;
}

function audioSegment(input: string | undefined, start: number, duration: number): string {
  if (!input) return `anullsrc=r=48000:cl=stereo,atrim=duration=${duration},asetpts=PTS-STARTPTS`;
  return `${input}atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo`;
}

export class StructureOperations {
  private readonly frames: FrameOperations;

  constructor(private readonly runtime: VideoOperationRuntime) {
    this.frames = new FrameOperations(runtime);
  }

  async replaceSegment(
    source: VideoSource,
    options: {
      replacementVideo?: VideoSource;
      replacementStartTime?: number;
      replacementDuration?: number;
      replacementFrames?: VideoSource[];
      replacementFps?: number;
      targetStartTime: number;
      targetEndTime: number;
      durationPolicy?: "fit" | "trim" | "preserve";
      outputPath: string;
    },
    controls: VideoRunControls = {}
  ) {
    const replacementModes = Number(options.replacementVideo !== undefined) + Number(options.replacementFrames !== undefined);
    if (replacementModes !== 1) throw new ApexifyInputError("replaceSegment requires exactly one replacementVideo or replacementFrames.");
    const targetStart = nonNegativeNumber(options.targetStartTime, "replace targetStartTime");
    const targetEnd = positiveNumber(options.targetEndTime, "replace targetEndTime");
    if (targetEnd <= targetStart) throw new ApexifyInputError("replace targetEndTime must be greater than targetStartTime.");
    const replacementStart = nonNegativeNumber(options.replacementStartTime ?? 0, "replace replacementStartTime");
    const policy = options.durationPolicy ?? "fit";

    return this.runtime.withWorkspace("apexify-replace-", async (workspace) => {
      const { videoPath: mainPath } = await this.runtime.resolve(source, workspace, "main", controls);
      const main = await this.runtime.probeFile(mainPath, controls);
      if (targetEnd > main.duration + 0.001) throw new ApexifyInputError("replace target range exceeds source duration.");
      const targetDuration = targetEnd - targetStart;

      let replacementPath: string;
      if (options.replacementVideo !== undefined) {
        replacementPath = (await this.runtime.resolve(options.replacementVideo, workspace, "replacement", controls)).videoPath;
      } else {
        replacementPath = workspace.path("replacement-frames.mp4");
        await this.frames.createFromFrames({
          frames: options.replacementFrames!,
          outputPath: replacementPath,
          fps: options.replacementFps ?? main.fps,
          format: "mp4",
          quality: "high",
          resolution: { width: main.width, height: main.height, fit: "contain" },
        }, { ...controls, overwrite: true });
      }
      const replacement = await this.runtime.probeFile(replacementPath, controls);
      if (replacementStart >= replacement.duration) throw new ApexifyInputError("replacementStartTime is outside replacement duration.");
      const available = replacement.duration - replacementStart;
      const selectedDuration = Math.min(options.replacementDuration ?? available, available);
      positiveNumber(selectedDuration, "replace selected replacement duration");

      const replacementOutputDuration = policy === "preserve" ? selectedDuration : targetDuration;
      const hasAudio = main.audio || replacement.audio;
      const filter: string[] = [];
      const videoLabels: string[] = [];
      const audioLabels: string[] = [];

      if (targetStart > 0) {
        filter.push(`${videoNormalize("[0:v]", main.width, main.height, main.fps)},trim=start=0:duration=${targetStart},setpts=PTS-STARTPTS[vpre]`);
        videoLabels.push("[vpre]");
        if (hasAudio) {
          filter.push(`${audioSegment(main.audio ? "[0:a]" : undefined, 0, targetStart)}[apre]`);
          audioLabels.push("[apre]");
        }
      }

      let replacementVideoChain = `${videoNormalize("[1:v]", main.width, main.height, main.fps)},trim=start=${replacementStart}:duration=${selectedDuration},setpts=PTS-STARTPTS`;
      let replacementAudioChain = audioSegment(replacement.audio ? "[1:a]" : undefined, replacementStart, selectedDuration);
      if (policy === "fit") {
        const videoRatio = targetDuration / selectedDuration;
        const tempo = selectedDuration / targetDuration;
        replacementVideoChain += `,setpts=${videoRatio}*PTS,trim=duration=${targetDuration},setpts=PTS-STARTPTS`;
        replacementAudioChain += `,${buildAtempoChain(tempo)},atrim=duration=${targetDuration},apad=pad_dur=${targetDuration},atrim=duration=${targetDuration},asetpts=PTS-STARTPTS`;
      } else if (policy === "trim") {
        replacementVideoChain += `,tpad=stop_mode=clone:stop_duration=${targetDuration},trim=duration=${targetDuration},setpts=PTS-STARTPTS`;
        replacementAudioChain += `,apad=pad_dur=${targetDuration},atrim=duration=${targetDuration},asetpts=PTS-STARTPTS`;
      }
      filter.push(`${replacementVideoChain}[vrep]`);
      videoLabels.push("[vrep]");
      if (hasAudio) {
        filter.push(`${replacementAudioChain}[arep]`);
        audioLabels.push("[arep]");
      }

      const postDuration = main.duration - targetEnd;
      if (postDuration > 0.001) {
        filter.push(`${videoNormalize("[0:v]", main.width, main.height, main.fps)},trim=start=${targetEnd}:duration=${postDuration},setpts=PTS-STARTPTS[vpost]`);
        videoLabels.push("[vpost]");
        if (hasAudio) {
          filter.push(`${audioSegment(main.audio ? "[0:a]" : undefined, targetEnd, postDuration)}[apost]`);
          audioLabels.push("[apost]");
        }
      }

      const segmentCount = videoLabels.length;
      if (hasAudio) {
        const concatInputs = videoLabels.map((video, index) => `${video}${audioLabels[index]}`).join("");
        filter.push(`${concatInputs}concat=n=${segmentCount}:v=1:a=1[outv][outa]`);
      } else {
        filter.push(`${videoLabels.join("")}concat=n=${segmentCount}:v=1:a=0[outv]`);
      }

      const args = ["-i", mainPath, "-i", replacementPath, "-filter_complex", filter.join(";"), "-map", "[outv]"];
      if (hasAudio) args.push("-map", "[outa]", "-c:a", "aac", "-b:a", "192k");
      args.push("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart");
      args.push(...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      const outputDuration = main.duration - targetDuration + replacementOutputDuration;
      await this.runtime.runFfmpeg(args, controls, outputDuration);
      return {
        outputPath: options.outputPath,
        success: true,
        durationPolicy: policy,
        expectedDuration: outputDuration,
      } as const;
    });
  }
}
