'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const paths = [
  'lib-next/gif/gif-creator.ts',
  'lib-next/gif/animate-frames.ts',
  'lib-next/gif/gif-validation.ts',
  'lib-next/apex-painter/creates/gif-create.ts',
];
const sources = Object.fromEntries(paths.map((path) => [path, fs.readFileSync(path, 'utf8')]));
const combined = Object.values(sources).join('\n');

for (const forbidden of [
  /\bPromise\.all\s*\(/,
  /\bArray\.from\s*\(/,
  /\baxios\b/,
  /\bfetch\s*\(/,
  /collectFramesFromOnStart/,
  /finalFrames\s*:/,
  /createBufferStream/,
  /name:\s*["']image\.js["']/,
]) {
  assert.equal(forbidden.test(combined), false, `Phase 7 GIF self-challenge found forbidden pattern ${forbidden}`);
}

const creator = sources['lib-next/gif/gif-creator.ts'];
assert.ok(creator.includes('for await (const raw of source.frames)'), 'generated AsyncIterable must be consumed incrementally');
assert.ok(creator.includes('No prefetch: normalization and encoding complete before the producer is asked for the next item.'), 'streaming no-prefetch invariant missing');
assert.ok(creator.includes('cache: cacheRemoteBytes'), 'GIF media must route through the central resolver');
assert.ok(creator.includes('cache: false'), 'frame media cache-pollution bypass missing');
assert.ok(creator.includes('const pending = new Map<number, Promise<GIFCanonicalFrame>>()'), 'bounded regular-frame queue missing');
assert.ok(creator.includes('Math.min(limits.maxBatchConcurrency, limits.maxConcurrentRemoteFetches'), 'bounded queue must use central concurrency limits');
assert.ok(creator.indexOf('validateGIFOptions(options') < creator.indexOf('prepareFrameSource(gifFrames'), 'common/output validation must precede onStart/frame preparation');
assert.ok(creator.includes('contentType: "image/gif"'), 'attachment MIME contract missing');
assert.ok(creator.includes('GIF87a') && creator.includes('GIF89a'), 'GIF signature verification missing');

const facade = sources['lib-next/apex-painter/creates/gif-create.ts'];
assert.equal(facade.includes('guardGeneratedFrames'), false, 'duplicate generated-frame validation wrapper must be removed');
assert.equal(facade.includes('validateGIFOptions'), false, 'GIF facade must not duplicate creator validation');

console.log('phase7-gif-scan: streaming, network, output, validation and dead-path architecture checks passed.');
