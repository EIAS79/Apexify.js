'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { before, after, afterEach, test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

let server;
let baseUrl;
let retryHits = 0;
let activeSlow = 0;
let maxActiveSlow = 0;

before(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname === '/ok') {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      return res.end('apexify-ok');
    }
    if (url.pathname === '/post-redirect') {
      res.writeHead(303, { location: '/echo-method' });
      return res.end();
    }
    if (/^\/post-(301|302|303|307|308)$/.test(url.pathname)) {
      const status = Number(url.pathname.slice(-3));
      res.writeHead(status, { location: '/echo-request' });
      return res.end();
    }
    if (url.pathname === '/echo-method') return res.end(req.method);
    if (url.pathname === '/echo-request') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          method: req.method,
          body: Buffer.concat(chunks).toString(),
          contentLength: req.headers['content-length'] ?? null,
          transferEncoding: req.headers['transfer-encoding'] ?? null,
          custom: req.headers['x-custom'] ?? null,
        }));
      });
      return;
    }
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: '/ok' });
      return res.end();
    }
    if (url.pathname === '/redirect-no-location') {
      res.writeHead(302);
      return res.end('missing-location');
    }
    if (url.pathname === '/redirect-invalid') {
      res.writeHead(302, { location: 'http://[' });
      return res.end();
    }
    if (url.pathname === '/redirect-blocked') {
      res.writeHead(302, { location: `http://127.0.0.2:${server.address().port}/ok?token=SECRET` });
      return res.end();
    }
    if (url.pathname === '/redirect-loop') {
      res.writeHead(302, { location: '/redirect-loop' });
      return res.end();
    }
    if (url.pathname === '/retry' || url.pathname === '/retry-date' || url.pathname === '/retry-invalid') {
      retryHits += 1;
      if (retryHits === 1) {
        const headers = url.pathname === '/retry-date'
          ? { 'retry-after': new Date(Date.now() + 100).toUTCString() }
          : url.pathname === '/retry-invalid'
            ? { 'retry-after': 'not-a-date' }
            : { 'retry-after': '0' };
        res.writeHead(503, headers);
        return res.end('retry');
      }
      return res.end('retried-ok');
    }
    if (url.pathname === '/always-retry') {
      res.writeHead(503);
      return res.end('retry');
    }
    if (url.pathname === '/not-found') {
      res.writeHead(404);
      return res.end('nope');
    }
    if (url.pathname === '/too-large-length') {
      res.writeHead(200, { 'content-length': '1000' });
      return res.end('short');
    }
    if (url.pathname === '/too-large-stream') {
      res.writeHead(200);
      res.write(Buffer.alloc(32, 1));
      return res.end(Buffer.alloc(32, 2));
    }
    if (url.pathname === '/empty') {
      res.writeHead(200);
      return res.end();
    }
    if (url.pathname === '/drop') {
      req.socket.destroy();
      return;
    }
    if (url.pathname === '/slow') {
      activeSlow += 1;
      maxActiveSlow = Math.max(maxActiveSlow, activeSlow);
      setTimeout(() => {
        activeSlow -= 1;
        if (!res.destroyed) res.end('slow-ok');
      }, 80);
      return;
    }
    res.writeHead(500);
    res.end('unhandled');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  api.resetApexifyRuntimeConfig();
  retryHits = 0;
  activeSlow = 0;
  maxActiveSlow = 0;
});

function trustLocal(overrides = {}) {
  api.setDefaultApexifyRuntimeConfig({
    network: {
      trustedNetworkAccess: true,
      allowedHosts: ['127.0.0.1'],
      timeoutMs: 1000,
      retryAttempts: 2,
      retryBaseDelayMs: 0,
      retryMaxDelayMs: 0,
      retryJitterRatio: 0,
      ...overrides.network,
    },
    limits: { maxConcurrentRemoteFetches: 2, ...overrides.limits },
  });
}

test('buffered remote fetch handles success and redirect with target revalidation', async () => {
  trustLocal();
  const direct = await api.fetchRemoteMedia(`${baseUrl}/ok`, { maxBytes: 1024 });
  assert.equal(direct.buffer.toString(), 'apexify-ok');
  assert.equal(direct.status, 200);
  const redirected = await api.fetchRemoteMedia(`${baseUrl}/redirect`, { maxBytes: 1024 });
  assert.equal(redirected.buffer.toString(), 'apexify-ok');
  await assert.rejects(
    api.fetchRemoteMedia(`${baseUrl}/redirect-blocked?auth=PRIVATE`, { maxBytes: 1024 }),
    (error) => /blocked loopback/i.test(error.message) && !/PRIVATE|SECRET/.test(error.message)
  );
});

