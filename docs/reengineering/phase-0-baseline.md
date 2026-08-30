# Apexify.js reengineering — Phase 0 baseline

## Status

**COMPLETE**

This document is the durable Phase 0 source of truth for the Apexify.js 9+/10 reengineering program.

The runtime/source baseline was audited at package commit:

- repository: `EIAS79/Apexify.js`
- default branch: `main`
- baseline subject SHA: `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1`
- baseline subject message: `fix: harden remote image loading in 5.4.5`
- package version: `5.4.5`

The documentation repository was inspected at:

- repository: `EIAS79/Apexify.js-Documentation`
- default branch: `main`
- SHA: `ce3e998dcf820c63299f453239e64124b036a9ce`

Phase 0 control files were added after the subject snapshot. They do not change package runtime behavior:

- `.github/workflows/phase-0-baseline.yml`
- `benchmarks/phase0-baseline.cjs`
- `benchmarks/baselines/phase0-node20-linux.json`
- this report

The benchmark run was executed from control SHA `679da1ae0210b1ed9d52bdd89db41f73f5ec46bd`; the only changes between the baseline subject and that control SHA were Phase 0 audit/control files.

No npm publication occurred.

---

## 0.1 Current-state snapshot

| Item | Baseline state |
|---|---|
| Default branch | `main` |
| Package version | `5.4.5` |
| Declared Node engine | `>=16.0.0` |
| TypeScript manifest range | `^5.6.2` |
| Fresh Node 20 TypeScript resolution | `5.9.3` because no lockfile pins the graph |
| Source root | `lib-next` |
| CJS output | `dist/cjs` |
| Nominal ESM output | `dist/esm` |
| Root runtime export | `ApexPainter` only |
| Root type export | `export type * from "./types"` |
| Build | `clean` -> `build:esm` -> `build:cjs` |
| Existing package test script | `test:remote-image` only |
| Additional checked-in smoke test | `tests/audio-synth-smoke.ts` |
| Release script | `npm run build && npm publish` |
| `prepack` gate | absent |
| Lockfile | absent |
| LICENSE file | absent although `package.json.files` lists it |
| Original GitHub Actions CI | absent before Phase 0 control workflow |
| FFmpeg on Phase 0 hosted runner | unavailable |
| Package `files` | `dist`, `types`, README/changelog/hotfix/license/banner; `types` and `LICENSE` entries are stale/missing in the baseline source tree |

### Package export boundary

`lib-next/index.ts` exports only `ApexPainter` at runtime plus public types. The README/documentation advertises root-level procedural-audio helpers that are not actually exported from the package root. This is a confirmed documentation/public-surface mismatch.

### Module-format observation

The nominal ESM compiler uses `NodeNext`, but the package has no module boundary that causes the emitted `dist/esm/index.js` to be ESM. The inspected emitted file begins with CommonJS machinery (`"use strict"`, `exports`, `require`). A dynamic `import()` smoke check succeeds on Node 18/20 because Node can import CommonJS, not because the `import` condition points to true ESM.

---

## 0.2 Repository architecture map

### Public façade and orchestration

| Domain | Primary responsibility | Key files / observations | Later owner |
|---|---|---|---|
| `apex-painter` | public façade, creator/facet wiring | `main.ts`, `facets.ts`, `creates/*`; constructor has output-format config only | Phase 3 / 11 |
| `render` | renderer façade / render contracts | small forwarding modules | Phase 5 |
| `scene` | declarative scene rendering and validation | current validation is dimension + nesting-depth centric | Phase 4 / 6 |
| `template` | templates/resolution | non-trivial resolver; requires behavior/immutability tests | Phase 6 |
| `assets` | named/palette asset references | separate resolver path | Phase 6 |
| `components` | higher-level reusable scene components | avatar/badge/card/progress/watermark | Phase 6 |
| `plugins` | plugin registration/lifecycle | async install is fired-and-forgotten by `ApexPainter.use()` | Phase 6 |

### Raster/text/graphics

| Domain | Primary responsibility | Key files / observations | Later owner |
|---|---|---|---|
| `canvas` | canvas/background creation | video-background temp fallback uses sync FS/manual temp path | Phase 4 / 5 |
| `image` | image creation, effects, masks, source loading | several source/decode paths; decoded image cache is unbounded | Phase 3 / 5 |
| `text` | text drawing/layout/styles | large option surface; runtime validation incomplete | Phase 4 / 10 |
| `chart` | chart rendering | multiple very large implementation files | Phase 10 / 11 |
| `path` / `foundation` | Path2D/custom path commands | separate command utilities | Phase 10 |
| `pixels` | pixel manipulation/hit detection | native full-buffer operations; validation/tests limited | Phase 10 |

