import path from "node:path";
import { MediaProcessRunner, type MediaProcessRunOptions } from "./process-runner";
import type { TempWorkspaceOptions } from "./temp-workspace";
import { getDefaultApexifyRuntimeConfig } from "../runtime/config";

function buildFfmpegInstallGuide(): string {
  const os = process.platform;
  let instructions = "\n\nFFMPEG INSTALLATION GUIDE\n";
  instructions += "=".repeat(50) + "\n\n";

  if (os === "win32") {
    instructions += "WINDOWS:\n";
    instructions += "  choco install ffmpeg\n";
    instructions += "  or: winget install ffmpeg\n";
    instructions += "  Official downloads: https://ffmpeg.org/download.html\n";
  } else if (os === "darwin") {
    instructions += "macOS:\n";
    instructions += "  brew install ffmpeg\n";
    instructions += "  Official downloads: https://ffmpeg.org/download.html\n";
  } else {
    instructions += "LINUX:\n";
    instructions += "  Debian/Ubuntu: sudo apt-get install ffmpeg\n";
    instructions += "  Fedora: sudo dnf install ffmpeg\n";
    instructions += "  Arch: sudo pacman -S ffmpeg\n";
    instructions += "  Official downloads: https://ffmpeg.org/download.html\n";
  }

  instructions += "\nConfigure custom binaries with configureApexifyRuntime({ ffmpeg: ... }) or APEXIFY_FFMPEG_PATH/APEXIFY_FFPROBE_PATH.\n";
  return instructions;
}

export interface FfmpegSessionOptions {
  ffmpegPath?: string;
  ffprobePath?: string;
  tempDirectory?: string;
  retainTempFiles?: boolean;
}

