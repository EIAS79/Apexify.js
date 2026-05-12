/**
 * Compares classic buffer chaining (createCanvas → createImage → createText → drawPath per step)
 * vs one {@link ApexPainter.renderScene} with the same logical layers.
 *
 * Run from repo root:
 *   npx ts-node --transpile-only scripts/benchmark-scene-vs-buffer-chain.ts
 *
 * PowerShell (more rounds, save PNGs to apexify-output):
 *   $env:ROUNDS="28"; $env:ITERATIONS="5"; $env:SAVE="1"; npx ts-node --transpile-only scripts/benchmark-scene-vs-buffer-chain.ts
 */
import { performance } from "node:perf_hooks";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { ApexPainter } from "../lib/index";
import type { ImageProperties, TextProperties } from "../lib/Canvas/utils/types";
import type { PathCommand } from "../lib/Canvas/utils/foundation/pathCmd";
import type { SceneLayer } from "../lib/Canvas/services/SceneCreator";

const W = 900;
const H = 700;
/** Each "round" = one small shape + label + diagonal stroke (same work in both modes). */
const ROUNDS = Number(process.env.ROUNDS) || 20;
/** Repeat full benchmark this many times; report min / mean ms. */
const OUTER_ITERATIONS = Number(process.env.ITERATIONS) || 3;
const SAVE_SAMPLES = process.env.SAVE === "1";

function rectAt(i: number): ImageProperties {
  const col = i % 14;
  const row = Math.floor(i / 14);
  const x = 24 + col * 62;
  const y = 24 + row * 62;
  return {
    source: "rectangle",
    x,
    y,
    width: 48,
    height: 28,
    shape: {
      fill: true,
      color: `hsl(${(i * 17) % 360}, 55%, 45%)`,
    },
  };
}

function textAt(i: number): TextProperties {
  const col = i % 14;
  const row = Math.floor(i / 14);
  return {
    text: String(i),
    x: 36 + col * 62,
    y: 44 + row * 62,
    font: { size: 14, family: "Arial" },
    color: "#f0f0f0",
    textAlign: "center",
    textBaseline: "middle",
  };
}

function pathAt(i: number): PathCommand[] {
  const col = i % 14;
  const row = Math.floor(i / 14);
  const x0 = 20 + col * 62;
  const y0 = 20 + row * 62;
  const x1 = x0 + 56;
  const y1 = y0 + 40;
  return [
    { type: "moveTo", x: x0, y: y0 },
    { type: "lineTo", x: x1, y: y1 },
  ];
}

const pathStroke = {
  stroke: { color: "rgba(255,255,255,0.35)", width: 1.2 },
} as const;

async function runBufferChain(painter: ApexPainter): Promise<Buffer> {
  const { buffer } = await painter.createCanvas({
    width: W,
    height: H,
    colorBg: "#1a1a2e",
  });
  let buf = buffer;
  for (let i = 0; i < ROUNDS; i++) {
    buf = await painter.createImage(rectAt(i), buf);
    buf = await painter.createText(textAt(i), buf);
    buf = await painter.drawPath(buf, pathAt(i), pathStroke);
  }
  return buf;
}

async function runScene(painter: ApexPainter): Promise<Buffer> {
  const layers: SceneLayer[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    layers.push({ type: "image", images: rectAt(i) });
    layers.push({ type: "text", texts: textAt(i) });
    layers.push({ type: "path", path: pathAt(i), options: { ...pathStroke } });
  }
  return painter.renderScene({
    width: W,
    height: H,
    background: { colorBg: "#1a1a2e" },
    layers,
  });
}

function statsMs(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return { min, max, mean };
}

async function main() {
  const painter = new ApexPainter();
  const bufferSamples: number[] = [];
  const sceneSamples: number[] = [];

  // Warmup (JIT, font caches)
  await runBufferChain(painter);
  await runScene(painter);

  let lastBuffer: Buffer | null = null;
  let lastScene: Buffer | null = null;

  for (let k = 0; k < OUTER_ITERATIONS; k++) {
    let t0 = performance.now();
    lastBuffer = await runBufferChain(painter);
    bufferSamples.push(performance.now() - t0);

    t0 = performance.now();
    lastScene = await runScene(painter);
    sceneSamples.push(performance.now() - t0);
  }

  const b = statsMs(bufferSamples);
  const s = statsMs(sceneSamples);
  const ratioMean = b.mean / s.mean;
  const ratioMin = b.min / s.min;

  console.log("\n=== Apexify.js: buffer chain vs renderScene ===\n");
  console.log(`Canvas: ${W}×${H}  |  Rounds: ${ROUNDS} (each round = image + text + path)  |  Iterations: ${OUTER_ITERATIONS}`);
  console.log(`Classic chain: ${ROUNDS * 3} steps × (decode PNG + draw + encode PNG) on full canvas\n`);

  console.log("Buffer chain (createCanvas → createImage → createText → drawPath …)");
  console.log(`  min: ${b.min.toFixed(1)} ms  max: ${b.max.toFixed(1)} ms  mean: ${b.mean.toFixed(1)} ms`);

  console.log("\nrenderScene (single context, one final PNG encode)");
  console.log(`  min: ${s.min.toFixed(1)} ms  max: ${s.max.toFixed(1)} ms  mean: ${s.mean.toFixed(1)} ms`);

  console.log("\nSpeedup (buffer mean / scene mean):");
  console.log(`  mean: ${ratioMean.toFixed(2)}× faster with scene`);
  console.log(`  min-best: ${ratioMin.toFixed(2)}× (best buffer vs best scene)`);

  if (lastBuffer && lastScene && lastBuffer.length !== lastScene.length) {
    console.log("\nNote: output PNG sizes differ (non-deterministic compression); pixel equality not asserted.");
  }

  if (SAVE_SAMPLES && lastBuffer && lastScene) {
    const dir = path.join(process.cwd(), "apexify-output");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "bench-buffer-chain.png"), lastBuffer);
    writeFileSync(path.join(dir, "bench-render-scene.png"), lastScene);
    console.log("\nWrote apexify-output/bench-buffer-chain.png and bench-render-scene.png (SAVE=1)");
  }

  console.log("");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
