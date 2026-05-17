/**
 * ~48s cinematic space-shooter demo — **lib-next only** (no direct `@napi-rs/canvas` imports).
 *
 * `painter.animate` + `onDrawCustom`, `painter.createVideo`, `painter.createAudio`, `painter.assets`,
 * `loadImageCached`, `registerTextFontFromPath`.
 *
 * Run: npm run test:space-shooter
 */
import fs from "node:fs";
import path from "node:path";
import { ApexPainter } from "../../lib-next/index";
import { loadImageCached } from "../../lib-next/image/image-properties";
import { registerTextFontFromPath } from "../../lib-next/text/text-layout";
import type { Frame } from "../../lib-next/types/gif";
import type { SynthPresetName } from "../../lib-next/types/audio-synth";

/** Canvas 2D context type from Apexify's `Frame.onDrawCustom` (same engine lib-next uses internally). */
type DrawContext = Parameters<NonNullable<Frame["onDrawCustom"]>>[0];
type RasterSprite = Awaited<ReturnType<typeof loadImageCached>>;

const W = 720;
const H = 1280;
const FPS = 24;
const DURATION_SEC = 48;
const TOTAL_FRAMES = FPS * DURATION_SEC;
/** After hull hits 0: short death spiral, then fade / game over. */
const CRASH_PHASE_FRAMES = Math.floor(FPS * 4);
const GAMEOVER_FADE_FRAMES = Math.floor(FPS * 4.5);
const PLAY_DEADLINE_FRAME = TOTAL_FRAMES - CRASH_PHASE_FRAMES - GAMEOVER_FADE_FRAMES;
const OUT_DIR = path.join(__dirname, "output");
const ASSET_DIR = path.join(__dirname, "assets");

const ASSET_URLS: Record<string, string[]> = {
  player: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/playerShip1_blue.png",
    "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/thrust_ship2.png",
  ],
  enemy: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Enemies/enemyRed1.png",
    "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/space-baddie.png",
  ],
  enemyBoss: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Enemies/enemyBlack5.png",
    "https://raw.githubusercontent.com/photonstorm/phaser3-examples/master/public/assets/sprites/space-baddie-purple.png",
  ],
  laserPlayer: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Lasers/laserBlue16.png",
  ],
  laserEnemy: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Lasers/laserRed16.png",
  ],
  coin: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Power-ups/star_gold.png",
  ],
  heart: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Power-ups/shield_gold.png",
  ],
  bg: [
    "https://kenney-content.azureedge.net/Content/SpaceShooterRedux/PNG/Backgrounds/black.png",
  ],
};
const FONT_URL =
  "https://github.com/google/fonts/raw/main/ofl/pressstart2p/PressStart2P-Regular.ttf";

/** Sfx logged during frame simulation → one WAV timeline before mux. */
type SfxKind =
  | "playerShoot"
  | "enemyShoot"
  | "enemyHit"
  | "enemyKillScout"
  | "enemyKillFighter"
  | "enemyKillHeavy"
  | "enemyKillBoss"
  | "playerHit"
  | "pickupCoin"
  | "pickupHeart"
  | "wave"
  | "combo"
  | "bossAppear"
  | "playerDeath"
  | "crashBoom"
  | "gameOver";

type SfxEvent = { frame: number; kind: SfxKind };

const sfxLog: SfxEvent[] = [];
const lastSfxAt: Partial<Record<SfxKind, number>> = {};

const SFX_MIN_GAP_SEC: Partial<Record<SfxKind, number>> = {
  playerShoot: 0.14,
  enemyShoot: 0.14,
  enemyHit: 0.07,
  playerHit: 0.16,
  crashBoom: 0.2,
  combo: 0.28,
};

const SFX_PRESET: Record<SfxKind, { preset: SynthPresetName; gain: number }> = {
  playerShoot: { preset: "clickSoft", gain: 0.28 },
  enemyShoot: { preset: "beepHigh", gain: 0.32 },
  enemyHit: { preset: "hitSoft", gain: 0.38 },
  enemyKillScout: { preset: "hitSoft", gain: 0.45 },
  enemyKillFighter: { preset: "hit", gain: 0.5 },
  enemyKillHeavy: { preset: "explosionSmall", gain: 0.55 },
  enemyKillBoss: { preset: "explosion", gain: 0.65 },
  playerHit: { preset: "hit", gain: 0.55 },
  pickupCoin: { preset: "coin", gain: 0.5 },
  pickupHeart: { preset: "shield", gain: 0.48 },
  wave: { preset: "menuSelect", gain: 0.5 },
  combo: { preset: "sparkle", gain: 0.45 },
  bossAppear: { preset: "alarm", gain: 0.58 },
  playerDeath: { preset: "explosion", gain: 0.62 },
  crashBoom: { preset: "hitSoft", gain: 0.4 },
  gameOver: { preset: "gameOverSoft", gain: 0.6 },
};

function logSfx(frame: number, kind: SfxKind): void {
  if (kind === "playerShoot" && frame % 12 !== 0) return;

  const t = frame / FPS;
  const gap = SFX_MIN_GAP_SEC[kind] ?? 0;
  if (gap > 0) {
    const last = lastSfxAt[kind] ?? -1e9;
    if (t - last < gap) return;
    lastSfxAt[kind] = t;
  }
  sfxLog.push({ frame, kind });
}

function resetSfxLog(): void {
  sfxLog.length = 0;
  for (const k of Object.keys(lastSfxAt) as SfxKind[]) delete lastSfxAt[k];
}

