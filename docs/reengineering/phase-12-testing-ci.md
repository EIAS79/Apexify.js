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

- it is available in every supported Node line;
- it provides process isolation, subtests and standard reporters;
- it provides native V8 coverage collection and threshold enforcement;
- it requires no new runtime or development dependency;
- it avoids replacing working historical regression scripts merely for framework churn.

Historical Phase 1–10 suites are retained behind permanent top-level gates. New critical tests use `node:test` directly.

## Permanent command architecture

| Command | Purpose |
|---|---|
| `npm test` | Complete permanent verification gate |
| `npm run test:unit` | Critical runtime/config/network/cache unit behavior |
| `npm run test:internals` | Non-published critical policy branch probes against coverage-only source copies |
| `npm run test:integration` | Deterministic local HTTP/network integration |
| `npm run test:security` | Permanent process/temp/network security plus historical Phase 1 security |
| `npm run test:golden` | Tolerant pixel-diff infrastructure plus retained raster/composition/chart goldens |
| `npm run test:fuzz` | Deterministic property tests plus retained audio/secondary-domain fuzz suites |
| `npm run test:regression` | Historical Phase 3–10 regressions |
| `npm run coverage` | Native V8 coverage gate over critical infrastructure |
| `npm run test:package` | Clean-prepack rebuild plus packed ESM/CJS/types/export installation verification |
| `npm run benchmark` | Versioned Phase 12 performance regression harness |
| `npm run audit:secrets` | High-confidence repository secret scan |
| `npm run audit:tests` | Inventory/classification audit for test assets |
| `npm run test:ci` | Build + audits + complete tests + coverage + package + benchmark + maintenance |

## Test-system inventory and classification

`scripts/test-system-audit.cjs` walks every test file, relevant fixture/scanner script, and benchmark and writes `artifacts/test-system-audit.json`. It fails if a candidate asset is unclassified.

The Phase 12 inventory contains **101 classified assets**:

- `BENCHMARK`: 10;
- `GOLDEN TEST`: 6;
- `INTEGRATION TEST`: 9;
- `PERMANENT TEST`: 19;
- `REGRESSION TEST`: 42;
- `SECURITY TEST`: 7;
- `TEMPORARY PHASE TEST`: 8.

Historical fixture-build glue remains only where it is still required to execute retained regression evidence.

## Coverage model

Coverage is not treated as a line-count game. The highest requirements apply to infrastructure controlling security, validation, process execution, networking, cache/resource governance and temp lifecycle.

The coverage harness compiles the authoritative TypeScript sources into **coverage-only CommonJS copies** under `tests/.coverage/`. Those copies are never published and never enter `dist/`. Compiler-only CommonJS metadata/default-import compatibility scaffolding is removed from measured copies so TypeScript-generated branches do not count as Apexify branch debt. Selected private policy helpers are exposed only on these coverage copies so reachable internal branches can be tested without expanding the package API.

The final mandatory thresholds are:

- **lines: 99%**;
- **functions: 96%**;
- **branches: 95%**.

Calibration on Linux Node 22, 24 and 26 produced the same critical-source result:

- **99.25% lines** (`1323 / 1333`);
- **96.21% functions** (`127 / 132`);
- **95.27% branches** (`524 / 550`).

Representative per-domain branch coverage at calibration:

- runtime config: **100%**;
- bounded cache: **100%**;
- temp workspace: **100%**;
- network policy: **96.39%**;
- process runner: **93.33%**;
- remote fetch transport: **92.92%**;
- combined critical infrastructure: **95.27%**.

The combined hard gate therefore satisfies the Phase 12 requirement that critical infrastructure generally exceed 95% branch coverage where practical while preserving explicit defensive branches whose states are not naturally reachable through supported Node/runtime invariants.

### Domain coverage map

| Domain | Primary permanent evidence |
|---|---|
| runtime/config | critical unit suites + historical Phase 3/4 regressions |
| runtime/limits/validation/errors | Phase 4 suites + table-driven unit validation |
| media/network | deterministic `remote-fetch` integration + SSRF unit matrix + private policy branches |
| cache | bounded-cache unit and internal invariant tests + Phase 3 decoded-cache regression |
| canvas/image/text | Phase 5 runtime/review/completion/goldens + Phase 10 text/image regressions |
| scene/templates/components/plugins | Phase 6 scene/asset/template/component/plugin regressions and goldens |
| GIF | Phase 7 GIF/streaming/animation/golden suites |
| video/FFmpeg/ffprobe | permanent process security + Phase 8 + Phase 9 video integration |
| audio/WAV | Phase 9 DSP/WAV/resource/presets/fuzz/golden/concurrency |
| chart/path/pixels | Phase 10 runtime/fuzz/golden |
| package/exports/types | clean-prepack verifier + packed-package fixtures + public API compatibility |

## Historical defect → regression traceability

Every major original-audit invariant has retained permanent evidence, including:

- embedded credential fallback → Phase 1 security scanner/tests + repository secret scan;
- shell-command FFmpeg execution → Phase 1 and Phase 12 hostile-argv process tests;
- SSRF/private addresses → Phase 3 regressions + Phase 12 SSRF matrix;
- redirect target revalidation → deterministic remote-fetch integration;
- remote byte limits → Content-Length and streamed-limit integration tests;
- duplicate remote-media bypass → historical source/bypass scanners;
- failed cache promise poisoning and unbounded decoded cache → Phase 3 cache regressions + bounded-cache tests;
- resource-limit validation → Phase 4 + runtime config unit table;
- zero/default `||` behavior and visual regressions → Phase 5/10 goldens;
- GIF validation/concurrency/attachment regressions → Phase 7 suites;
- remote video buffering/grid/watermark regressions → Phase 8 suites;
- temp cleanup → Phase 1/8 + permanent Phase 12 temp-workspace tests;
- missing root exports and ESM/CJS/types regressions → public API + packed-package verification;
- malformed WAV and unsafe audio allocation → Phase 9 tests/fuzzing;
- batch concurrency, output slicing, collage/stitch semantics → Phase 10 regressions.