### Media/output

| Domain | Primary responsibility | Key files / observations | Later owner |
|---|---|---|---|
| `gif` | GIF generation | full collection of async frames, broad `Promise.all`, output-validation bypass route | Phase 7 |
| `video` | FFmpeg operations/pipeline | shell command construction, duplicate source resolvers, unsafe temp patterns, giant helper file | Phase 1 / 8 |
| `audio-synth` | procedural synthesis/WAV/compose | allocation is derived from unbounded duration/sample settings | Phase 4 / 9 |
| `output` | encodings/save/upload/compression/stitch | Imgur credential fallback, sync FS, external-service coupling | Phase 1 / 10 |
| `batch` | batch/chain orchestration | concurrency/failure/resource contract needs formalization | Phase 10 |

### Shared/core/types

| Domain | Primary responsibility | Key files / observations | Later owner |
|---|---|---|---|
| `core` | mixed shared helpers | `general-functions.ts` mixes transport, Sharp, Canvas, filesystem, filters, color analysis, errors; `cache.ts`/`logger.ts` are tiny placeholders rather than authoritative infrastructure | Phase 3 / 11 |
| `types` | broad public declarations | strong breadth but several `any`/loose option structures remain | Phase 4 / 11 |
| `ambient` | ambient declarations | package/tooling support | Phase 2 / 11 |
| `version` | version metadata | must remain aligned with semantic release work | Phase 2 |

### Large-file hotspots

Approximate source sizes at the baseline subject:

| File | Size | Risk |
|---|---:|---|
| `lib-next/video/video-helpers.ts` | 92.8 KB | major god-module / security / cleanup / duplication risk |
| `lib-next/chart/impl/linechart.ts` | 89.1 KB | high complexity |
| `lib-next/chart/impl/barchart.ts` | 71.9 KB | high complexity |
| `lib-next/chart/impl/horizontalbarchart.ts` | 60.4 KB | high complexity |
| `lib-next/chart/impl/combochart.ts` | 58.8 KB | high complexity |
| `lib-next/image/image-creator.ts` | 34.7 KB | broad responsibility |
| `lib-next/video/video-creator.ts` | 33.9 KB | broad routing/operation responsibility |
| `lib-next/core/general-functions.ts` | 26.0 KB | unrelated cross-cutting concerns mixed together |

High-fan/shared areas observed qualitatively are the `types` barrel, `ApexPainter` façade, image source/decode helpers, and `core/general-functions.ts`. Exact dependency-graph metrics are deferred until the architecture is remodeled; Phase 0 records the current dependency direction and duplication rather than introducing a graph-analysis dependency.

---

## 0.3 Duplicate infrastructure audit

| Concern | Current implementations / bypasses | Baseline disposition |
|---|---|---|
| HTTP fetching | `image/resolvable-image-source.ts`, direct fetch/axios in `core/general-functions.ts`, GIF loaders, video input resolver/helpers | duplicated; no authoritative policy |
| URL recognition | repeated `http://` / `https://` checks and regexes across image/GIF/video/core | duplicated |
| Image source resolution | `resolvable-image-source.ts`, `sharpFromResolvableInput`, direct `loadImage` paths, GIF frame resolution | duplicated |
| Video source resolution | `video/video-input-resolve.ts` plus private resolver in `video-helpers.ts` | duplicated |
| Temp creation | shared `.temp-frames`, timestamp names, ad-hoc operation files | duplicated/unsafe |
| Cleanup | manual success/catch cleanup scattered through video/canvas operations | not centralized; not consistently `finally` |
| FFmpeg execution | `video/ffmpeg-session.ts`, `video-creator.ts`, `video-helpers.ts` | shell-string execution in several modules |
| ffprobe execution | video helper/session command strings | shell-string execution |
| Error wrapping | generic `Error`, `RemoteImageFetchError`, helper string wrapping, `console.error` fallbacks | inconsistent |
| Path normalization | repeated `path.join(process.cwd(), ...)`, `path.resolve`, URL/path branching | duplicated |
| Image decoding | Sharp plus `@napi-rs/canvas.loadImage` through multiple paths | duplicated semantics |
| Validation | domain-local ad-hoc checks | incomplete and non-uniform |
| Cache | module-level decoded-image `Map`; placeholder `core/cache.ts` | unbounded / architecture mismatch |
| Output conversion | Sharp conversion in multiple image/output/core modules | overlapping implementations |

Phase 3 is the owner for authoritative runtime/media/cache/error infrastructure. Phase 1 owns immediate process/temp/secret hazards.

