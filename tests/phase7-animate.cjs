'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
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

function assertGifFile(file) {
  const bytes = fs.readFileSync(file);
  assert.ok(['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii')));
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const painter = new api.ApexPainter();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase7-animate-'));
  const local = path.join(dir, 'source.png');
  fs.writeFileSync(local, solidPng(16, 16, '#22c55e'));

  try {
    // Animation gradients use the shared gradient renderer, including legacy conic `angle`.
    const pngs = await painter.animate([
      {
        gradient: {
          type: 'conic',
          centerX: 16,
          centerY: 16,
          angle: 45,
          colors: [
            { stop: 0, color: '#ff0000' },
            { stop: 0.5, color: '#0000ff' },
            { stop: 1, color: '#ff0000' },
          ],
        },
      },
    ], 0, 32, 32);
    assert.ok(Array.isArray(pngs) && pngs.length === 1);
    const decoded = await sharp(pngs[0]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const unique = new Set();
    for (let i = 0; i < decoded.data.length; i += decoded.info.channels * 17) {
      unique.add(`${decoded.data[i]},${decoded.data[i + 1]},${decoded.data[i + 2]}`);
    }
    assert.ok(unique.size > 1, 'conic animation gradient must render rather than silently disappear');

    // GIF mode has one fixed encoder size, resolves only after the file is complete,
    // and onEnd observes the already-validated output file.
    const gifPath = path.join(dir, 'animate.gif');
    let endObservedCompleteFile = false;
    const gifResult = await painter.animate([
      { backgroundColor: '#ef4444', duration: 0 },
      { source: local, duration: 0 },
    ], 0, 16, 16, {
      gif: true,
      gifPath,
      onEnd: () => {
        assertGifFile(gifPath);
        endObservedCompleteFile = true;
      },
    });
    assert.equal(gifResult, undefined);
    assert.equal(endObservedCompleteFile, true);
    assertGifFile(gifPath);

    // Per-frame dimension changes cannot be represented by one GIF encoder canvas;
    // reject them instead of silently cropping/leaking the prior frame.
    const mismatch = path.join(dir, 'mismatch.gif');
    await assert.rejects(
      painter.animate([{ width: 8, height: 8, backgroundColor: '#000000' }], 0, 16, 16, {
        gif: true,
        gifPath: mismatch,
      }),
      (error) => error instanceof api.ApexifyInputError && /must use the configured GIF width and height/.test(error.message)
    );
    assert.equal(fs.existsSync(mismatch), false);

    // Pre-abort must stop before hooks/output allocation.
    const aborted = path.join(dir, 'aborted.gif');
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    let started = false;
    await assert.rejects(
      painter.animate([{ backgroundColor: '#000000' }], 0, 16, 16, {
        gif: true,
        gifPath: aborted,
        signal: controller.signal,
        onStart: () => { started = true; },
      }),
      api.ApexifyProcessError
    );
    assert.equal(started, false);
    assert.equal(fs.existsSync(aborted), false);

    // animate() source loading also goes through the central remote policy.
    const remoteBytes = solidPng(16, 16, '#3b82f6');
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'image/png', 'content-length': remoteBytes.length });
      res.end(remoteBytes);
    });
    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/frame.png`;
    try {
      api.resetApexifyRuntimeConfig();
      await assert.rejects(
        painter.animate([{ source: url }], 0, 16, 16),
        api.ApexifyRemoteFetchError
      );
      api.configureApexifyRuntime({
        network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'], retryAttempts: 1, timeoutMs: 1000 },
      });
      const remotePngs = await painter.animate([{ source: url }], 0, 16, 16);
      assert.ok(Array.isArray(remotePngs) && remotePngs.length === 1);
      assert.equal((await sharp(remotePngs[0]).metadata()).width, 16);
    } finally {
      await close(server);
      api.resetApexifyRuntimeConfig();
    }

    console.log('phase7-animate: shared gradients, fixed GIF dimensions, completed output, abort and central media policy passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
