import { promises as fs } from "node:fs";
import { ApexifyInputError, ApexifyProcessError } from "../../runtime/errors";
import type { VideoSource } from "../video-options";
import { VideoOperationRuntime, type VideoRunControls } from "./runtime";
import { TranscodeOperations } from "./transcode";
import { finiteNumber, nonNegativeNumber, positiveNumber } from "./filter-graph";

export class AdvancedVideoOperations {
  private readonly transcode: TranscodeOperations;

  constructor(private readonly runtime: VideoOperationRuntime) {
    this.transcode = new TranscodeOperations(runtime);
  }

  async loop(source: VideoSource, options: { outputPath: string; smooth?: boolean }, controls: VideoRunControls = {}) {
    if (options.smooth) {
      throw new ApexifyInputError("createLoop.smooth was historically ignored and is not supported; use an explicit transition pipeline for a blended loop.");
    }
    return this.runtime.withWorkspace("apexify-loop-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const graph: string[] = [
        "[0:v:0]split=2[v0][v1]",
        "[v0]setpts=PTS-STARTPTS[a]",
        "[v1]setpts=PTS-STARTPTS[b]",
        "[a][b]concat=n=2:v=1:a=0[vout]",
      ];
      const args: string[] = ["-i", videoPath];
      if (info.audio) {
        graph.push("[0:a:0]asplit=2[a0][a1]", "[a0]asetpts=PTS-STARTPTS[aa]", "[a1]asetpts=PTS-STARTPTS[ab]", "[aa][ab]concat=n=2:v=0:a=1[aout]");
      }
      args.push("-filter_complex", graph.join(";"), "-map", "[vout]");
      if (info.audio) args.push("-map", "[aout]", "-c:a", "aac"); else args.push("-an");
      args.push("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration * 2);
      return { outputPath: options.outputPath, success: true, duration: info.duration * 2 } as const;
    });
  }

  async detectScenes(source: VideoSource, options: { threshold?: number; outputPath?: string }, controls: VideoRunControls = {}) {
    const threshold = finiteNumber(options.threshold ?? 0.3, "scene threshold");
    if (threshold < 0 || threshold > 1) throw new ApexifyInputError("scene threshold must be between 0 and 1.");
    return this.runtime.withWorkspace("apexify-scenes-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const { stderr } = await this.runtime.runFfmpeg([
        "-i", videoPath,
        "-vf", `select=gt(scene\\,${threshold}),showinfo`,
        "-an", "-f", "null", "-",
      ], controls, info.duration);
      const times: number[] = [];
      for (const match of stderr.matchAll(/pts_time:([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)/gi)) {
        const time = Number(match[1]);
        if (Number.isFinite(time) && time >= 0 && time <= info.duration + 0.001) times.push(time);
      }
      const scenes = times.map((time, index) => ({ time, scene: index + 1 }));
      if (options.outputPath) {
        if (controls.overwrite === false) {
          try {
            await fs.access(options.outputPath);
            throw new ApexifyInputError(`Output already exists and overwrite=false: ${options.outputPath}`);
          } catch (error) {
            if (error instanceof ApexifyInputError) throw error;
          }
        }
        await fs.writeFile(options.outputPath, `${JSON.stringify(scenes, null, 2)}\n`, "utf8");
      }
      return scenes;
    });
  }

  async stabilize(source: VideoSource, options: { outputPath: string; smoothing?: number }, controls: VideoRunControls = {}) {
    const smoothing = nonNegativeNumber(options.smoothing ?? 10, "stabilization smoothing");
    return this.runtime.withWorkspace("apexify-stabilize-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      const transforms = "transforms.trf";
      try {
        await this.runtime.runFfmpeg([
          "-i", videoPath,
          "-vf", `vidstabdetect=shakiness=5:accuracy=15:result=${transforms}`,
          "-an", "-f", "null", "-",
        ], controls, info.duration, workspace.directory);
        const args = [
          "-i", videoPath,
          "-vf", `vidstabtransform=smoothing=${smoothing}:input=${transforms}`,
          "-map", "0:v:0",
          ...(info.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]),
          "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
          ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false),
        ];
        await this.runtime.runFfmpeg(args, controls, info.duration, workspace.directory);
      } catch (cause) {
        throw new ApexifyProcessError("Video stabilization requires FFmpeg vidstabdetect and vidstabtransform support.", { cause });
      }
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async freezeFrame(source: VideoSource, options: { time: number; duration: number; outputPath: string }, controls: VideoRunControls = {}) {
    const time = nonNegativeNumber(options.time, "freeze time");
    const freezeDuration = positiveNumber(options.duration, "freeze duration");
    return this.runtime.withWorkspace("apexify-freeze-", async (workspace) => {
      const { videoPath } = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(videoPath, controls);
      if (time > info.duration) throw new ApexifyInputError("freeze time is outside source duration.");
      const graph: string[] = [];
      const vLabels: string[] = [];
      const aLabels: string[] = [];
      if (time > 0) {
        graph.push(`[0:v]trim=start=0:end=${time},setpts=PTS-STARTPTS[vpre]`);
        vLabels.push("[vpre]");
        if (info.audio) {
          graph.push(`[0:a]atrim=start=0:end=${time},asetpts=PTS-STARTPTS[apre]`);
          aLabels.push("[apre]");
        }
      }
      graph.push(`[0:v]trim=start=${time}:end=${Math.min(info.duration, time + 0.05)},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=${freezeDuration},trim=duration=${freezeDuration}[vfreeze]`);
      vLabels.push("[vfreeze]");
      if (info.audio) {
        graph.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${freezeDuration},asetpts=PTS-STARTPTS[afreeze]`);
        aLabels.push("[afreeze]");
      }
      const postDuration = info.duration - time;
      if (postDuration > 0.001) {
        graph.push(`[0:v]trim=start=${time}:duration=${postDuration},setpts=PTS-STARTPTS[vpost]`);
        vLabels.push("[vpost]");
        if (info.audio) {
          graph.push(`[0:a]atrim=start=${time}:duration=${postDuration},asetpts=PTS-STARTPTS[apost]`);
          aLabels.push("[apost]");
        }
      }
      if (info.audio) {
        graph.push(`${vLabels.map((v, i) => `${v}${aLabels[i]}`).join("")}concat=n=${vLabels.length}:v=1:a=1[vout][aout]`);
      } else {
        graph.push(`${vLabels.join("")}concat=n=${vLabels.length}:v=1:a=0[vout]`);
      }
      const args = ["-i", videoPath, "-filter_complex", graph.join(";"), "-map", "[vout]"];
      if (info.audio) args.push("-map", "[aout]", "-c:a", "aac"); else args.push("-an");
      args.push("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      await this.runtime.runFfmpeg(args, controls, info.duration + freezeDuration);
      return { outputPath: options.outputPath, success: true, expectedDuration: info.duration + freezeDuration } as const;
    });
  }

  async exportPreset(source: VideoSource, options: { preset: "youtube" | "instagram" | "tiktok" | "twitter" | "facebook" | "4k" | "1080p" | "720p" | "mobile" | "web"; outputPath: string }, controls: VideoRunControls = {}) {
    const presets = {
      youtube: { width: 1920, height: 1080, fps: 30, bitrate: 8000, format: "mp4" as const },
      instagram: { width: 1080, height: 1080, fps: 30, bitrate: 3500, format: "mp4" as const },
      tiktok: { width: 1080, height: 1920, fps: 30, bitrate: 4000, format: "mp4" as const },
      twitter: { width: 1280, height: 720, fps: 30, bitrate: 5000, format: "mp4" as const },
      facebook: { width: 1280, height: 720, fps: 30, bitrate: 4000, format: "mp4" as const },
      "4k": { width: 3840, height: 2160, fps: 30, bitrate: 50000, format: "mp4" as const },
      "1080p": { width: 1920, height: 1080, fps: 30, bitrate: 8000, format: "mp4" as const },
      "720p": { width: 1280, height: 720, fps: 30, bitrate: 5000, format: "mp4" as const },
      mobile: { width: 720, height: 1280, fps: 30, bitrate: 2500, format: "mp4" as const },
      web: { width: 1280, height: 720, fps: 30, bitrate: 3000, format: "webm" as const },
    } as const;
    const preset = presets[options.preset];
    return this.transcode.convert(source, {
      outputPath: options.outputPath,
      format: preset.format,
      quality: "high",
      bitrate: preset.bitrate,
      fps: preset.fps,
      resolution: { width: preset.width, height: preset.height, fit: "contain" },
    }, controls);
  }

  async applyLUT(source: VideoSource, options: { lutPath: string; intensity?: number; outputPath: string }, controls: VideoRunControls = {}) {
    const intensity = finiteNumber(options.intensity ?? 1, "LUT intensity");
    if (intensity < 0 || intensity > 1) throw new ApexifyInputError("LUT intensity must be between 0 and 1.");
    if (intensity !== 1) throw new ApexifyInputError("Partial LUT intensity was historically ignored and is intentionally unsupported; use intensity=1 or a pipeline blend.");
    return this.runtime.withWorkspace("apexify-lut-", async (workspace) => {
      const video = await this.runtime.resolve(source, workspace, "input", controls);
      const info = await this.runtime.probeFile(video.videoPath, controls);
      const lutSource = await fs.readFile(options.lutPath);
      const lutPath = await workspace.writeFile("lut.cube", lutSource);
      void lutPath;
      const args = [
        "-i", video.videoPath,
        "-vf", "lut3d=filename=lut.cube",
        "-map", "0:v:0",
        ...(info.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]),
        "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
        ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false),
      ];
      await this.runtime.runFfmpeg(args, controls, info.duration, workspace.directory);
      return { outputPath: options.outputPath, success: true } as const;
    });
  }

  async transition(source: VideoSource, options: { type: "fade" | "wipe" | "slide" | "zoom" | "rotate" | "dissolve" | "blur" | "circle" | "pixelize"; duration: number; direction?: "left" | "right" | "up" | "down" | "in" | "out"; secondVideo?: VideoSource; outputPath: string }, controls: VideoRunControls = {}) {
    const duration = positiveNumber(options.duration, "transition duration");
    return this.runtime.withWorkspace("apexify-transition-", async (workspace) => {
      const first = await this.runtime.resolve(source, workspace, "first", controls);
      const firstInfo = await this.runtime.probeFile(first.videoPath, controls);
      if (!options.secondVideo) {
        if (options.type !== "fade") throw new ApexifyInputError("A second video is required for non-fade transitions.");
        if (duration > firstInfo.duration) throw new ApexifyInputError("transition duration exceeds source duration.");
        const fade = options.direction === "out" ? `fade=t=out:st=${firstInfo.duration - duration}:d=${duration}` : `fade=t=in:st=0:d=${duration}`;
        const args = ["-i", first.videoPath, "-vf", fade, "-map", "0:v:0", ...(firstInfo.audio ? ["-map", "0:a?", "-c:a", "copy"] : ["-an"]), "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false)];
        await this.runtime.runFfmpeg(args, controls, firstInfo.duration);
        return { outputPath: options.outputPath, success: true } as const;
      }
      const second = await this.runtime.resolve(options.secondVideo, workspace, "second", controls);
      const secondInfo = await this.runtime.probeFile(second.videoPath, controls);
      if (duration > firstInfo.duration || duration > secondInfo.duration) throw new ApexifyInputError("transition duration must fit inside both videos.");
      const transitionMap: Record<string, string> = {
        fade: "fade", wipe: "wipeleft", slide: "slideleft", zoom: "zoomin", rotate: "radial", dissolve: "dissolve", blur: "fadeblack", circle: "circleopen", pixelize: "pixelize",
      };
      const directional: Record<string, Record<string, string>> = {
        wipe: { left: "wipeleft", right: "wiperight", up: "wipeup", down: "wipedown" },
        slide: { left: "slideleft", right: "slideright", up: "slideup", down: "slidedown" },
        zoom: { in: "zoomin", out: "zoomout" },
        circle: { in: "circleopen", out: "circleclose" },
      };
      const transition = options.direction ? (directional[options.type]?.[options.direction] ?? transitionMap[options.type]) : transitionMap[options.type];
      const width = Math.max(firstInfo.width, secondInfo.width);
      const height = Math.max(firstInfo.height, secondInfo.height);
      const fps = Math.max(firstInfo.fps, secondInfo.fps);
      const offset = firstInfo.duration - duration;
      const graph: string[] = [
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1[v0]`,
        `[1:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1[v1]`,
        `[v0][v1]xfade=transition=${transition}:duration=${duration}:offset=${offset}[vout]`,
      ];
      const hasAudio = firstInfo.audio || secondInfo.audio;
      if (hasAudio) {
        if (firstInfo.audio) graph.push("[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]");
        else graph.push(`anullsrc=r=48000:cl=stereo:d=${firstInfo.duration}[a0]`);
        if (secondInfo.audio) graph.push("[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a1]");
        else graph.push(`anullsrc=r=48000:cl=stereo:d=${secondInfo.duration}[a1]`);
        graph.push(`[a0][a1]acrossfade=d=${duration}:c1=tri:c2=tri[aout]`);
      }
      const args = ["-i", first.videoPath, "-i", second.videoPath, "-filter_complex", graph.join(";"), "-map", "[vout]"];
      if (hasAudio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k"); else args.push("-an");
      args.push("-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", ...this.runtime.outputArgs(options.outputPath, controls.overwrite !== false));
      const expected = firstInfo.duration + secondInfo.duration - duration;
      await this.runtime.runFfmpeg(args, controls, expected);
      return { outputPath: options.outputPath, success: true, expectedDuration: expected } as const;
    });
  }
}