---

## 0.4 Feature-completeness matrix

Status definitions follow the master plan: **fully supported**, **partial**, **misleading**, **deprecated**, **undocumented**, or **documented-not-exported**. A status of partial does not mean the main happy path is absent; it means the advertised feature lacks one or more required elements such as complete semantics, runtime validation, bounded resource behavior, error guarantees, tests, or documentation accuracy.

| Public area | Public surface / option families audited | Status | Evidence / gap | Later owner |
|---|---|---|---|---|
| Package root | `ApexPainter`, types | partial | runtime root is much smaller than README claims | Phase 2 / 13 |
| Root audio helpers | README claims helpers such as synthesis/sequence/compose helpers | **documented-not-exported** | no corresponding root runtime exports | Phase 2 / 13 |
| `ApexPainter` construction | output format | partial | no shared runtime/network/limits/cache/ffmpeg/temp/diagnostics config | Phase 3 |
| Canvas | dimensions, backgrounds, patterns/noise/video background | partial | no max dimension/pixel budget; temp fallback/sync I/O; finite checks incomplete | Phase 4 / 5 |
| Image creation | raster/source/shapes/effects/masks/fit/crop/opacity/rotation | partial | duplicated loaders, inconsistent validation, no decoded-pixel budget | Phase 4 / 5 |
| Image utility facet | stitch/collage/compress/palette/resize/convert/effects/color analysis/remove color/background removal/blend/crop/mask/gradient | partial | generic/inconsistent errors; underlying helpers can return `[]`/`undefined`; direct fetches/sync I/O remain | Phase 3 / 5 / 10 |
| Text | layout/wrap/font/fill/stroke/gradient/shadow/decorations/path/curve families | partial | broad implementation but incomplete runtime bounds/numeric validation and no comprehensive golden suite | Phase 4 / 10 |
| Scenes | `renderScene`, validation, GIF/video frame scene helpers, nested surfaces | partial | validation only covers root finite/min dimensions, layer-array shape, and nesting depth; no total resource budget | Phase 4 / 6 |
| Templates | create/render/placeholder/default/override/layout/asset behavior | partial | substantial implementation but not comprehensively verified; magic/ref semantics need explicit contract | Phase 6 |
| Assets | named assets and palette references | partial | implemented but edge semantics/cycles/escaping need formal tests | Phase 6 |
| Components | avatar/badge/card/progress/watermark | partial | implementations exist; full behavior/golden/documentation coverage absent | Phase 6 |
| Plugins | registration/install and named lookup | **partial** | `use()` discards possible async install promise and marks name installed immediately | Phase 6 |
| Charts | bar/horizontal bar/line/pie/scatter/radar/polar/combo/comparison families and layout options | partial | broad implementations exist; validation/golden/extreme/empty-range coverage is not comprehensive | Phase 10 / 12 |
| GIF | frames, generated frames, `AsyncIterable`, delay/repeat/quality/transparency/disposal/watermark/text, file/base64/buffer/attachment, hooks | **partial/misleading** | async iterable is collected; regular frames use unbounded `Promise.all`; `onStart` can bypass validation; attachment is named `.js`; no frame/resource budgets | Phase 7 |
| Video | metadata, frames, thumbnail, convert, trim, audio, watermark, speed, preview, effects, merge, replace, rotate/crop/compress, text, fades/reverse/loop, batch, scenes/stabilize/color, PIP/split/time-lapse/audio controls, frames-to-video, format/freeze/preset/LUT/transition/overlays | **partial** | most branches route to implementations but all inherit unsafe process/temp/source infrastructure and weak validation | Phase 1 / 8 |
| Video merge `grid` | `merge.mode = "grid"`, grid rows/columns | **misleading** | grid options are ignored and the branch performs the same two-input horizontal stack as side-by-side | Phase 8 |
| Video remote watermark | URL-like watermark path | **misleading/inconsistent** | URL bypasses path joining but is then checked with `fs.existsSync`, so remote watermark cannot work as implied by generalized media behavior | Phase 8 |
| Procedural audio | synth, preset, sequence, mix, compose, save/list presets | partial | substantial DSP exists and benchmark workload runs, but allocation is unbounded and checked-in smoke test does not compile against CJS output declarations | Phase 4 / 9 / 12 |
| Batch/chain | batch operations and chain orchestration | partial | resource/concurrency/failure/abort semantics not comprehensively governed or tested | Phase 10 |
| Path2D | create/draw/custom | partial | implementation exists; runtime finite-command validation and tests need completion | Phase 10 |
| Pixels | get/set/manipulate/getColor/setColor | partial | implementation exists; boundary/resource/copy behavior requires validation/perf tests | Phase 10 |
| Hit detection | path/region/anyRegion/distance | partial | implementation exists; boundary semantics need explicit tests | Phase 10 |
| Output encodings | data URL/base64/blob/array buffer | broadly implemented | package-level tests still absent | Phase 10 / 12 |
| Save/saveMultiple | filesystem output, conversion/naming | partial | synchronous request-path FS; error semantics; no clean package fixtures | Phase 10 / 12 |
| Imgur URL output | external upload | **unsafe partial** | embedded credential-looking fallbacks remain; values intentionally not reproduced here | Phase 1 / 10 |

