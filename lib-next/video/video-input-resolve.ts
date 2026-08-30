import path from "node:path";
import { promises as fs } from "node:fs";
import type { TempWorkspace } from "./temp-workspace";
import { resolveMediaInput } from "../media/source";

export interface ResolvedVideoInput {
  videoPath: string;
  /** True only when Apexify materialized the source inside the supplied workspace. */
  temporary: boolean;
}

export function inferMediaExtensionFromBuffer(buf: Buffer): string {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return "wav";
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

/** Resolve Buffer / HTTP(S) URL / local path through the authoritative media-source layer. */
export async function resolveVideoInputToPath(
  videoSource: string | Buffer,
  workspace: TempWorkspace,
  basename = "input"
): Promise<ResolvedVideoInput> {
  const name = safeBasename(basename);
  const resolved = await resolveMediaInput(videoSource, { kind: "video" });

  if (Buffer.isBuffer(resolved)) {
    const ext = typeof videoSource === "string" ? (extensionFromUrl(videoSource) ?? inferMediaExtensionFromBuffer(resolved)) : inferMediaExtensionFromBuffer(resolved);
    const videoPath = await workspace.writeFile(`${name}.${ext}`, resolved);
    return { videoPath, temporary: true };
  }

  await fs.access(resolved);
  return { videoPath: resolved, temporary: false };
}
