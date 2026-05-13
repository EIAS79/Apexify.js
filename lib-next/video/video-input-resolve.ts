import fs from "fs";
import path from "path";
import axios from "axios";

export interface ResolvedVideoInput {
  videoPath: string;
  /** When true, caller should delete `videoPath` after use. */
  shouldCleanup: boolean;
}

/**
 * Resolve buffer / http(s) URL / local path to a concrete file path for ffmpeg/ffprobe.
 */
export async function resolveVideoInputToPath(
  videoSource: string | Buffer,
  frameDir: string,
  tempBasename: string
): Promise<ResolvedVideoInput> {
  if (!fs.existsSync(frameDir)) {
    fs.mkdirSync(frameDir, { recursive: true });
  }

  if (Buffer.isBuffer(videoSource)) {
    const videoPath = path.join(frameDir, `${tempBasename}.mp4`);
    fs.writeFileSync(videoPath, videoSource);
    return { videoPath, shouldCleanup: true };
  }

  if (typeof videoSource === "string" && /^https?:\/\//i.test(videoSource)) {
    const response = await axios({
      method: "get",
      url: videoSource,
      responseType: "arraybuffer",
    });
    const videoPath = path.join(frameDir, `${tempBasename}.mp4`);
    fs.writeFileSync(videoPath, Buffer.from(response.data));
    return { videoPath, shouldCleanup: true };
  }

  if (typeof videoSource === "string") {
    let resolvedPath = videoSource;
    if (!/^https?:\/\//i.test(resolvedPath)) {
      resolvedPath = path.isAbsolute(resolvedPath) ? resolvedPath : path.join(process.cwd(), resolvedPath);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Video file not found: ${videoSource}`);
    }
    return { videoPath: resolvedPath, shouldCleanup: false };
  }

  throw new Error("resolveVideoInputToPath: videoSource must be string or Buffer");
}