### Specific no-op / misleading branches confirmed

1. Video `grid` merge ignores the public grid configuration and performs a horizontal two-input stack.
2. GIF `AsyncIterable` is not streamed incrementally despite the source type suggesting streaming capability.
3. GIF attachment output uses a `.js` filename.
4. Root-level audio helper claims do not match root runtime exports.
5. Nominal ESM files are CommonJS syntax despite the `import` export condition.
6. Remote watermark handling is inconsistent with URL-like media source support.
7. `reflect` gradient repetition maps to ordinary `repeat` rather than a reflected pattern.

---

## 0.5 Direct dependency usage matrix

Because the package has no lockfile, ranges float. The Node 20 Phase 0 run resolved the versions below; Node 16 notably resolved `imgur` differently, proving graph non-reproducibility.

### Runtime dependencies

| Dependency | Manifest range | Node 20 resolution | Source usage | Platform/size implications | Baseline decision |
|---|---:|---:|---|---|---|
| `@napi-rs/canvas` | `^0.1.80` | `0.1.100` | core raster/canvas/image/text/chart rendering | native binaries; central runtime dependency | keep candidate; architecture-critical |
| `axios` | `^1.15.0` | `1.20.0` | remote image/GIF/video/general utility fetching | network dependency; duplicated transport behavior | keep/reassess after Phase 3 central fetch layer |
| `fs-extra` | `^11.3.1` | `11.4.0` | no source references found in repository-wide audit search | extra transitive/package surface | candidate unused; final proof/removal Phase 11 |
| `gifencoder` | `^2.0.1` | `2.0.1` | GIF encoding | old package; dependency chain brings legacy `canvas@2.11.2`, blocking clean Node 22 install on hosted Linux | replacement/removal decision Phase 7/11 |
| `imgur` | `^2.5.0` | `2.5.0` on Node 18/20; `2.6.1` observed on Node 16 | output URL upload integration | external service + credential/security concerns; engine drift | retain only if service feature remains justified; Phase 1/10/11 |
| `jimp` | `^1.6.0` | `1.6.1` | no source references found in repository-wide audit search | large image stack overlap; Node >=18 engine | strong unused/redundant candidate; Phase 11 |
| `jszip` | `^3.10.1` | `3.10.1` | no source references found in repository-wide audit search | extra dependency/package surface | candidate unused; Phase 11 |
| `sharp` | `^0.34.4` | `0.34.5` | image utilities, compression/conversion/metadata and raster pipelines | native binaries; current release requires newer Node than package claims | keep candidate; important native accelerator; Phase 2/5/11 |

### Development dependencies

| Dependency | Manifest range | Node 20 resolution | Usage | Baseline decision |
|---|---:|---:|---|---|
| `@types/gifencoder` | `^2.0.3` | `2.0.3` | GIFEncoder typings | tied to encoder decision |
| `@types/node` | `^22.5.4` | `22.20.1` | Node typings | keep, pin via lockfile/toolchain |
| `ts-node` | `^10.9.2` | `10.9.2` | smoke tests | current test arrangement is fragile; test runner reconsidered Phase 12 |
| `typescript` | `^5.6.2` | `5.9.3` | compiler | lock/pin reproducibly in Phase 2 |

### Build-tool anomaly

`rimraf` is invoked by `npm run clean` but is not a direct dev dependency. Successful installs happen to expose it transitively; an incomplete/failing install makes the build immediately fail with `rimraf: not found`. This is not a defensible toolchain dependency declaration.

### Dependency-health observations

- Fresh Node 16/20 installs reported **1 high-severity npm audit finding**. Phase 11 must identify the exact path and remove/upgrade it; Phase 1/2 should escalate sooner if it is directly exploitable.
- Node 16 emitted numerous engine warnings: current Sharp requires Node >=18.17 / >=20.3 / >=21, Jimp requires >=18, and other resolved transitive packages require newer runtimes. The package's `>=16` claim is false in practice.
- Node 22 clean install failed while installing legacy `canvas@2.11.2`; no Node 22 prebuilt binary was available and the runner lacked native Cairo/Pixman build dependencies. This legacy canvas arrives through the current dependency graph and must not be confused with Apexify's direct `@napi-rs/canvas` backend.

