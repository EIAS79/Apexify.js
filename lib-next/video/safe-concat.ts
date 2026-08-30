import { promises as fs } from "fs";
import path from "path";
import type { TempWorkspace } from "./temp-workspace";

/**
 * Build an FFmpeg concat-demuxer list containing only Apexify-generated filenames.
 * User-controlled paths are copied into the isolated workspace first, so concat syntax
 * never contains quotes, newlines, protocol prefixes, or other user-controlled tokens.
 */
export async function writeSafeConcatList(
  workspace: TempWorkspace,
  sources: readonly string[],
  name = "concat.txt"
): Promise<string> {
  if (sources.length === 0) throw new Error("concat: at least one source is required.");

  const lines: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const ext = path.extname(source).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : ".bin";
    const basename = `concat-input-${String(i).padStart(4, "0")}${safeExt}`;
    const target = workspace.path(basename);
    await fs.copyFile(source, target);
    lines.push(`file '${basename}'`);
  }

  return workspace.writeFile(name, `${lines.join("\n")}\n`);
}
