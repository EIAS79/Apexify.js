'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { createCanvas } = require('@napi-rs/canvas');

async function expectReject(promise, predicate, label) {
  try {
    await promise;
  } catch (error) {
    assert.ok(predicate(error), `${label}: unexpected error ${error?.stack || error}`);
    return;
  }
  assert.fail(`${label}: expected rejection`);
}

async function main() {
  const phase3 = require('../node_modules/.cache/apexify-phase3/phase3-entry.cjs');
  phase3.resetApexifyRuntimeConfig();
  phase3.clearMediaCache();
  phase3.clearDecodedImageCache();

  const canvas = createCanvas(4, 4);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 4, 4);
  const png = canvas.toBuffer('image/png');

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(png.length) });
    res.end(png);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}/image.png`;

    phase3.configureApexifyRuntime({
      network: {
        trustedNetworkAccess: true,
        allowedHosts: ['127.0.0.1'],
        timeoutMs: 500,
        retryAttempts: 1,
      },
      limits: {
        maxRemoteImageBytes: 1024 * 1024,
        maxDecodedImagePixels: 64,
      },
      cache: { enabled: true, ttlMs: 60_000, maxEntries: 16, maxBytes: 4 * 1024 * 1024 },
    });

    const first = await phase3.loadImageCached(url);
    assert.equal(first.width, 4);
    assert.equal(first.height, 4);
    assert.equal(phase3.getDecodedImageCacheStats().entries, 1, 'decoded remote image must enter the bounded cache');

    // Tightening SSRF policy must invalidate the decoded-image cache rather than
    // allowing a previously trusted URL to bypass the current network policy.
    phase3.configureApexifyRuntime({ network: { trustedNetworkAccess: false, allowedHosts: [] } });
    await expectReject(
      phase3.loadImageCached(url),
      (error) => error instanceof phase3.ApexifyRemoteFetchError,
      'decoded cache SSRF policy revalidation'
    );

    // Tightening decoded-pixel limits must also invalidate the decoded cache.
    phase3.configureApexifyRuntime({
      network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'] },
      limits: { maxDecodedImagePixels: 64 },
    });
    await phase3.loadImageCached(url);
    phase3.configureApexifyRuntime({ limits: { maxDecodedImagePixels: 8 } });
    await expectReject(
      phase3.loadImageCached(url),
      (error) => error instanceof phase3.ApexifyResourceLimitError && error.limit === 'maxDecodedImagePixels',
      'decoded cache resource-policy revalidation'
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    phase3.clearMediaCache();
    phase3.clearDecodedImageCache();
    phase3.resetApexifyRuntimeConfig();
  }

  console.log('Phase 3 decoded-cache policy tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