---

## 0.6 Baseline benchmarks

Environment:

- GitHub hosted Ubuntu 24.04, Linux x64
- Node `v20.20.2`
- benchmark artifact generated `2026-08-30T00:04:24.917Z`
- FFmpeg/ffprobe not installed on the hosted runner

| Workload | Wall time | Peak RSS delta | Output | Status |
|---|---:|---:|---:|---|
| cold CommonJS import | 361.807 ms | n/a | n/a | pass |
| 1200×630 canvas | 26.981 ms | 2,695,168 B (~2.57 MiB) | 4,530 B | pass |
| text rendering | 34.065 ms | 4,214,784 B (~4.02 MiB) | 19,935 B | pass |
| single image composition | 34.305 ms | 4,890,624 B (~4.66 MiB) | 5,521 B | pass |
| medium scene | 34.157 ms | 3,014,656 B (~2.88 MiB) | 27,338 B | pass |
| bar chart | 18.402 ms | 0 B sampled delta | 16,299 B | pass |
| 30-frame GIF | 546.915 ms | 23,769,088 B (~22.67 MiB) | 78,693 B | pass |
| 10-second stereo synthesis | 109.795 ms | 1,572,864 B (~1.50 MiB) | 1,764,044 B | pass |
| representative video from frames | n/a | n/a | n/a | skipped: FFmpeg unavailable |

The JSON baseline is committed at `benchmarks/baselines/phase0-node20-linux.json`; `benchmarks/phase0-baseline.cjs` is the repeatable harness.

These numbers are a comparison baseline, not a performance endorsement. RSS sampling is process-level and coarse; native allocations and short peaks may be under-sampled. Later performance phases must run the same workload and supplement it with domain-specific benchmarks.

---

## 0.7 Baseline install/build/test/package report

The Phase 0 workflow deliberately records each step outcome independently so a failure does not prevent later diagnostic steps.

| Node | Install | Build | remote-image smoke | audio smoke | CJS import | nominal ESM import | `npm pack --dry-run` |
|---:|---|---|---|---|---|---|---|
| 16.20.2 | pass with many engine warnings | pass | **fail** | **fail** | **fail** | **fail** | pass |
| 18 | pass | pass | **fail** | **fail** | pass | pass | pass |
| 20.20.2 | pass | pass | **fail** | **fail** | pass | pass | pass |
| 22.23.2 | **fail** | downstream fail | downstream fail | downstream fail | downstream fail | downstream fail | command succeeds but only packages non-built top-level files |

### Failure causes traced

1. **Node 16 runtime is unsupported despite `engines >=16`.** Sharp refuses to load and explicitly requires a newer Node range. CJS and nominal-ESM imports therefore fail at runtime.
2. **Node 22 clean installation is not reproducible.** `canvas@2.11.2` has no matching Node 22 prebuilt binary in the tested environment; fallback native compilation fails because Pixman/Cairo build prerequisites are not present.
3. **Remote-image smoke test fails on Node 20 under the floating current dependency graph.** Sharp reports a `libspng read error` while decoding the checked-in tiny PNG fixture after the retry/cache sequence. This test had historically passed against an older dependency graph, so the failure is direct evidence that the absent lockfile makes the baseline unstable.
4. **Audio smoke test does not compile.** It imports `../dist/cjs`, but the CJS build emits no declarations there; strict TypeScript reports TS7016. This is a test/package-layout defect, not proof that the underlying audio benchmark path is broken—the 10-second audio benchmark executes successfully through the CJS runtime.
5. **Nominal ESM is not ESM.** On successful Node 18/20 builds, `dist/esm/index.js` contains CommonJS `exports`/`require`. Dynamic import passing is therefore a false positive for true dual-module packaging.
6. **`npm pack --dry-run` can succeed after a failed build.** On the Node 22 run it produced an 82,878-byte tarball description with only five top-level files and no `dist`. This demonstrates the missing release/prepack safety gate.

### Packed package observations from successful Node 18/20 build

- 1,249 files
- about 713 KB packed
- about 5.04 MB unpacked
- both `dist/cjs/index.js` and `dist/esm/index.js` are present
- no `LICENSE` is present despite package metadata listing it
- stale top-level `types/` entry contributes no files
- tests, `.github`, `benchmarks`, and `lib-next` are excluded by the current `files` allowlist