function buildSfxTrack(painter: ApexPainter): Buffer {
  return painter.createAudio.sequence({
    events: sfxLog.map(({ frame, kind }) => {
      const { preset, gain } = SFX_PRESET[kind];
      return { at: frame / FPS, preset, gain };
    }),
    tail: 0.25,
    masterGain: 0.95,
  });
}

async function probeWavPeakDb(wavPath: string): Promise<number | null> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  try {
    const { stderr } = await execAsync(
      `ffmpeg -hide_banner -i "${wavPath.replace(/"/g, '\\"')}" -af volumedetect -f null - 2>&1`,
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 }
    );
    const m = (stderr || "").match(/max_volume:\s*([-\d.]+)\s*dB/);
    return m ? parseFloat(m[1]) : null;
  } catch (e) {
    const out = String((e as { stdout?: string; stderr?: string }).stderr ?? "");
    const m = out.match(/max_volume:\s*([-\d.]+)\s*dB/);
    return m ? parseFloat(m[1]) : null;
  }
}

async function probeOutputHasAudio(filePath: string): Promise<boolean> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a -show_entries stream=codec_type -of csv=p=0 "${filePath.replace(/"/g, '\\"')}"`,
      { timeout: 15000 }
    );
    return stdout.includes("audio");
  } catch {
    return false;
  }
}

type Vec = { x: number; y: number; w: number; h: number };
type EnemyKind = "scout" | "fighter" | "heavy" | "boss";
type Bullet = Vec & { vy: number; friendly: boolean; pw: number };
type Enemy = Vec & {
  hp: number;
  maxHp: number;
  shootCd: number;
  kind: EnemyKind;
  bank: number;
  sway: number;
};
type Drop = Vec & { kind: "coin" | "heart"; vy: number; life: number; spin: number };
type ParticleKind = "spark" | "smoke" | "glow" | "ring";
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  kind: ParticleKind;
  grow?: number;
};
type Floater = { x: number; y: number; text: string; life: number; vy: number; color: string; size: number };
type Star = { x: number; y: number; speed: number; size: number; layer: number; twinkle: number };

type GameState = {
  phase: "play" | "crash" | "gameover";
  player: Vec;
  health: number;
  maxHealth: number;
  money: number;
  combo: number;
  comboTimer: number;
  wave: number;
  enemies: Enemy[];
  bullets: Bullet[];
  drops: Drop[];
  particles: Particle[];
  floaters: Floater[];
  stars: Star[];
  engine: Array<{ x: number; y: number; life: number; size: number }>;
  muzzle: number;
  shieldPulse: number;
  screenFlash: number;
  crashT: number;
  shake: number;
  spawnCd: number;
  fireCd: number;
  waveTimer: number;
  bossSpawned: boolean;
  hitIframes: number;
  playerHitFlash: number;
  gameoverStart: number | null;
};

type Sprites = {
  player?: RasterSprite;
  enemy?: RasterSprite;
  enemyBoss?: RasterSprite;
  laserPlayer?: RasterSprite;
  laserEnemy?: RasterSprite;
  coin?: RasterSprite;
  heart?: RasterSprite;
  bg?: RasterSprite;
};

