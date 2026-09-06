# Phase 12 — Comprehensive Testing, Fuzzing, Benchmarks, Packaging, and CI

## Authority and baseline

This phase implements **Phase 12 of the original Apexify.js 0–14 reengineering program**. The later Advanced Engine / Phase 15+ roadmaps do not define this work.

Baseline recorded before Phase 12 implementation:

- merged `main`: `52f6b123241932ec91601df639b8a16210b0bb35`;
- package: `apexify.js@6.0.0`;
- supported Node: `22.x || 24.x || 26.x`;
- package manager: `npm@11.19.1`, committed `package-lock.json`, `npm ci` in CI;
- build: TypeScript typecheck + esbuild ESM/CJS + declaration generation + emitted-format verification;
- prior test system: phase-specific CJS scripts plus TypeScript fixture bundles;
- prior CI: Ubuntu Node 22/24/26 with FFmpeg, full Phase 1–10 regressions, package fixtures, maintenance/dependency audits.

Phase 11 was verified complete on merged `main` before this branch was created.

## Test runner decision

Apexify uses Node's built-in `node:test` runner for the permanent Phase 12 suites. This is intentional:

- it is stable in every supported Node line;
- it provides process isolation, subtests, mocking, filtering and standard reporters;
- it provides native V8 coverage collection and thresholds;
- it requires no new runtime or development dependency;
- it avoids replacing working historical regression scripts merely for framework churn.

Historical Phase 1–10 suites are **retained** and promoted behind permanent top-level gates. New critical tests use `node:test` directly. The old scripts remain regression evidence, not the primary test-system interface.

## Permanent command architecture

| Command | Purpose |
|---|---|
| `npm test` | Complete permanent verification gate |
| `npm run test:unit` | Critical runtime/config/network/cache unit behavior |
| `npm run test:integration` | Deterministic local HTTP/network integration |
| `npm run test:security` | Permanent process/temp/network security plus historical Phase 1 security |
| `npm run test:golden` | Tolerant pixel-diff infrastructure plus retained raster/composition/chart goldens |
| `npm run test:fuzz` | Deterministic property tests plus retained audio/secondary-domain fuzz suites |
| `npm run test:regression` | Historical Phase 3–10 regressions |
| `npm run coverage` | Native V8 coverage gate over critical infrastructure |
| `npm run test:package` | Packed-package ESM/CJS/types/export installation verification |
| `npm run benchmark` | Versioned Phase 12 performance regression harness |
| `npm run test:ci` | Build + complete tests + coverage + package + benchmark + maintenance audit |
| `npm run audit:tests` | Inventory/classification audit for test assets |

## Test-system inventory and classification

`scripts/test-system-audit.cjs` walks every test file, relevant fixture/scanner script, and benchmark and writes `artifacts/test-system-audit.json`. It fails if a candidate asset is unclassified.

Primary classifications are:

- `PERMANENT TEST` — permanent runner suites, shared helpers, fixture entrypoints and packed-package verifier;
- `REGRESSION TEST` — historical defect reproductions, fuzz regressions, compatibility scans;
- `INTEGRATION TEST` — remote/media/video/end-to-end fixtures;
- `SECURITY TEST` — security policy/process/temp/secret suites;
- `GOLDEN TEST` — raster visual reference suites;
- `BENCHMARK` — repeatable performance evidence;
- `TEMPORARY PHASE TEST` — historical fixture-build glue still required to execute retained regression coverage.

Phase 11 already removed dead/redundant source and test paths. Phase 12 does not delete useful regression history simply because its filename contains an old phase number.

## Coverage model

Coverage is not treated as a line-count game. The highest threshold applies to infrastructure that controls security, validation, process execution, networking and resource governance.

The native coverage gate directly executes the bundled critical-infrastructure entry with unit/security/network/property suites. The committed coverage command has explicit line/function/branch thresholds; CI captures the report as evidence. Thresholds may only move downward with a documented justification.

