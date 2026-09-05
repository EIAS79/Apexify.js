import path from "node:path";
import { promises as fs } from "node:fs";
import type { TempWorkspace } from "./temp-workspace";
import { resolveMediaInput } from "../media/source";
import { fetchRemoteMediaToFile } from "../media/remote-fetch";
import { ApexifyInputError } from "../runtime/errors";

export interface ResolvedVideoInput {
  videoPath: string;
  /** True only when Apexify materialized the source inside the supplied workspace. */
  temporary: boolean;
  /** Bytes written for materialized sources when known. */
  bytes?: number;
}

export interface ResolveVideoInputOptions {
  signal?: AbortSignal;
}

export function inferMediaExtensionFromBuffer(buf: Buffer): string {
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WAVE") return "wav";
  if (buf.length >= 8 && buf.toString("ascii", 4, 8) === "ftyp") return "mp4";
  if (buf.length >= 3 && buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return "mp3";
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
  } catch { return undefined; }
}

/** Authoritative Buffer / HTTP(S) / local-path resolver for media consumed by video operations. */
export async function resolveVideoInputToPath(
  videoSource: string | Buffer,
  workspace: TempWorkspace,
  basename = "input",
  options: ResolveVideoInputOptions = {}
): Promise<ResolvedVideoInput> {
  const name = safeBasename(basename);
  if (Buffer.isBuffer(videoSource)) {
    if (videoSource.length === 0) throw new ApexifyInputError("Video media buffer is empty.");
    const videoPath = await workspace.writeFile(`${name}.${inferMediaExtensionFromBuffer(videoSource)}`, videoSource);
    return { videoPath, temporary: true, bytes: videoSource.length };
  }

  const trimmed = videoSource.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const ext = extensionFromUrl(trimmed) ?? "media";
    const videoPath = workspace.path(`${name}.${ext}`);
    const result = await fetchRemoteMediaToFile(trimmed, videoPath, { kind: "video", signal: options.signal });
    return { videoPath, temporary: true, bytes: result.bytes };
  }

  const resolved = await resolveMediaInput(trimmed, { kind: "video", signal: options.signal, cache: false });
  if (Buffer.isBuffer(resolved)) {
    const videoPath = await workspace.writeFile(`${name}.${inferMediaExtensionFromBuffer(resolved)}`, resolved);
    return { videoPath, temporary: true, bytes: resolved.length };
  }
  await fs.access(resolved);
  return { videoPath: resolved, temporary: false };
}
