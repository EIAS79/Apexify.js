'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1];
    if (value !== undefined && !value.startsWith('--')) {
      out[key] = value;
      index += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function resolveEntry(root) {
  const entries = [
    path.join(root, 'dist', 'cjs', 'index.cjs'),
    path.join(root, 'dist', 'cjs', 'index.js'),
  ];
  const entry = entries.find((candidate) => fs.existsSync(candidate));
  if (!entry) throw new Error(`No CJS Apexify entry found in ${root}.`);
  return entry;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subjectRoot = path.resolve(String(args.subject || '.'));
  const workload = String(args.workload || 'text');
  const repeats = Math.max(1, Number(args.repeats || 120));
  const entry = resolveEntry(subjectRoot);
  const { ApexPainter } = require(entry);
  const painter = new ApexPainter('png');
  const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';

  const base = (await painter.createCanvas({ width: 1200, height: 630, colorBg: '#101820' })).buffer;
  const source = (await painter.createCanvas({ width: 320, height: 180, colorBg: '#3a86ff' })).buffer;
  const text = {
    text: 'Apexify.js Phase 14-P profiler workload',
    x: 72,
    y: 160,
    font: { size: 56, family: fontFamily },
    fill: { color: '#ffffff' },
  };
  const chartData = Array.from({ length: 12 }, (_, i) => ({
    label: `S${i + 1}`,
    value: [14, 38, 29, 51, 44, 63, 57, 72, 49, 66, 54, 75][i],
    xStart: i,
    xEnd: i + 1,
  }));

  const operations = {
    canvas: () => painter.createCanvas({ width: 1200, height: 630, colorBg: '#101820' }),
    text: () => painter.createText(text, base),
    measureText: () => painter.measureText(text),
    image: () => painter.createImage({ source, x: 440, y: 225, width: 320, height: 180, borderRadius: 18 }, base),
    chart: () => painter.createChart('bar', chartData),
    scene: () => painter.renderScene({
      width: 1200,
      height: 630,
      background: { colorBg: '#0b132b' },
      layers: [
        { type: 'text', texts: text },
        { type: 'imageBuffer', buffer: source, x: 140, y: 330, width: 320, height: 180 },
      ],
    }),
  };
  const operation = operations[workload];
  if (!operation) throw new Error(`Unknown workload '${workload}'. Supported: ${Object.keys(operations).join(', ')}`);

  for (let i = 0; i < 10; i += 1) await operation();
  if (global.gc) global.gc();
  const started = performance.now();
  let outputBytes = 0;
  for (let i = 0; i < repeats; i += 1) {
    const value = await operation();
    if (Buffer.isBuffer(value)) outputBytes += value.length;
    else if (value && Buffer.isBuffer(value.buffer)) outputBytes += value.buffer.length;
  }
  const elapsedMs = performance.now() - started;
  const memory = process.memoryUsage();
  process.stdout.write(`${JSON.stringify({ workload, repeats, elapsedMs, averageMs: elapsedMs / repeats, outputBytes, memory }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
