'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
  const phase3 = require('../node_modules/.cache/apexify-phase3/phase3-entry.cjs');
  const runtime = phase3;
  const media = phase3;

  runtime.resetApexifyRuntimeConfig();

  // Defaults and structured error contract.
  const defaults = runtime.getDefaultApexifyRuntimeConfig();
  assert.equal(defaults.network.trustedNetworkAccess, false);
  assert.ok(defaults.limits.maxCanvasDimension > 0);
  assert.ok(defaults.cache.maxEntries > 0);
  assert.ok(defaults.ffmpeg.processTimeoutMs > 0);
  assert.ok(defaults.ffmpeg.probeTimeoutMs > 0);
  assert.equal(defaults.temp.retainFiles, false);

  const rootCause = new Error('decode root cause');
  const decodeError = new runtime.ApexifyDecodeError('safe decode failure', { cause: rootCause, details: { stage: 'decode' } });
  assert.ok(decodeError instanceof runtime.ApexifyError);
  assert.equal(decodeError.code, 'APEXIFY_DECODE');
  assert.equal(decodeError.cause, rootCause);
  assert.deepEqual(decodeError.details, { stage: 'decode' });

  for (const ip of [
    '127.0.0.1', '10.0.0.1', '100.64.0.1', '169.254.1.1', '192.168.1.1',
    '192.0.2.1', '192.88.99.1', '198.18.0.1', '203.0.113.1', '0.0.0.0', '224.0.0.1',
    '::1', 'fc00::1', 'fe80::1', '64:ff9b::7f00:1', '64:ff9b:1::1', '2001::1',
    '2001:db8::1', '2002::1', '3fff::1', '5f00::1', '::ffff:127.0.0.1'
  ]) {
    assert.equal(media.classifyIpAddress(ip).blocked, true, `${ip} must be blocked`);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
    assert.equal(media.classifyIpAddress(ip).blocked, false, `${ip} must remain public`);
  }

  const redacted = media.redactUrl('https://user:pass@example.com/a?token=secret#fragment');
  assert.ok(!redacted.includes('secret'));
  assert.ok(!redacted.includes('pass'));
  assert.ok(!redacted.includes('fragment'));
  assert.equal(redacted, 'https://example.com/a');

  await expectReject(media.validateRemoteTarget('ftp://example.com/file'), (e) => e instanceof runtime.ApexifyRemoteFetchError, 'protocol policy');
  await expectReject(media.validateRemoteTarget('http://127.0.0.1/'), (e) => e instanceof runtime.ApexifyRemoteFetchError, 'default localhost policy');
  await expectReject(media.validateRemoteTarget('http://localhost/'), (e) => e instanceof runtime.ApexifyRemoteFetchError, 'DNS localhost policy');

  // Config merge/inheritance across every central infrastructure section.
  runtime.configureApexifyRuntime({
    network: { timeoutMs: 777 },
    cache: { ttlMs: 55 },
    ffmpeg: { processTimeoutMs: 1_234 },
    temp: { retainFiles: true },
  });
  const merged = runtime.configureApexifyRuntime({ limits: { maxConcurrentRemoteFetches: 2 } });
  assert.equal(merged.network.timeoutMs, 777);
  assert.equal(merged.cache.ttlMs, 55);
  assert.equal(merged.limits.maxConcurrentRemoteFetches, 2);
  assert.equal(merged.ffmpeg.processTimeoutMs, 1_234);
  assert.equal(merged.temp.retainFiles, true);

  for (const [label, input] of [
    ['invalid retry jitter', { network: { retryJitterRatio: 2 } }],
    ['empty protocol policy', { network: { allowedProtocols: [] } }],
    ['trusted access without allowlist', { network: { trustedNetworkAccess: true, allowedHosts: [] } }],
    ['invalid render limit', { limits: { maxCanvasDimension: 0 } }],
    ['invalid process timeout', { ffmpeg: { processTimeoutMs: 0 } }],
    ['invalid temp retention', { temp: { retainFiles: 'yes' } }],
  ]) {
    await expectReject(
      Promise.resolve().then(() => runtime.configureApexifyRuntime(input)),
      (e) => e instanceof runtime.ApexifyConfigError,
      label
    );
  }
  runtime.resetApexifyRuntimeConfig();

  // Central source normalization supports byte sources, data URLs, filesystem paths, and file URLs.
  assert.deepEqual(await media.resolveMediaBuffer(Buffer.from('buf'), { kind: 'image' }), Buffer.from('buf'));
  assert.deepEqual(await media.resolveMediaBuffer(new Uint8Array([1, 2, 3]), { kind: 'image' }), Buffer.from([1, 2, 3]));
  assert.equal((await media.resolveMediaBuffer('data:image/png;base64,b2s=', { kind: 'image' })).toString(), 'ok');
  await expectReject(
    media.resolveMediaInput('ftp://example.com/file', { kind: 'image' }),
    (e) => e instanceof runtime.ApexifyInputError,
    'unsupported media protocol'
  );
  const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase3-source-'));
  try {
    const localPath = path.join(localRoot, 'media.bin');
    await fs.writeFile(localPath, 'local');
    assert.equal((await media.resolveMediaBuffer(localPath, { kind: 'image' })).toString(), 'local');
    assert.equal((await media.resolveMediaBuffer(pathToFileURL(localPath), { kind: 'image' })).toString(), 'local');
  } finally {
    await fs.rm(localRoot, { recursive: true, force: true });
  }

  const diagnosticEvents = [];
  runtime.configureApexifyRuntime({
    network: {
      trustedNetworkAccess: true,
      allowedHosts: ['127.0.0.1'],
      timeoutMs: 100,
      retryAttempts: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 50,
      retryJitterRatio: 0,
      maxRedirects: 3,
    },
    limits: { maxConcurrentRemoteFetches: 2, maxRemoteImageBytes: 64 },
    diagnostics: { handler: (event) => diagnosticEvents.push(event) },
  });

  let retryCount = 0;
  let retryAfterCount = 0;
  let bigCount = 0;
  let concurrencyActive = 0;
  let concurrencyMax = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end('ok');
      return;
    }
    if (req.url === '/big') {
      bigCount += 1;
      res.writeHead(200);
      res.end(Buffer.alloc(128));
      return;
    }
    if (req.url === '/big-header') {
      res.writeHead(200, { 'content-length': '128' });
      res.end(Buffer.alloc(128));
      return;
    }
    if (req.url === '/slow') {
      setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('slow'); } }, 180);
      return;
    }
    if (req.url === '/trickle') {
      res.writeHead(200);
      let sent = 0;
      const timer = setInterval(() => {
        if (res.destroyed || sent >= 20) {
          clearInterval(timer);
          if (!res.destroyed) res.end();
          return;
        }
        res.write('x');
        sent += 1;
      }, 10);
      res.once('close', () => clearInterval(timer));
      return;
    }
    if (req.url === '/queue-block') {
      setTimeout(() => { if (!res.destroyed) { res.writeHead(200); res.end('queue'); } }, 160);
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
    if (req.url === '/retry-after') {
      retryAfterCount += 1;
      if (retryAfterCount === 1) {
        res.writeHead(503, { 'retry-after': '0.025' });
        res.end('retry-after');
      } else {
        res.writeHead(200);
        res.end('retry-after-recovered');
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
      media.fetchRemoteMedia(`${base}/big-header`, { kind: 'image', maxBytes: 32 }),
      (e) => e instanceof runtime.ApexifyResourceLimitError && e.actual === 128,
      'Content-Length byte limit'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/big`, { kind: 'image', maxBytes: 32 }),
      (e) => e instanceof runtime.ApexifyResourceLimitError,
      'streaming byte limit'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/slow`, { kind: 'image', timeoutMs: 20, attempts: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError && /timed out/.test(e.message),
      'timeout'
    );

    await expectReject(
      media.fetchRemoteMedia(`${base}/trickle`, { kind: 'image', timeoutMs: 45, attempts: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError && /timed out/.test(e.message),
      'hard wall-clock timeout'
    );

    const controller = new AbortController();
    const aborted = media.fetchRemoteMedia(`${base}/slow`, { kind: 'image', timeoutMs: 500, attempts: 1, signal: controller.signal });
    setTimeout(() => controller.abort(new Error('test abort')), 10);
    await expectReject(aborted, (e) => e instanceof runtime.ApexifyRemoteFetchError && /aborted/i.test(String(e.message)), 'abort');

    // Abort must also work while a request is queued behind the concurrency gate.
    runtime.configureApexifyRuntime({ limits: { maxConcurrentRemoteFetches: 1 } });
    const blocker = media.fetchRemoteMedia(`${base}/queue-block`, { kind: 'image', timeoutMs: 500, attempts: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const queuedController = new AbortController();
    const queuedStartedAt = Date.now();
    const queued = media.fetchRemoteMedia(`${base}/ok`, { kind: 'image', timeoutMs: 500, attempts: 1, signal: queuedController.signal });
    setTimeout(() => queuedController.abort(new Error('queued abort')), 10);
    await expectReject(queued, (e) => e instanceof runtime.ApexifyRemoteFetchError && /aborted/i.test(String(e.message)), 'queued abort');
    assert.ok(Date.now() - queuedStartedAt < 120, 'queued abort must not wait for the occupied network slot');
    assert.equal(media.getRemoteConcurrencyStats().queued, 0);
    await blocker;
    runtime.configureApexifyRuntime({ limits: { maxConcurrentRemoteFetches: 2 } });

    const recovered = await media.fetchRemoteMedia(`${base}/retry`, { kind: 'image' });
    assert.equal(recovered.buffer.toString(), 'recovered');
    assert.equal(retryCount, 3, 'retry policy must retry transient statuses');

    const retryAfterRecovered = await media.fetchRemoteMedia(`${base}/retry-after`, { kind: 'image', attempts: 2 });
    assert.equal(retryAfterRecovered.buffer.toString(), 'retry-after-recovered');
    const retryAfterEvent = diagnosticEvents.find((event) => event.code === 'REMOTE_FETCH_RETRY' && event.details?.delayMs === 25);
    assert.ok(retryAfterEvent, 'Retry-After must control the bounded retry delay when enabled');

    const signedError = await expectReject(
      media.fetchRemoteMedia(`${base}/missing?token=super-secret`, { kind: 'image', attempts: 1 }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError,
      'URL redaction'
    );
    assert.ok(!String(signedError.requestUrl).includes('super-secret'));
    assert.ok(!String(signedError.message).includes('super-secret'));
    assert.ok(!JSON.stringify(signedError.details ?? {}).includes('super-secret'));

    await Promise.all(Array.from({ length: 5 }, () => media.fetchRemoteMedia(`${base}/concurrency`, { kind: 'image', timeoutMs: 500, attempts: 1 })));
    assert.ok(concurrencyMax <= 2, `remote concurrency exceeded configured maximum: ${concurrencyMax}`);
    assert.equal(media.getRemoteConcurrencyStats().active, 0);
    assert.equal(media.getRemoteConcurrencyStats().queued, 0);

    // A permissive first fetch must not let a later stricter byte policy reuse it.
    media.clearMediaCache();
    const wide = await media.resolveMediaBuffer(`${base}/big`, { kind: 'video', maxBytes: 256 });
    assert.equal(wide.byteLength, 128);
    assert.ok(media.getMediaCacheStats().bytes >= 128, 'remote cache must account for actual Buffer bytes');
    const countAfterWideFetch = bigCount;
    await expectReject(
      media.resolveMediaBuffer(`${base}/big`, { kind: 'image', maxBytes: 32 }),
      (e) => e instanceof runtime.ApexifyResourceLimitError,
      'cache byte-policy isolation'
    );
    assert.ok(bigCount > countAfterWideFetch, 'stricter policy must not reuse a wider cached representation');

    // Cached trusted content must not survive a later tightening of SSRF policy.
    media.clearMediaCache();
    await media.resolveMediaBuffer(`${base}/ok`, { kind: 'image' });
    runtime.configureApexifyRuntime({ network: { trustedNetworkAccess: false, allowedHosts: [] } });
    await expectReject(
      media.resolveMediaBuffer(`${base}/ok`, { kind: 'image' }),
      (e) => e instanceof runtime.ApexifyRemoteFetchError,
      'cache SSRF policy revalidation'
    );
    runtime.configureApexifyRuntime({ network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'] } });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  let now = 1000;
  const cache = new media.BoundedCache({ ttlMs: 10, maxEntries: 2, maxBytes: 4, sizeOf: (v) => v.length, now: () => now });
  assert.equal(cache.get('missing'), undefined);
  assert.equal(cache.stats().misses, 1);
  cache.set('a', 'aa');
  cache.set('b', 'bb');
  assert.equal(cache.get('a'), 'aa');
  assert.ok(cache.stats().hits >= 1);
  cache.set('c', 'cc');
  assert.equal(cache.get('b'), undefined, 'LRU entry must be evicted at maxEntries');
  assert.equal(cache.get('a'), 'aa');
  assert.ok(cache.stats().entries <= 2);
  assert.ok(cache.stats().bytes <= 4);
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
  cache.enable();
  cache.set('z', 'zz');
  assert.equal(cache.get('z'), 'zz');

  const byteCache = new media.BoundedCache({ ttlMs: 100, maxEntries: 5, maxBytes: 3, sizeOf: (v) => v.length });
  byteCache.set('too-large', '1234');
  assert.equal(byteCache.get('too-large'), undefined, 'entry larger than maxBytes must never be retained');

  runtime.assertCanvasResourceLimits(10, 10);
  runtime.assertGifResourceLimits(10, 10, 2);
  await expectReject(
    Promise.resolve().then(() => runtime.assertCanvasResourceLimits(999999, 1)),
    (e) => e instanceof runtime.ApexifyResourceLimitError,
    'canvas limit helper'
  );
  await expectReject(
    Promise.resolve().then(() => runtime.assertGifResourceLimits(10, 10, 999999)),
    (e) => e instanceof runtime.ApexifyResourceLimitError,
    'GIF limit helper'
  );

  runtime.resetApexifyRuntimeConfig();
  console.log('Phase 3 runtime/media/cache/network/config/error tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