A deleted obsolete path does not delete its regression contract: retained scanners and package-surface tests prevent equivalent bypasses from silently returning.

## Golden-image policy

Goldens compare decoded pixels, not output length or merely non-empty buffers. `tests/helpers/image-diff.cjs` reports differing pixel count/percentage, maximum channel delta and configured tolerance, and can emit a PNG diff image on mismatch.

Retained goldens cover canvas backgrounds, text composition, shapes/paths, image fit, gradients including reflect behavior, masks, scenes, charts, crop/resize, x=0/y=0 placement, opacity=0, collage and stitch semantics. CI never silently regenerates golden references.

## Security matrix

Permanent Phase 12 coverage includes:

- IPv4 loopback/private/link-local/reserved/documentation/multicast ranges;
- IPv6 loopback/ULA/link-local/multicast/documentation, translation ranges and IPv4-mapped IPv6;
- protocol and URL-credential rejection;
- explicit trusted-host allowlisting;
- redirect-to-blocked-target revalidation;
- redirect count and POST→GET semantics;
- retryable/non-retryable status and `Retry-After` policy;
- Content-Length and streaming byte caps;
- empty response, timeout and abort handling;
- queued-request abort and global network-concurrency bounds;
- hostile process argv (`$()`, backticks, semicolon, ampersand, quotes, spaces, Unicode, brackets);
- bounded stdout/stderr, timeout, abort, exit-code and forced-kill behavior;
- temp-workspace uniqueness, confinement, cleanup and explicit debug retention;
- signed URL redaction;
- absence of hard-coded secret fallbacks and process/network bypasses.

The deterministic network integration suite binds only to loopback and explicitly permits `127.0.0.1`; it never requires a public host.

`scripts/secret-scan.cjs` scans repository text using seven high-confidence detector families. The calibration scan covered **316 text files** and reported **zero findings**.

## Fuzz/property policy

Property tests use deterministic seeded PRNGs so failures reproduce exactly. Phase 12 directly covers asset-reference recursion/escaping/prototype safety, scene numeric bounds, gradients, FFmpeg filter expressions, video option normalization and malformed address classifications. Retained Phase 9/10 fuzz suites continue to cover audio/WAV and path/chart/pixel domains.

A fuzz-discovered crash becomes a named permanent regression; it is never accepted as expected flakiness.

## Package verification

Phase 12 verifies the artifact rather than inferring package correctness from source.

`scripts/verify-prepack-rebuild.cjs` removes `dist/`, invokes the actual npm `prepack` lifecycle and requires the ESM, CJS, ESM declarations and CJS declarations to be rebuilt before accepting the tarball.

`scripts/verify-packed-package.cjs` then packs the actual package and installs it into clean temporary consumers that verify:

- ESM import;
- CommonJS require;
- TypeScript declarations in both modes;
- root exports/helpers;
- declared subpaths, including the types-only subpath behavior;
- package-content boundaries;
- cold-import viability.

## Benchmark policy

`benchmarks/phase12-benchmark.cjs` executes a representative path/pixel/chart/stitch workload **five times** and compares the median with the committed, versioned `benchmarks/baselines/phase12.json` registry.

- wall time and RSS delta are recorded;
- baselines are keyed by OS/architecture/Node major;
- elapsed-time regression tolerance is **10%**;
- RSS uses the same relative tolerance plus a small absolute allocator-noise allowance;
- missing baselines are allowed only while generating calibration evidence and are not an acceptable completed Phase 12 state.

The committed Linux x64 baseline registry is calibrated from the conservative maximum median observed across successful Linux full-gate benchmark jobs in workflow runs `34073922518`, `34074426539`, and `34074706070`:

| Runtime | Baseline median | Baseline RSS delta |
|---|---:|---:|
| Node 22 | 36.19 ms | 2.38 MiB |
| Node 24 | 34.42 ms | 3.75 MiB |
| Node 26 | 44.30 ms | 3.88 MiB |

This uses actual retained CI evidence and deliberately avoids calibrating to an unusually fast hosted-runner sample.

## CI policy

`.github/workflows/ci.yml` is the permanent workflow. It proves:

1. locked dependency installation;
2. build/typecheck/module-format verification;
3. test-system inventory classification;
4. high-confidence secret scan;
5. unit/internal/integration/security/golden/fuzz/regression suites;
6. source-only critical coverage gate;
7. clean-prepack lifecycle rebuild;
8. packed-package ESM/CJS/types fixtures;
9. all-dependency and production-dependency security audits;
10. controlled FFmpeg installation/integration;
11. versioned benchmark regression gate;
12. maintenance audit;
13. Linux Node 22/24/26 full gates plus Windows/macOS Node 24 runtime/package smoke.

Coverage, benchmark, package, secret-scan and dependency-audit evidence is retained as GitHub Actions artifacts.

## Completion contract

Phase 12 is not complete merely because its branch tests pass. Completion requires all of the following:

- the final PR head passes the permanent CI matrix with the **99/96/95** coverage thresholds enforced;
- the committed Node 22/24/26 benchmark baselines are actually consumed and pass the 10% regression gate;
- packed-package and clean-prepack verification pass;
- secret/dependency/security/regression/golden/fuzz gates pass;
- PR #18 is merged into `main`;
- the exact resulting merged `main` SHA passes the automatic post-merge CI matrix.

Only that post-merge evidence closes Phase 12.