test('redirect method semantics cover 301/302/303 downgrade and 307/308 preservation', async () => {
  trustLocal();
  const result = await api.fetchRemoteMedia(`${baseUrl}/post-redirect`, { method: 'POST', body: 'x', maxBytes: 1024 });
  assert.equal(result.buffer.toString(), 'GET');

  for (const status of [301, 302]) {
    const response = await api.fetchRemoteMedia(`${baseUrl}/post-${status}`, {
      method: 'POST', body: 'payload', headers: { 'Content-Length': '7', 'X-Custom': 'yes' }, maxBytes: 2048,
    });
    const echoed = JSON.parse(response.buffer.toString());
    assert.equal(echoed.method, 'GET');
    assert.equal(echoed.body, '');
    assert.equal(echoed.contentLength, null);
    assert.equal(echoed.transferEncoding, null);
    assert.equal(echoed.custom, 'yes');
  }

  const chunked = await api.fetchRemoteMedia(`${baseUrl}/post-303`, {
    method: 'POST', body: 'payload', headers: { 'Transfer-Encoding': 'chunked', 'X-Custom': 'yes' }, maxBytes: 2048,
  });
  const chunkedEcho = JSON.parse(chunked.buffer.toString());
  assert.equal(chunkedEcho.method, 'GET');
  assert.equal(chunkedEcho.body, '');
  assert.equal(chunkedEcho.contentLength, null);
  assert.equal(chunkedEcho.transferEncoding, null);
  assert.equal(chunkedEcho.custom, 'yes');

  for (const status of [307, 308]) {
    const response = await api.fetchRemoteMedia(`${baseUrl}/post-${status}`, { method: 'POST', body: 'payload', headers: { 'X-Custom': 'yes' }, maxBytes: 2048 });
    const echoed = JSON.parse(response.buffer.toString());
    assert.equal(echoed.method, 'POST');
    assert.equal(echoed.body, 'payload');
    assert.equal(echoed.contentLength, '7');
    assert.equal(echoed.custom, 'yes');
  }
});

test('redirect invalid location, missing location and redirect limit are rejected', async () => {
  trustLocal();
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/redirect-invalid`, { maxBytes: 1024 }), /redirect URL is invalid/i);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/redirect-no-location`, { maxBytes: 1024, attempts: 1 }), (error) => error.status === 302);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/redirect-loop`, { maxBytes: 1024, maxRedirects: 1 }), /redirect limit exceeded/i);
});

test('retry parsing covers seconds, HTTP-date, invalid Retry-After and aborted backoff', async () => {
  trustLocal();
  for (const route of ['/retry', '/retry-date', '/retry-invalid']) {
    retryHits = 0;
    const retried = await api.fetchRemoteMedia(`${baseUrl}${route}`, { maxBytes: 1024, attempts: 2 });
    assert.equal(retried.buffer.toString(), 'retried-ok');
    assert.equal(retryHits, 2);
  }
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/not-found`, { maxBytes: 1024, attempts: 3 }), (error) => error.status === 404);

  trustLocal({ network: { retryBaseDelayMs: 100, retryMaxDelayMs: 100, retryJitterRatio: 0, honorRetryAfter: false } });
  const controller = new AbortController();
  const pending = api.fetchRemoteMedia(`${baseUrl}/always-retry`, { maxBytes: 1024, attempts: 3, signal: controller.signal });
  setTimeout(() => controller.abort(new Error('stop-backoff')), 20);
  await assert.rejects(pending, /stop-backoff|aborted/i);
});

test('content-length, streaming-byte, defaults by kind and empty-response limits reject safely', async () => {
  trustLocal({ limits: { maxRemoteImageBytes: 16, maxRemoteVideoBytes: 48 } });
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-length`, { maxBytes: 16 }), api.ApexifyResourceLimitError);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-stream`, { maxBytes: 40 }), api.ApexifyResourceLimitError);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/empty`, { maxBytes: 40 }), /response was empty/i);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-stream`, { kind: 'image', attempts: 1 }), (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxRemoteImageBytes');
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-stream`, { kind: 'video', attempts: 1 }), (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxRemoteVideoBytes');
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-stream`, { kind: 'generic', attempts: 1 }), (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxRemoteVideoBytes');
});

