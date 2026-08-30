import axios from "axios";
import { promises as fs } from "fs";
import path from "path";
import type { TempWorkspace } from "./temp-workspace";

export interface ResolvedVideoInput {
  videoPath: string;
  /** True only when Apexify materialized the source inside the supplied workspace. */
  temporary: boolean;
}

export function inferMediaExtensionFromBuffer(buf: Buffer): string {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") {
    return "wav";
  }
  if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") return "mp4";
  if (buf.length >= 3 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "mp3";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 3 && buf.toString("ascii", 0, 3) === "GIF") return "gif";
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "OggS") return "ogg";
  return "mp4";
}

function safeBasename(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^\.+/, "");
  return cleaned || "media";
}

function extensionFromUrl(source: string): string | undefined {
  try {
    const ext = path.extname(new URL(source).pathname).slice(1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(ext) ? ext : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve Buffer / http(s) URL / local path to a concrete media path.
 * Any materialized bytes are written only inside the caller's isolated TempWorkspace.
 * Network security/size policy is centralized later in Phase 3; this function intentionally
 * preserves Phase 1 behavior while eliminating shared temp paths and duplicate resolvers.
 */
export async function resolveVideoInputToPath(
  videoSource: string | Buffer,
  workspace: TempWorkspace,
  basename = "input"
): Promise<ResolvedVideoInput> {
  const name = safeBasename(basename);

  if (Buffer.isBuffer(videoSource)) {
    if (videoSource.length === 0) throw new Error("Media buffer is empty.");
    const ext = inferMediaExtensionFromBuffer(videoSource);
    const videoPath = await workspace.writeFile(`${name}.${ext}`, videoSource);
    return { videoPath, temporary: true };
  }

  if (typeof videoSource !== "string" || !videoSource.trim()) {
    throw new Error("Media source must be a non-empty string path/URL or Buffer.");
  }

  const source = videoSource.trim();
  if (/^https?:\/\//i.test(source)) {
    const response = await axios.get<ArrayBuffer>(source, {
      responseType: "arraybuffer",
      timeout: 30_000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    const bytes = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
    if (bytes.length === 0) throw new Error("Remote media response was empty.");
    const ext = extensionFromUrl(source) || inferMediaExtensionFromBuffer(bytes);
    const videoPath = await workspace.writeFile(`${name}.${ext}`, bytes);
    return { videoPath, temporary: true };
  }

  const resolvedPath = path.isAbsolute(source) ? source : path.resolve(process.cwd(), source);
  await fs.access(resolvedPath);
  return { videoPath: resolvedPath, temporary: false };
}
