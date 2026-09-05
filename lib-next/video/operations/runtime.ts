import type { FfmpegSession } from "../ffmpeg-session";
import { createFfmpegProgressParser, type FfmpegProgress } from "../process-runner";
import { resolveVideoInputToPath } from "../video-input-resolve";
import { withTempWorkspace, type TempWorkspace } from "../temp-workspace";
import { ffprobeVideoFile } from "../ffprobe-metadata";
import { ApexifyInputError } from "../../runtime/errors";

export interface VideoRunControls {
  signal?: AbortSignal;
  timeoutMs?: number;
  overwrite?: boolean;
  onProgress?: (progress: FfmpegProgress) => void;
}

function validateControls(controls: VideoRunControls): void {
  if (controls.timeoutMs !== undefined && (!Number.isFinite(controls.timeoutMs) || controls.timeoutMs <= 0)) {
    throw new ApexifyInputError("video timeoutMs must be a finite positive number.");
  }
  if (controls.overwrite !== undefined && typeof controls.overwrite !== "boolean") {
    throw new ApexifyInputError("video overwrite must be a boolean.");
  }
  if (controls.onProgress !== undefined && typeof controls.onProgress !== "function") {
    throw new ApexifyInputError("video onProgress must be a function.");
  }
  if (controls.signal !== undefined) {
    const signal = controls.signal as unknown as { aborted?: unknown; addEventListener?: unknown; removeEventListener?: unknown };
    if (typeof signal !== "object" || signal === null || typeof signal.aborted !== "boolean" || typeof signal.addEventListener !== "function" || typeof signal.removeEventListener !== "function") {
      throw new ApexifyInputError("video signal must be an AbortSignal.");
    }
  }
}

/** Shared execution context used by cohesive video operation modules. */
export class VideoOperationRuntime {
  constructor(readonly session: FfmpegSession) {}

  withWorkspace<T>(prefix: string, work: (workspace: TempWorkspace) => Promise<T>): Promise<T> {
    return withTempWorkspace({ ...this.session.workspaceOptions, prefix }, work);
  }

  resolve(source: string | Buffer, workspace: TempWorkspace, basename: string, controls: Pick<VideoRunControls, "signal"> = {}) {
    validateControls(controls);
    return resolveVideoInputToPath(source, workspace, basename, { signal: controls.signal });
  }

  probeFile(path: string, controls: Pick<VideoRunControls, "signal"> = {}) {
    validateControls(controls);
    return ffprobeVideoFile(path, this.session, true, controls.signal);
  }

  outputArgs(outputPath: string, overwrite = true): string[] {
    if (typeof outputPath !== "string" || outputPath.trim().length === 0 || outputPath.includes("\0")) {
      throw new ApexifyInputError("video outputPath must be a non-empty path without NUL bytes.");
    }
    return [overwrite ? "-y" : "-n", outputPath];
  }

  runFfmpeg(args: readonly string[], controls: VideoRunControls = {}, expectedDuration?: number, cwd?: string) {
    validateControls(controls);
    const progress = controls.onProgress;
    const progressArgs = progress ? ["-progress", "pipe:2", "-nostats"] : [];
    return this.session.runFfmpeg(["-hide_banner", "-nostdin", ...progressArgs, ...args], {
      cwd,
      timeoutMs: controls.timeoutMs,
      signal: controls.signal,
      onStderr: progress ? createFfmpegProgressParser(progress, expectedDuration) : undefined,
    });
  }
}
