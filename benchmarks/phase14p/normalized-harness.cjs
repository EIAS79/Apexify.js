'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');
const zlib = require('node:zlib');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function numberArg(value, fallback, minimum = 1) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) throw new Error(`Expected integer >= ${minimum}, got ${value}.`);
  return parsed;
}

const args = parseArgs(process.argv.slice(2));
if (!args.subject) throw new Error('Usage: node --expose-gc normalized-harness.cjs --subject <path> --label <label> --output <path>');

const subjectRoot = path.resolve(String(args.subject));
const label = String(args.label || path.basename(subjectRoot));
const outputPath = path.resolve(String(args.output || path.join(process.cwd(), `phase14p-${label}.json`)));
const cheapWarmups = numberArg(args['cheap-warmups'], Number(process.env.APEXIFY_BENCH_CHEAP_WARMUPS || 10));
const cheapSamples = numberArg(args['cheap-samples'], Number(process.env.APEXIFY_BENCH_CHEAP_SAMPLES || 30));
const expensiveWarmups = numberArg(args['expensive-warmups'], Number(process.env.APEXIFY_BENCH_EXPENSIVE_WARMUPS || 3));
const expensiveSamples = numberArg(args['expensive-samples'], Number(process.env.APEXIFY_BENCH_EXPENSIVE_SAMPLES || 10));
const memorySamples = numberArg(args['memory-samples'], Number(process.env.APEXIFY_BENCH_MEMORY_SAMPLES || 3));
const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';

function resolveEntry(root) {
  const candidates = [
    path.join(root, 'dist', 'cjs', 'index.cjs'),
    path.join(root, 'dist', 'cjs', 'index.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`No built CJS entry found under ${root}. Checked: ${candidates.join(', ')}`);
  return found;
}

const cjsEntry = resolveEntry(subjectRoot);

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = crcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const payload = Buffer.concat([typeBuffer, data]);
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(payload), 8 + data.length);
  return out;
}

function solidPng(width, height, rgb) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.allocUnsafe(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.allocUnsafe(row.length * height);
  for (let y = 0; y < height; y += 1) row.copy(raw, y * row.length);
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function outputBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && Buffer.isBuffer(value.buffer)) return value.buffer;
  if (value && typeof value.base64 === 'string') return Buffer.from(value.base64, 'base64');
  return null;
}