### Domain coverage map

| Domain | Primary permanent evidence |
|---|---|
| runtime/config | `tests/unit/critical-infrastructure.test.cjs`, Phase 3/4 regressions |
| runtime/limits/validation/errors | Phase 4 runtime/public-surface/postmerge suites, unit config table |
| diagnostics | Phase 3/4 regressions and domain failure tests |
| media/network | `tests/integration/remote-fetch.test.cjs`, unit SSRF matrix, Phase 3 runtime |
| media/source | Phase 3/5/7/8 source-path regressions |
| cache | unit bounded-cache test, Phase 3 decoded-cache suite |
| canvas/image | Phase 5 runtime/completion/review/golden suites |
| text | Phase 5/10 runtime and golden suites |
| scene/templates/components/plugins | Phase 6 scenes/assets/templates/components/plugins/regressions/golden |
| GIF | Phase 7 GIF/streaming/animation/golden |
| video/FFmpeg/ffprobe | Phase 1 process security, Phase 8 video/edges/pipeline, Phase 9 video integration |
| audio | Phase 9 DSP/WAV/resource/presets/fuzz/golden/concurrency |
| chart/path/pixels | Phase 10 runtime/fuzz/golden |
| batch/chain | Phase 10 runtime/completeness regressions |
| output/compression/collage/stitch | Phase 10 runtime/collage/golden/compatibility |
| package/exports/types | packed-package verifier + public API compatibility |

## Historical defect → regression traceability

Every major finding from the original audit has a permanent test or scanner path:

| Historical defect/invariant | Regression evidence |
|---|---|
| embedded credential fallback | `scripts/phase1-security-scan.cjs`, `tests/security-phase1.cjs` |
| shell-command FFmpeg execution | `tests/security-phase1.cjs`, `tests/security/phase12-security.test.cjs` |
| SSRF/private addresses | Phase 3 runtime + `tests/unit/critical-infrastructure.test.cjs` |
| redirect target revalidation | `tests/integration/remote-fetch.test.cjs` |
| remote Content-Length/stream byte limits | `tests/integration/remote-fetch.test.cjs`, Phase 3 runtime |
| duplicate remote-media bypass | Phase 3 bypass scan and Phase 7/8 source scanners |
| failed image-cache promise poisoning | `tests/phase3-decoded-cache.cjs` |
| unbounded decoded cache | `tests/phase3-decoded-cache.cjs`, bounded-cache unit test |
| resource limits | Phase 4 suites + config table-driven unit tests |
| zero/default `||` behavior | Phase 5 review/golden regressions |
| reflected gradient collapsing to repeat | `tests/phase5-golden.cjs` |
| custom background render/filter defect | `tests/phase5-golden.cjs` |
| GIF validation bypass | Phase 7 GIF suite/scanner |
| GIF frame accumulation/unbounded concurrency | `tests/phase7-streaming.cjs` |
| GIF attachment filename | Phase 7 GIF suite |
| remote video whole-buffer path | Phase 8 scanner/video suite |
| fake grid merge | Phase 8 video/edges suite |
| remote watermark handling | Phase 8 video/edges suite |
| temp workspace cleanup | Phase 1 security, Phase 8 tests, permanent Phase 12 security suite |
| missing root exports | `tests/public-api-compat.cjs`, packed-package verifier |
| ESM/CJS/type packaging regressions | `scripts/verify-packed-package.cjs` |
| Node engine mismatch | package metadata + CI Node 22/24/26 matrix |
| unsafe audio allocation | `tests/phase9-resource.cjs` |
| malformed WAV parsing | `tests/phase9-wav.cjs`, `tests/phase9-fuzz.cjs` |
| batch unbounded concurrency | Phase 10 runtime/completeness suite |
| output ArrayBuffer slicing | Phase 10 runtime regressions |
| x=0/y=0 image placement and opacity=0 | `tests/phase5-golden.cjs` |
| collage/stitch semantic regressions | `tests/phase10-collage-semantics.cjs`, Phase 10 golden |

