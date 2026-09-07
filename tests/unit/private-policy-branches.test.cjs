'use strict';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

afterEach(() => api.resetApexifyRuntimeConfig());

test('private IPv4/IPv6 policy helpers cover defensive parser and CIDR branches', () => {
  assert.equal(api.__phase12_ipv4ToInt('255.255.255.255'), 0xffffffff);
  assert.deepEqual(api.__phase12_ipv4Range('0.0.0.0/0', 'all'), { base: 0, mask: 0, label: 'all' });
  assert.equal(api.__phase12_ipv6InCidr(123n, 999n, 0), true);

  assert.equal(api.__phase12_normalizeIpv6('::ffff:8.8.8.8'), 0xffff08080808n);
  assert.throws(() => api.__phase12_normalizeIpv6('1:2:3:4:5:6:7'), /Invalid IPv6 address/);
  assert.throws(() => api.__phase12_normalizeIpv6('1:2:3:4:5:6:7:8::9'), /Invalid IPv6 address/);
  assert.throws(() => api.__phase12_normalizeIpv6('1:2:3:4:5:6:7:zzzz'), /Invalid IPv6 address/);
});

test('private retry parsing and delay policy cover array, date, invalid, jitter and Retry-After branches', async () => {
  assert.equal(api.__phase12_parseRetryAfter(undefined), undefined);
  assert.equal(api.__phase12_parseRetryAfter(['2']), 2000);
  assert.equal(api.__phase12_parseRetryAfter('3'), 3000);
  assert.equal(api.__phase12_parseRetryAfter('not-a-date'), undefined);
  const future = new Date(Date.now() + 60_000).toUTCString();
  const futureMs = api.__phase12_parseRetryAfter(future);
  assert.ok(futureMs >= 0 && futureMs <= 60_000);

  api.setDefaultApexifyRuntimeConfig({ network: { honorRetryAfter: true, retryMaxDelayMs: 25 } });
  assert.equal(api.__phase12_retryDelay(1, 100), 25);

  api.setDefaultApexifyRuntimeConfig({ network: { honorRetryAfter: false, retryBaseDelayMs: 10, retryMaxDelayMs: 100, retryJitterRatio: 0.5 } });
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(api.__phase12_retryDelay(0), 5);
    Math.random = () => 1;
    assert.equal(api.__phase12_retryDelay(2), 30);
  } finally {
    Math.random = originalRandom;
  }

  await api.__phase12_sleep(0);
  const pre = new AbortController();
  pre.abort(new Error('pre-aborted-sleep'));
  await assert.rejects(api.__phase12_sleep(10, pre.signal), /pre-aborted-sleep/);
});

test('private pinned lookup covers all/single results, cursor rotation and IPv4/IPv6 family detection', async () => {
  const lookup = api.__phase12_createPinnedLookup(['127.0.0.1', '::1']);
  const all = await new Promise((resolve, reject) => lookup('example', { all: true }, (error, value) => error ? reject(error) : resolve(value)));
  assert.deepEqual(all, [{ address: '127.0.0.1', family: 4 }]);

  const single = await new Promise((resolve, reject) => lookup('example', {}, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(single, { address: '::1', family: 6 });

  const rotated = await new Promise((resolve, reject) => lookup('example', null, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  assert.deepEqual(rotated, { address: '127.0.0.1', family: 4 });
});

test('private header and redirect helpers cover absent headers, casing, body conversion and method preservation', () => {
  assert.equal(api.__phase12_hasHeader({ 'Content-Length': '3' }, 'content-length'), true);
  assert.equal(api.__phase12_hasHeader({ 'X-Test': '1' }, 'content-length'), false);
  assert.equal(api.__phase12_withoutBodyHeaders(undefined), undefined);
  assert.deepEqual(api.__phase12_withoutBodyHeaders({ 'Content-Length': '3', 'transfer-encoding': 'chunked', 'X-Test': '1' }), { 'X-Test': '1' });

  const noHeaders = api.__phase12_redirectRequestOptions(303, { method: 'POST', body: 'abc' });
  assert.equal(noHeaders.method, 'GET');
  assert.equal(noHeaders.body, undefined);
  assert.equal(noHeaders.headers, undefined);

  const preserve = { method: 'POST', body: 'abc', headers: { 'X-Test': '1' } };
  assert.equal(api.__phase12_redirectRequestOptions(307, preserve), preserve);

  const absentBody = api.__phase12_requestHeaders({});
  assert.equal(absentBody.body, undefined);
  const stringBody = api.__phase12_requestHeaders({ body: 'abc' });
  assert.equal(stringBody.body.toString(), 'abc');
  assert.equal(stringBody.headers['Content-Length'], '3');
  const bufferBody = api.__phase12_requestHeaders({ body: Buffer.from('abcd'), headers: { 'content-length': '9' } });
  assert.equal(bufferBody.body.toString(), 'abcd');
  assert.equal(bufferBody.headers['content-length'], '9');
  assert.equal(bufferBody.headers['Content-Length'], undefined);
});

test('private size and HTTP guard helpers cover defaults, finite/non-finite headers and limit names', () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxRemoteImageBytes: 11, maxRemoteVideoBytes: 22 } });
  assert.equal(api.__phase12_defaultMaxBytes('image'), 11);
  assert.equal(api.__phase12_defaultMaxBytes(undefined), 11);
  assert.equal(api.__phase12_defaultMaxBytes('video'), 22);
  assert.equal(api.__phase12_defaultMaxBytes('generic'), 22);
  assert.equal(api.__phase12_remoteLimitName('image'), 'maxRemoteImageBytes');
  assert.equal(api.__phase12_remoteLimitName('video'), 'maxRemoteVideoBytes');

  const url = new URL('https://example.com/file');
  api.__phase12_contentLengthGuard(url, {}, { maxBytes: 10, kind: 'image' });
  api.__phase12_contentLengthGuard(url, { 'content-length': 'not-a-number' }, { maxBytes: 10, kind: 'image' });
  assert.throws(
    () => api.__phase12_contentLengthGuard(url, { 'content-length': '11' }, { maxBytes: 10, kind: 'image' }),
    api.ApexifyResourceLimitError,
  );
});

