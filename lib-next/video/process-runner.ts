import { spawn } from "child_process";
import { ApexifyProcessError } from "../runtime/errors";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { redactUrl } from "../media/network-policy";

export interface MediaProcessPaths {
  ffmpegPath?: string;
  ffprobePath?: string;
}

export interface MediaProcessRunOptions {
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Receives decoded stderr chunks, e.g. for FFmpeg progress parsing. */
  onStderr?: (chunk: string) => void;
}

export interface MediaProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Compatibility subtype backed by the authoritative Apexify process error hierarchy. */
export class MediaProcessError extends ApexifyProcessError {
  readonly executable: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly outputLimitExceeded: boolean;

  constructor(options: {
    executable: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stderr: string;
    timedOut: boolean;
    aborted: boolean;
    outputLimitExceeded: boolean;
    cause?: unknown;
  }) {
    const reason = options.timedOut
      ? "timed out"
      : options.aborted
        ? "was aborted"
        : options.outputLimitExceeded
          ? "exceeded its output limit"
          : options.exitCode === null
            ? "failed to start"
            : `exited with code ${options.exitCode}`;
    super(`Media process ${reason}.`, {
      cause: options.cause,
      details: {
        executable: options.executable,
        exitCode: options.exitCode,
        signal: options.signal,
        timedOut: options.timedOut,
        aborted: options.aborted,
        outputLimitExceeded: options.outputLimitExceeded,
      },
    });
    this.executable = options.executable;
    this.exitCode = options.exitCode;
    this.signal = options.signal;
    this.stderr = options.stderr;
    this.timedOut = options.timedOut;
    this.aborted = options.aborted;
    this.outputLimitExceeded = options.outputLimitExceeded;
  }
}


function validateProcessToken(value: string, label: string): void {
  if (!value || value.includes("\0")) {
    throw new ApexifyProcessError(`${label} must be a non-empty string without NUL bytes.`);
  }
}

/** Sanitize every URL-like token using the authoritative network redactor. */
function redactProcessText(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => redactUrl(raw));
}

/**
 * The sole FFmpeg/ffprobe process boundary for Apexify.js.
 *
 * Every invocation is an executable plus argv array and always uses `shell: false`.
 * No shell command string is accepted by this API.
 */
export class MediaProcessRunner {
  private ffmpegPath: string;
  private ffprobePath: string;

  constructor(paths: MediaProcessPaths = {}) {
    this.ffmpegPath = paths.ffmpegPath ?? "ffmpeg";
    this.ffprobePath = paths.ffprobePath ?? "ffprobe";
    validateProcessToken(this.ffmpegPath, "ffmpegPath");
    validateProcessToken(this.ffprobePath, "ffprobePath");
  }

  setExecutablePaths(paths: MediaProcessPaths): void {
    if (paths.ffmpegPath !== undefined) {
      validateProcessToken(paths.ffmpegPath, "ffmpegPath");
      this.ffmpegPath = paths.ffmpegPath;
    }
    if (paths.ffprobePath !== undefined) {
      validateProcessToken(paths.ffprobePath, "ffprobePath");
      this.ffprobePath = paths.ffprobePath;
    }
  }

  getExecutablePaths(): Required<MediaProcessPaths> {
    return { ffmpegPath: this.ffmpegPath, ffprobePath: this.ffprobePath };
  }

  runFfmpeg(args: readonly string[], options?: MediaProcessRunOptions): Promise<MediaProcessResult> {
    return this.runExecutable(this.ffmpegPath, args, options);
  }

  runFfprobe(args: readonly string[], options?: MediaProcessRunOptions): Promise<MediaProcessResult> {
    return this.runExecutable(this.ffprobePath, args, options);
  }

