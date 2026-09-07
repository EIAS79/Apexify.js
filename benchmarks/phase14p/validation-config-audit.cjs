'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const outputPath = path.resolve(String(args.output || path.join(root, 'artifacts', 'phase14p', 'validation-config-audit.json')));
const fixtureRoot = path.join(root, 'benchmarks', '.phase14p-source', 'lib-next');

function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}

const checks = [];
function check(id, condition, evidence, category) {
  checks.push({ id, category, status: condition ? 'pass' : 'fail', evidence });
}

function contains(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

async function main() {
  if (!fs.existsSync(fixtureRoot)) {
    throw new Error('Phase 14-P internal fixture is missing. Run node scripts/build-phase14p-benchmark-fixture.mjs first.');
  }

  const textCreator = read('lib-next/text/text-creator.ts');
  const textEncoder = read('lib-next/text/text-png-encoder.ts');
  const imageProperties = read('lib-next/image/image-properties.ts');
  const gifCreator = read('lib-next/gif/gif-creator.ts');
  const audioSynth = read('lib-next/audio-synth/synthesizer.ts');
  const sceneCreator = read('lib-next/scene/scene-creator.ts');
  const runtimeConfigSource = read('lib-next/runtime/config.ts');
  const networkPolicy = read('lib-next/media/network-policy.ts');
  const remoteFetch = read('lib-next/media/remote-fetch.ts');
  const processRunner = read('lib-next/video/process-runner.ts');
  const tempWorkspace = read('lib-next/video/temp-workspace.ts');

  // P14-P.4 — validation/normalization boundary audit.
  check(
    'text-public-validates-before-trusted-fast-path',
    contains(textCreator, [
      'const textList = this.validateTextArray(textArray);',
      'assertCanvasResourceLimits(existingImage.width, existingImage.height);',
      'return await this.createTextFromDecodedBase(textList, canvasBuffer, existingImage);',
    ]),
    'createText validates text and decoded canvas resource limits before entering createTextFromDecodedBase.',
    'validation'
  );
  check(
    'audio-public-validates-before-trusted-render-encode',
    contains(audioSynth, [
      'const validated = validateSynthSoundOptions(options);',
      'assertAudioWavResourceLimits(validated.duration, validated.sampleRate, validated.channels);',
      'const pcm = renderValidatedSound(options, validated);',
      'return encodeValidatedWavPcm16(pcm, validated.sampleRate, validated.channels);',
    ]),
    'synthesizeSound validates once, checks WAV resource limits, then uses trusted validated render/encode helpers.',
    'validation'
  );
  check(
    'scene-public-validation-retained',
    sceneCreator.includes('validateSceneRenderInput(input, { maxSurfaceDepth: options?.maxSurfaceDepth });'),
    'SceneCreator.render retains the public scene validator before resource allocation/rendering.',
    'validation'
  );
  check(
    'gif-generated-frame-bound-retained',
    contains(gifCreator, [
      'if (index >= source.limit)',
      'generated AsyncIterable exceeded the configured bound',
      'validateGeneratedGIFFrame(raw, index);',
    ]),
    'Generated GIF producers are validated incrementally and cannot exceed the configured frame bound.',
    'validation'
  );

  // P14-P.5/P14-P.10 — config resolution, bounded caches/concurrency and transient memory.
  check(
    'text-fast-path-has-hard-16mib-ceiling-and-native-fallback',
    contains(textEncoder, [
      'TEXT_FAST_PNG_MAX_RAW_BYTES = 16 * 1024 * 1024',
      'rawBytes > TEXT_FAST_PNG_MAX_RAW_BYTES',
      'return canvas.encode("png");',
      'TEXT_PNG_FAST_PATH_FALLBACK',
    ]),
    'The lossless text PNG fast path is capped at 16 MiB raw RGBA and falls back to native Skia on size or semantic/backend anomalies.',
    'memory'
  );
  check(
    'image-decoded-cache-remains-bounded',
    contains(imageProperties, [
      'new BoundedCache<string, Image>',
      'maxEntries: config.maxEntries',
      'maxBytes: config.maxBytes',
      'sizeOf: (value) => Math.max(1, value.width * value.height * 4)',
    ]),
    'Decoded-image cache is still LRU/TTL bounded by both entry count and byte estimate.',
    'memory'
  );
  check(
    'image-inflight-dedup-remains-bounded-and-cleared',
    contains(imageProperties, [
      'const inFlightDecodes = new Map<string, Promise<Image>>();',
      'assertWithinLimit("maxCollectionItems", inFlightDecodes.size + 1);',
      '.finally(() => {',
      'inFlightDecodes.delete(key);',
    ]),
    'In-flight decode deduplication is capped by central collection limits and entries are removed in finally.',
    'memory'
  );
  check(
    'gif-prefetch-remains-central-limit-bounded',
    contains(gifCreator, [
      'Math.min(limits.maxBatchConcurrency, limits.maxConcurrentRemoteFetches, frames.length)',
      'pending.size < concurrency',
      'pending.delete(index);',
    ]),
    'GIF array prefetch never exceeds the minimum of central batch/network limits and removes completed entries.',
    'memory'
  );
  check(
    'scene-surfaces-avoid-intermediate-png-roundtrip',
    contains(sceneCreator, [
      'private async renderSurface',
      'Promise<Canvas>',
      'return cv;',
      'drawSurfaceOntoParent(ctx, surface, layer.placement);',
    ]),
    'Nested scene surfaces remain Canvas objects until parent compositing; no intermediate PNG encode/decode is inserted.',
    'memory'
  );

  // P14-P.5 — runtime configuration structure and defensive validation.
  check(
    'runtime-defaults-are-deeply-frozen-at-boundaries',
    contains(runtimeConfigSource, [
      'DEFAULT_APEXIFY_RUNTIME_CONFIG: Readonly<ApexifyRuntimeConfig> = Object.freeze',
      'network: Object.freeze',
      'limits: Object.freeze',
      'cache: Object.freeze',
      'return Object.freeze({ network: Object.freeze(network), limits: Object.freeze(limits), cache: Object.freeze(cache)',
    ]),
    'Default and resolved runtime configuration objects are frozen, including network/limits/cache sections.',
    'config'
  );
  check(
    'runtime-network-policy-defaults-safe',
    contains(runtimeConfigSource, [
      'trustedNetworkAccess: false',
      'allowedHosts: Object.freeze([] as string[])',
      'allowedProtocols: Object.freeze(["http:", "https:"] as const)',
      'network.trustedNetworkAccess requires at least one explicit network.allowedHosts entry.',
    ]),
    'Default network access is untrusted, HTTP(S)-only, and trusted mode requires an explicit allowlist.',
    'security'
  );
  check(
    'runtime-resource-defaults-remain-bounded',
    contains(runtimeConfigSource, [
      'maxCanvasDimension: 16_384',
      'maxTotalPixels: 67_108_864',
      'maxRemoteImageBytes: 32 * 1024 * 1024',
      'maxImageSourceBytes: 64 * 1024 * 1024',
      'maxGifFrames: 1_000',
      'maxAudioDurationSeconds: 600',
      'maxBatchConcurrency: 4',
      'maxConcurrentRemoteFetches: 8',
    ]),
    'Canvas/pixel/image/GIF/audio/batch/network limits remain explicitly bounded in the default runtime configuration.',
    'config'
  );

  const runtime = require(path.join(fixtureRoot, 'runtime', 'config.js'));
  const defaultsA = runtime.resolveApexifyRuntimeConfig();
  const defaultsB = runtime.resolveApexifyRuntimeConfig();
  const overridden = runtime.resolveApexifyRuntimeConfig({ cache: { maxEntries: 17 }, limits: { maxBatchConcurrency: 2 } });
  check(
    'runtime-resolver-returns-independent-frozen-objects',
    defaultsA !== defaultsB && Object.isFrozen(defaultsA) && Object.isFrozen(defaultsA.network) && Object.isFrozen(defaultsA.limits) && Object.isFrozen(defaultsA.cache),
    'Two default resolutions are independent objects and all critical sections are frozen.',
    'config'
  );
  check(
    'runtime-partial-overrides-do-not-mutate-defaults',
    overridden.cache.maxEntries === 17 && overridden.limits.maxBatchConcurrency === 2 && defaultsA.cache.maxEntries !== 17 && defaultsA.limits.maxBatchConcurrency !== 2,
    'Partial overrides are applied to a new resolved config without mutating prior/default config objects.',
    'config'
  );
  let invalidLimitRejected = false;
  try { runtime.resolveApexifyRuntimeConfig({ limits: { maxBatchConcurrency: 0 } }); } catch { invalidLimitRejected = true; }
  check('runtime-invalid-limit-rejected', invalidLimitRejected, 'Zero batch concurrency is rejected by the central config validator.', 'config');
  let unsafeTrustedNetworkRejected = false;
  try { runtime.resolveApexifyRuntimeConfig({ network: { trustedNetworkAccess: true, allowedHosts: [] } }); } catch { unsafeTrustedNetworkRejected = true; }
  check('runtime-trusted-network-requires-allowlist', unsafeTrustedNetworkRejected, 'Trusted network mode without an allowlist is rejected.', 'security');

  // Non-negotiable security/resource controls must remain structurally present.
  check(
    'ssrf-private-address-policy-retained',
    contains(networkPolicy, [
      '10.0.0.0/8',
      '127.0.0.0/8',
      '169.254.0.0/16',
      '192.168.0.0/16',
      'fc00::',
      'fe80::',
      'validateRemoteTarget',
      'classification.blocked',
    ]),
    'Network policy still rejects IPv4/IPv6 private, loopback and link-local classes unless explicitly trusted/allowlisted.',
    'security'
  );
  check(
    'remote-fetch-byte-and-redirect-controls-retained',
    remoteFetch.includes('maxRedirects') && remoteFetch.includes('maxBytes') && remoteFetch.includes('validateRemoteTarget'),
    'Remote fetch still composes target validation with redirect and byte ceilings.',
    'security'
  );
  check(
    'process-execution-remains-argv-based',
    processRunner.includes('spawn(') && !processRunner.includes('shell: true'),
    'Video process execution uses argv-based spawn and does not opt into shell execution.',
    'security'
  );
  check(
    'temp-workspace-cleanup-retained',
    tempWorkspace.includes('finally') || tempWorkspace.includes('rm(') || tempWorkspace.includes('cleanup'),
    'Temporary video workspace implementation retains explicit cleanup machinery.',
    'security'
  );

  const failures = checks.filter((entry) => entry.status !== 'pass');
  const report = {
    schemaVersion: 1,
    phase: '14-P',
    generatedAt: new Date().toISOString(),
    node: process.version,
    status: failures.length === 0 ? 'pass' : 'fail',
    summary: {
      total: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
      categories: [...new Set(checks.map((entry) => entry.category))],
    },
    checks,
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  for (const entry of checks) console.log(`${entry.status.toUpperCase()} ${entry.id}: ${entry.evidence}`);
  console.log(`Phase 14-P validation/config/security/memory audit: ${report.status.toUpperCase()} (${report.summary.passed}/${report.summary.total})`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
