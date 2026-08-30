# Apexify.js reengineering — Phase 0 current-main re-verification

## Status

**COMPLETE**

This addendum re-runs and re-validates Phase 0 against the repository state that existed when the fresh inspection began, rather than assuming the earlier Phase 0 report remained correct.

- package repository: `EIAS79/Apexify.js`
- inspected `main` SHA at re-verification start: `4c7509a7126ea698641f33a2d7e7d9b850cd6c19`
- Phase 0 audit-control SHA used for the final fresh execution: `353d36c5fd64ee4fa15265446065b252b27f85d6`
- documentation repository: `EIAS79/Apexify.js-Documentation`
- documentation `main` SHA: `ce3e998dcf820c63299f453239e64124b036a9ce`
- package version: `5.4.5`
- no npm publication was performed

The governing specification remains `APEXIFY_JS_9_PLUS_REENGINEERING_MASTER_PLAN.md`.

## Verification method

The earlier report was not accepted as proof by itself. Current state was re-established by:

1. reading the master plan completely;
2. reading current repository/branch metadata for both repositories;
3. comparing runtime subject `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1` with current `main`;
4. tracing high-risk/current callers directly in `lib-next`;
5. re-running the Phase 0 Node compatibility/build/test/import/package matrix on GitHub-hosted clean environments;
6. re-running the representative performance benchmark on Node 20;
7. adding an audit-only `npm audit --json` capture to the Phase 0 workflow and running it;
8. inspecting generated dependency, package, registry, audit, and benchmark artifacts.

The commit comparison from `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1` through `4c7509a7126ea698641f33a2d7e7d9b850cd6c19` contains only four Phase 0 files:

- `.github/workflows/phase-0-baseline.yml`
- `benchmarks/phase0-baseline.cjs`
- `benchmarks/baselines/phase0-node20-linux.json`
- `docs/reengineering/phase-0-baseline.md`

No package runtime source, manifest, pre-existing test, or documentation-site source changed in that interval. The source-level findings in the original report therefore remain applicable to current runtime code, and the highest-risk findings were independently spot-traced again during this re-verification.

## Current package/build/release snapshot

- version: `5.4.5`
- declared Node engine: `>=16.0.0`
- source root: `lib-next`
- runtime root export: `ApexPainter` only
- types root export: `export type * from "./types"`
- nominal ESM output: `dist/esm`
- CJS output: `dist/cjs`
- build: clean -> ESM TypeScript build -> CJS TypeScript build
- package test script: only `test:remote-image`
- checked-in audio smoke exists but is not a package `test` script
- release script: `npm run build && npm publish`
- no `prepack` gate
- no committed lockfile
- no `LICENSE` file although manifest metadata/files reference it
- `rimraf` is used by `clean` but is not a direct dev dependency
- `main` is not branch protected and has no required status checks
- documentation repository has build/lint/gallery scripts but no broad example/test workflow under `.github/workflows`

## Fresh clean-runtime matrix

The workflow deliberately uses `continue-on-error` on diagnostic steps so all evidence can be collected. Therefore the overall GitHub Actions run being green is **not** equivalent to product checks passing; the status artifacts below are authoritative.

| Runtime | Install | Build | Remote-image smoke | Audio smoke | CJS import | Nominal ESM import | Pack dry-run |
|---|---|---|---|---|---|---|---|
| Node 16 | pass, with major engine violations | pass | **fail** | **fail** | **fail** | **fail** | pass |
| Node 18 | pass | pass | **fail** | **fail** | pass | pass | pass |
| Node 20 | pass | pass | **fail** | **fail** | pass | pass | pass |
| Node 22 | **fail** | downstream fail | downstream fail | downstream fail | downstream fail | downstream fail | pass despite missing build output |

### Failure causes

- Node 16: current Sharp/runtime dependencies require newer Node versions. Runtime import fails even though TypeScript compilation can complete. The `>=16` engine claim is false in practice.
- Node 22: install fails on legacy `canvas@2.11.2` in the current graph because no matching prebuilt binary is available and the fallback native build lacks Cairo/Pixman prerequisites.
- Remote-image smoke: current floating Sharp/libvips graph reports `pngload_buffer: libspng read error` on the checked-in 1x1 PNG regression fixture.
- Audio smoke: TypeScript TS7016 because the test imports `../dist/cjs` while declarations are emitted only with the ESM build layout.
- Nominal ESM: successful dynamic import on Node 18/20 is a false positive; emitted `dist/esm/index.js` contains CommonJS `require`/`exports` syntax.
- Pack safety: Node 22 still produces a successful dry-run package description after build failure, proving there is no safe build/test/package gate.

## Dependency audit

Fresh Node 20 direct resolutions include:

