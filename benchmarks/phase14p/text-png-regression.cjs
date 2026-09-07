'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');

const root = process.cwd();
const fixtureRoot = path.join(root, 'benchmarks', '.phase14p-source', 'lib-next');
const {
  encodeTextCanvasPng,
  TEXT_FAST_PNG_MAX_RAW_BYTES,
} = require(path.join(fixtureRoot, 'text', 'text-png-encoder.js'));
const {
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
} = require(path.join(fixtureRoot, 'runtime', 'config.js'));

const SEMANTIC_TYPES = new Set(['sBIT', 'sRGB', 'pHYs', 'iCCP', 'gAMA', 'cHRM']);
const REQUIRED_SEMANTICS = ['sBIT:08080808', 'sRGB:00'];

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function semanticChunks(png) {
  const result = [];
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const end = dataStart + length + 4;
    assert.ok(end <= png.length, `malformed PNG chunk ${type}`);
    if (SEMANTIC_TYPES.has(type)) result.push(`${type}:${png.subarray(dataStart, dataStart + length).toString('hex')}`);
    offset = end;
    if (type === 'IEND') break;
  }
  return result;
}

async function decodedHash(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return `${info.width}x${info.height}x${info.channels}:${hash(data)}`;
}

function makeTransparentFixture() {
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255, 40, 80, 0.37)';
  ctx.fillRect(24, 30, 280, 210);
  ctx.fillStyle = 'rgba(20, 180, 255, 0.61)';
  ctx.beginPath();
  ctx.arc(360, 170, 120, 0, Math.PI * 2);
  ctx.fill();
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function makeFallbackFixture() {
  // 2,100 x 2,000 x 4 = 16,800,000 bytes, deliberately just above the 16 MiB fast-path ceiling.
  const canvas = createCanvas(2100, 2000);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#101820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(32, 32, 256, 256);
  return canvas;
}

(async () => {
  assert.equal(TEXT_FAST_PNG_MAX_RAW_BYTES, 16 * 1024 * 1024, 'text fast-path memory ceiling drifted');

  const fallbacks = [];
  configureApexifyRuntime({
    diagnostics: {
      handler(event) {
        if (event.code === 'TEXT_PNG_FAST_PATH_FALLBACK') fallbacks.push(event);
      },
    },
  });

  try {
    const transparent = makeTransparentFixture();
    const nativeTransparent = await transparent.encode('png');
    const fastTransparent = await encodeTextCanvasPng(transparent);

    assert.equal(await decodedHash(fastTransparent), await decodedHash(nativeTransparent), 'transparent fast-path RGBA changed');
    assert.deepEqual(semanticChunks(nativeTransparent), REQUIRED_SEMANTICS, 'native Skia PNG semantic contract drifted');
    assert.deepEqual(semanticChunks(fastTransparent), REQUIRED_SEMANTICS, 'fast-path PNG semantic contract drifted');
    assert.equal(fallbacks.length, 0, 'small transparent fixture unexpectedly fell back to Skia');

    const large = makeFallbackFixture();
    const rawBytes = large.width * large.height * 4;
    assert.ok(rawBytes > TEXT_FAST_PNG_MAX_RAW_BYTES, 'large fallback fixture no longer exceeds fast-path ceiling');
    const fallbackOutput = await encodeTextCanvasPng(large);
    const nativeLarge = await large.encode('png');
    assert.ok(fallbackOutput.equals(nativeLarge), 'oversized text PNG path did not preserve the native Skia fallback bytes');

    console.log('Phase 14-P text PNG regression: PASS');
    console.log(`transparent pixels=${await decodedHash(fastTransparent)}`);
    console.log(`transparent semantics=${semanticChunks(fastTransparent).join(',')}`);
    console.log(`transparent bytes native=${nativeTransparent.length} fast=${fastTransparent.length}`);
    console.log(`fallback rawBytes=${rawBytes} ceiling=${TEXT_FAST_PNG_MAX_RAW_BYTES} nativeByteParity=true`);
  } finally {
    resetApexifyRuntimeConfig();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
