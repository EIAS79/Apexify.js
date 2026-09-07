'use strict';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

afterEach(() => api.resetApexifyRuntimeConfig());

test('runtime config covers numeric edge classes, flooring and process-wide reset', () => {
  const invalid = [
    { network: { timeoutMs: NaN } },
    { network: { timeoutMs: Infinity } },
    { network: { retryBaseDelayMs: -1 } },
    { network: { retryMaxDelayMs: -1 } },
    { network: { retryJitterRatio: -0.1 } },
    { network: { allowedProtocols: ['http:', 'ftp:'] } },
    { limits: { maxCanvasDimension: NaN } },
    { limits: { maxCanvasDimension: Infinity } },
    { limits: { maxCanvasDimension: -1 } },
    { limits: { maxVideoDurationSeconds: NaN } },
    { limits: { maxVideoFps: 0 } },
    { cache: { ttlMs: NaN } },
    { cache: { maxEntries: Infinity } },
    { ffmpeg: { ffmpegPath: 'bad\0path' } },
    { temp: { rootDirectory: 'bad\0path' } },
  ];
  for (const input of invalid) assert.throws(() => api.resolveApexifyRuntimeConfig(input), api.ApexifyConfigError);

  const cfg = api.resolveApexifyRuntimeConfig({
    network: { maxRedirects: 2.9, retryAttempts: 2.9 },
    limits: { maxAudioDurationSeconds: 0.25, maxVideoDurationSeconds: 0.5, maxVideoFps: 23.976 },
    ffmpeg: { ffmpegPath: undefined, ffprobePath: undefined },
  });
  assert.equal(cfg.network.maxRedirects, 2);
  assert.equal(cfg.network.retryAttempts, 2);
  assert.equal(cfg.limits.maxVideoFps, 23.976);

  const changed = api.setDefaultApexifyRuntimeConfig({ cache: { enabled: false }, network: { timeoutMs: 321 } });
  assert.equal(api.getDefaultApexifyRuntimeConfig(), changed);
  assert.equal(changed.cache.enabled, false);
  api.resetApexifyRuntimeConfig();
  assert.equal(api.getDefaultApexifyRuntimeConfig().network.timeoutMs, api.DEFAULT_APEXIFY_RUNTIME_CONFIG.network.timeoutMs);
});

test('bounded cache covers default sizing, replacement, byte eviction, prune and disabled construction', async () => {
  let now = 1;
  const defaultSized = new api.BoundedCache({ ttlMs: 10, maxEntries: 1, maxBytes: 10, now: () => now });
  defaultSized.set('a', 'a');
  defaultSized.set('a', 'b');
  assert.equal(defaultSized.get('a'), 'b');
  defaultSized.set('b', 'b');
  assert.equal(defaultSized.get('a'), undefined);
  assert.equal(defaultSized.stats().evictions, 1);

  const byteBound = new api.BoundedCache({ ttlMs: 10, maxEntries: 10, maxBytes: 3, sizeOf: (v) => v.length, now: () => now });
  byteBound.set('a', 'aa');
  byteBound.set('b', 'bb');
  assert.equal(byteBound.get('a'), undefined);
  assert.equal(byteBound.get('b'), 'bb');
  byteBound.set('zero', 'x');
  const zero = new api.BoundedCache({ ttlMs: 10, maxEntries: 2, maxBytes: 2, sizeOf: () => -4, now: () => now });
  zero.set('z', 'z');
  assert.equal(zero.stats().bytes, 0);
  now += 20;
  assert.equal(byteBound.stats().entries, 0);

  const disabled = new api.BoundedCache({ enabled: false, ttlMs: 10, maxEntries: 1, maxBytes: 1 });
  assert.equal(disabled.isEnabled(), false);
  assert.equal(await disabled.getOrCreate('x', async () => 'value'), 'value');
  assert.equal(disabled.stats().entries, 0);
});

test('bounded cache constructor covers non-finite and non-positive bound rejection', () => {
  const invalid = [
    { ttlMs: NaN, maxEntries: 1, maxBytes: 1 },
    { ttlMs: Infinity, maxEntries: 1, maxBytes: 1 },
    { ttlMs: -1, maxEntries: 1, maxBytes: 1 },
    { ttlMs: 1, maxEntries: NaN, maxBytes: 1 },
    { ttlMs: 1, maxEntries: Infinity, maxBytes: 1 },
    { ttlMs: 1, maxEntries: -1, maxBytes: 1 },
    { ttlMs: 1, maxEntries: 1, maxBytes: NaN },
    { ttlMs: 1, maxEntries: 1, maxBytes: Infinity },
    { ttlMs: 1, maxEntries: 1, maxBytes: -1 },
  ];
  for (const options of invalid) assert.throws(() => new api.BoundedCache(options), TypeError);
});