If a defect is removed by deleting the obsolete path, the associated static scanner or package-surface test prevents that path from silently returning.

## Golden-image policy

Goldens must compare decoded pixels, not only output length or “non-empty buffer”. `tests/helpers/image-diff.cjs` reports:

- differing pixel count;
- differing pixel percentage;
- maximum channel delta;
- configured channel tolerance;
- configured differing-pixel tolerance;
- a generated PNG diff image when requested.

The retained raster goldens cover canvas backgrounds, text composition, shapes/paths, image fit, gradients (including reflect), masks, scenes and charts, plus important historical crop/resize/x=0/y=0/opacity/collage/stitch regressions.

Golden updates are explicit review work. There is intentionally no CI behavior that silently regenerates references on failure.

## Security matrix

Permanent Phase 12 coverage includes:

- IPv4 loopback/private/link-local/reserved/documentation/multicast ranges;
- IPv6 loopback/ULA/link-local/multicast/documentation and IPv4-mapped IPv6;
- protocol and URL credential rejection;
- explicit trusted-host allowlisting;
- redirects into a blocked target;
- redirect count and POST→GET 303 semantics;
- retryable/non-retryable HTTP status;
- `Retry-After` path;
- Content-Length and streaming byte caps;
- empty response;
- timeout and `AbortSignal`;
- queued-request abort and network concurrency bound;
- argv hostile characters (`$()`, backticks, semicolon, ampersand, quotes, spaces, Unicode, brackets);
- bounded process stdout/stderr, timeout and abort;
- temp workspace uniqueness and cleanup after success/throw;
- signed URL redaction;
- absence of secret fallbacks and source-level process/network bypasses.

The network integration suite binds only to loopback and explicitly enables the trusted-host policy for `127.0.0.1`. It never depends on a public host.

## Fuzz/property policy

Property tests use deterministic seeded PRNGs so failures reproduce exactly in CI. Phase 12 targets asset-reference recursion/escaping, scene numeric bounds and address-classification invariants directly. Existing bounded fuzz suites remain active for procedural audio/WAV and Phase 10 option/path/chart/pixel domains.

A fuzz-discovered crash is a bug to fix and preserve as a named regression; it is not accepted as an expected flaky failure.

## Package verification

`scripts/verify-packed-package.cjs` remains the authoritative package-artifact test. It packs the actual package and installs it into clean temporary consumers that verify:

- ESM import;
- CommonJS require;
- TypeScript declarations;
- root exports/helpers;
- declared subpaths;
- package content boundaries.

Tests do not infer package correctness from the source tree.

## Benchmark policy

`benchmarks/phase12-benchmark.cjs` executes a representative path/pixel/chart/stitch workload three times and compares the median with `benchmarks/baselines/phase12.json`.

- wall time and RSS delta are recorded;
- committed baselines are keyed by OS/architecture/Node major;
- normal regression tolerance is 10%;
- RSS gets a small absolute noise allowance to avoid false failures from allocator variance;
- a missing baseline emits candidate evidence but is not considered the final Phase 12 state — supported CI benchmark environments must receive a committed baseline before completion.

## CI policy

The permanent GitHub Actions workflow must prove:

1. locked install;
2. build/typecheck/module-format verification;
3. test-system inventory audit;
4. unit/integration/security/golden/fuzz/regression suites;
5. critical coverage gate;
6. packed-package install fixtures;
7. secret/security scanners;
8. dependency and maintenance audits;
9. controlled FFmpeg integration;
10. versioned benchmark gate;
11. Linux coverage across Node 22/24/26 plus Windows/macOS package/runtime smoke coverage.

CI artifacts retain coverage, benchmark, package and audit evidence for diagnosis.