  runExecutable(
    executable: string,
    args: readonly string[],
    options: MediaProcessRunOptions = {}
  ): Promise<MediaProcessResult> {
    validateProcessToken(executable, "executable");
    for (const [index, arg] of args.entries()) {
      if (typeof arg !== "string" || arg.includes("\0")) {
        throw new ApexifyProcessError(`process argv[${index}] must be a string without NUL bytes.`);
      }
    }

    const runtime = getDefaultApexifyRuntimeConfig().ffmpeg;
    const timeoutMs = Math.max(1, options.timeoutMs ?? runtime.processTimeoutMs);
    const maxStdoutBytes = Math.max(1, options.maxStdoutBytes ?? runtime.maxStdoutBytes);
    const maxStderrBytes = Math.max(1, options.maxStderrBytes ?? runtime.maxStderrBytes);

    if (options.signal?.aborted) {
      return Promise.reject(
        new MediaProcessError({
          executable,
          exitCode: null,
          signal: null,
          stderr: "",
          timedOut: false,
          aborted: true,
          outputLimitExceeded: false,
          cause: options.signal.reason,
        })
      );
    }

    return new Promise<MediaProcessResult>((resolve, reject) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let timedOut = false;
      let aborted = false;
      let outputLimitExceeded = false;
      let settled = false;
      let spawnError: unknown;

      const child = spawn(executable, [...args], {
        shell: false,
        windowsHide: true,
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const terminate = (): void => {
        if (!child.killed) {
          try {
            child.kill("SIGKILL");
          } catch {
            // Process may already have exited between state check and kill.
          }
        }
      };

      const timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs);
      timer.unref?.();

      const onAbort = (): void => {
        aborted = true;
        terminate();
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });

      const finish = (exitCode: number | null, exitSignal: NodeJS.Signals | null): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);

        const stdout = Buffer.concat(stdoutChunks).toString("utf8");
        const stderr = redactProcessText(Buffer.concat(stderrChunks).toString("utf8"));

        if (
          spawnError !== undefined ||
          timedOut ||
          aborted ||
          outputLimitExceeded ||
          exitCode !== 0
        ) {
          reject(
            new MediaProcessError({
              executable,
              exitCode,
              signal: exitSignal,
              stderr,
              timedOut,
              aborted,
              outputLimitExceeded,
              cause: spawnError,
            })
          );
          return;
        }

        resolve({ stdout, stderr, exitCode: 0 });
      };

      child.stdout.on("data", (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        stdoutBytes += chunk.length;
        if (stdoutBytes > maxStdoutBytes) {
          outputLimitExceeded = true;
          terminate();
          return;
        }
        stdoutChunks.push(chunk);
      });

      child.stderr.on("data", (raw: Buffer | string) => {
        const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
        stderrBytes += chunk.length;
        if (stderrBytes > maxStderrBytes) {
          outputLimitExceeded = true;
          terminate();
          return;
        }
        stderrChunks.push(chunk);
        options.onStderr?.(chunk.toString("utf8"));
      });

      child.once("error", (error) => {
        spawnError = error;
      });
      child.once("close", finish);
    });
  }
}

export interface FfmpegProgress {
  percent: number;
  time: number;
  speed: number;
}

/** Incremental parser for regular FFmpeg stderr progress lines. */
export function createFfmpegProgressParser(
  onProgress?: (progress: FfmpegProgress) => void
): (chunk: string) => void {
  if (!onProgress) return () => {};

  let tail = "";
  let durationSeconds: number | undefined;
  return (chunk: string) => {
    tail = (tail + chunk).slice(-16_384);

    const durationMatches = [...tail.matchAll(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    const durationMatch = durationMatches[durationMatches.length - 1];
    if (durationMatch) {
      durationSeconds =
        Number(durationMatch[1]) * 3600 +
        Number(durationMatch[2]) * 60 +
        Number(durationMatch[3]);
    }

    const timeMatches = [...tail.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    const timeMatch = timeMatches[timeMatches.length - 1];
    if (!timeMatch) return;

    const currentTime =
      Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
    const speedMatches = [...tail.matchAll(/speed=\s*([\d.]+)x/g)];
    const speedMatch = speedMatches[speedMatches.length - 1];
    const speed = speedMatch ? Number(speedMatch[1]) : 1;
    const percent = durationSeconds && durationSeconds > 0
      ? Math.min(100, (currentTime / durationSeconds) * 100)
      : 0;

    onProgress({ percent, time: currentTime, speed: Number.isFinite(speed) ? speed : 1 });
  };
}