function outputSignature(value) {
  const buffer = outputBuffer(value);
  if (!buffer) return null;
  return {
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

function verifyOutput(name, value) {
  const buffer = outputBuffer(value);
  if (!buffer || buffer.length === 0) throw new Error(`${name}: operation returned no non-empty binary output.`);
  if (name === 'audio-10-second') {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error(`${name}: output is not a RIFF/WAVE payload.`);
    }
    return;
  }
  if (name === 'gif-30-frame') {
    if (buffer.length < 6 || !buffer.toString('ascii', 0, 6).startsWith('GIF8')) throw new Error(`${name}: output is not a GIF payload.`);
    return;
  }
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < png.length || !buffer.subarray(0, png.length).equals(png)) {
    throw new Error(`${name}: expected PNG output.`);
  }
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  const round = (value) => Number(value.toFixed(3));
  return {
    samples: values.length,
    mean: round(mean),
    median: round(percentile(sorted, 0.5)),
    p50: round(percentile(sorted, 0.5)),
    p90: round(percentile(sorted, 0.9)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    standardDeviation: round(standardDeviation),
    coefficientOfVariation: mean === 0 ? 0 : round(standardDeviation / mean),
  };
}

async function timedOperation(operation) {
  if (global.gc) global.gc();
  const started = performance.now();
  const value = await operation();
  const ended = performance.now();
  return { wallMs: ended - started, value };
}

async function memoryOperation(operation) {
  if (global.gc) global.gc();
  const before = process.memoryUsage();
  let peakRss = before.rss;
  let peakHeapUsed = before.heapUsed;
  let peakExternal = before.external;
  const sampler = setInterval(() => {
    const now = process.memoryUsage();
    peakRss = Math.max(peakRss, now.rss);
    peakHeapUsed = Math.max(peakHeapUsed, now.heapUsed);
    peakExternal = Math.max(peakExternal, now.external);
  }, 2);
  sampler.unref();
  try {
    const value = await operation();
    const after = process.memoryUsage();
    peakRss = Math.max(peakRss, after.rss);
    peakHeapUsed = Math.max(peakHeapUsed, after.heapUsed);
    peakExternal = Math.max(peakExternal, after.external);
    return {
      value,
      startRssBytes: before.rss,
      peakRssBytes: peakRss,
      rssDeltaBytes: Math.max(0, peakRss - before.rss),
      startHeapUsedBytes: before.heapUsed,
      peakHeapUsedBytes: peakHeapUsed,
      heapUsedDeltaBytes: Math.max(0, peakHeapUsed - before.heapUsed),
      startExternalBytes: before.external,
      peakExternalBytes: peakExternal,
      externalDeltaBytes: Math.max(0, peakExternal - before.external),
    };
  } finally {
    clearInterval(sampler);
  }
}

async function benchmark(name, kind, operation) {
  const warmups = kind === 'expensive' ? expensiveWarmups : cheapWarmups;
  const samples = kind === 'expensive' ? expensiveSamples : cheapSamples;
  for (let i = 0; i < warmups; i += 1) {
    const value = await operation();
    verifyOutput(name, value);
  }

  const wall = [];
  const signatures = [];
  for (let i = 0; i < samples; i += 1) {
    const measured = await timedOperation(operation);
    verifyOutput(name, measured.value);
    wall.push(measured.wallMs);
    signatures.push(outputSignature(measured.value));
  }

  const memory = [];
  for (let i = 0; i < memorySamples; i += 1) {
    const measured = await memoryOperation(operation);
    verifyOutput(name, measured.value);
    memory.push(measured);
  }

  const signatureKeys = signatures.filter(Boolean).map((entry) => `${entry.bytes}:${entry.sha256}`);
  const uniqueSignatures = [...new Set(signatureKeys)];
  const memoryFieldStats = (field) => stats(memory.map((entry) => entry[field]));
  return {
    name,
    kind,
    status: 'pass',
    warmups,
    timing: stats(wall),
    memory: {
      samples: memory.length,
      peakRssBytes: memoryFieldStats('peakRssBytes'),
      rssDeltaBytes: memoryFieldStats('rssDeltaBytes'),
      peakHeapUsedBytes: memoryFieldStats('peakHeapUsedBytes'),
      heapUsedDeltaBytes: memoryFieldStats('heapUsedDeltaBytes'),
      peakExternalBytes: memoryFieldStats('peakExternalBytes'),
      externalDeltaBytes: memoryFieldStats('externalDeltaBytes'),
    },
    output: {
      stableWithinSubject: uniqueSignatures.length <= 1,
      uniqueSignatures,
      representative: signatures.find(Boolean) || null,
    },
  };
}

function ffmpegVersion() {
  const proc = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', timeout: 10000 });
  if (proc.status !== 0) return null;
  return String(proc.stdout || '').split(/\r?\n/, 1)[0] || null;
}

function coldImportOperation() {
  const proc = spawnSync(process.execPath, ['-e', 'require(process.argv[1])', cjsEntry], {
    cwd: subjectRoot,
    encoding: 'utf8',
    timeout: 30000,
    env: process.env,
  });
  if (proc.status !== 0) {
    throw new Error(`cold import failed (${proc.status ?? proc.signal}): ${(proc.stderr || proc.stdout || '').trim().slice(0, 1200)}`);
  }
  return Buffer.from('ok');
}

async function benchmarkColdImport() {
  for (let i = 0; i < cheapWarmups; i += 1) coldImportOperation();
  const wall = [];
  for (let i = 0; i < cheapSamples; i += 1) {
    const started = performance.now();
    coldImportOperation();
    wall.push(performance.now() - started);
  }
  return {
    name: 'cold-cjs-import',
    kind: 'cheap',
    status: 'pass',
    warmups: cheapWarmups,
    timing: stats(wall),
    memory: null,
    output: { stableWithinSubject: true, uniqueSignatures: [], representative: null },
  };
}

async function main() {
  const results = [];
  results.push(await benchmarkColdImport());

  const { ApexPainter } = require(cjsEntry);
  if (typeof ApexPainter !== 'function') throw new Error(`${cjsEntry} does not export ApexPainter.`);
  const painter = new ApexPainter('png');

  const baseFixture = solidPng(1200, 630, [16, 24, 32]);
  const sourceFixture = solidPng(320, 180, [58, 134, 255]);
  const gifFixture = solidPng(320, 180, [20, 33, 61]);

  const textProps = {
    text: 'Apexify.js normalized Phase 14-P baseline',
    x: 72,
    y: 160,
    font: { size: 56, family: fontFamily },
    fill: { color: '#ffffff' },
  };

  const chartData = Array.from({ length: 8 }, (_, i) => ({
    label: `S${i + 1}`,
    value: [14, 38, 29, 51, 44, 63, 57, 72][i],
    xStart: i,
    xEnd: i + 1,
  }));

  const gifFrames = Array.from({ length: 30 }, () => ({ duration: 33, buffer: gifFixture }));

  results.push(await benchmark('canvas-1200x630', 'cheap', () => painter.createCanvas({
    width: 1200,
    height: 630,
    colorBg: '#101820',
  })));

  results.push(await benchmark('text-render', 'cheap', () => painter.createText(textProps, baseFixture)));

  results.push(await benchmark('single-image-composition', 'cheap', () => painter.createImage({
    source: sourceFixture,
    x: 440,
    y: 225,
    width: 320,
    height: 180,
    borderRadius: 18,
  }, baseFixture)));

  results.push(await benchmark('medium-scene', 'cheap', () => painter.renderScene({
    width: 1200,
    height: 630,
    background: { colorBg: '#0b132b' },
    layers: [
      { type: 'image', images: { source: 'rectangle', x: 80, y: 80, width: 1040, height: 470, shape: { fill: true, color: '#1c2541' }, borderRadius: 24 } },
      { type: 'text', texts: { text: 'Medium scene', x: 140, y: 180, font: { size: 54, family: fontFamily }, fill: { color: '#ffffff' } } },
      { type: 'text', texts: { text: 'Apexify.js normalized baseline', x: 140, y: 260, font: { size: 30, family: fontFamily }, fill: { color: '#d8e2dc' } } },
      { type: 'imageBuffer', buffer: sourceFixture, x: 140, y: 330, width: 320, height: 180, globalAlpha: 0.95 },
      { type: 'surface', placement: { x: 700, y: 330, width: 300, height: 160 }, background: { colorBg: '#5bc0be' }, layers: [
        { type: 'text', texts: { text: 'nested surface', x: 24, y: 80, font: { size: 28, family: fontFamily }, fill: { color: '#0b132b' } } },
      ] },
    ],
  })));

  results.push(await benchmark('chart-render', 'cheap', () => painter.createChart('bar', chartData)));

  results.push(await benchmark('gif-30-frame', 'expensive', () => painter.createGIF(gifFrames, {
    outputFormat: 'buffer',
    width: 320,
    height: 180,
    repeat: 0,
    quality: 10,
  })));

  results.push(await benchmark('audio-10-second', 'expensive', () => painter.createAudio.synth({
    duration: 10,
    sampleRate: 44100,
    channels: 2,
    masterGain: 0.5,
    layers: [
      { waveform: 'sine', frequency: 220, frequencyEnd: 440, duration: 10, gain: 0.35 },
      { waveform: 'triangle', frequency: 110, duration: 10, gain: 0.15, pan: -0.25 },
    ],
  })));

  const report = {
    schemaVersion: 1,
    phase: '14-P',
    label,
    generatedAt: new Date().toISOString(),
    subjectRoot,
    cjsEntry: path.relative(subjectRoot, cjsEntry),
    environment: {
      node: process.version,
      npmUserAgent: process.env.npm_config_user_agent || null,
      platform: `${process.platform}-${process.arch}`,
      cpuModel: require('node:os').cpus()[0]?.model || null,
      cpuCount: require('node:os').cpus().length,
      ffmpeg: ffmpegVersion(),
      fontFamily,
      tz: process.env.TZ || null,
      locale: process.env.LC_ALL || process.env.LANG || null,
      exposeGc: typeof global.gc === 'function',
    },
    methodology: {
      cheapWarmups,
      cheapSamples,
      expensiveWarmups,
      expensiveSamples,
      memorySamples,
      timingExcludesOutputHashing: true,
      memorySamplingSeparatedFromTiming: true,
      deterministicRasterFixtures: true,
    },
    fixtureDigests: {
      base1200x630: outputSignature(baseFixture),
      source320x180: outputSignature(sourceFixture),
      gif320x180: outputSignature(gifFixture),
    },
    results,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`phase14p normalized harness: wrote ${outputPath}`);
  for (const result of results) {
    console.log(`${result.name}: median=${result.timing?.median ?? 'n/a'} ms p95=${result.timing?.p95 ?? 'n/a'} ms cv=${result.timing?.coefficientOfVariation ?? 'n/a'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