test('timeout, pre-aborted signal, active abort and network failure terminate safely', async () => {
  trustLocal({ network: { retryAttempts: 1 } });
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, timeoutMs: 20, attempts: 1 }), /timed out/i);

  const pre = new AbortController();
  pre.abort(new Error('already-stopped'));
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/ok`, { signal: pre.signal }), /aborted before it acquired/i);

  const controller = new AbortController();
  const pending = api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, timeoutMs: 1000, attempts: 1, signal: controller.signal });
  setTimeout(() => controller.abort(new Error('stop')), 10);
  await assert.rejects(pending, /aborted/i);

  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/drop`, { maxBytes: 1024, attempts: 1 }), /request failed/i);
});

test('stream-to-file covers success, redirects, retry, HTTP errors, length/stream limits and empty response', async () => {
  trustLocal();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-fetch-'));
  try {
    const destination = path.join(dir, 'ok.bin');
    const result = await api.fetchRemoteMediaToFile(`${baseUrl}/ok`, destination, { maxBytes: 1024 });
    assert.equal(result.bytes, 10);
    assert.equal(await fs.readFile(destination, 'utf8'), 'apexify-ok');

    const redirected = path.join(dir, 'redirected.bin');
    const redirectResult = await api.fetchRemoteMediaToFile(`${baseUrl}/redirect`, redirected, { maxBytes: 1024 });
    assert.equal(redirectResult.bytes, 10);
    assert.equal(await fs.readFile(redirected, 'utf8'), 'apexify-ok');

    retryHits = 0;
    const retried = path.join(dir, 'retried.bin');
    const retryResult = await api.fetchRemoteMediaToFile(`${baseUrl}/retry`, retried, { maxBytes: 1024, attempts: 2 });
    assert.equal(retryResult.bytes, 10);
    assert.equal(retryHits, 2);

    for (const [route, options, matcher] of [
      ['/too-large-stream', { maxBytes: 40 }, api.ApexifyResourceLimitError],
      ['/too-large-length', { maxBytes: 16 }, api.ApexifyResourceLimitError],
      ['/empty', { maxBytes: 40 }, /response was empty/i],
      ['/not-found', { maxBytes: 40, attempts: 1 }, (error) => error.status === 404],
      ['/redirect-invalid', { maxBytes: 40 }, /redirect URL is invalid/i],
      ['/redirect-loop', { maxBytes: 40, maxRedirects: 0 }, /redirect limit exceeded/i],
      ['/drop', { maxBytes: 40, attempts: 1 }, /request failed/i],
    ]) {
      const failed = path.join(dir, `failed-${route.replaceAll('/', '-')}.bin`);
      await assert.rejects(api.fetchRemoteMediaToFile(`${baseUrl}${route}`, failed, options), matcher);
      await assert.rejects(fs.stat(failed), { code: 'ENOENT' });
    }

    const pre = new AbortController();
    pre.abort(new Error('file-pre-abort'));
    await assert.rejects(api.fetchRemoteMediaToFile(`${baseUrl}/ok`, path.join(dir, 'pre.bin'), { signal: pre.signal }), /aborted before it acquired/i);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('global concurrency bound queues requests and aborted waiters release cleanly', async () => {
  trustLocal({ limits: { maxConcurrentRemoteFetches: 1 }, network: { retryAttempts: 1 } });
  const first = api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, attempts: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  const controller = new AbortController();
  const queued = api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, attempts: 1, signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(api.getRemoteConcurrencyStats().active, 1);
  assert.equal(api.getRemoteConcurrencyStats().queued, 1);
  controller.abort();
  await assert.rejects(queued, /aborted while waiting/i);
  await first;
  assert.deepEqual(api.getRemoteConcurrencyStats(), { active: 0, queued: 0 });

  await Promise.all([
    api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, attempts: 1 }),
    api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, attempts: 1 }),
  ]);
  assert.equal(maxActiveSlow, 1);
  assert.deepEqual(api.getRemoteConcurrencyStats(), { active: 0, queued: 0 });
});
