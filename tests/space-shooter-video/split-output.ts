/**
 * Split space-shooter-48s.mp4 into 20s + 20s + 8s.
 *
 * Run: npx ts-node --files -P tests/space-shooter-video/tsconfig.json tests/space-shooter-video/split-output.ts
 */
import fs from "node:fs";
import path from "node:path";
import { MediaProcessRunner } from "../../lib-next/video/process-runner";

const runner = new MediaProcessRunner();
const OUT_DIR = path.join(__dirname, "output");
const SOURCE = path.join(OUT_DIR, "space-shooter-48s.mp4");
const MAX_MB = 20;

const SEGMENTS: { name: string; start: number; duration: number; reencode?: boolean }[] = [
  { name: "space-shooter-part1-20s.mp4", start: 0, duration: 20 },
  { name: "space-shooter-part2-20s.mp4", start: 20, duration: 20 },
  { name: "space-shooter-part3-8s.mp4", start: 40, duration: 8, reencode: true },
];

async function runFfmpeg(args: string[]): Promise<void> {
  await runner.runFfmpeg(args, {
    timeoutMs: 120_000,
    maxStdoutBytes: 4 * 1024 * 1024,
    maxStderrBytes: 32 * 1024 * 1024,
  });
}

async function probe(filePath: string): Promise<{ duration: number; mb: number }> {
  const { stdout } = await runner.runFfprobe(
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    { timeoutMs: 15_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024 }
  );
  const mb = fs.statSync(filePath).size / (1024 * 1024);
  return { duration: Number.parseFloat(stdout.trim()) || 0, mb };
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing source: ${SOURCE}`);
  }

  for (const seg of SEGMENTS) {
    const dest = path.join(OUT_DIR, seg.name);

    if (seg.reencode) {
      await runFfmpeg([
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", SOURCE,
        "-ss", String(seg.start),
        "-t", String(seg.duration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-movflags", "+faststart",
        dest,
      ]);
    } else {
      await runFfmpeg([
        "-y", "-hide_banner", "-loglevel", "error",
        "-ss", String(seg.start),
        "-i", SOURCE,
        "-t", String(seg.duration),
        "-c", "copy",
        "-avoid_negative_ts", "make_zero",
        "-movflags", "+faststart",
        dest,
      ]);
    }

    const info = await probe(dest);
    const ok = info.mb <= MAX_MB;
    console.log(`${seg.name}: ${info.duration.toFixed(2)}s, ${info.mb.toFixed(2)} MB${ok ? "" : ` (over ${MAX_MB} MB)`}`);
    if (!ok) {
      console.warn(`Re-encoding ${seg.name} at lower bitrate...`);
      await runFfmpeg([
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", SOURCE,
        "-ss", String(seg.start),
        "-t", String(seg.duration),
        "-c:v", "libx264",
        "-preset", "fast",
        "-b:v", "6M",
        "-maxrate", "7M",
        "-bufsize", "14M",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        dest,
      ]);
      const again = await probe(dest);
      console.log(`  -> ${again.duration.toFixed(2)}s, ${again.mb.toFixed(2)} MB`);
    }
  }

  console.log("Done. Files in:", OUT_DIR);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
