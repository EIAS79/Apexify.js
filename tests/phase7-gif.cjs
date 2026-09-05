'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase7/phase7-entry.cjs');

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function gifHeader(buffer) {
  return buffer.subarray(0, 6).toString('ascii');
}

function assertGif(buffer, label = 'GIF') {
  assert.ok(Buffer.isBuffer(buffer), `${label} must be a Buffer`);
  assert.ok(['GIF87a', 'GIF89a'].includes(gifHeader(buffer)), `${label} has invalid signature`);
}

async function decodeFirst(buffer) {
  return sharp(buffer, { page: 0 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const painter = new api.ApexPainter();
  const red = solidPng(8, 8, '#ff0000');
  const blue = solidPng(24, 4, '#0000ff');
  const watermark = solidPng(3, 3, '#ffffff');
  const frames = [
    { buffer: red, duration: 20 },
    { buffer: blue, duration: 30 },
  ];

  // Common/output validation must run even when generated-frame mode is selected.
  let onStartCalled = false;
  await assert.rejects(
    painter.createGIF(undefined, {
      outputFormat: 'wrong',
      width: 16,
      height: 12,
      onStart: async () => {
        onStartCalled = true;
        return [{ buffer: red }];
      },
    }),
    api.ApexifyInputError
  );
  assert.equal(onStartCalled, false, 'invalid output options must fail before onStart executes');

  await assert.rejects(
    painter.createGIF([{ buffer: red, background: blue }], { outputFormat: 'buffer', width: 16, height: 12 }),
    api.ApexifyInputError
  );
  await assert.rejects(
    painter.createGIF([{ buffer: red }], { outputFormat: 'buffer', width: 16, height: 12, quality: 31 }),
    api.ApexifyInputError
  );
  await assert.rejects(
    painter.createGIF([{ buffer: red, transparentColor: 'nope' }], { outputFormat: 'buffer', width: 16, height: 12 }),
    api.ApexifyInputError
  );
  await assert.rejects(
    painter.createGIF([{ buffer: red }], {
      outputFormat: 'buffer', width: 16, height: 12,
      watermark: { url: watermark, scale: 2, width: 10 },
    }),
    api.ApexifyInputError
  );
  await assert.rejects(
    painter.createGIF([{ buffer: red }], {
      outputFormat: 'buffer', width: 16, height: 12, textOverlay: { text: '' },
    }),
    api.ApexifyInputError
  );

  // Width, pixels and known frame count are rejected before frame decode/encoding.
  api.configureApexifyRuntime({ limits: { maxGifDimension: 10 } });
  await assert.rejects(
    painter.createGIF([{ buffer: Buffer.from('not-an-image') }], { outputFormat: 'buffer', width: 11, height: 10 }),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxGifDimension'
  );
  api.resetApexifyRuntimeConfig();
  api.configureApexifyRuntime({ limits: { maxTotalPixels: 100 } });
  await assert.rejects(
    painter.createGIF([{ buffer: Buffer.from('not-an-image') }], { outputFormat: 'buffer', width: 11, height: 10 }),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxTotalPixels'
  );
  api.resetApexifyRuntimeConfig();
  api.configureApexifyRuntime({ limits: { maxGifFrames: 2 } });
  await assert.rejects(
    painter.createGIF([{ buffer: red }, { buffer: red }, { buffer: Buffer.from('not-an-image') }], { outputFormat: 'buffer', width: 8, height: 8 }),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxGifFrames'
  );
  api.resetApexifyRuntimeConfig();

  // Buffer output, exact GIF signature and decoded frame count.
  const bufferGif = await painter.createGIF(frames, {
    outputFormat: 'buffer', width: 16, height: 12, repeat: -1, quality: 1,
  });
  assertGif(bufferGif, 'buffer output');
  const bufferMeta = await sharp(bufferGif, { animated: true }).metadata();
  assert.equal(bufferMeta.pages, 2, 'buffer GIF must contain two frames');
  assert.equal(bufferGif.includes(Buffer.from('NETSCAPE2.0')), false, 'repeat=-1 must not emit looping extension');

  const infinite = await painter.createGIF([{ buffer: red, duration: 0 }], {
    outputFormat: 'buffer', width: 8, height: 8, repeat: 0, delay: 0, quality: 30,
  });
  assertGif(infinite, 'zero-delay/infinite-loop output');
  assert.equal(infinite.includes(Buffer.from('NETSCAPE2.0')), true, 'repeat=0 must emit infinite-loop extension');

  const finite = await painter.createGIF([{ buffer: red }], {
    outputFormat: 'buffer', width: 8, height: 8, repeat: 2,
  });
  assertGif(finite, 'finite-loop output');
  assert.equal(finite.includes(Buffer.from('NETSCAPE2.0')), true, 'positive repeat must emit looping extension');

  // Base64 output.
  const base64 = await painter.createGIF([{ buffer: red }], { outputFormat: 'base64', width: 8, height: 8 });
  assert.equal(typeof base64, 'string');
  assertGif(Buffer.from(base64, 'base64'), 'base64 output');

  // Attachment output is a real GIF Buffer with .gif name and MIME.
  const attachment = await painter.createGIF([{ buffer: red }], {
    outputFormat: 'attachment', width: 8, height: 8, attachmentName: 'custom-animation',
  });
  assert.ok(Array.isArray(attachment) && attachment.length === 1);
  assert.equal(attachment[0].name, 'custom-animation.gif');
  assert.equal(attachment[0].contentType, 'image/gif');
  assertGif(attachment[0].attachment, 'attachment output');

  // File output is complete before the promise resolves and has a valid header.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase7-gif-'));
  const file = path.join(dir, 'out.gif');
  const localPng = path.join(dir, 'frame.png');
  fs.writeFileSync(localPng, red);
  try {
    const fileResult = await painter.createGIF([{ background: localPng }], {
      outputFormat: 'file', outputFile: file, width: 8, height: 8,
    });
    assert.equal(fileResult, undefined);
    assertGif(fs.readFileSync(file), 'file output');

    // Uint8Array source and static onEnd result.
    const withStatic = await painter.createGIF([{ buffer: new Uint8Array(red) }], {
      outputFormat: 'buffer', width: 8, height: 8,
      onEnd: async (lastFrame) => lastFrame,
    });
    assertGif(withStatic.gif, 'onEnd GIF output');
    assert.ok(Buffer.isBuffer(withStatic.static));
    assert.equal(withStatic.static.subarray(1, 4).toString('ascii'), 'PNG');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // Frame dimensions are explicitly stretch-to-output: both near and far pixels become source color.
  const stretched = await painter.createGIF([{ buffer: red }], { outputFormat: 'buffer', width: 20, height: 10 });
  const { data, info } = await decodeFirst(stretched);
  assert.equal(info.width, 20);
  assert.equal(info.height, 10);
  const far = ((info.height - 1) * info.width + (info.width - 1)) * info.channels;
  assert.ok(data[0] > 200 && data[1] < 30 && data[2] < 30, 'top-left pixel should be red');
  assert.ok(data[far] > 200 && data[far + 1] < 30 && data[far + 2] < 30, 'stretched far pixel should be red');

  // Static watermark and authoritative text renderer both compose without per-frame API forks.
  const overlayGif = await painter.createGIF([{ buffer: solidPng(20, 20, '#000000') }], {
    outputFormat: 'buffer', width: 20, height: 20,
    watermark: { url: watermark, position: 'top-right', scale: 2, opacity: 0.5, margin: 1 },
    textOverlay: { text: 'A', x: 1, y: 12, fontSize: 10, fontColor: '#ffffff' },
  });
  assertGif(overlayGif, 'overlay GIF');

  console.log('phase7-gif: validation, limits, sources, outputs, sizing, timing/repeat and overlays passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
