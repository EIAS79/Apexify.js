import { spawn } from "node:child_process";
import { ApexifyProcessError } from "../runtime/errors";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";
import { emitDiagnostic } from "../runtime/diagnostics";
import { redactUrlsInText } from "../media/network-policy";

export interface MediaProcessPaths {
  ffmpegPath?: string;
  ffprobePath?: string;
}

export interface MediaProcessRunOptions {
  timeoutMs?: number;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  /** Grace period before SIGKILL after timeout/abort. */
  killGraceMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  /** Receives decoded stderr chunks. Callback errors are isolated and reported diagnostically. */
  onStderr?: (chunk: string) => void;
}

export interface MediaProcessResult {
  stdout: string;
  /** Bounded tail of stderr. */
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
          ? "exceeded its stdout limit"
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

function appendBoundedTail(chunks: Buffer[], currentBytes: number, raw: Buffer, maximum: number): number {
  if (raw.length >= maximum) {
    chunks.length = 0;
    chunks.push(raw.subarray(raw.length - maximum));
    return maximum;
  }
  chunks.push(raw);
  currentBytes += raw.length;
  while (currentBytes > maximum && chunks.length > 0) {
    const first = chunks[0]!;
    const excess = currentBytes - maximum;
    if (first.length <= excess) {
      chunks.shift();
      currentBytes -= first.length;
    } else {
      chunks[0] = first.subarray(excess);
      currentBytes -= excess;
    }
  }
  return currentBytes;
}

/**
 * Sole FFmpeg/ffprobe child-process boundary.
 * Invocations are argv-only with `shell:false`; stdout is bounded strictly while stderr keeps a bounded tail.
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

  runExecutable(executable: string, args: readonly string[], options: MediaProcessRunOptions = {}): Promise<MediaProcessResult> {
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
    const killGraceMs = Math.max(50, options.killGraceMs ?? 2_000);

    if (options.signal?.aborted) {
      return Promise.reject(new MediaProcessError({
        executable,
        exitCode: null,
        signal: null,
        stderr: "",
        timedOut: false,
        aborted: true,
        outputLimitExceeded: false,
        cause: options.signal.reason,
      }));
    }

    return new Promise<MediaProcessResult>((resolve, reject) => {
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdoutChunks: Buffer[] = [];
      const stderrTail: Buffer[] = [];
      let timedOut = false;
      let aborted = false;
      let outputLimitExceeded = false;
      let settled = false;
      let spawnError: unknown;
      let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

      const child = spawn(executable, [...args], {
        shell: false,
        windowsHide: true,
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const forceKill = (): void => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        try { child.kill("SIGKILL"); } catch { /* already exited */ }
      };

      const terminate = (): void => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        try { child.kill("SIGTERM"); } catch { /* already exited */ }
        if (!forceKillTimer) {
          forceKillTimer = setTimeout(forceKill, killGraceMs);
          forceKillTimer.unref?.();
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
        if (forceKillTimer) clearTimeout(forceKillTimer);
        options.signal?.removeEventListener("abort", onAbort);

        const stdout = Buffer.concat(stdoutChunks, stdoutBytes).toString("utf8");
        const stderr = redactUrlsInText(Buffer.concat(stderrTail, stderrBytes).toString("utf8"));
        if (spawnError !== undefined || timedOut || aborted || outputLimitExceeded || exitCode !== 0) {
          reject(new MediaProcessError({
            executable,
            exitCode,
            signal: exitSignal,
            stderr,
            timedOut,
            aborted,
            outputLimitExceeded,
            cause: spawnError,
          }));
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
        stderrBytes = appendBoundedTail(stderrTail, stderrBytes, chunk, maxStderrBytes);
        if (options.onStderr) {
          try {
            options.onStderr(chunk.toString("utf8"));
          } catch (cause) {
            emitDiagnostic({
              level: "warn",
              code: "FFMPEG_PROGRESS_CALLBACK_ERROR",
              message: "A media-process stderr/progress callback threw and was isolated.",
              details: { cause: cause instanceof Error ? cause.message : String(cause) },
            });
          }
        }
      });

      child.once("error", (error) => { spawnError = error; });
      child.once("close", finish);
    });
  }
}

export interface FfmpegProgress {
  percent: number;
  time: number;
  speed: number;
}

/**
 * Parser for FFmpeg machine progress (`-progress pipe:2 -nostats`).
 * `durationSeconds` is optional; when unknown percent remains 0 while time/speed still advance.
 */
export function createFfmpegProgressParser(
  onProgress?: (progress: FfmpegProgress) => void,
  durationSeconds?: number
): (chunk: string) => void {
  if (!onProgress) return () => {};
  let tail = "";
  let time = 0;
  let speed = 1;

  const emit = (): void => {
    const percent = durationSeconds && durationSeconds > 0
      ? Math.max(0, Math.min(100, (time / durationSeconds) * 100))
      : 0;
    onProgress({ percent, time, speed: Number.isFinite(speed) ? speed : 1 });
  };

  return (chunk: string) => {
    tail += chunk;
    const lines = tail.split(/\r?\n/);
    tail = lines.pop() ?? "";
    for (const line of lines) {
      const index = line.indexOf("=");
      if (index <= 0) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key === "out_time_us") {
        const micros = Number(value);
        if (Number.isFinite(micros) && micros >= 0) time = micros / 1_000_000;
      } else if (key === "out_time_ms") {
        const micros = Number(value);
        if (Number.isFinite(micros) && micros >= 0) time = micros / 1_000_000;
      } else if (key === "speed") {
        const parsed = Number(value.replace(/x$/i, ""));
        if (Number.isFinite(parsed) && parsed >= 0) speed = parsed;
      } else if (key === "progress") {
        if (value === "end" && durationSeconds && durationSeconds > 0) time = durationSeconds;
        emit();
      }
    }
  };
}
