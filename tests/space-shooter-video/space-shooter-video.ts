/**
 * Cinematic space-shooter integration demo using Apexify.js public rendering/audio/video APIs.
 * External FFmpeg diagnostics use the same shell-free MediaProcessRunner as the library.
 *
 * Run with this directory's tsconfig when a long-form integration sample is needed.
 */
import fs from "node:fs";
import path from "node:path";
import { ApexPainter } from "../../lib-next/index";
import { MediaProcessRunner } from "../../lib-next/video/process-runner";
import type { Frame } from "../../lib-next/types/gif";

const W = 720;
const H = 1280;
const FPS = 24;
const DURATION_SEC = 48;
const TOTAL_FRAMES = FPS * DURATION_SEC;
const OUT_DIR = path.join(__dirname, "output");
const runner = new MediaProcessRunner();

type Bullet = { x: number; y: number; enemy?: boolean };
type Enemy = { x: number; y: number; phase: number };

type State = {
  playerX: number;
  bullets: Bullet[];
  enemies: Enemy[];
  credits: number;
  health: number;
};

function state(): State {
  return {
    playerX: W / 2,
    bullets: [],
    enemies: Array.from({ length: 8 }, (_, i) => ({
      x: 90 + (i % 4) * 170,
      y: 120 + Math.floor(i / 4) * 180,
      phase: i * 0.7,
    })),
    credits: 120,
    health: 100,
  };
}

function drawFrame(ctx: Parameters<NonNullable<Frame["onDrawCustom"]>>[0], s: State, frame: number): void {
  const t = frame / FPS;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#020617");
  bg.addColorStop(0.55, "#111827");
  bg.addColorStop(1, "#020617");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 120; i++) {
    const x = (i * 73 + frame * (1 + (i % 3))) % W;
    const y = (i * 131 + frame * (2 + (i % 4))) % H;
    ctx.globalAlpha = 0.3 + (i % 5) * 0.12;
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
  }
  ctx.globalAlpha = 1;

  s.playerX = W / 2 + Math.sin(t * 1.7) * 210;
  if (frame % 7 === 0) s.bullets.push({ x: s.playerX, y: H - 180 });
  if (frame % 41 === 0) {
    const enemy = s.enemies[frame % s.enemies.length];
    s.bullets.push({ x: enemy.x, y: enemy.y + 50, enemy: true });
  }

  for (const e of s.enemies) {
    e.x += Math.sin(t * 1.2 + e.phase) * 0.7;
    e.y += 0.8;
    if (e.y > H * 0.55) e.y = 100;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = "#ef4444";
    ctx.shadowColor = "#fb7185";
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.lineTo(-28, -24);
    ctx.lineTo(28, -24);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (let i = s.bullets.length - 1; i >= 0; i--) {
    const b = s.bullets[i];
    b.y += b.enemy ? 10 : -17;
    ctx.fillStyle = b.enemy ? "#fca5a5" : "#7dd3fc";
    ctx.shadowColor = b.enemy ? "#ef4444" : "#38bdf8";
    ctx.shadowBlur = 12;
    ctx.fillRect(b.x - 3, b.y, 6, 22);
    ctx.shadowBlur = 0;
    if (b.y < -40 || b.y > H + 40) s.bullets.splice(i, 1);
  }

  ctx.save();
  ctx.translate(s.playerX, H - 120);
  ctx.fillStyle = "#38bdf8";
  ctx.shadowColor = "#0ea5e9";
  ctx.shadowBlur = 25;
  ctx.beginPath();
  ctx.moveTo(0, -45);
  ctx.lineTo(-38, 36);
  ctx.lineTo(0, 24);
  ctx.lineTo(38, 36);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (frame > TOTAL_FRAMES * 0.75) {
    s.health = Math.max(0, 100 - Math.round(((frame - TOTAL_FRAMES * 0.75) / (TOTAL_FRAMES * 0.25)) * 100));
  }

  ctx.fillStyle = "rgba(2,6,23,0.8)";
  ctx.fillRect(18, 18, W - 36, 80);
  ctx.font = "20px Arial";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(`HULL ${s.health}`, 36, 54);
  ctx.fillStyle = "#fde047";
  ctx.textAlign = "right";
  ctx.fillText(`CREDITS $${s.credits}`, W - 36, 54);
  ctx.textAlign = "left";
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(36, 70, W - 72, 12);
  ctx.fillStyle = s.health > 35 ? "#22c55e" : "#ef4444";
  ctx.fillRect(36, 70, (W - 72) * (s.health / 100), 12);

  if (s.health === 0) {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = "center";
    ctx.font = "bold 52px Arial";
    ctx.fillStyle = "#ef4444";
    ctx.fillText("GAME OVER", W / 2, H / 2);
    ctx.textAlign = "left";
  }
}

