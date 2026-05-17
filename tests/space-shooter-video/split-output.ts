/**
 * Split space-shooter-48s.mp4 into 20s + 20s + 8s (max ~20 MB each with stream copy).
 *
 * Run: npx ts-node --files -P tests/space-shooter-video/tsconfig.json tests/space-shooter-video/split-output.ts
 */
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const OUT_DIR = path.join(__dirname, "output");
const SOURCE = path.join(OUT_DIR, "space-shooter-48s.mp4");
const MAX_MB = 20;

const SEGMENTS: { name: string; start: number; duration: number; reencode?: boolean }[] = [
  { name: "space-shooter-part1-20s.mp4", start: 0, duration: 20 },
  { name: "space-shooter-part2-20s.mp4", start: 20, duration: 20 },
  { name: "space-shooter-part3-8s.mp4", start: 40, duration: 8, reencode: true },
];

async function run(cmd: string): Promise<void> {
  await execAsync(cmd, { maxBuffer: 32 * 1024 * 1024 });
}

async function probe(path: string): Promise<{ duration: number; mb: number }> {
  const { stdout: d } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${path.replace(/"/g, '\\"')}"`
  );
  const mb = fs.statSync(path).size / (1024 * 1024);
  return { duration: parseFloat(d.trim()) || 0, mb };
}

async function main(): Promise<void> {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`Missing source: ${SOURCE}\nRun: npm run test:space-shooter`);
  }

  for (const seg of SEGMENTS) {
    const dest = path.join(OUT_DIR, seg.name);
    const escIn = SOURCE.replace(/"/g, '\\"');
    const escOut = dest.replace(/"/g, '\\"');

    if (seg.reencode) {
      await run(
        `ffmpeg -y -hide_banner -loglevel error -i "${escIn}" -ss ${seg.start} -t ${seg.duration} ` +
          `-c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${escOut}"`
      );
    } else {
      await run(
        `ffmpeg -y -hide_banner -loglevel error -ss ${seg.start} -i "${escIn}" -t ${seg.duration} ` +
          `-c copy -avoid_negative_ts make_zero -movflags +faststart "${escOut}"`
      );
    }

    const info = await probe(dest);
    const ok = info.mb <= MAX_MB;
    console.log(`${seg.name}: ${info.duration.toFixed(2)}s, ${info.mb.toFixed(2)} MB${ok ? "" : ` (over ${MAX_MB} MB)`}`);
    if (!ok) {
      console.warn(`  Re-encoding ${seg.name} at lower bitrate…`);
      await run(
        `ffmpeg -y -hide_banner -loglevel error -i "${escIn}" -ss ${seg.start} -t ${seg.duration} ` +
          `-c:v libx264 -preset fast -b:v 6M -maxrate 7M -bufsize 14M -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart "${escOut}"`
      );
      const again = await probe(dest);
      console.log(`  → ${again.duration.toFixed(2)}s, ${again.mb.toFixed(2)} MB`);
    }
  }

  console.log("Done. Files in:", OUT_DIR);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