### Published npm `5.4.5` divergence

The npm registry still reports version `5.4.5`. Its immutable published SHA-512 integrity differs from the tarball produced from current GitHub source at the same `5.4.5` version. Therefore historical finding #33 is **confirmed**: current GitHub `5.4.5` source is not the same artifact as already-published npm `5.4.5`. Phase 2 must choose a new semantic version before any future publication.

---

## Re-validation of the 44 historical findings

Legend: **Confirmed** = still present in the baseline; **Partially confirmed** = shape changed but material issue remains; **Remediated** = no longer present; **Needs later proof** = Phase 0 found evidence but final decision needs phase-specific tooling/behavior tests.

| # | Finding | Phase 0 disposition | Owner |
|---:|---|---|---|
| 1 | embedded credential/token-looking Imgur fallbacks | **Confirmed**; secret values deliberately omitted | Phase 1 |
| 2 | FFmpeg/ffprobe shell-string `exec` | **Confirmed** in session/creator/helpers | Phase 1 |
| 3 | remote HTTP(S) lacks comprehensive SSRF policy | **Confirmed** | Phase 3 |
| 4 | remote byte limits inconsistent/absent | **Confirmed** | Phase 3/4 |
| 5 | media acquisition duplicated | **Confirmed** | Phase 3 |
| 6 | decoded image cache lacks TTL/LRU/size bound | **Confirmed** | Phase 3/5 |
| 7 | canvas dimensions only weakly bounded | **Confirmed**; no max dimension/pixel budget | Phase 4 |
| 8 | scene lacks resource budgets | **Confirmed**; current validator mainly covers dimensions/depth | Phase 4/6 |
| 9 | numeric runtime validation inconsistent | **Confirmed** | Phase 4 |
| 10 | procedural audio can allocate from unbounded configuration | **Confirmed** | Phase 4/9 |
| 11 | GIF async iterable collected fully | **Confirmed** | Phase 7 |
| 12 | GIF broad `Promise.all` concurrency | **Confirmed** | Phase 7 |
| 13 | GIF `onStart` validation bypass | **Confirmed** | Phase 7 |
| 14 | GIF attachment `.js` name | **Confirmed** | Phase 7 |
| 15 | remote video fully buffered before disk | **Confirmed** | Phase 3/8 |
| 16 | multiple video source resolvers | **Confirmed** | Phase 3/8 |
| 17 | shared/manual video temp lifecycle | **Confirmed** | Phase 1/8 |
| 18 | video grid is not a real grid | **Confirmed**; options ignored, hstack used | Phase 8 |
| 19 | remote watermark handling inconsistent | **Confirmed** | Phase 8 |
| 20 | image utilities return `[]`/`undefined` on operational failure | **Confirmed** in underlying `detectColors`, `removeColor`, `bgRemoval`; façade wrappers do not repair the semantic ambiguity | Phase 3/10 |
| 21 | reflect gradient behaves as repeat | **Confirmed**; code maps both modes to `repeat` | Phase 5 |
| 22 | `||` defaults where zero is valid | **Confirmed** in gradient coordinates/GIF overlays and other branches | Phase 4/5/7 |
| 23 | exact-pixel dominant-color analysis is expensive | **Confirmed**; full `getImageData` loop counts exact RGB keys | Phase 5 |
| 24 | `engines >=16` is false for current graph | **Confirmed by Node 16 runtime failure/engine warnings** | Phase 2 |
| 25 | nominal ESM may actually be CJS | **Confirmed by emitted syntax** | Phase 2 |
| 26 | README/runtime exports mismatch | **Confirmed** for root audio helpers | Phase 2/13 |
| 27 | no guaranteed prepack build/test gate | **Confirmed** | Phase 2 |
| 28 | `rimraf` script without direct dev dependency | **Confirmed** | Phase 2 |
| 29 | metadata references missing LICENSE | **Confirmed** | Phase 2 |
| 30 | package `files` has stale entries | **Confirmed** (`types`, missing license) | Phase 2/11 |
| 31 | no broad GitHub Actions CI | **Confirmed for baseline subject**; Phase 0 adds diagnostic workflow only, not final CI | Phase 12 |
| 32 | test coverage tiny | **Confirmed** | Phase 12 |
| 33 | GitHub `5.4.5` diverged from published immutable `5.4.5` | **Confirmed by differing package integrity** | Phase 2 |
| 34 | no committed lockfile | **Confirmed** | Phase 2 |
| 35 | `video-helpers.ts` giant/mixed | **Confirmed**, ~92.8 KB | Phase 8/11 |
| 36 | request-path sync filesystem use | **Confirmed** across canvas/video/output/core | Phase 1/3/5/8/10 |
| 37 | inconsistent error types/semantics | **Confirmed** | Phase 3 |
| 38 | signed remote URLs can leak through errors/logs | **Confirmed**; source URL is retained/interpolated in remote errors | Phase 3 |
| 39 | image decompression/pixel limits insufficient | **Confirmed** | Phase 4/5 |
| 40 | network concurrency not consistently bounded | **Confirmed** | Phase 3/7/10 |
| 41 | excessive keywords | **Confirmed** | Phase 11 |
| 42 | dependencies may be unused/redundant | **Confirmed as cleanup candidates**; `fs-extra`, `jimp`, `jszip` have no source refs found in Phase 0 search | Phase 11 |
| 43 | docs/examples not comprehensively executable | **Confirmed**; no docs/example compile system and root-export mismatch exists | Phase 12/13 |
| 44 | no shared runtime/security configuration | **Confirmed**; painter config is not a cross-domain runtime policy | Phase 3 |