async function download(url: string, dest: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${url}: ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function ensureAssets(
  painter: ApexPainter
): Promise<{ sprites: Sprites; fontFamily: string }> {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const sprites: Sprites = {};
  for (const [key, urls] of Object.entries(ASSET_URLS)) {
    const file = path.join(ASSET_DIR, `${key}.png`);
    let ok = false;
    for (const url of urls) {
      try {
        await download(url, file);
        painter.assets.loadImage(key, file);
        sprites[key as keyof Sprites] = await loadImageCached(file);
        ok = true;
        break;
      } catch {
        /* next mirror */
      }
    }
    if (!ok) console.warn(`[assets] ${key}: using procedural art`);
  }
  const fontPath = path.join(ASSET_DIR, "PressStart2P-Regular.ttf");
  let fontFamily = "Arial";
  try {
    await download(FONT_URL, fontPath);
    painter.assets.loadFont("PressStart2P", fontPath);
    await registerTextFontFromPath(fontPath, "PressStart2P");
    fontFamily = "PressStart2P";
  } catch (e) {
    console.warn(`[font] ${(e as Error).message}`);
  }
  return { sprites, fontFamily };
}

function initStars(): Star[] {
  const stars: Star[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const count = layer === 0 ? 50 : layer === 1 ? 80 : 140;
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        speed: (layer + 1) * (0.6 + Math.random() * 1.4),
        size: layer === 2 ? 1 + Math.random() * 1.5 : layer === 1 ? 1.5 + Math.random() * 2 : 2 + Math.random() * 3,
        layer,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
  return stars;
}

function createState(): GameState {
  const s: GameState = {
    phase: "play",
    player: { x: W / 2 - 44, y: H - 180, w: 88, h: 88 },
    health: 100,
    maxHealth: 100,
    money: 120,
    combo: 0,
    comboTimer: 0,
    wave: 1,
    enemies: [],
    bullets: [],
    drops: [],
    particles: [],
    floaters: [],
    stars: initStars(),
    engine: [],
    muzzle: 0,
    shieldPulse: 0,
    screenFlash: 0,
    crashT: 0,
    shake: 0,
    spawnCd: 8,
    fireCd: 0,
    waveTimer: 0,
    bossSpawned: false,
    hitIframes: 0,
    playerHitFlash: 0,
    gameoverStart: null,
  };
  for (let i = 0; i < 4; i++) {
    spawnEnemy(s, i % 2 === 0 ? "fighter" : "scout");
    const e = s.enemies[s.enemies.length - 1];
    e.y = 60 + i * 110;
    e.x = 80 + i * ((W - 200) / 3);
  }
  return s;
}

function beginCrash(s: GameState, frame: number): void {
  if (s.phase !== "play") return;
  s.phase = "crash";
  s.crashT = 0;
  s.health = 0;
  s.hitIframes = 0;
  s.shake = 9;
  s.playerHitFlash = 0;
  const cx = s.player.x + s.player.w / 2;
  const cy = s.player.y + s.player.h / 2;
  explosion(s, cx, cy, 1.8, "#38bdf8");
  explosion(s, cx, cy, 1.2, "#ef4444");
  s.enemies = [];
  s.bullets = s.bullets.filter((b) => !b.friendly);
  s.screenFlash = 0.35;
  logSfx(frame, "playerDeath");
}

function applyPlayerHit(s: GameState, damage: number, hitX: number, hitY: number, frame: number): void {
  if (s.phase !== "play" || s.hitIframes > 0) return;

  const dealt = Math.max(1, Math.round(damage));
  s.health = Math.max(0, s.health - dealt);
  s.hitIframes = 30;
  s.playerHitFlash = 14;
  s.shieldPulse = 20;
  s.shake = Math.min(7, s.shake + 3.5);
  s.screenFlash = Math.min(0.2, s.screenFlash + 0.06);

  addParticle(s, {
    x: hitX,
    y: hitY,
    vx: (Math.random() - 0.5) * 5,
    vy: (Math.random() - 0.5) * 5,
    life: 12,
    color: "#fca5a5",
    size: 4,
    kind: "spark",
  });

  s.floaters.push({
    x: hitX,
    y: hitY - 12,
    text: `-${dealt}`,
    life: 38,
    vy: -1.4,
    color: "#f87171",
    size: 15,
  });

  logSfx(frame, "playerHit");
  if (s.health <= 0) beginCrash(s, frame);
}

function aabb(a: Vec, b: Vec, pad = 0): boolean {
  return (
    a.x + pad < b.x + b.w - pad &&
    a.x + a.w - pad > b.x + pad &&
    a.y + pad < b.y + b.h - pad &&
    a.y + a.h - pad > b.y + pad
  );
}

function addParticle(
  s: GameState,
  p: Omit<Particle, "maxLife"> & { maxLife?: number }
): void {
  if (s.particles.length > 420) s.particles.shift();
  s.particles.push({ ...p, maxLife: p.maxLife ?? p.life });
}

function explosion(s: GameState, x: number, y: number, scale = 1, hot = "#fb923c"): void {
  for (let i = 0; i < 28 * scale; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (2 + Math.random() * 7) * scale;
    addParticle(s, {
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 18 + Math.floor(Math.random() * 22),
      color: i % 3 === 0 ? "#fef08a" : i % 3 === 1 ? hot : "#f97316",
      size: 2 + Math.random() * 4 * scale,
      kind: "spark",
    });
  }
  for (let i = 0; i < 8; i++) {
    addParticle(s, {
      x,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 2,
      life: 35 + Math.floor(Math.random() * 20),
      color: "rgba(100,116,139,0.5)",
      size: 12 + Math.random() * 18 * scale,
      kind: "smoke",
    });
  }
  addParticle(s, {
    x,
    y,
    vx: 0,
    vy: 0,
    life: 16,
    color: "rgba(255,255,255,0.85)",
    size: 8,
    kind: "ring",
    grow: 3.5 * scale,
  });
  s.screenFlash = Math.min(0.55, s.screenFlash + 0.18 * scale);
}

function spawnEnemy(s: GameState, kind?: EnemyKind): void {
  const roll = Math.random();
  const k: EnemyKind =
    kind ??
    (roll < 0.28 ? "scout" : roll < 0.72 ? "fighter" : roll < 0.92 ? "heavy" : "fighter");
  const specs: Record<EnemyKind, { w: number; h: number; hp: number; bank: number }> = {
    scout: { w: 52, h: 52, hp: 1, bank: 0.04 },
    fighter: { w: 68, h: 68, hp: 2, bank: 0.025 },
    heavy: { w: 92, h: 92, hp: 5, bank: 0.015 },
    boss: { w: 140, h: 140, hp: 28, bank: 0.01 },
  };
  const spec = specs[k];
  s.enemies.push({
    x: 40 + Math.random() * (W - spec.w - 80),
    y: k === "boss" ? -160 : -100 - Math.random() * 80,
    w: spec.w,
    h: spec.h,
    hp: spec.hp,
    maxHp: spec.hp,
    shootCd: 20 + Math.floor(Math.random() * 50),
    kind: k,
    bank: spec.bank,
    sway: Math.random() * Math.PI * 2,
  });
}

function spawnFormation(s: GameState): void {
  const cols = 5;
  const gap = 62;
  const startX = (W - cols * gap) / 2;
  for (let c = 0; c < cols; c++) {
    const e = {
      x: startX + c * gap,
      y: -80 - c * 12,
      w: 56,
      h: 56,
      hp: 2,
      maxHp: 2,
      shootCd: 40 + c * 8,
      kind: "scout" as EnemyKind,
      bank: 0.02,
      sway: c * 0.5,
    };
    s.enemies.push(e);
  }
  s.floaters.push({
    x: W / 2,
    y: H * 0.22,
    text: `WAVE ${s.wave}`,
    life: 48,
    vy: -0.3,
    color: "#7dd3fc",
    size: 22,
  });
}

function killEnemy(s: GameState, e: Enemy, frame: number): void {
  const cx = e.x + e.w / 2;
  const cy = e.y + e.h / 2;
  const killKind: SfxKind =
    e.kind === "boss"
      ? "enemyKillBoss"
      : e.kind === "heavy"
        ? "enemyKillHeavy"
        : e.kind === "scout"
          ? "enemyKillScout"
          : "enemyKillFighter";
  logSfx(frame, killKind);
  explosion(s, cx, cy, e.kind === "boss" ? 2.2 : e.kind === "heavy" ? 1.4 : 1, "#f472b6");
  const bounty = e.kind === "boss" ? 500 : e.kind === "heavy" ? 80 : e.kind === "scout" ? 35 : 55;
  const comboBonus = Math.floor(s.combo * 8);
  s.money += bounty + comboBonus;
  s.combo++;
  s.comboTimer = 72;
  s.floaters.push({
    x: cx,
    y: cy,
    text: `+$${bounty + comboBonus}`,
    life: 42,
    vy: -1.8,
    color: "#fde047",
    size: 16,
  });
  if (s.combo > 2 && s.combo % 3 === 0) {
    logSfx(frame, "combo");
    s.floaters.push({
      x: cx,
      y: cy - 28,
      text: `${s.combo}x COMBO`,
      life: 36,
      vy: -1.2,
      color: "#f472b6",
      size: 14,
    });
  }
  if (Math.random() < (e.kind === "boss" ? 0.95 : 0.5)) {
    s.drops.push({
      x: cx - 20,
      y: cy,
      w: 40,
      h: 40,
      kind: Math.random() < 0.72 ? "coin" : "heart",
      vy: 1.4,
      life: 110,
      spin: Math.random() * Math.PI,
    });
  }
}

function firePlayer(s: GameState, frame: number): void {
  logSfx(frame, "playerShoot");
  const cx = s.player.x + s.player.w / 2;
  const nose = s.player.y + 8;
  s.bullets.push({ x: cx - 5, y: nose, w: 10, h: 28, vy: -18, friendly: true, pw: 2 });
  s.bullets.push({ x: cx - 22, y: nose + 12, w: 8, h: 22, vy: -16, friendly: true, pw: 1.2 });
  s.bullets.push({ x: cx + 14, y: nose + 12, w: 8, h: 22, vy: -16, friendly: true, pw: 1.2 });
  s.muzzle = 4;
  for (let i = 0; i < 6; i++) {
    addParticle(s, {
      x: cx + (Math.random() - 0.5) * 16,
      y: nose,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 4,
      life: 8 + Math.floor(Math.random() * 6),
      color: "rgba(125,211,252,0.9)",
      size: 3 + Math.random() * 3,
      kind: "glow",
    });
  }
}

function updateState(s: GameState, frame: number): void {
  const t = frame / FPS;

  for (const star of s.stars) {
    star.y += star.speed * (1 + star.layer * 0.15);
    star.twinkle += 0.12;
    if (star.y > H + 10) {
      star.y = -10;
      star.x = Math.random() * W;
    }
  }

  s.screenFlash *= 0.82;
  if (s.muzzle > 0) s.muzzle--;
  if (s.shieldPulse > 0) s.shieldPulse--;
  if (s.hitIframes > 0) s.hitIframes--;
  if (s.playerHitFlash > 0) s.playerHitFlash--;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - 1.35);
  if (s.comboTimer > 0) {
    s.comboTimer--;
    if (s.comboTimer <= 0) s.combo = 0;
  }

  s.waveTimer++;
  if (s.waveTimer > FPS * 5 && s.phase === "play") {
    s.wave++;
    s.waveTimer = 0;
    logSfx(frame, "wave");
    spawnFormation(s);
    if (s.wave >= 4 && !s.bossSpawned) {
      spawnEnemy(s, "boss");
      s.bossSpawned = true;
      logSfx(frame, "bossAppear");
    }
  }

  if (s.phase === "crash") {
    s.crashT++;
    if (s.crashT === 1) s.shake = 8;
    if (s.crashT > 8) s.shake = Math.max(0, s.shake - 2.2);
    if (s.crashT % 14 === 0 && s.crashT < CRASH_PHASE_FRAMES - 12) {
      logSfx(frame, "crashBoom");
      explosion(
        s,
        s.player.x + s.player.w / 2 + (Math.random() - 0.5) * 40,
        s.player.y + s.player.h / 2 + (Math.random() - 0.5) * 30,
        0.45
      );
    }
    if (s.crashT >= CRASH_PHASE_FRAMES) {
      s.phase = "gameover";
      s.gameoverStart = frame;
      logSfx(frame, "gameOver");
    }
    tickParticles(s);
    return;
  }

  if (s.phase === "gameover") {
    tickParticles(s);
    return;
  }

  if (s.phase === "play" && frame >= PLAY_DEADLINE_FRAME) {
    beginCrash(s, frame);
    tickParticles(s);
    return;
  }

  s.player.x = W / 2 - s.player.w / 2 + Math.sin(t * 1.9) * 200 + Math.cos(t * 2.8) * 55;
  s.player.y = H - 200 + Math.sin(t * 2.4) * 48 + Math.cos(t * 1.3) * 22;
  s.player.x = Math.max(20, Math.min(W - s.player.w - 20, s.player.x));
  s.player.y = Math.max(H * 0.38, Math.min(H - s.player.h - 16, s.player.y));

  const ex = s.player.x + s.player.w / 2;
  const ey = s.player.y + s.player.h;
  if (frame % 2 === 0) {
    s.engine.push({ x: ex + (Math.random() - 0.5) * 12, y: ey, life: 14, size: 4 + Math.random() * 8 });
  }
  for (let i = s.engine.length - 1; i >= 0; i--) {
    const em = s.engine[i];
    em.y += 5 + Math.random() * 2;
    em.life--;
    if (em.life <= 0) s.engine.splice(i, 1);
  }

  s.spawnCd--;
  if (s.spawnCd <= 0) {
    spawnEnemy(s);
    s.spawnCd = 14 + Math.floor(Math.random() * 12);
  }

  s.fireCd--;
  if (s.fireCd <= 0) {
    firePlayer(s, frame);
    s.fireCd = 4;
  }

  for (const e of s.enemies) {
    e.sway += 0.06;
    // Classic vertical shooter: spawn above, fly **down** (+Y) toward the player.
    const spd = e.kind === "scout" ? 4 : e.kind === "heavy" ? 2.2 : e.kind === "boss" ? 1.5 : 3;
    e.y += spd;
    e.x += Math.sin(e.sway) * (e.kind === "boss" ? 1.2 : 2.4);
    e.x = Math.max(12, Math.min(W - e.w - 12, e.x));
    e.shootCd--;
    const canShoot = e.y > 60 && e.y < H - 220;
    if (e.shootCd <= 0 && canShoot) {
      logSfx(frame, "enemyShoot");
      const cx = e.x + e.w / 2;
      s.bullets.push({
        x: cx - 5,
        y: e.y + e.h,
        w: 10,
        h: 24,
        vy: e.kind === "boss" ? 11 : 8 + Math.random() * 3,
        friendly: false,
        pw: 1.5,
      });
      if (e.kind === "boss" || e.kind === "heavy") {
        s.bullets.push({ x: cx - 28, y: e.y + e.h, w: 8, h: 18, vy: 9, friendly: false, pw: 1 });
        s.bullets.push({ x: cx + 20, y: e.y + e.h, w: 8, h: 18, vy: 9, friendly: false, pw: 1 });
      }
      e.shootCd = e.kind === "boss" ? 22 : 48 + Math.floor(Math.random() * 35);
    }
  }

  for (const b of s.bullets) {
    b.y += b.vy;
    if (frame % 2 === 0) {
      addParticle(s, {
        x: b.x + b.w / 2,
        y: b.y + (b.friendly ? b.h : 0),
        vx: (Math.random() - 0.5) * 0.8,
        vy: b.friendly ? 2 : -1.5,
        life: 10,
        color: b.friendly ? "rgba(56,189,248,0.7)" : "rgba(248,113,113,0.65)",
        size: 2 + b.pw,
        kind: "glow",
      });
    }
  }
  s.bullets = s.bullets.filter((b) => b.y > -60 && b.y < H + 60);

  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    if (e.y > H + 120) {
      s.enemies.splice(i, 1);
      continue;
    }
    for (let j = s.bullets.length - 1; j >= 0; j--) {
      const b = s.bullets[j];
      if (!b.friendly || !aabb(b, e, 4)) continue;
      e.hp--;
      if (e.hp > 0) logSfx(frame, "enemyHit");
      s.bullets.splice(j, 1);
      addParticle(s, {
        x: b.x,
        y: b.y,
        vx: (Math.random() - 0.5) * 4,
        vy: (Math.random() - 0.5) * 4,
        life: 10,
        color: "#fef9c3",
        size: 3,
        kind: "spark",
      });
      if (e.hp <= 0) {
        killEnemy(s, e, frame);
        s.enemies.splice(i, 1);
      }
      break;
    }
  }

  for (let i = s.bullets.length - 1; i >= 0; i--) {
    const b = s.bullets[i];
    if (b.friendly || !aabb(b, s.player, 8)) continue;
    s.bullets.splice(i, 1);
    const dmg = 4 + b.pw * 2;
    applyPlayerHit(s, dmg, b.x + b.w / 2, b.y + b.h / 2, frame);
    if (s.phase !== "play") break;
  }

  for (let i = s.drops.length - 1; i >= 0; i--) {
    const d = s.drops[i];
    d.y += d.vy;
    d.spin += 0.14;
    d.life--;
    if (d.life <= 0 || d.y > H + 50) {
      s.drops.splice(i, 1);
      continue;
    }
    if (aabb(d, s.player, 4)) {
      if (d.kind === "coin") {
        logSfx(frame, "pickupCoin");
        s.money += 65;
        s.floaters.push({ x: d.x, y: d.y, text: "+$65", life: 30, vy: -1.5, color: "#fde047", size: 14 });
      } else {
        logSfx(frame, "pickupHeart");
        s.health = Math.min(s.maxHealth, s.health + 22);
        s.shieldPulse = 24;
        s.floaters.push({ x: d.x, y: d.y, text: "+HP", life: 30, vy: -1.5, color: "#4ade80", size: 14 });
      }
      s.drops.splice(i, 1);
    }
  }

  for (let i = s.floaters.length - 1; i >= 0; i--) {
    const f = s.floaters[i];
    f.y += f.vy;
    f.life--;
    if (f.life <= 0) s.floaters.splice(i, 1);
  }

  tickParticles(s);
}