- `@napi-rs/canvas` 0.1.100
- `axios` 1.20.0
- `fs-extra` 11.4.0
- `gifencoder` 2.0.1
- `imgur` 2.5.0
- `jimp` 1.6.1
- `jszip` 3.10.1
- `sharp` 0.34.5
- TypeScript 5.9.3

`fs-extra`, `jimp`, and `jszip` still have no runtime source references found by repository-wide source search; they remain removal candidates for Phase 11, not Phase 0 deletions.

The fresh audit identifies one high-severity vulnerability:

- direct dependency: `sharp`
- affected range reported by npm audit: `<0.35.0`
- installed version: `0.34.5`
- advisory: inherited libvips vulnerabilities grouped under GHSA-f88m-g3jw-g9cj
- npm audit proposed fixed Sharp version: `0.35.4`, outside the current manifest range

On the failed Node 22 path, `npm audit` returns `ENOLOCK`, further demonstrating why a committed reproducible lockfile is required.

## Packaging baseline

Successful Node 20 package dry run:

- package: `apexify.js-5.4.5.tgz`
- packed size: 713,439 bytes
- unpacked size: 5,042,600 bytes
- entries: 1,249
- includes `dist/cjs/index.js`
- includes generated `.tsbuildinfo` files
- does not include `LICENSE`

Failed Node 22 build followed by package dry run:

- packed size: 82,878 bytes
- unpacked size: 159,873 bytes
- entries: 5
- contents: banner, changelog, hotfix note, README, package manifest
- no `dist`

The npm registry still reports immutable version `5.4.5`, and its SHA-512 integrity differs from the current-source dry-run tarball integrity. Current GitHub source must therefore never be published again as `5.4.5`.

## Current performance baseline

Final fresh benchmark execution:

- control SHA: `353d36c5fd64ee4fa15265446065b252b27f85d6`
- Node: `v20.20.2`
- Linux x64 / GitHub-hosted Ubuntu
- FFmpeg: unavailable

| Workload | Wall time | Peak RSS delta | Output | Status |
|---|---:|---:|---:|---|
| cold CJS import | 363.859 ms | n/a | n/a | pass |
| 1200x630 canvas | 29.972 ms | 2,768,896 B | 4,530 B | pass |
| text render | 34.635 ms | 4,591,616 B | 19,935 B | pass |
| single-image composition | 36.451 ms | 4,980,736 B | 5,521 B | pass |
| medium scene | 40.113 ms | 3,014,656 B | 27,338 B | pass |
| chart render | 19.484 ms | 0 B sampled delta | 16,299 B | pass |
| 30-frame GIF | 521.765 ms | 25,047,040 B | 78,693 B | pass |
| 10-second stereo audio | 97.409 ms | 1,835,008 B | 1,764,044 B | pass |
| representative video | n/a | n/a | n/a | skipped: FFmpeg unavailable |

These are comparison baselines, not performance-quality claims. RSS sampling is coarse and does not guarantee capture of all short-lived/native peaks.

## Architecture re-verification

The prior architecture map remains current because no runtime source changed. Direct re-tracing again confirms:

- `ApexPainter` is a broad façade wiring canvas/image/text/path/pixels/GIF/chart/scene/video/audio/template/assets/plugins/components/output/batch functionality;
- the constructor has no shared runtime/network/security/limits/cache/temp/FFmpeg/diagnostics configuration;
- `core/general-functions.ts` remains a mixed-responsibility module combining transport, Sharp, Canvas, filesystem, gradients, filters, color analysis and error behavior;
- `video/video-helpers.ts` remains a very large mixed video module with shell execution, source resolution, probing, conversion/edit operations and cleanup responsibilities;
- video source resolution exists both in `video-input-resolve.ts` and a private helper resolver;
- remote media acquisition remains split among `resolvable-image-source.ts`, `core/general-functions.ts`, GIF code, and video code;
- temp lifecycle remains scattered across shared `.temp-frames` paths and manual cleanup branches;
- validation remains per-domain/ad hoc rather than governed by a cross-domain limits policy;
- cache behavior remains implemented locally rather than through an authoritative bounded cache abstraction.

## High-risk finding spot-traces

Direct current-source inspection reconfirmed:

1. credential-looking Imgur fallback literals remain embedded in `output/upload-imgur.ts`; values are intentionally omitted here;
2. FFmpeg/ffprobe still use shell-string `child_process.exec` paths;
3. image HTTP acquisition has retries/timeouts on one path but no comprehensive SSRF/private-network/redirect policy and no max-byte policy;
4. other image/GIF/video helpers bypass that resolver with direct `fetch`/`axios` calls;
5. decoded image cache is an unbounded module-level `Map` without TTL/LRU/entry/byte controls;
6. canvas validation has no max-pixel policy and its positive-number checks do not reject all non-finite numeric values;
7. scene validation checks root finite dimensions, array shape and nested-surface depth but no total resource budget;
8. audio synthesis allocates `Float32Array(ceil(duration * sampleRate) * channels)` without a maximum allocation budget;
9. GIF `onStart` bypasses the normal validation branch, async iterables are fully collected, regular input frames are resolved through unbounded `Promise.all`, direct remote fetch paths exist, and attachment output is named `gif.js`;
10. video remote inputs are fully buffered before disk, duplicate resolvers disagree on extension semantics, shell strings remain, temp workspaces are shared/manual, `grid` ignores its grid configuration, and remote watermark URLs are checked with `fs.existsSync`;
11. `reflect` gradient mode maps to ordinary `repeat`;
12. exact dominant-color analysis reads/counts every pixel and returns `[]` on operational failure;
13. `removeColor`/`bgRemoval` return `undefined` on operational failure;
14. request-path synchronous filesystem operations remain in output/media/image paths;
15. README claims Node 16+ and root procedural-audio helpers despite runtime/dependency/export evidence to the contrary.

## Historical finding disposition

All 44 master-plan historical findings were rechecked against current runtime code and/or fresh clean execution.

- **Substantively rejected as false:** none.
- **Fully remediated before this re-verification:** none of the 44.
- **Literal wording now partially outdated:** historical #31 (“no broad GitHub Actions CI”) because Phase 0 itself has added a diagnostic workflow. The underlying problem remains: this is not release-grade product CI, diagnostic steps are non-gating, `main` is unprotected, and there are no required checks.
- All other historical findings remain **confirmed** or **confirmed in materially equivalent current form** with the same phase ownership recorded in `phase-0-baseline.md`.

## Newly discovered / sharpened findings in this re-verification

The original Phase 0 report already recorded N1-N14. This fresh pass adds:

- **N15 — unprotected default branch:** `main` has branch protection disabled and no required status checks. Owner: Phase 12. Priority: P1 release/control risk.
- **N16 — diagnostic workflow can look green while product checks fail:** compatibility checks intentionally use `continue-on-error`, so GitHub's run conclusion is not a release signal. Owner: Phase 12. Priority: P1; retain diagnostic behavior for Phase 0, replace/supplement with gating CI later.
- **N17 — exact direct dependency vulnerability identified:** current Sharp 0.34.5 is reported high-severity by npm audit for inherited libvips vulnerabilities; fixed release is outside the current range. Owner: Phase 1 security triage + Phase 11 dependency modernization. Priority: P0/P1 based on exploitability/processing trust boundary.
- **N18 — failed-install environments cannot produce an npm audit report without a lockfile:** Node 22 returns `ENOLOCK`. Owner: Phase 2. Priority: P0 package reproducibility.

## Phase 0 scorecard

No runtime remediation occurred, so the evidence-based engineering scores remain:

| Category | Score |
|---|---:|
| Architecture / modularity | 5.1/10 |
| Public API organization | 5.7/10 |
| TypeScript design | 6.0/10 |
| Feature completeness | 5.4/10 |
| Runtime resilience | 4.2/10 |
| Security hardening | 2.2/10 |
| Performance | 5.3/10 |
| Memory efficiency | 4.3/10 |
| Testing | 2.0/10 |
| CI / release engineering | 2.4/10 |
| Documentation breadth | 8.0/10 |
| Documentation accuracy | 5.6/10 |
| Maintainability | 4.8/10 |
| Production readiness — trusted input | 4.8/10 |
| Production readiness — untrusted server input | 1.9/10 |
| **Overall** | **4.6/10** |

## Completion gate

Phase 0 completion gates are satisfied:

- current repository/default-branch state independently re-established;
- complete master plan read;
- prior source findings reconciled with current `main` by commit comparison and direct source traces;
- package/build/release/export/dependency/test/CI configuration re-inspected;
- architecture and duplicate-infrastructure maps remain current;
- full historical finding disposition remains current;
- additional findings recorded;
- Node 16/18/20/22 clean execution matrix re-run;
- package dry-runs and registry integrity rechecked;
- direct dependency vulnerability report captured on a successful runtime;
- representative benchmark re-run;
- FFmpeg benchmark explicitly skipped because the runner has no FFmpeg binary;
- every unresolved item has a later phase owner;
- no runtime architecture remediation was started;
- no npm publication occurred;
- no documentation-site change was required because Phase 0 changes no public package behavior.

**Readiness:** Phase 0 is complete. The repository is ready to begin **Phase 1 — P0 security incident remediation and critical execution hardening**. Phase 1 should start with credential removal/rotation guidance, shell-execution elimination, temp-workspace isolation/cleanup, and triage of the newly identified Sharp/libvips advisory before broader architectural work.