No historical finding was accepted merely because it appeared in the master plan; each entry above was rechecked against the current source/build/package behavior.

---

## Newly discovered Phase 0 findings

| ID | Finding | Risk / reason | Priority / owner |
|---|---|---|---|
| N1 | `ApexPainter.use()` fires a possibly async `plugin.install()` with `void` and immediately records the plugin as installed | failed async installs can leave false installed state and unhandled rejection behavior | P1 / Phase 6 |
| N2 | no lockfile materially changes the graph across runtime/npm combinations | Node 16 resolved a different `imgur` release; current TS/Sharp/Axios float beyond manifest-era versions | P0 package reliability / Phase 2 |
| N3 | Node 22 clean install breaks on legacy `canvas@2.11.2` in current dependency graph | blocks modern runtime reproducibility and benchmarks | P0/P1 / Phase 2 + Phase 7/11 |
| N4 | existing remote-image regression fixture now fails under the floating Sharp graph | dependency drift can silently invalidate hotfix coverage | P0/P1 / Phase 2 + Phase 12 |
| N5 | existing audio smoke test is structurally incompatible with the declaration layout | checked-in test is not executable as intended | P1 / Phase 2 + Phase 12 |
| N6 | successful `npm pack --dry-run` does not imply a built artifact | Node 22 produced a five-file package after build failure | P0 / Phase 2 |
| N7 | current nominal ESM smoke can falsely pass while loading CommonJS | test must verify actual emitted semantics/package fixture, not merely dynamic import compatibility | P0 / Phase 2/12 |
| N8 | canvas video-background fallback temp cleanup is not guarded by one authoritative workspace/finally lifecycle | exception paths can leak temp files; timestamp paths can collide | P0 / Phase 1 |
| N9 | video input resolver assigns generic `.mp4` temp paths while another resolver separately infers extensions | duplicate resolvers have divergent correctness semantics | P1 / Phase 8 |
| N10 | `core/cache.ts`/`logger.ts` are effectively placeholders while real cache/logging behavior lives elsewhere | intended shared architecture and actual implementation disagree | P1 / Phase 3/11 |
| N11 | `console.error`/`console.warn` are used inside library execution paths | diagnostics are not caller-controlled and can expose data/noise server logs | P1 / Phase 3 |
| N12 | direct image helper `sharpFromResolvableInput` performs its own arbitrary fetch, independent of the newer image resolver | the recent remote-image hardening is bypassable by another public utility route | **P0 security** / Phase 3, with Phase 1 review |
| N13 | fresh installs report a high-severity npm audit finding | dependency security debt must be identified and resolved, not hidden by successful build | P0/P1 / Phase 1/11 |
| N14 | package tarball is large and source maps dominate a significant portion of 1,249 packed files | package-surface/performance cleanup opportunity; needs deliberate policy rather than arbitrary deletion | P2 / Phase 2/11 |

---

## Backlog ownership and priority control

### P0 — immediate safety/release correctness

- **Phase 1:** embedded Imgur credential fallbacks; all shell-based FFmpeg/ffprobe execution; filter/text/path escaping; isolated temp workspaces; cleanup regression tests.
- **Phase 2:** truthful Node baseline; reproducible lockfile/install; real ESM/CJS; root exports; prepack/release safety; LICENSE/files; semantic version divergence; direct build-tool declarations.

### P1 — cross-cutting runtime and resource safety