function tickParticles(s: GameState): void {
  for (let i = s.particles.length - 1; i >= 0; i--) {
    const p = s.particles[i];
    p.x += p.vx;
    p.y += p.vy;
    if (p.kind === "smoke") {
      p.vx *= 0.98;
      p.vy *= 0.98;
      p.size += 0.15;
    }
    if (p.kind === "ring" && p.grow) p.size += p.grow;
    p.life--;
    if (p.life <= 0) s.particles.splice(i, 1);
  }
}

function drawGlowImage(
  ctx: DrawContext,
  img: RasterSprite | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  glow: string,
  fallback: () => void,
  /** Kenney enemy art faces up — rotate 180° so nose points toward player (down). */
  flipY = false
): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  if (flipY) ctx.rotate(Math.PI);
  ctx.translate(-w / 2, -h / 2);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 20;
  if (img) {
    ctx.drawImage(img, 0, 0, w, h);
    ctx.shadowBlur = 0;
    ctx.drawImage(img, 0, 0, w, h);
  } else {
    fallback();
    ctx.shadowBlur = 0;
    fallback();
  }
  ctx.restore();
}

function drawProceduralPlayer(ctx: DrawContext, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  g.addColorStop(0, "#e0f2fe");
  g.addColorStop(0.45, "#38bdf8");
  g.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -h / 2);
  ctx.lineTo(-w / 2, h / 2);
  ctx.lineTo(0, h / 2 - 8);
  ctx.lineTo(w / 2, h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** Drawn in **local** space `(0,0)–(e.w,e.h)` — caller must `translate` to `e.x,e.y`. Nose at bottom (+Y). */
function drawProceduralEnemy(ctx: DrawContext, e: Enemy): void {
  const w = e.w;
  const h = e.h;
  const cx = w / 2;

  const body = ctx.createLinearGradient(cx, 0, cx, h);
  body.addColorStop(0, e.kind === "boss" ? "#7f1d1d" : "#450a0a");
  body.addColorStop(0.55, e.kind === "boss" ? "#dc2626" : "#b91c1c");
  body.addColorStop(1, "#fecaca");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(cx, h - 4);
  ctx.lineTo(cx - w * 0.42, h * 0.35);
  ctx.lineTo(cx - w * 0.48, 6);
  ctx.lineTo(cx - w * 0.12, 0);
  ctx.lineTo(cx + w * 0.12, 0);
  ctx.lineTo(cx + w * 0.48, 6);
  ctx.lineTo(cx + w * 0.42, h * 0.35);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(254,202,202,0.9)";
  ctx.beginPath();
  ctx.ellipse(cx, h * 0.38, w * 0.12, h * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();

  if (e.hp < e.maxHp) {
    const barY = -8;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(4, barY, w - 8, 5);
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(4, barY, (w - 8) * (e.hp / e.maxHp), 5);
  }
}

function drawNebula(ctx: DrawContext, t: number): void {
  const blobs = [
    { x: W * 0.2, y: H * 0.15, r: 220, c: "rgba(99,102,241,0.12)" },
    { x: W * 0.85, y: H * 0.35, r: 180, c: "rgba(236,72,153,0.1)" },
    { x: W * 0.5, y: H * 0.7, r: 260, c: "rgba(14,165,233,0.08)" },
  ];
  for (const b of blobs) {
    const ox = Math.sin(t * 0.4 + b.x) * 30;
    const oy = Math.cos(t * 0.35 + b.y) * 24;
    const rad = ctx.createRadialGradient(b.x + ox, b.y + oy, 0, b.x + ox, b.y + oy, b.r);
    rad.addColorStop(0, b.c);
    rad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rad;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBackground(ctx: DrawContext, sprites: Sprites, t: number): void {
  if (sprites.bg) {
    ctx.globalAlpha = 0.35;
    ctx.drawImage(sprites.bg, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#050816");
  sky.addColorStop(0.45, "#0f172a");
  sky.addColorStop(1, "#020617");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  drawNebula(ctx, t);
}

function drawStars(ctx: DrawContext, stars: Star[]): void {
  for (const star of stars) {
    const tw = 0.45 + Math.sin(star.twinkle) * 0.35;
    ctx.globalAlpha = tw * (0.25 + star.layer * 0.22);
    if (star.layer === 2) {
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(star.x, star.y, star.size, star.size);
    } else {
      const g = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 2);
      g.addColorStop(0, "#fff");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawBullet(ctx: DrawContext, b: Bullet, sprites: Sprites): void {
  const cx = b.x + b.w / 2;
  const grad = ctx.createLinearGradient(cx, b.y, cx, b.y + b.h);
  if (b.friendly) {
    grad.addColorStop(0, "rgba(186,230,253,0)");
    grad.addColorStop(0.35, "#7dd3fc");
    grad.addColorStop(1, "#0ea5e9");
  } else {
    grad.addColorStop(0, "#fecaca");
    grad.addColorStop(1, "#dc2626");
  }
  ctx.fillStyle = grad;
  ctx.shadowColor = b.friendly ? "#38bdf8" : "#ef4444";
  ctx.shadowBlur = 14;
  ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.shadowBlur = 0;
  drawSprite(ctx, b.friendly ? sprites.laserPlayer : sprites.laserEnemy, b.x, b.y, b.w, b.h, () => {});
}

function drawSprite(
  ctx: DrawContext,
  img: RasterSprite | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  _fallback: () => void
): void {
  if (img) ctx.drawImage(img, x, y, w, h);
}

function drawHud(ctx: DrawContext, s: GameState, fontFamily: string, frame: number): void {
  const pad = 16;
  const barW = W - pad * 2;

  ctx.save();
  ctx.fillStyle = "rgba(2,6,23,0.55)";
  ctx.strokeStyle = "rgba(56,189,248,0.35)";
  ctx.lineWidth = 2;
  roundRect(ctx, pad, pad, barW, 78, 12);
  ctx.fill();
  ctx.stroke();

  const hpPct = Math.max(0, s.health / s.maxHealth);
  ctx.fillStyle = "rgba(15,23,42,0.9)";
  roundRect(ctx, pad + 10, pad + 12, barW - 20, 18, 6);
  ctx.fill();
  const hpG = ctx.createLinearGradient(pad, 0, pad + barW, 0);
  hpG.addColorStop(0, "#22c55e");
  hpG.addColorStop(0.5, "#eab308");
  hpG.addColorStop(1, "#ef4444");
  ctx.fillStyle = hpG;
  roundRect(ctx, pad + 10, pad + 12, (barW - 20) * hpPct, 18, 6);
  ctx.fill();

  ctx.font = `12px "${fontFamily}", Arial`;
  ctx.fillStyle = "#94a3b8";
  ctx.textAlign = "left";
  ctx.fillText("HULL", pad + 14, pad + 52);
  ctx.fillStyle = "#f1f5f9";
  ctx.font = `bold 20px "${fontFamily}", Arial`;
  ctx.fillText(`${Math.ceil(s.health)}`, pad + 14, pad + 72);

  ctx.textAlign = "right";
  ctx.fillStyle = "#94a3b8";
  ctx.font = `12px "${fontFamily}", Arial`;
  ctx.fillText("CREDITS", W - pad - 14, pad + 52);
  ctx.fillStyle = "#fde047";
  ctx.font = `bold 20px "${fontFamily}", Arial`;
  ctx.fillText(`$${s.money}`, W - pad - 14, pad + 72);

  if (s.combo > 1) {
    ctx.textAlign = "center";
    ctx.fillStyle = `rgba(244,114,182,${0.6 + Math.sin(frame * 0.35) * 0.4})`;
    ctx.font = `bold 16px "${fontFamily}", Arial`;
    ctx.fillText(`${s.combo}x COMBO`, W / 2, pad + 100);
  }

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(125,211,252,0.85)";
  ctx.font = `11px "${fontFamily}", Arial`;
  ctx.fillText(`WAVE ${s.wave}`, W / 2, pad + 8);
  ctx.restore();
}

function roundRect(
  ctx: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawVignette(ctx: DrawContext): void {
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.72);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

function drawScanlines(ctx: DrawContext, frame: number): void {
  ctx.globalAlpha = 0.04;
  ctx.fillStyle = "#000";
  for (let y = (frame % 3) - 3; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.globalAlpha = 1;
}

function drawFrame(
  ctx: DrawContext,
  s: GameState,
  sprites: Sprites,
  fontFamily: string,
  frame: number
): void {
  const t = frame / FPS;
  const shakeAmt = s.shake > 0.4 ? s.shake * (s.phase === "crash" && s.crashT < 12 ? 1.1 : 0.55) : 0;
  const shakeX = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;
  const shakeY = shakeAmt ? (Math.random() - 0.5) * shakeAmt : 0;

  ctx.save();
  ctx.translate(shakeX, shakeY);

  drawBackground(ctx, sprites, t);
  drawStars(ctx, s.stars);

  for (const em of s.engine) {
    const a = em.life / 14;
    const g = ctx.createRadialGradient(em.x, em.y, 0, em.x, em.y, em.size * 2);
    g.addColorStop(0, `rgba(56,189,248,${a * 0.9})`);
    g.addColorStop(0.5, `rgba(249,115,22,${a * 0.5})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(em.x, em.y, em.size * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const b of s.bullets) drawBullet(ctx, b, sprites);

  for (const d of s.drops) {
    ctx.save();
    ctx.translate(d.x + d.w / 2, d.y + d.h / 2);
    ctx.rotate(d.spin);
    drawGlowImage(
      ctx,
      d.kind === "coin" ? sprites.coin : sprites.heart,
      -d.w / 2,
      -d.h / 2,
      d.w,
      d.h,
      d.kind === "coin" ? "#facc15" : "#4ade80",
      () => {
        ctx.fillStyle = d.kind === "coin" ? "#facc15" : "#f472b6";
        ctx.beginPath();
        ctx.arc(0, 0, d.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    );
    ctx.restore();
  }

  for (const e of s.enemies) {
    if (e.y < -e.h - 20 || e.y > H + 40) continue;
    const img = e.kind === "boss" ? sprites.enemyBoss ?? sprites.enemy : sprites.enemy;
    drawGlowImage(
      ctx,
      img,
      e.x,
      e.y,
      e.w,
      e.h,
      e.kind === "boss" ? "#f87171" : "#fb7185",
      () => drawProceduralEnemy(ctx, e),
      Boolean(img)
    );
  }

  const showPlayer =
    s.phase === "play" ||
    s.phase === "crash" ||
    (s.gameoverStart != null && frame < s.gameoverStart + 18);

  if (showPlayer) {
    const rot = s.phase === "crash" ? (s.crashT / 14) * 1.05 : 0;
    const px = s.player.x + s.player.w / 2;
    const py = s.player.y + s.player.h / 2;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);

    if (s.playerHitFlash > 0) {
      const hf = s.playerHitFlash / 14;
      ctx.fillStyle = `rgba(239,68,68,${hf * 0.45})`;
      ctx.beginPath();
      ctx.arc(0, 0, s.player.w * 0.72, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.shieldPulse > 0 || s.hitIframes > 0) {
      const sp = s.shieldPulse > 0 ? s.shieldPulse / 20 : s.hitIframes / 30;
      ctx.strokeStyle = `rgba(56,189,248,${0.25 + sp * 0.65})`;
      ctx.lineWidth = s.hitIframes > 0 ? 5 : 3;
      ctx.beginPath();
      ctx.arc(0, 0, s.player.w * 0.68, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (s.hitIframes > 0 && Math.floor(frame / 3) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    drawGlowImage(
      ctx,
      sprites.player,
      -s.player.w / 2,
      -s.player.h / 2,
      s.player.w,
      s.player.h,
      "#38bdf8",
      () => drawProceduralPlayer(ctx, s.player.w, s.player.h)
    );
    ctx.globalAlpha = 1;

    if (s.muzzle > 0) {
      ctx.fillStyle = `rgba(255,255,255,${s.muzzle / 5})`;
      ctx.beginPath();
      ctx.arc(0, -s.player.h / 2 - 6, 16 + s.muzzle * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (const p of s.particles) {
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    if (p.kind === "ring") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.stroke();
    } else if (p.kind === "smoke") {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.kind === "glow" ? 12 : 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  for (const f of s.floaters) {
    const a = Math.min(1, f.life / 20);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.font = `bold ${f.size}px "${fontFamily}", Arial`;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 4;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }

  drawHud(ctx, s, fontFamily, frame);
  drawVignette(ctx);
  drawScanlines(ctx, frame);

  if (s.screenFlash > 0.02) {
    ctx.fillStyle = `rgba(255,255,255,${s.screenFlash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (s.gameoverStart != null) {
    const fade = Math.min(1, (frame - s.gameoverStart) / GAMEOVER_FADE_FRAMES);
    ctx.fillStyle = `rgba(0,0,0,${fade * 0.94})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (s.phase === "gameover" && s.gameoverStart != null && frame > s.gameoverStart + 20) {
    const pulse = 0.88 + Math.sin(frame * 0.22) * 0.12;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `32px "${fontFamily}", Arial`;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 10;
    ctx.strokeText("GAME OVER", W / 2, H / 2 - 40);
    ctx.fillStyle = `rgba(239,68,68,${pulse})`;
    ctx.fillText("GAME OVER", W / 2, H / 2 - 40);
    ctx.font = `14px "${fontFamily}", Arial`;
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("CRITICAL FAILURE — EJECTED", W / 2, H / 2 + 4);
    ctx.fillStyle = "#fde047";
    ctx.fillText(`FINAL CREDITS  $${s.money}`, W / 2, H / 2 + 38);
    ctx.fillStyle = "#64748b";
    ctx.fillText(`MAX COMBO  ${s.combo}x  ·  WAVE ${s.wave}`, W / 2, H / 2 + 68);
  }

  ctx.restore();
}

async function main(): Promise<void> {
  console.log("Space shooter video (enhanced) — Apexify.js");
  console.log(`Frames: ${TOTAL_FRAMES} @ ${FPS}fps · procedural audio via painter.createAudio`);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  resetSfxLog();

  const painter = new ApexPainter();
  const { sprites, fontFamily } = await ensureAssets(painter);

  const state = createState();
  const frames: Frame[] = [];

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    frames.push({
      width: W,
      height: H,
      duration: 0,
      onDrawCustom: (ctx) => {
        updateState(state, i);
        drawFrame(ctx, state, sprites, fontFamily, i);
      },
    });
  }

  console.log("Rendering frames…");
  const t0 = Date.now();
  const buffers = await painter.animate(frames, 0, W, H);
  if (!buffers?.length) throw new Error("animate returned no buffers");
  console.log(`Rendered ${buffers.length} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const mp4Silent = path.join(OUT_DIR, "space-shooter-48s-silent.mp4");
  const mp4Path = path.join(OUT_DIR, "space-shooter-48s.mp4");
  console.log("Encoding silent MP4…");
  await painter.createVideo({
    source: buffers[0],
    createFromFrames: {
      frames: buffers,
      outputPath: mp4Silent,
      fps: FPS,
      format: "mp4",
      quality: "high",
      bitrate: 8000,
      resolution: { width: W, height: H },
    },
  });

  console.log(`Synthesizing audio (${sfxLog.length} SFX events)…`);
  const tAudio = Date.now();
  const sfxPath = path.join(OUT_DIR, "space-shooter-sfx.wav");
  const sfx = buildSfxTrack(painter);
  await painter.createAudio.save(sfx, sfxPath);
  const sfxBytes = fs.statSync(sfxPath).size;
  console.log(`Audio built in ${((Date.now() - tAudio) / 1000).toFixed(1)}s → ${sfxPath} (${sfxBytes} bytes)`);
  if (sfxBytes < 1000) {
    console.warn("Warning: SFX WAV is very small — check sfxLog / compose settings.");
  }
  const peakDb = await probeWavPeakDb(sfxPath);
  if (peakDb != null) {
    console.log(`SFX peak level: ${peakDb} dBFS (aim roughly -6 to -3 for clear game audio)`);
    if (peakDb < -24) {
      console.warn("SFX track is very quiet — events may be hard to hear in the MP4.");
    }
    if (peakDb > -0.5) {
      console.warn("SFX track is near clipping — lowering masterGain if distortion occurs.");
    }
  }

  console.log("Muxing audio onto video…");
  const videoResult = await painter.createVideo({
    source: mp4Silent,
    mixAudio: {
      outputPath: mp4Path,
      keepOriginalAudio: false,
      overlays: [{ source: sfxPath, startTime: 0, volume: 1.15 }],
    },
  });

  const hasAudio = await probeOutputHasAudio(mp4Path);
  if (!hasAudio) {
    throw new Error(
      `Output MP4 has no audio track: ${mp4Path}\n` +
        "Check FFmpeg on PATH and play space-shooter-sfx.wav — if WAV has sound, re-run after lib fix."
    );
  }
  console.log("Audio track verified on output MP4.");

  try {
    fs.unlinkSync(mp4Silent);
  } catch {
    /* keep silent file if locked */
  }

  console.log("Done:", videoResult);
  console.log("Output:", mp4Path);
  console.log("Audio stems:", path.join(OUT_DIR, "space-shooter-sfx.wav"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
