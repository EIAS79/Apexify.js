'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

async function expectReject(promise, predicate, label) {
  try {
    await promise;
  } catch (error) {
    assert.ok(predicate(error), `${label}: unexpected error ${error?.stack || error}`);
    return error;
  }
  assert.fail(`${label}: expected rejection`);
}

async function main() {
  const runtime = await import('../dist/esm/runtime/index.js');
  const media = await import('../dist/esm/media/index.js');

  runtime.resetApexifyRuntimeConfig();

  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.1.1', '192.168.1.1', '0.0.0.0', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1', '::ffff:127.0.0.1']) {
    assert.equal(media.classifyIpAddress(ip).blocked, true, `${ip} must be blocked`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(media.classifyIpAddress(ip).blocked, false, `${ip} must remain public`);
  }

  const redacted = media.redactUrl('https://user:pass@example.com/a?token=secret#fragment');
  assert.ok(!redacted.includes('secret'));
  assert.ok(!redacted.includes('pass'));
  assert.ok(!redacted.includes('fragment'));

  await expectReject(media.validateRemoteTarget('ftp://example.com/file'), (e) => e instanceof runtime.ApexifyRemoteFetchError, 'protocol policy');
  await expectReject(media.validateRemoteTarget('http://127.0.0.1/'), (e) => e instanceof runtime.ApexifyRemoteFetchError, 'default localhost policy');

  runtime.configureApexifyRuntime({ network: { timeoutMs: 777 }, cache: { ttlMs: 55 } });
  const merged = runtime.configureApexifyRuntime({ limits: { maxConcurrentRemoteFetches: 2 } });
  assert.equal(merged.network.timeoutMs, 777);
  assert.equal(merged.cache.ttlMs, 55);
  assert.equal(merged.limits.maxConcurrentRemoteFetches, 2);

  runtime.configureApexifyRuntime({
    network: {
      trustedNetworkAccess: true,
      allowedHosts: ['127.0.0.1'],
      timeoutMs: 100,
      retryAttempts: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 10,
      retryJitterRatio: 0,
      maxRedirects: 3,
    },
    limits: { maxConcurrentRemoteFetches: 2, maxRemoteImageBytes: 64 },
  });

  let retryCount = 0;
  let concurrencyActive = 0;
  let concurrencyMax = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end('ok');
      return;
    }
    if (req.url === '/big') {
      res.writeHead(200);
      res.end(Buffer.alloc(128));
      return;
    }
    if (req.url === '/slow') {
      setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('slow'); } }, 180);
      return;
    }
    if (req.url === '/concurrency') {
      concurrencyActive += 1;
      concurrencyMax = Math.max(concurrencyMax, concurrencyActive);
      let decremented = false;
      const done = () => {
        if (decremented) return;
        decremented = true;
        concurrencyActive -= 1;
      };
      res.once('finish', done);
      res.once('close', done);
      setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('bounded'); } }, 60);
      return;
    }
    if (req.url === '/retry') {
      retryCount += 1;
      if (retryCount < 3) {
        res.writeHead(503, { 'retry-after': '0' });
        res.end('retry');
      } else {
        res.writeHead(200);
        res.end('recovered');
      }
      return;
    }
    if (req.url === '/redirect-safe') {
      res.writeHead(302, { location: '/ok' });
      res.end();
      return;
    }
    if (req.url === '/redirect-loop') {
      res.writeHead(302, { location: '/redirect-loop' });
      res.end();
      return;
    }
    if (req.url === '/redirect-blocked') {
      res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data' });
      res.end();
      return;
    }
    res.writeHead(404);
    res.end('missing');
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const base = `http://127.0.0.1:${address.port}`;

    const ok = await media.fetchRemoteMedia(`${base}/ok`, { kind: 'image' });
    assert.equal(ok.buffer.toString(), 'ok');

    const redirected = await media.fetchRemoteMedia(`${base}/redirect-safe`, { kind: 'image' });
    assert.equal(redirected.buffer.toString(), 'ok');

    await expectReject(
      media.fetchRemoteMedia(`${base}/redirect-blocked`, { kind: 'image' }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError && /blocked/.test(e.message),
      'redirect target revalidation'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/redirect-loop`, { kind: 'image', maxRedirects: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError && /redirect limit/.test(e.message),
      'redirect maximum'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/big`, { kind: 'image', maxBytes: 32 }),
      (e) => e instanceof runtime.ApexifyResourceLimitError,
      'byte limit'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/slow`, { kind: 'image', timeoutMs: 20, attempts: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError && /timed out/.test(e.message),
      'timeout'
    );

    const controller = new AbortController();
    const aborted = media.fetchRemoteMedia(`${base}/slow`, { kind: 'image', timeoutMs: 500, attempts: 1, signal: controller.signal });
    setTimeout(() => controller.abort(new Error('test abort')), 10);
    await expectReject(aborted, (e) => /aborted|abort|failed/i.test(String(e.message)), 'abort');

    const recovered = await media.fetchRemoteMedia(`${base}/retry`, { kind: 'image' });
    assert.equal(recovered.buffer.toString(), 'recovered');
    assert.equal(retryCount, 3, 'retry policy must retry transient statuses');

    const signedError = await expectReject(
      media.fetchRemoteMedia(`${base}/missing?token=super-secret`, { kind: 'image', attempts: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError,
      'URL redaction'
    );
    assert.ok(!String(signedError.requestUrl).includes('super-secret'));
    assert.ok(!String(signedError.message).includes('super-secret'));

    await Promise.all(Array.from({ length: 5 }, () => media.fetchRemoteMedia(`${base}/concurrency`, { kind: 'image', timeoutMs: 500, attempts: 1 })));
    assert.ok(concurrencyMax <= 2, `remote concurrency exceeded configured maximum: ${concurrencyMax}`);
    assert.equal(media.getRemoteConcurrencyStats().active, 0);
    assert.equal(media.getRemoteConcurrencyStats().queued, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  let now = 1000;
  const cache = new media.BoundedCache({ ttlMs: 10, maxEntries: 2, maxBytes: 4, sizeOf: (v) => v.length, now: () => now });
  cache.set('a', 'aa');
  cache.set('b', 'bb');
  assert.equal(cache.get('a'), 'aa');
  cache.set('c', 'cc');
  assert.equal(cache.get('b'), undefined, 'LRU entry must be evicted');
  assert.equal(cache.get('a'), 'aa');
  now += 11;
  assert.equal(cache.get('a'), undefined, 'TTL entry must expire');
  await expectReject(cache.getOrCreate('x', async () => { throw new Error('factory failed'); }), (e) => e.message === 'factory failed', 'cache failure');
  assert.equal(cache.get('x'), undefined, 'failed value must not poison cache');
  assert.ok(cache.stats().failures >= 1);
  cache.clear();
  assert.equal(cache.stats().entries, 0);
  cache.disable();
  cache.set('z', 'zz');
  assert.equal(cache.get('z'), undefined);

  runtime.assertCanvasResourceLimits(10, 10);
  await expectReject(
    Promise.resolve().then(() => runtime.assertCanvasResourceLimits(999999, 1)),
    (e) => e instanceof runtime.ApexifyResourceLimitError,
    'canvas limit helper'
  );

  runtime.resetApexifyRuntimeConfig();
  console.log('Phase 3 runtime/media/cache/network tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
