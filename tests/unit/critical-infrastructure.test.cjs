'use strict';

const assert = require('node:assert/strict');
const { test, afterEach } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

afterEach(() => api.resetApexifyRuntimeConfig());

test('network policy classifies public and non-public address families', () => {
  const blocked = [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1',
    '172.16.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '240.0.0.1', '::', '::1', 'fc00::1', 'fe80::1',
    'ff02::1', '2001:db8::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1',
  ];
  for (const ip of blocked) assert.equal(api.classifyIpAddress(ip).blocked, true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.deepEqual(api.classifyIpAddress(ip), { blocked: false }, ip);
  }
  assert.deepEqual(api.classifyIpAddress('not-an-ip'), { blocked: true, reason: 'invalid-address' });
});

test('URL redaction removes credentials, query and fragments without damaging diagnostics', () => {
  assert.equal(api.redactUrl('https://user:pass@example.com/a.png?token=secret#frag'), 'https://example.com/a.png');
  assert.equal(api.redactUrl('%%%'), '[invalid-url]');
  const text = api.redactUrlsInText('one https://a.test/x?sig=ONE two http://b.test/y#TWO');
  assert.equal(text, 'one https://a.test/x two http://b.test/y');
  assert.doesNotMatch(text, /ONE|TWO|sig=/);
});

test('runtime config rejects malformed network, limits, cache, ffmpeg, temp and diagnostics values', () => {
  const invalid = [
    { network: { timeoutMs: 0 } },
    { network: { maxRedirects: -1 } },
    { network: { retryAttempts: 0 } },
    { network: { retryJitterRatio: 1.1 } },
    { network: { retryBaseDelayMs: 10, retryMaxDelayMs: 5 } },
    { network: { allowedProtocols: [] } },
    { network: { allowedProtocols: ['ftp:'] } },
    { network: { trustedNetworkAccess: true, allowedHosts: [] } },
    { limits: { maxCanvasDimension: 0 } },
    { limits: { maxCanvasDimension: 1.2 } },
    { limits: { maxAudioDurationSeconds: 0 } },
    { limits: { maxAudioChannels: 3 } },
    { limits: { maxSceneDepth: 65, maxNestedSurfaces: 64 } },
    { limits: { maxSceneTotalPixels: 1 } },
    { limits: { maxBatchConcurrency: 5, maxBatchOperations: 4 } },
    { limits: { maxRemoteImageBytes: 65 * 1024 * 1024 } },
    { cache: { ttlMs: 0 } },
    { cache: { maxEntries: 0 } },
    { cache: { maxBytes: 0 } },
    { ffmpeg: { ffmpegPath: '' } },
    { ffmpeg: { ffprobePath: 'bad\0path' } },
    { ffmpeg: { processTimeoutMs: 0 } },
    { temp: { rootDirectory: '' } },
    { temp: { retainFiles: 'yes' } },
    { diagnostics: { handler: 'not-a-function' } },
  ];
  for (const input of invalid) assert.throws(() => api.resolveApexifyRuntimeConfig(input), api.ApexifyConfigError);
});

test('runtime config preserves valid zero-like booleans and merges safely', () => {
  const cfg = api.resolveApexifyRuntimeConfig({ cache: { enabled: false }, temp: { retainFiles: false } });
  assert.equal(cfg.cache.enabled, false);
  assert.equal(cfg.temp.retainFiles, false);
  assert.ok(Object.isFrozen(cfg));
  assert.ok(Object.isFrozen(cfg.network));
  const configured = api.configureApexifyRuntime({ network: { timeoutMs: 1234 } });
  assert.equal(configured.network.timeoutMs, 1234);
  assert.equal(configured.limits.maxCanvasDimension, api.DEFAULT_APEXIFY_RUNTIME_CONFIG.limits.maxCanvasDimension);
});

test('bounded cache enforces TTL, LRU, byte/entry bounds and failed-factory eviction', async () => {
  let now = 100;
  const cache = new api.BoundedCache({ ttlMs: 10, maxEntries: 2, maxBytes: 5, sizeOf: (value) => value.length, now: () => now });
  assert.equal(cache.get('missing'), undefined);
  cache.set('a', 'aa');
  cache.set('b', 'bb');
  assert.equal(cache.get('a'), 'aa'); // refresh LRU
  cache.set('c', 'cc');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'aa');
  assert.equal(cache.get('c'), 'cc');
  assert.equal(cache.stats().entries, 2);
  cache.set('too-big', '123456');
  assert.equal(cache.get('too-big'), undefined);
  now += 11;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.stats().entries, 0);
  assert.ok(cache.stats().expirations >= 2);

  await assert.rejects(cache.getOrCreate('fail', async () => { throw new Error('factory failed'); }), /factory failed/);
  assert.equal(cache.stats().failures, 1);
  assert.equal(await cache.getOrCreate('ok', async () => 'x'), 'x');
  assert.equal(await cache.getOrCreate('ok', async () => 'never'), 'x');
  assert.equal(cache.delete('missing'), false);
  assert.equal(cache.delete('ok'), true);
  cache.disable();
  assert.equal(cache.isEnabled(), false);
  cache.set('disabled', 'x');
  assert.equal(cache.get('disabled'), undefined);
  cache.enable();
  assert.equal(cache.isEnabled(), true);
  cache.clear();
  assert.equal(cache.stats().entries, 0);
});

test('cache constructor rejects invalid bounds', () => {
  for (const options of [
    { ttlMs: 0, maxEntries: 1, maxBytes: 1 },
    { ttlMs: 1, maxEntries: 0, maxBytes: 1 },
    { ttlMs: 1, maxEntries: 1, maxBytes: 0 },
  ]) assert.throws(() => new api.BoundedCache(options), TypeError);
});

test('remote target validation blocks protocols, URL credentials and local addresses by default', async () => {
  await assert.rejects(api.validateRemoteTarget('ftp://example.com/x'), /protocol is not allowed/i);
  await assert.rejects(api.validateRemoteTarget('https://user:pass@example.com/x'), /credentials embedded/i);
  await assert.rejects(api.validateRemoteTarget('http://localhost/x'), /local and blocked/i);
  await assert.rejects(api.validateRemoteTarget('http://127.0.0.1/x'), /blocked loopback/i);
  await assert.rejects(api.validateRemoteTarget('http://[::1]/x'), /blocked loopback/i);
  await assert.rejects(api.validateRemoteTarget('not a url'), /invalid/i);
});

test('trusted allowlist is explicit and wildcard matching does not trust the bare suffix', async () => {
  const trusted = api.resolveApexifyRuntimeConfig({ network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1', '*.localhost'] } }).network;
  const direct = await api.validateRemoteTarget('http://127.0.0.1:1234/x', trusted);
  assert.equal(direct.trusted, true);
  assert.deepEqual(direct.addresses, ['127.0.0.1']);
  const child = await api.validateRemoteTarget('http://x.localhost:1234/x', trusted);
  assert.equal(child.trusted, true);
  const wildcardOnly = api.resolveApexifyRuntimeConfig({ network: { trustedNetworkAccess: true, allowedHosts: ['*.localhost'] } }).network;
  await assert.rejects(api.validateRemoteTarget('http://localhost/x', wildcardOnly), /local and blocked/i);
});