export interface FfmpegSession {
  readonly runner: MediaProcessRunner;
  readonly workspaceOptions: TempWorkspaceOptions;
  getInstallInstructions(): string;
  getAvailabilityError(): unknown;
  checkAvailable(): Promise<boolean>;
  runFfmpeg(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfmpeg"]>;
  runFfprobe(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfprobe"]>;
}

function executablePathValue(): string | undefined {
  return process.env.PATH ?? process.env.Path ?? process.env.path;
}

function executableFileName(executable: string): string {
  if (process.platform === "win32" && !/\.exe$/i.test(executable)) return `${executable}.exe`;
  return executable;
}

/**
 * Produce absolute executable candidates from the current process PATH.
 * Existence is deliberately not checked synchronously: checkAvailable() probes
 * candidates through MediaProcessRunner, preserving Apexify's no-sync-I/O runtime policy.
 */
export function executableCandidatesFromPath(executable: string, pathValue = executablePathValue()): string[] {
  if (!pathValue) return [];
  const fileName = executableFileName(executable);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const rawEntry of pathValue.split(path.delimiter)) {
    const trimmed = rawEntry.trim();
    const directory = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed;
    if (!directory) continue;
    const candidate = path.resolve(directory, fileName);
    const key = process.platform === "win32" ? candidate.toLowerCase() : candidate;
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

function pathExecutablePairs(pathValue = executablePathValue()): Array<{ ffmpegPath: string; ffprobePath: string }> {
  const ffmpegCandidates = executableCandidatesFromPath("ffmpeg", pathValue);
  const ffprobeCandidates = executableCandidatesFromPath("ffprobe", pathValue);
  const count = Math.min(ffmpegCandidates.length, ffprobeCandidates.length);
  const pairs: Array<{ ffmpegPath: string; ffprobePath: string }> = [];
  for (let index = 0; index < count; index++) {
    pairs.push({ ffmpegPath: ffmpegCandidates[index]!, ffprobePath: ffprobeCandidates[index]! });
  }
  return pairs;
}

function commonFfmpegPaths(): string[] {
  return process.platform === "win32"
    ? [
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
      ]
    : ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/opt/local/bin/ffmpeg"];
}

function pairedFfprobePath(ffmpegPath: string): string {
  if (process.platform === "win32") {
    return ffmpegPath.replace(/ffmpeg\.exe$/i, "ffprobe.exe");
  }
  return ffmpegPath.replace(/ffmpeg$/i, "ffprobe");
}

/**
 * Shared FFmpeg/ffprobe session. All child processes flow through MediaProcessRunner,
 * which only accepts argv arrays and always uses shell:false.
 */
export function createFfmpegSession(options: FfmpegSessionOptions = {}): FfmpegSession {
  const runtime = getDefaultApexifyRuntimeConfig();
  const explicitFfmpeg = options.ffmpegPath ?? runtime.ffmpeg.ffmpegPath ?? process.env.APEXIFY_FFMPEG_PATH;
  const explicitFfprobe = options.ffprobePath ?? runtime.ffmpeg.ffprobePath ?? process.env.APEXIFY_FFPROBE_PATH;
  const runner = new MediaProcessRunner({
    ffmpegPath: explicitFfmpeg ?? "ffmpeg",
    ffprobePath: explicitFfprobe ?? "ffprobe",
  });
  const initialExecutablePaths = runner.getExecutablePaths();
  const workspaceOptions: TempWorkspaceOptions = {
    rootDirectory: options.tempDirectory ?? runtime.temp.rootDirectory ?? process.env.APEXIFY_TEMP_DIR,
    retain: options.retainTempFiles ?? runtime.temp.retainFiles,
  };

  const defaultProcessOptions = (): Pick<MediaProcessRunOptions, "timeoutMs" | "maxStdoutBytes" | "maxStderrBytes"> => {
    const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
    return {
      timeoutMs: ffmpeg.processTimeoutMs,
      maxStdoutBytes: ffmpeg.maxStdoutBytes,
      maxStderrBytes: ffmpeg.maxStderrBytes,
    };
  };

  let checked = false;
  let available = false;
  let availabilityError: unknown;

  async function probePair(): Promise<boolean> {
    const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
    try {
      await runner.runFfmpeg(["-version"], {
        timeoutMs: ffmpeg.probeTimeoutMs,
        maxStdoutBytes: Math.min(ffmpeg.maxStdoutBytes, 1024 * 1024),
        maxStderrBytes: Math.min(ffmpeg.maxStderrBytes, 1024 * 1024),
      });
      await runner.runFfprobe(["-version"], {
        timeoutMs: ffmpeg.probeTimeoutMs,
        maxStdoutBytes: Math.min(ffmpeg.maxStdoutBytes, 1024 * 1024),
        maxStderrBytes: Math.min(ffmpeg.maxStderrBytes, 1024 * 1024),
      });
      availabilityError = undefined;
      return true;
    } catch (error) {
      availabilityError = error;
      return false;
    }
  }

  return {
    runner,
    workspaceOptions,
    getInstallInstructions: () => buildFfmpegInstallGuide(),
    getAvailabilityError: () => availabilityError,
    runFfmpeg: (args, runOptions) => runner.runFfmpeg(args, { ...defaultProcessOptions(), ...runOptions }),
    runFfprobe: (args, runOptions) => runner.runFfprobe(args, { ...defaultProcessOptions(), ...runOptions }),

    async checkAvailable(): Promise<boolean> {
      if (checked) return available;

      if (await probePair()) {
        available = true;
        checked = true;
        return true;
      }

      // Only auto-discover when the caller did not explicitly configure executables.
      if (!explicitFfmpeg && !explicitFfprobe) {
        for (const executablePaths of pathExecutablePairs()) {
          runner.setExecutablePaths(executablePaths);
          if (await probePair()) {
            available = true;
            checked = true;
            return true;
          }
        }
        for (const ffmpegPath of commonFfmpegPaths()) {
          const ffprobePath = pairedFfprobePath(ffmpegPath);
          runner.setExecutablePaths({ ffmpegPath, ffprobePath });
          if (await probePair()) {
            available = true;
            checked = true;
            return true;
          }
        }
        runner.setExecutablePaths(initialExecutablePaths);
      }

      available = false;
      checked = true;
      return false;
    },
  };
}