- **Phase 3:** centralized runtime config, media/network/SSRF policy, bounded cache, source resolvers, errors, diagnostics.
- **Phase 4:** uniform runtime validation and `RenderLimits` across all resource-heavy APIs.
- **Phase 5:** raster correctness/performance, decompression limits, defaulting/gradient/color-analysis fixes.
- **Phase 6:** scene/template/assets/components/plugin lifecycle.
- **Phase 7:** actual GIF streaming, bounded concurrency, output correctness.
- **Phase 8:** video module decomposition, one source resolver, secure process/workspace, complete grid/watermark/etc.
- **Phase 9:** bounded audio/DSP hardening.

### P2 — breadth, cleanup, and proof

- **Phase 10:** text/charts/path/pixels/batch/output utility completion.
- **Phase 11:** dependency/dead-code/API/package surface cleanup.
- **Phase 12:** comprehensive unit/integration/golden/security/fuzz/package CI and controlled FFmpeg environment.
- **Phase 13:** executable docs and documentation-repository synchronization.
- **Phase 14:** clean-room final audit and release-candidate proof.

Every confirmed/new finding above has a named later owner; none is intentionally left ownerless.

---

## Initial engineering scorecard

These are baseline engineering scores, not target claims. They intentionally remain low where evidence is weak or critical hazards exist.

| Category | Baseline score | Evidence |
|---|---:|---|
| Architecture / modularity | 5.1/10 | broad domain separation exists, but duplicated cross-cutting infrastructure and giant mixed modules remain |
| Public API organization | 5.7/10 | strong façade breadth, but root docs/exports mismatch and misleading/no-op branches exist |
| TypeScript design | 6.0/10 | strict compiler config and extensive types, but loose/`any` structures, declaration-layout/test issues, and nominal ESM confusion |
| Feature completeness | 5.4/10 | large implementation surface, but grid/streaming/reflect/export/lifecycle defects prevent a mature score |
| Runtime resilience | 4.2/10 | inconsistent errors, manual cleanup, sync I/O, brittle dependency/runtime behavior |
| Security hardening | 2.2/10 | embedded credential fallbacks, shell commands, SSRF gaps, URL leakage, weak limits |
| Performance | 5.3/10 | representative baseline is now measured, but excessive buffering/pixel loops/transcodes/sync I/O remain |
| Memory efficiency | 4.3/10 | unbounded decoded cache, GIF collection, full video downloads, unbounded audio allocation |
| Testing | 2.0/10 | two checked-in smoke suites fail in baseline; no broad unit/integration/golden/security/package suite |
| CI / release engineering | 2.4/10 | Phase 0 adds measurement workflow, but baseline product had no CI, no lockfile/prepack, false Node/ESM claims |
| Documentation breadth | 8.0/10 | documentation repository covers many domains and use cases |
| Documentation accuracy | 5.6/10 | root helper mismatch and no executable-doc verification |
| Maintainability | 4.8/10 | large god/helper/chart files, placeholders, dead-dependency candidates, duplicated utilities |
| Production readiness: trusted use | 4.8/10 | many happy paths work and benchmark, but package/runtime/test reliability is not sufficient |
| Production readiness: untrusted server input | 1.9/10 | SSRF/process/secret/resource-limit boundaries are not defensible |
| **Overall** | **4.6/10** | substantial feature value, but security, reproducibility, tests, memory governance, and package correctness dominate the baseline |

The scorecard is expected to improve only when later phases produce concrete evidence. Phase 0 itself does not claim runtime quality improvements.

---

## Phase 0 completion-gate check

- [x] current default branch and subject SHA recorded
- [x] package/toolchain/exports/dependencies/scripts/release/files/CI snapshot recorded
- [x] architecture/domain map recorded
- [x] large-file hotspots identified
- [x] duplicate cross-cutting infrastructure mapped
- [x] public feature/option-family completeness matrix created
- [x] every direct runtime/dev dependency classified with current evidence
- [x] reproducible representative benchmark harness committed
- [x] wall-time/RSS baseline recorded for required non-video workloads
- [x] video benchmark attempted conditionally and explicitly skipped because FFmpeg is unavailable on the runner
- [x] install/build/smoke/import/package matrix executed across Node 16/18/20/22
- [x] current emitted nominal ESM syntax inspected
- [x] `npm pack --dry-run` contents inspected
- [x] npm registry version/integrity compared with current source-generated package
- [x] all 44 historical audit findings revalidated rather than assumed
- [x] newly discovered findings added to live backlog
- [x] every known finding has priority/phase ownership
- [x] initial engineering scorecard recorded
- [x] no npm publication performed
- [x] no documentation-site synchronization required because Phase 0 changed no public package behavior

Phase 0 is therefore complete. The next permitted implementation phase is **Phase 1 — P0 security incident remediation and critical execution hardening**.
