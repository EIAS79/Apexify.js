import path from "node:path";
import { MediaProcessRunner, type MediaProcessPaths, type MediaProcessRunOptions } from "./process-runner";
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
  getAvailabilityAttempts(): readonly Required<MediaProcessPaths>[];
  checkAvailable(): Promise<boolean>;
  runFfmpeg(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfmpeg"]>;
  runFfprobe(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfprobe"]>;
}

export function parseExecutableLocatorOutput(output: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    const value = rawLine.trim().replace(/^"(.*)"$/, "$1");
    if (!value) continue;
    const key = process.platform === "win32" ? value.toLowerCase() : value;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(value);
  }
  return results;
}

export function pairLocatedExecutables(
  ffmpegPaths: readonly string[],
  ffprobePaths: readonly string[],
): Array<Required<MediaProcessPaths>> {
  const pairs: Array<Required<MediaProcessPaths>> = [];
  const used = new Set<string>();
  const normalize = (value: string): string => process.platform === "win32" ? value.toLowerCase() : value;

  for (const ffmpegPath of ffmpegPaths) {
    const ffmpegDir = normalize(path.dirname(ffmpegPath));
    for (const ffprobePath of ffprobePaths) {
      if (normalize(path.dirname(ffprobePath)) !== ffmpegDir) continue;
      const key = `${normalize(ffmpegPath)}\0${normalize(ffprobePath)}`;
      if (used.has(key)) continue;
      used.add(key);
      pairs.push({ ffmpegPath, ffprobePath });
    }
  }

  // Some package managers expose launcher shims from different directories.
  if (pairs.length === 0 && ffmpegPaths[0] && ffprobePaths[0]) {
    pairs.push({ ffmpegPath: ffmpegPaths[0], ffprobePath: ffprobePaths[0] });
  }
  return pairs;
}

function windowsPackageManagerPairs(): Array<Required<MediaProcessPaths>> {
  if (process.platform !== "win32") return [];
  const pairs: Array<Required<MediaProcessPaths>> = [];
  const add = (directory: string | undefined): void => {
    if (!directory) return;
    pairs.push({
      ffmpegPath: path.join(directory, "ffmpeg.exe"),
      ffprobePath: path.join(directory, "ffprobe.exe"),
    });
  };

  if (process.env.LOCALAPPDATA) add(path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links"));
  if (process.env.USERPROFILE) add(path.join(process.env.USERPROFILE, "scoop", "shims"));
  add(path.join(process.env.ChocolateyInstall ?? "C:\\ProgramData\\chocolatey", "bin"));
  return pairs;
}

function windowsWhereExecutable(): string {
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? "C:\\Windows";
  return path.join(windowsRoot, "System32", "where.exe");
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
  const availabilityAttempts: Required<MediaProcessPaths>[] = [];

  async function probePair(): Promise<boolean> {
    const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
    availabilityAttempts.push(runner.getExecutablePaths());
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

  async function discoverWithWindowsWhere(): Promise<Array<Required<MediaProcessPaths>>> {
    if (process.platform !== "win32") return [];
    const ffmpeg = getDefaultApexifyRuntimeConfig().ffmpeg;
    const options: MediaProcessRunOptions = {
      timeoutMs: ffmpeg.probeTimeoutMs,
      maxStdoutBytes: Math.min(ffmpeg.maxStdoutBytes, 1024 * 1024),
      maxStderrBytes: Math.min(ffmpeg.maxStderrBytes, 1024 * 1024),
    };
    const locator = windowsWhereExecutable();
    try {
      const [ffmpegResult, ffprobeResult] = await Promise.all([
        runner.runExecutable(locator, ["ffmpeg"], options),
        runner.runExecutable(locator, ["ffprobe"], options),
      ]);
      return pairLocatedExecutables(
        parseExecutableLocatorOutput(ffmpegResult.stdout),
        parseExecutableLocatorOutput(ffprobeResult.stdout),
      );
    } catch {
      return [];
    }
  }

  return {
    runner,
    workspaceOptions,
    getInstallInstructions: () => buildFfmpegInstallGuide(),
    getAvailabilityError: () => availabilityError,
    getAvailabilityAttempts: () => availabilityAttempts.map((item) => ({ ...item })),
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
        // On Windows, ask the OS resolver first. This matches what users see from
        // `where.exe ffmpeg` and correctly handles WinGet's versioned package paths.
        for (const executablePaths of await discoverWithWindowsWhere()) {
          runner.setExecutablePaths(executablePaths);
          if (await probePair()) {
            available = true;
            checked = true;
            return true;
          }
        }

        // Probe well-known package-manager shims without synchronous filesystem I/O.
        for (const executablePaths of windowsPackageManagerPairs()) {
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