function makeAudio(painter: ApexPainter): Buffer {
  const events = [] as Array<{ at: number; preset: "laser" | "coin" | "explosionSmall"; gain: number }>;
  for (let t = 0.2; t < DURATION_SEC - 2; t += 0.65) events.push({ at: t, preset: "laser", gain: 0.24 });
  for (let t = 4; t < DURATION_SEC - 4; t += 7) events.push({ at: t, preset: "coin", gain: 0.38 });
  events.push({ at: DURATION_SEC - 2.2, preset: "explosionSmall", gain: 0.65 });
  return painter.createAudio.sequence({ events, tail: 0.4, masterGain: 0.8 });
}

async function probeWavPeakDb(wavPath: string): Promise<number | null> {
  try {
    const { stderr } = await runner.runFfmpeg(
      ["-hide_banner", "-i", wavPath, "-af", "volumedetect", "-f", "null", "-"],
      { timeoutMs: 60_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 4 * 1024 * 1024 }
    );
    const match = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
    return match ? Number.parseFloat(match[1]) : null;
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error
      ? String((error as Error & { stderr?: string }).stderr ?? "")
      : "";
    const match = stderr.match(/max_volume:\s*([-\d.]+)\s*dB/);
    return match ? Number.parseFloat(match[1]) : null;
  }
}

async function probeOutputHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await runner.runFfprobe(
      ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", filePath],
      { timeoutMs: 15_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024 }
    );
    return stdout.includes("audio");
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const painter = new ApexPainter();
  const s = state();
  const frames: Frame[] = Array.from({ length: TOTAL_FRAMES }, (_, frame) => ({
    width: W,
    height: H,
    duration: 0,
    onDrawCustom: (ctx) => drawFrame(ctx, s, frame),
  }));

  console.log(`Rendering ${TOTAL_FRAMES} frames @ ${FPS}fps...`);
  const buffers = await painter.animate(frames, 0, W, H);
  if (!buffers?.length) throw new Error("animate returned no frames");

  const silentPath = path.join(OUT_DIR, "space-shooter-48s-silent.mp4");
  const outputPath = path.join(OUT_DIR, "space-shooter-48s.mp4");
  const audioPath = path.join(OUT_DIR, "space-shooter-sfx.wav");

  await painter.createVideo({
    source: buffers[0],
    createFromFrames: {
      frames: buffers,
      outputPath: silentPath,
      fps: FPS,
      format: "mp4",
      quality: "high",
      bitrate: 8000,
      resolution: { width: W, height: H },
    },
  });

  const audio = makeAudio(painter);
  await painter.createAudio.save(audio, audioPath);
  const peakDb = await probeWavPeakDb(audioPath);
  if (peakDb !== null) console.log(`SFX peak: ${peakDb.toFixed(2)} dBFS`);

  await painter.createVideo({
    source: silentPath,
    mixAudio: {
      outputPath,
      keepOriginalAudio: false,
      overlays: [{ source: audioPath, startTime: 0, volume: 1 }],
    },
  });

  if (!(await probeOutputHasAudio(outputPath))) throw new Error("Output video has no audio stream.");
  try { fs.unlinkSync(silentPath); } catch { /* debug artifact may remain if locked */ }
  console.log("Output:", outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
