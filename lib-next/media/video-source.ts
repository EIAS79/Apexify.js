import path from "node:path";
import type { ApexifyRuntime } from "../runtime/context";
import { defaultApexifyRuntime } from "../runtime/context";
import { MediaSourceResolver, type MediaSource, type MediaResolveOptions } from "./source";

export interface MediaWorkspace {
  writeFile(name: string, data: string | NodeJS.ArrayBufferView): Promise<string>;
}

export interface ResolvedVideoSource {
  videoPath: string;
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

function extensionFromSource(source: string): string | undefined {
  try {
    const url = new URL(source);
    const ext = path.extname(url.pathname).slice(1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(ext) ? ext : undefined;
  } catch {
    const ext = path.extname(source).slice(1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(ext) ? ext : undefined;
  }
}

/** One authoritative Buffer/path/HTTP(S)/data source resolver for video/media operations. */
export async function resolveVideoSourceToPath(
  source: MediaSource,
  workspace: MediaWorkspace,
  basename = "input",
  runtime: ApexifyRuntime = defaultApexifyRuntime,
  options: MediaResolveOptions = {}
): Promise<ResolvedVideoSource> {
  const resolved = await new MediaSourceResolver(runtime).resolve(source, "video", options);
  if (resolved.kind === "path") {
    return { videoPath: resolved.value as string, temporary: false };
  }

  const bytes = resolved.value as Buffer;
  const hinted = typeof source === "string" ? extensionFromSource(source) : undefined;
  const ext = hinted ?? inferMediaExtensionFromBuffer(bytes);
  const videoPath = await workspace.writeFile(`${safeBasename(basename)}.${ext}`, bytes);
  return { videoPath, temporary: true };
}