test('network classification and allowlist cover mapped-public, reserved ranges, special IPv6 and exact hosts', () => {
  for (const ip of ['192.0.0.1', '192.88.99.1', '64:ff9b::1', '64:ff9b:1::1', '100::1', '2001::1', '2002::1', '3fff::1', '5f00::1']) {
    assert.equal(api.classifyIpAddress(ip).blocked, true, ip);
  }
  assert.deepEqual(api.classifyIpAddress('::ffff:8.8.8.8'), { blocked: false });
  assert.equal(api.classifyIpAddress('fe80::1%eth0').blocked, true);
  assert.equal(api.hostMatchesAllowlist('Example.COM.', ['example.com']), true);
  assert.equal(api.hostMatchesAllowlist('example.com', ['example.com.']), true);
  assert.equal(api.hostMatchesAllowlist('sub.example.com', ['example.com']), false);
  assert.equal(api.hostMatchesAllowlist('sub.example.com', ['*.example.com']), true);
  assert.equal(api.hostMatchesAllowlist('example.com', ['*.example.com']), false);
  assert.equal(api.hostMatchesAllowlist('deep.sub.example.com.', ['*.example.com.']), true);
});

test('remote target validation covers numeric public/trusted paths, trusted localhost and deterministic DNS failure', async () => {
  const defaults = api.resolveApexifyRuntimeConfig().network;
  const publicTarget = await api.validateRemoteTarget('https://8.8.8.8/resource', defaults);
  assert.equal(publicTarget.trusted, false);
  assert.deepEqual(publicTarget.addresses, ['8.8.8.8']);

  const trusted = api.resolveApexifyRuntimeConfig({ network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1', 'localhost'] } }).network;
  const local = await api.validateRemoteTarget(new URL('http://127.0.0.1/x'), trusted);
  assert.equal(local.trusted, true);

  const localhost = await api.validateRemoteTarget('http://localhost/x', trusted);
  assert.equal(localhost.trusted, true);
  assert.ok(localhost.addresses.length >= 1);

  await assert.rejects(
    api.validateRemoteTarget('https://definitely-does-not-exist.invalid/a', defaults),
    (error) => error instanceof api.ApexifyRemoteFetchError && /DNS resolution failed/i.test(error.message)
  );
});

test('URL redaction accepts URL instances and sanitizer leaves non-URLs untouched', () => {
  const url = new URL('https://user:pass@example.com/path?secret=1#frag');
  assert.equal(api.redactUrl(url), 'https://example.com/path');
  assert.equal(api.redactUrlsInText('plain diagnostic'), 'plain diagnostic');
});

test('network policy edge branches reject malformed, credentialed, local and blocked numeric targets', async () => {
  const defaults = api.resolveApexifyRuntimeConfig().network;
  assert.deepEqual(api.classifyIpAddress('not-an-ip'), { blocked: true, reason: 'invalid-address' });
  assert.deepEqual(api.classifyIpAddress('8.8.4.4'), { blocked: false });
  assert.deepEqual(api.classifyIpAddress('::ffff:127.0.0.1'), { blocked: true, reason: 'ipv4-mapped:loopback' });
  assert.deepEqual(api.classifyIpAddress('2606:4700:4700::1111'), { blocked: false });
  assert.equal(api.redactUrl('not a URL'), '[invalid-url]');
  assert.equal(api.redactUrlsInText('bad https://[ and good https://user:pw@example.com/x?q=secret#f'), 'bad [invalid-url] and good https://example.com/x');

  await assert.rejects(api.validateRemoteTarget('not a URL', defaults), /URL is invalid/i);
  await assert.rejects(api.validateRemoteTarget('ftp://8.8.8.8/file', defaults), /protocol is not allowed/i);
  await assert.rejects(api.validateRemoteTarget('https://user:password@8.8.8.8/file', defaults), /credentials embedded/i);
  await assert.rejects(api.validateRemoteTarget('http://localhost/file', defaults), /local and blocked/i);
  await assert.rejects(api.validateRemoteTarget('http://127.0.0.1/file', defaults), /blocked loopback/i);
});