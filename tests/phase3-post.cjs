'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

async function main() {
  const phase3 = require('../node_modules/.cache/apexify-phase3/phase3-entry.cjs');
  phase3.resetApexifyRuntimeConfig();
  phase3.configureApexifyRuntime({
    network: {
      trustedNetworkAccess: true,
      allowedHosts: ['127.0.0.1'],
      timeoutMs: 500,
      retryAttempts: 3,
      retryBaseDelayMs: 1,
      retryMaxDelayMs: 5,
      retryJitterRatio: 0,
      maxRedirects: 3,
    },
    limits: { maxRemoteImageBytes: 1024, maxConcurrentRemoteFetches: 2 },
  });

  let postCount = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/post') {
      postCount += 1;
      assert.equal(req.method, 'POST');
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        assert.equal(Buffer.concat(chunks).toString('utf8'), '{"ok":true}');
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end('posted');
      });
      return;
    }
    if (req.url === '/post-redirect') {
      assert.equal(req.method, 'POST');
      res.writeHead(303, { location: '/after-redirect' });
      res.end();
      return;
    }
    if (req.url === '/after-redirect') {
      assert.equal(req.method, 'GET');
      res.writeHead(200);
      res.end('redirected');
      return;
    }
    if (req.url === '/post-retry') {
      postCount += 1;
      res.writeHead(503);
      res.end('no retry');
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

    const posted = await phase3.fetchRemoteMedia(`${base}/post`, {
      kind: 'image',
      method: 'POST',
      body: '{"ok":true}',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(posted.buffer.toString(), 'posted');

    const redirected = await phase3.fetchRemoteMedia(`${base}/post-redirect`, {
      kind: 'image',
      method: 'POST',
      body: 'payload',
    });
    assert.equal(redirected.buffer.toString(), 'redirected');

    const beforeRetryProbe = postCount;
    await assert.rejects(
      phase3.fetchRemoteMedia(`${base}/post-retry`, { kind: 'image', method: 'POST', body: 'x' }),
      (error) => error instanceof phase3.ApexifyRemoteFetchError && error.status === 503
    );
    assert.equal(postCount, beforeRetryProbe + 1, 'POST must default to a single attempt');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    phase3.resetApexifyRuntimeConfig();
  }

  console.log('Phase 3 shared POST transport tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
