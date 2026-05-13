import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

function buildFfmpegInstallGuide(): string {
  const os = process.platform;
  let instructions = "\n\n📹 FFMPEG INSTALLATION GUIDE\n";
  instructions += "═".repeat(50) + "\n\n";

  if (os === "win32") {
    instructions += "🪟 WINDOWS INSTALLATION:\n\n";
    instructions += "OPTION 1 - Using Chocolatey (Recommended):\n";
    instructions += "  1. Open PowerShell as Administrator\n";
    instructions += "  2. Run: choco install ffmpeg\n";
    instructions += "  3. Restart your terminal\n\n";
    instructions += "OPTION 2 - Using Winget:\n";
    instructions += "  1. Open PowerShell\n";
    instructions += "  2. Run: winget install ffmpeg\n";
    instructions += "  3. Restart your terminal\n\n";
    instructions += "OPTION 3 - Manual Installation:\n";
    instructions += "  1. Visit: https://www.gyan.dev/ffmpeg/builds/\n";
    instructions += "  2. Download \"ffmpeg-release-essentials.zip\"\n";
    instructions += "  3. Extract to C:\\ffmpeg\n";
    instructions += "  4. Add C:\\ffmpeg\\bin to System PATH:\n";
    instructions += "     - Press Win + X → System → Advanced → Environment Variables\n";
    instructions += "     - Edit \"Path\" → Add \"C:\\ffmpeg\\bin\"\n";
    instructions += "  5. Restart terminal and verify: ffmpeg -version\n\n";
    instructions += "🔍 Search Terms: \"install ffmpeg windows\", \"ffmpeg windows tutorial\"\n";
    instructions += "📺 YouTube: Search \"How to install FFmpeg on Windows 2024\"\n";
    instructions += "🌐 Official: https://ffmpeg.org/download.html\n";
  } else if (os === "darwin") {
    instructions += "🍎 macOS INSTALLATION:\n\n";
    instructions += "OPTION 1 - Using Homebrew (Recommended):\n";
    instructions += "  1. Install Homebrew if not installed:\n";
    instructions +=
      "     /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\"\n";
    instructions += "  2. Run: brew install ffmpeg\n";
    instructions += "  3. Verify: ffmpeg -version\n\n";
    instructions += "OPTION 2 - Using MacPorts:\n";
    instructions += "  1. Install MacPorts from: https://www.macports.org/\n";
    instructions += "  2. Run: sudo port install ffmpeg\n\n";
    instructions += "🔍 Search Terms: \"install ffmpeg mac\", \"ffmpeg macos homebrew\"\n";
    instructions += "📺 YouTube: Search \"Install FFmpeg on Mac using Homebrew\"\n";
    instructions += "🌐 Official: https://ffmpeg.org/download.html\n";
  } else {
    instructions += "🐧 LINUX INSTALLATION:\n\n";
    instructions += "Ubuntu/Debian:\n";
    instructions += "  sudo apt-get update\n";
    instructions += "  sudo apt-get install ffmpeg\n\n";
    instructions += "RHEL/CentOS/Fedora:\n";
    instructions += "  sudo yum install ffmpeg\n";
    instructions += "  # OR for newer versions:\n";
    instructions += "  sudo dnf install ffmpeg\n\n";
    instructions += "Arch Linux:\n";
    instructions += "  sudo pacman -S ffmpeg\n\n";
    instructions += "🔍 Search Terms: \"install ffmpeg [your-distro]\", \"ffmpeg linux tutorial\"\n";
    instructions += "📺 YouTube: Search \"Install FFmpeg on Linux\"\n";
    instructions += "🌐 Official: https://ffmpeg.org/download.html\n";
  }

  instructions += "\n" + "═".repeat(50) + "\n";
  instructions += "✅ After installation, restart your terminal and verify with: ffmpeg -version\n";
  instructions += "💡 If still not working, ensure FFmpeg is in your system PATH\n";
  return instructions;
}

export interface FfmpegSession {
  getInstallInstructions(): string;
  checkAvailable(): Promise<boolean>;
}

/**
 * Cached FFmpeg presence check + OS-specific install copy (moved out of ApexPainter).
 */
export function createFfmpegSession(): FfmpegSession {
  let checked = false;
  let available: boolean | null = null;

  return {
    getInstallInstructions: () => buildFfmpegInstallGuide(),

    async checkAvailable(): Promise<boolean> {
      if (checked) {
        return available ?? false;
      }
      try {
        await execAsync("ffmpeg -version", {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
        });
        available = true;
        checked = true;
        return true;
      } catch {
        const commonPaths =
          process.platform === "win32"
            ? [
                "C:\\ffmpeg\\bin\\ffmpeg.exe",
                "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
                "C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe",
              ]
            : ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg", "/opt/local/bin/ffmpeg"];

        for (const ffmpegPath of commonPaths) {
          try {
            await execAsync(`"${ffmpegPath}" -version`, {
              timeout: 3000,
              maxBuffer: 1024 * 1024,
            });
            available = true;
            checked = true;
            return true;
          } catch {
            continue;
          }
        }
        available = false;
        checked = true;
        return false;
      }
    },
  };
}
