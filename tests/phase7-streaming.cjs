'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase7/phase7-entry.cjs');

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function assertGif(buffer) {
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')));
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
  const frame = solidPng(24, 16, '#ef4444');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase7-stream-'));

  try {
    // True incremental consumption: second pull observes encoded bytes from the first frame.
    const lazyFile = path.join(dir, 'lazy.gif');
    let nextCalls = 0;
    let activeNext = 0;
    let maxActiveNext = 0;
    let encodedBeforeSecondPull = false;
    const iterable = {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            nextCalls += 1;
            activeNext += 1;
            maxActiveNext = Math.max(maxActiveNext, activeNext);
            try {
              if (index === 1) {
                await new Promise((resolve) => setImmediate(resolve));
                encodedBeforeSecondPull = fs.existsSync(lazyFile) && fs.statSync(lazyFile).size > 6;
              }
              if (index >= 5) return { done: true };
              const value = { buffer: frame, duration: 10 };
              index += 1;
              await new Promise((resolve) => setTimeout(resolve, 2));
              return { done: false, value };
            } finally {
              activeNext -= 1;
            }
          },
        };
      },
    };
    await painter.createGIF(undefined, {
      outputFormat: 'file', outputFile: lazyFile, width: 24, height: 16,
      onStart: async () => iterable,
    });
    assert.equal(nextCalls, 6, 'five frames plus terminal pull expected');
    assert.equal(maxActiveNext, 1, 'producer next() calls must never overlap');
    assert.equal(encodedBeforeSecondPull, true, 'first frame must be encoded before requesting the second');
    assertGif(fs.readFileSync(lazyFile));

    // Producer failure propagates with safe context and removes a partial file.
    const failedFile = path.join(dir, 'failed.gif');
    let producerFinally = false;
    await assert.rejects(
      painter.createGIF(undefined, {
        outputFormat: 'file', outputFile: failedFile, width: 24, height: 16,
        onStart: async () => (async function* () {
          try {
            yield { buffer: frame };
            throw new Error('producer boom');
          } finally {
            producerFinally = true;
          }
        })(),
      }),
      (error) => error instanceof api.ApexifyDecodeError && /AsyncIterable failed/.test(error.message)
    );
    assert.equal(producerFinally, true);
    assert.equal(fs.existsSync(failedFile), false, 'partial GIF file must be removed after producer failure');

    // Incremental max-frame enforcement does not collect the stream to discover its length.
    api.configureApexifyRuntime({ limits: { maxGifFrames: 2 } });
    let yielded = 0;
    await assert.rejects(
      painter.createGIF(undefined, {
        outputFormat: 'buffer', width: 24, height: 16,
        onStart: async () => (async function* () {
          for (let i = 0; i < 4; i++) {
            yielded += 1;
            yield { buffer: frame };
          }
        })(),
      }),
      api.ApexifyError
    );
    assert.equal(yielded, 3, 'stream must stop immediately when the third frame exceeds maxGifFrames=2');
    api.resetApexifyRuntimeConfig();

    // Abort before first frame prevents onStart; abort mid-stream invokes iterator cleanup and removes partial output.
    const preAbort = new AbortController();
    preAbort.abort(new Error('before'));
    let preStartCalled = false;
    await assert.rejects(
      painter.createGIF(undefined, {
        outputFormat: 'buffer', width: 24, height: 16, signal: preAbort.signal,
        onStart: async () => {
          preStartCalled = true;
          return [{ buffer: frame }];
        },
      }),
      api.ApexifyProcessError
    );
    assert.equal(preStartCalled, false);

    const midAbort = new AbortController();
    const abortedFile = path.join(dir, 'aborted.gif');
    let iteratorReturned = false;
    const abortIterable = {
      [Symbol.asyncIterator]() {
        let index = 0;
        return {
          async next() {
            if (index === 0) {
              index += 1;
              return { done: false, value: { buffer: frame } };
            }
            midAbort.abort(new Error('midstream'));
            return { done: false, value: { buffer: frame } };
          },
          async return() {
            iteratorReturned = true;
            return { done: true };
          },
        };
      },
    };
    await assert.rejects(
      painter.createGIF(undefined, {
        outputFormat: 'file', outputFile: abortedFile, width: 24, height: 16,
        signal: midAbort.signal, onStart: async () => abortIterable,
      }),
      api.ApexifyProcessError
    );
    assert.equal(iteratorReturned, true, 'abrupt streaming abort must close the iterator');
    assert.equal(fs.existsSync(abortedFile), false, 'partial aborted GIF must be removed');

    // Central network policy, redirect validation, byte limit, cancellation, cache policy and bounded concurrency.
    let active = 0;
    let peakActive = 0;
    let watermarkRequests = 0;
    let stalledClosed = false;
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/redirect')) {
        res.statusCode = 302;
        res.setHeader('location', '/frame');
        res.end();
        return;
      }
      if (req.url.startsWith('/missing')) {
        res.statusCode = 500;
        res.end('no');
        return;
      }
      if (req.url.startsWith('/stall')) {
        req.on('close', () => { stalledClosed = true; });
        setTimeout(() => {
          if (!res.destroyed) {
            res.writeHead(200, { 'content-type': 'image/png' });
            res.end(frame);
          }
        }, 400);
        return;
      }
      active += 1;
      peakActive = Math.max(peakActive, active);
      if (req.url.startsWith('/watermark')) watermarkRequests += 1;
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'image/png', 'content-length': frame.length });
        res.end(frame);
        active -= 1;
      }, req.url.startsWith('/slow') ? 40 : 2);
    });
    const port = await listen(server);
    const root = `http://127.0.0.1:${port}`;
    try {
      api.resetApexifyRuntimeConfig();
      await assert.rejects(
        painter.createGIF([{ background: `${root}/frame` }], { outputFormat: 'buffer', width: 24, height: 16 }),
        api.ApexifyRemoteFetchError
      );

      api.configureApexifyRuntime({
        network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'], retryAttempts: 1, timeoutMs: 1000 },
        limits: { maxBatchConcurrency: 3, maxConcurrentRemoteFetches: 2 },
      });
      api.clearMediaCache();
      api.clearDecodedImageCache();
      const remoteGif = await painter.createGIF([
        { background: `${root}/redirect` },
        { background: `${root}/frame?i=2` },
      ], { outputFormat: 'buffer', width: 24, height: 16 });
      assertGif(remoteGif);
      assert.equal(api.getMediaCacheStats().entries, 0, 'stream frames must not pollute shared remote-byte cache');
      assert.equal(api.getDecodedImageCacheStats().entries, 0, 'stream frames must not pollute shared decoded-image cache');

      peakActive = 0;
      const slowFrames = Array.from({ length: 6 }, (_, i) => ({ background: `${root}/slow?i=${i}` }));
      const bounded = await painter.createGIF(slowFrames, { outputFormat: 'buffer', width: 24, height: 16 });
      assertGif(bounded);
      assert.ok(peakActive <= 2, `central/local concurrency must be <=2, saw ${peakActive}`);
      assert.ok(peakActive >= 2, 'regular frame arrays should use safe bounded concurrency rather than forced serial fetches');
      assert.deepEqual(api.getRemoteConcurrencyStats(), { active: 0, queued: 0 });

      api.clearMediaCache();
      watermarkRequests = 0;
      const wm = await painter.createGIF([{ buffer: frame }, { buffer: frame }, { buffer: frame }], {
        outputFormat: 'buffer', width: 24, height: 16,
        watermark: { url: `${root}/watermark`, position: 'center' },
      });
      assertGif(wm);
      assert.equal(watermarkRequests, 1, 'static watermark must be fetched/resolved once per GIF render');
      assert.equal(api.getMediaCacheStats().entries, 1, 'shared cache should contain the reusable watermark only');

      api.configureApexifyRuntime({ limits: { maxRemoteImageBytes: Math.max(1, frame.length - 1) } });
      await assert.rejects(
        painter.createGIF([{ background: `${root}/frame?too-big=1` }], { outputFormat: 'buffer', width: 24, height: 16 }),
        (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxRemoteImageBytes'
      );

      api.configureApexifyRuntime({ limits: { maxRemoteImageBytes: 32 * 1024 * 1024 } });
      const fetchAbort = new AbortController();
      setTimeout(() => fetchAbort.abort(new Error('network abort')), 30);
      await assert.rejects(
        painter.createGIF([{ background: `${root}/stall` }], {
          outputFormat: 'buffer', width: 24, height: 16, signal: fetchAbort.signal,
        }),
        api.ApexifyRemoteFetchError
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(stalledClosed, true, 'aborted remote request should close the HTTP request');

      let safeError;
      try {
        await painter.createGIF([{ background: `${root}/missing?token=super-secret` }], {
          outputFormat: 'buffer', width: 24, height: 16,
        });
      } catch (error) {
        safeError = error;
      }
      assert.ok(safeError instanceof api.ApexifyRemoteFetchError);
      const exposed = `${safeError.message} ${safeError.requestUrl ?? ''} ${JSON.stringify(safeError.details ?? {})}`;
      assert.equal(exposed.includes('super-secret'), false, 'GIF remote errors must redact signed/query URL secrets');
    } finally {
      await close(server);
      api.resetApexifyRuntimeConfig();
    }

    // Multiple encoders are isolated and deterministic under concurrency.
    const jobs = await Promise.all([
      painter.createGIF([{ buffer: frame }], { outputFormat: 'buffer', width: 24, height: 16 }),
      painter.createGIF([{ buffer: frame }], { outputFormat: 'buffer', width: 24, height: 16 }),
      painter.createGIF([{ buffer: frame }], { outputFormat: 'buffer', width: 24, height: 16 }),
    ]);
    jobs.forEach(assertGif);
    assert.equal(jobs[0].equals(jobs[1]), true, 'same inputs should encode deterministically across concurrent jobs');
    assert.equal(jobs[1].equals(jobs[2]), true, 'concurrent encoder state must not cross-contaminate');

    console.log('phase7-streaming: lazy consumption, backpressure, abort, network policy, cache and concurrency passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
