import { MediaProcessRunner, type MediaProcessRunOptions } from "./process-runner";
import type { TempWorkspaceOptions } from "./temp-workspace";

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

  instructions += "\nConfigure custom binaries with APEXIFY_FFMPEG_PATH and APEXIFY_FFPROBE_PATH.\n";
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
  checkAvailable(): Promise<boolean>;
  runFfmpeg(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfmpeg"]>;
  runFfprobe(args: readonly string[], options?: MediaProcessRunOptions): ReturnType<MediaProcessRunner["runFfprobe"]>;
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
  const explicitFfmpeg = options.ffmpegPath ?? process.env.APEXIFY_FFMPEG_PATH;
  const explicitFfprobe = options.ffprobePath ?? process.env.APEXIFY_FFPROBE_PATH;
  const runner = new MediaProcessRunner({
    ffmpegPath: explicitFfmpeg || "ffmpeg",
    ffprobePath: explicitFfprobe || "ffprobe",
  });
  const workspaceOptions: TempWorkspaceOptions = {
    rootDirectory: options.tempDirectory ?? process.env.APEXIFY_TEMP_DIR,
    retain: options.retainTempFiles,
  };

  let checked = false;
  let available = false;

  async function probePair(): Promise<boolean> {
    try {
      await runner.runFfmpeg(["-version"], {
        timeoutMs: 5_000,
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 1024 * 1024,
      });
      await runner.runFfprobe(["-version"], {
        timeoutMs: 5_000,
        maxStdoutBytes: 1024 * 1024,
        maxStderrBytes: 1024 * 1024,
      });
      return true;
    } catch {
      return false;
    }
  }

  return {
    runner,
    workspaceOptions,
    getInstallInstructions: () => buildFfmpegInstallGuide(),
    runFfmpeg: (args, runOptions) => runner.runFfmpeg(args, runOptions),
    runFfprobe: (args, runOptions) => runner.runFfprobe(args, runOptions),

    async checkAvailable(): Promise<boolean> {
      if (checked) return available;

      if (await probePair()) {
        available = true;
        checked = true;
        return true;
      }

      // Only auto-discover when the caller did not explicitly configure executables.
      if (!explicitFfmpeg && !explicitFfprobe) {
        for (const ffmpegPath of commonFfmpegPaths()) {
          const ffprobePath = pairedFfprobePath(ffmpegPath);
          runner.setExecutablePaths({ ffmpegPath, ffprobePath });
          if (await probePair()) {
            available = true;
            checked = true;
            return true;
          }
        }
        runner.setExecutablePaths({ ffmpegPath: "ffmpeg", ffprobePath: "ffprobe" });
      }

      available = false;
      checked = true;
      return false;
    },
  };
}
