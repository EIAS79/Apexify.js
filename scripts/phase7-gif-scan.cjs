'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gifDir = path.resolve('lib-next/gif');
const gifPaths = fs.readdirSync(gifDir)
  .filter((name) => /\.(?:ts|js|cjs|mjs)$/.test(name))
  .map((name) => `lib-next/gif/${name}`);
const paths = [
  ...gifPaths,
  'lib-next/types/gif.ts',
  'lib-next/apex-painter/creates/gif-create.ts',
  'lib-next/scene/gif-scene.ts',
];
const sources = Object.fromEntries(paths.map((file) => [file, fs.readFileSync(file, 'utf8')]));
const combined = Object.values(sources).join('\n');

for (const forbidden of [
  /\bPromise\.all\s*\(/,
  /\bArray\.from\s*\(/,
  /\baxios\b/,
  /\bfetch\s*\(/,
  /\bloadImageCached\b/,
  /\bloadImage\s*\(/,
  /collectFramesFromOnStart/,
  /finalFrames\s*:/,
  /createBufferStream/,
  /name:\s*["']image\.js["']/,
  /\bbasDir\b/,
  /\b(?:TODO|FIXME)\b/,
  /not implemented/i,
]) {
  assert.equal(forbidden.test(combined), false, `Phase 7 GIF self-challenge found forbidden pattern ${forbidden}`);
}

const creator = sources['lib-next/gif/gif-creator.ts'];
assert.ok(creator.includes('for await (const raw of source.frames)'), 'generated AsyncIterable must be consumed incrementally');
assert.ok(creator.includes('No prefetch: normalization and encoding complete before the producer is asked for the next item.'), 'streaming no-prefetch invariant missing');
assert.ok(creator.includes('resolveMediaInput(source, { kind: "image", cache: cacheRemoteBytes, signal })'), 'GIF media must route through the central resolver');
assert.ok(creator.includes('this.resolveImageSource(source, signal, false)'), 'frame media cache-pollution bypass missing');
assert.ok(creator.includes('const pending = new Map<number, Promise<GIFCanonicalFrame>>()'), 'bounded regular-frame queue missing');
assert.ok(creator.includes('Math.min(limits.maxBatchConcurrency, limits.maxConcurrentRemoteFetches'), 'bounded queue must use central concurrency limits');
assert.ok(creator.indexOf('validateGIFOptions(options') < creator.indexOf('prepareFrameSource(gifFrames'), 'common/output validation must precede onStart/frame preparation');
assert.ok(creator.includes('new BoundedCache<string, Image>'), 'operation-local watermark reuse must use central bounded-cache abstraction');
assert.ok(creator.includes('watermarkCache?.clear()'), 'operation-local watermark cache must be released after render');
assert.ok(creator.includes('contentType: "image/gif"'), 'attachment MIME contract missing');
assert.ok(creator.includes('GIF87a') && creator.includes('GIF89a'), 'GIF signature verification missing');
assert.ok(creator.includes('encoder.setDispose(frame.dispose ?? options.defaultDispose'), 'disposal state must be reset for every frame');
assert.ok(creator.includes('encoder.setTransparent(parsed)'), 'transparency state must be set for every frame');

const facade = sources['lib-next/apex-painter/creates/gif-create.ts'];
assert.equal(facade.includes('guardGeneratedFrames'), false, 'duplicate generated-frame validation wrapper must be removed');
assert.equal(facade.includes('validateGIFOptions'), false, 'GIF facade must not duplicate creator validation');

const animate = sources['lib-next/gif/animate-frames.ts'];
assert.ok(animate.includes('await gifCompletion'), 'animate GIF file lifecycle must await stream completion');
assert.ok(animate.includes('await assertGifFile(options!.gifPath!)'), 'animate GIF output must validate the completed file');
assert.ok(animate.includes('resolveMediaInput(source, { kind: "image", cache: false, signal })'), 'animate media must use central network resolver without global frame cache pollution');
assert.ok(animate.includes('createGradientFill(ctx, normalized as gradient'), 'animate gradients must route through the shared renderer');
assert.equal(/ctx\.create(?:Linear|Radial|Conic)Gradient\s*\(/.test(animate), false, 'animate must not maintain a divergent local gradient implementation');
assert.ok(animate.includes('GIF frames must use the configured GIF width and height'), 'animate GIF mode must reject mixed logical-screen dimensions');
assert.ok(animate.includes('if (!options?.gif && (frame.duration ?? defaultDuration) > 0)'), 'animate GIF encoding must not add wall-clock sleeps to encode throughput');

const types = sources['lib-next/types/gif.ts'];
assert.ok(types.includes('AsyncIterable<GIFEncodedFrame>'), 'public generated-frame type must expose streaming AsyncIterable');
assert.ok(types.includes('signal?: AbortSignal'), 'public GIF cancellation contract missing');
assert.ok(types.includes('contentType: "image/gif"'), 'public attachment MIME contract missing');

console.log('phase7-gif-scan: streaming, backpressure, network, output, validation, cache, animate parity and dead-path architecture checks passed.');
