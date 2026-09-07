'use strict';

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const sharp = require('sharp');

const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';
const warmups = Number(process.env.APEXIFY_PNG_PROBE_WARMUPS || 5);
const samples = Number(process.env.APEXIFY_PNG_PROBE_SAMPLES || 20);
const PNG_SIGNATURE_BYTES = 8;

function textCanvas() {
  const canvas = createCanvas(1200, 630);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, 1200, 630);
  ctx.font = `56px ${fontFamily}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Apexify.js normalized Phase 14-P baseline', 72, 160);
  return canvas;
}
function transparentCanvas() {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 640, 360);
  ctx.fillStyle = 'rgba(255, 40, 80, 0.37)';
  ctx.fillRect(24, 30, 280, 210);
  ctx.fillStyle = 'rgba(20, 180, 255, 0.61)';
  ctx.beginPath(); ctx.arc(360, 170, 120, 0, Math.PI * 2); ctx.fill();
  ctx.font = `42px ${fontFamily}`;
  ctx.fillStyle = 'rgba(255,255,255,0.73)';
  ctx.fillText('alpha edges', 70, 310);
  return canvas;
}
function gradientCanvas() {
  const canvas = createCanvas(800, 500);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 800, 500);
  gradient.addColorStop(0, '#ff006e'); gradient.addColorStop(0.37, '#8338ec');
  gradient.addColorStop(0.72, '#3a86ff'); gradient.addColorStop(1, '#06d6a0');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 800, 500);
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetX = 6; ctx.shadowOffsetY = 8;
  ctx.font = `64px ${fontFamily}`; ctx.fillStyle = '#ffffff'; ctx.fillText('gradient + shadow', 70, 270);
  return canvas;
}
function compositingCanvas() {
  const canvas = createCanvas(720, 480);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0b132b'; ctx.fillRect(0, 0, 720, 480);
  ctx.globalAlpha = 0.82; ctx.fillStyle = '#5bc0be'; ctx.fillRect(80, 70, 430, 280);
  ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = '#ff9f1c';
  ctx.beginPath(); ctx.arc(430, 250, 155, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.font = `38px ${fontFamily}`; ctx.fillStyle = '#ffffff'; ctx.fillText('composite', 245, 430);
  return canvas;
}
function percentile(sorted, p) { const index = (sorted.length - 1) * p; const lo = Math.floor(index); const hi = Math.ceil(index); if (lo === hi) return sorted[lo]; const w = index - lo; return sorted[lo] * (1 - w) + sorted[hi] * w; }
function stats(values) { const sorted = [...values].sort((a, b) => a - b); return { median: Number(percentile(sorted, 0.5).toFixed(3)), p95: Number(percentile(sorted, 0.95).toFixed(3)), min: Number(sorted[0].toFixed(3)), max: Number(sorted[sorted.length - 1].toFixed(3)) }; }
function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
  return table;
})();
function crc32(buffer) { let c = 0xffffffff; for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function makePngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0); typeBuffer.copy(chunk, 4); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}
function pngChunks(png) {
  const chunks = []; let offset = PNG_SIGNATURE_BYTES;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset); const type = png.toString('ascii', offset + 4, offset + 8); const dataStart = offset + 8; const end = dataStart + length + 4;
    if (end > png.length) throw new Error(`Malformed PNG chunk ${type}.`);
    chunks.push({ type, offset, length, data: png.subarray(dataStart, dataStart + length), end }); offset = end; if (type === 'IEND') break;
  }
  return chunks;
}
function withSkiaSemanticChunks(png) {
  const chunks = pngChunks(png);
  if (chunks.some((chunk) => chunk.type === 'sBIT' || chunk.type === 'sRGB')) throw new Error('Unexpected Sharp semantic PNG chunks already present.');
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');
  if (!ihdr) throw new Error('PNG output is missing IHDR.');
  const sbit = makePngChunk('sBIT', Buffer.from([8, 8, 8, 8]));
  const srgb = makePngChunk('sRGB', Buffer.from([0]));
  return Buffer.concat([png.subarray(0, ihdr.end), sbit, srgb, png.subarray(ihdr.end)]);
}
async function decoded(png) {
  const metadata = await sharp(png).metadata();
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { hash: hash(data), info, metadata: { width: metadata.width, height: metadata.height, space: metadata.space, channels: metadata.channels, depth: metadata.depth, density: metadata.density ?? null, hasAlpha: metadata.hasAlpha, isProgressive: metadata.isProgressive, hasProfile: metadata.hasProfile } };
}
function rawView(typed) { return Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength); }
async function encodeSharpImageData(canvas, compressionLevel = 6) {
  const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const encoded = await sharp(rawView(imageData.data), { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .png({ compressionLevel, adaptiveFiltering: false, palette: false }).toBuffer();
  return withSkiaSemanticChunks(encoded);
}
async function run(name, encode) {
  for (let i = 0; i < warmups; i += 1) await encode();
  const timings = []; let representative;
  for (let i = 0; i < samples; i += 1) { if (global.gc) global.gc(); const started = performance.now(); const output = await encode(); timings.push(performance.now() - started); representative ||= output; }
  return { name, timing: stats(timings), bytes: representative.length, encodedHash: hash(representative), decoded: await decoded(representative), chunks: pngChunks(representative).map((chunk) => `${chunk.type}:${chunk.data.toString('hex')}`) };
}
async function once(name, encode) { const output = await encode(); return { name, timing: null, bytes: output.length, encodedHash: hash(output), decoded: await decoded(output), chunks: pngChunks(output).map((chunk) => `${chunk.type}:${chunk.data.toString('hex')}`) }; }
async function verifyFixture(label, canvas, benchmark = false) {
  const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  const imageDataHash = hash(rawView(imageData.data));
  const skia = benchmark ? await run(`${label}-skia`, () => canvas.encode('png')) : await once(`${label}-skia`, () => canvas.encode('png'));
  const sharpC6 = benchmark ? await run(`${label}-sharp-c6`, () => encodeSharpImageData(canvas, 6)) : await once(`${label}-sharp-c6`, () => encodeSharpImageData(canvas, 6));
  const sharpC8 = benchmark ? await run(`${label}-sharp-c8`, () => encodeSharpImageData(canvas, 8)) : null;
  const reference = skia.decoded.hash;
  console.log(`\n[${label}] ${canvas.width}x${canvas.height}`);
  console.log(`imageData matchesSkia=${imageDataHash === reference}`);
  console.log(`sharpC6 matchesSkia=${sharpC6.decoded.hash === reference}`);
  console.log(`skia metadata=${JSON.stringify(skia.decoded.metadata)} chunks=${skia.chunks.filter((v) => v.startsWith('IHDR:') || v.startsWith('sBIT:') || v.startsWith('sRGB:')).join(',')}`);
  console.log(`sharp metadata=${JSON.stringify(sharpC6.decoded.metadata)} chunks=${sharpC6.chunks.filter((v) => v.startsWith('IHDR:') || v.startsWith('sBIT:') || v.startsWith('sRGB:')).join(',')}`);
  const report = (result) => { const sizeChange = ((result.bytes / skia.bytes) - 1) * 100; const timing = result.timing ? ` median=${result.timing.median.toFixed(3)} ms p95=${result.timing.p95.toFixed(3)} ms` : ''; console.log(`${result.name.padEnd(25)}${timing} bytes=${result.bytes} size=${sizeChange >= 0 ? '+' : ''}${sizeChange.toFixed(1)}%`); };
  if (benchmark) report(skia); report(sharpC6); if (sharpC8) report(sharpC8);
  if (imageDataHash !== reference || sharpC6.decoded.hash !== reference || (sharpC8 && sharpC8.decoded.hash !== reference)) throw new Error(`${label}: lossless decoded-pixel parity failed.`);
  const sm = skia.decoded.metadata; const fm = sharpC6.decoded.metadata;
  if (fm.space !== sm.space || fm.channels !== sm.channels || fm.depth !== sm.depth || fm.density !== sm.density || fm.hasAlpha !== sm.hasAlpha || fm.isProgressive !== sm.isProgressive || fm.hasProfile !== sm.hasProfile) throw new Error(`${label}: fast PNG metadata parity failed.`);
  const skiaSemantic = skia.chunks.filter((v) => v.startsWith('sBIT:') || v.startsWith('sRGB:'));
  const fastSemantic = sharpC6.chunks.filter((v) => v.startsWith('sBIT:') || v.startsWith('sRGB:'));
  if (JSON.stringify(fastSemantic) !== JSON.stringify(skiaSemantic)) throw new Error(`${label}: sBIT/sRGB chunk parity failed.`);
}
(async () => {
  console.log(`sharp concurrency=${sharp.concurrency()}`);
  console.log('Phase 14-P Skia-semantic lossless PNG probe');
  await verifyFixture('opaque-text', textCanvas(), true);
  await verifyFixture('transparent-alpha', transparentCanvas(), true);
  await verifyFixture('gradient-shadow', gradientCanvas());
  await verifyFixture('compositing', compositingCanvas());
})().catch((error) => { console.error(error); process.exitCode = 1; });