test('private retryability helpers cover all error classes/status branches and policy normalization', () => {
  assert.equal(api.__phase12_retryAfterFromError(new Error('x')), undefined);
  assert.equal(api.__phase12_retryAfterFromError(new api.ApexifyRemoteFetchError('x', { details: { retryAfterMs: 'bad' } })), undefined);
  assert.equal(api.__phase12_retryAfterFromError(new api.ApexifyRemoteFetchError('x', { details: { retryAfterMs: 12 } })), 12);

  assert.equal(api.__phase12_retryable(new Error('x')), false);
  assert.equal(api.__phase12_retryable(new api.ApexifyResourceLimitError('x', 1, 2)), false);
  assert.equal(api.__phase12_retryable(new api.ApexifyRemoteFetchError('x', { status: 503 })), true);
  assert.equal(api.__phase12_retryable(new api.ApexifyRemoteFetchError('x', { status: 404 })), false);
  assert.equal(api.__phase12_retryable(new api.ApexifyRemoteFetchError('request aborted')), false);
  assert.equal(api.__phase12_retryable(new api.ApexifyRemoteFetchError('socket failed')), true);

  api.setDefaultApexifyRuntimeConfig({ network: { retryAttempts: 4, maxRedirects: 6, timeoutMs: 99 } });
  const get = api.__phase12_resolvedFetchPolicy({});
  assert.equal(get.attempts, 4);
  assert.equal(get.maxRedirects, 6);
  assert.equal(get.timeoutMs, 99);
  const post = api.__phase12_resolvedFetchPolicy({ method: 'POST' });
  assert.equal(post.attempts, 1);
  const normalized = api.__phase12_resolvedFetchPolicy({ attempts: -5.8, maxRedirects: -2.2, timeoutMs: 7, maxBytes: 8 });
  assert.equal(normalized.attempts, 1);
  assert.equal(normalized.maxRedirects, 0);
  assert.equal(normalized.timeoutMs, 7);
  assert.equal(normalized.maxBytes, 8);
});

test('private process helpers cover token validation and bounded-tail replacement/trimming branches', () => {
  assert.throws(() => api.__phase12_validateProcessToken('', 'token'), api.ApexifyProcessError);
  assert.throws(() => api.__phase12_validateProcessToken('bad\0token', 'token'), api.ApexifyProcessError);
  api.__phase12_validateProcessToken('ok', 'token');

  const chunks = [];
  assert.equal(api.__phase12_appendBoundedTail(chunks, 0, Buffer.from('123456'), 4), 4);
  assert.equal(Buffer.concat(chunks).toString(), '3456');

  const chunks2 = [Buffer.from('ab')];
  const bytes = api.__phase12_appendBoundedTail(chunks2, 2, Buffer.from('cde'), 4);
  assert.equal(bytes, 4);
  assert.equal(Buffer.concat(chunks2).toString(), 'bcde');

  const chunks3 = [Buffer.from('abc')];
  const bytes3 = api.__phase12_appendBoundedTail(chunks3, 3, Buffer.from('def'), 3);
  assert.equal(bytes3, 3);
  assert.equal(Buffer.concat(chunks3).toString(), 'def');
});
