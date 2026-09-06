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
    if (url.pathname === '/echo-method') {
      return res.end(req.method);
    }
    if (url.pathname === '/redirect') {
      res.writeHead(302, { location: '/ok' });
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
    if (url.pathname === '/retry') {
      retryHits += 1;
      if (retryHits === 1) {
        res.writeHead(503, { 'retry-after': '0' });
        return res.end('retry');
      }
      return res.end('retried-ok');
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

test('redirect method semantics and redirect limit are enforced', async () => {
  trustLocal();
  const result = await api.fetchRemoteMedia(`${baseUrl}/post-redirect`, { method: 'POST', body: 'x', maxBytes: 1024 });
  assert.equal(result.buffer.toString(), 'GET');
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/redirect-loop`, { maxBytes: 1024, maxRedirects: 1 }), /redirect limit exceeded/i);
});

test('retryable status is retried while non-retryable status fails immediately', async () => {
  trustLocal();
  const retried = await api.fetchRemoteMedia(`${baseUrl}/retry`, { maxBytes: 1024, attempts: 2 });
  assert.equal(retried.buffer.toString(), 'retried-ok');
  assert.equal(retryHits, 2);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/not-found`, { maxBytes: 1024, attempts: 3 }), (error) => error.status === 404);
});

test('content-length, streaming-byte and empty-response limits reject safely', async () => {
  trustLocal();
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-length`, { maxBytes: 16 }), api.ApexifyResourceLimitError);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/too-large-stream`, { maxBytes: 40 }), api.ApexifyResourceLimitError);
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/empty`, { maxBytes: 40 }), /response was empty/i);
});

test('timeout and AbortSignal terminate remote requests', async () => {
  trustLocal({ network: { retryAttempts: 1 } });
  await assert.rejects(api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, timeoutMs: 20, attempts: 1 }), /timed out/i);
  const controller = new AbortController();
  const pending = api.fetchRemoteMedia(`${baseUrl}/slow`, { maxBytes: 1024, timeoutMs: 1000, attempts: 1, signal: controller.signal });
  setTimeout(() => controller.abort(new Error('stop')), 10);
  await assert.rejects(pending, /aborted/i);
});

test('stream-to-file preserves bytes and removes partial destination on failure', async () => {
  trustLocal();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-fetch-'));
  try {
    const destination = path.join(dir, 'ok.bin');
    const result = await api.fetchRemoteMediaToFile(`${baseUrl}/ok`, destination, { maxBytes: 1024 });
    assert.equal(result.bytes, 10);
    assert.equal(await fs.readFile(destination, 'utf8'), 'apexify-ok');

    const failed = path.join(dir, 'failed.bin');
    await assert.rejects(api.fetchRemoteMediaToFile(`${baseUrl}/too-large-stream`, failed, { maxBytes: 40 }), api.ApexifyResourceLimitError);
    await assert.rejects(fs.stat(failed), { code: 'ENOENT' });
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
