# Phase 14 — Final whole-repository audit and release-candidate proof

## Status

**RELEASE-CANDIDATE VERIFICATION IN PROGRESS**

This report is the Phase 14 evidence record for the original Phase 0–14 reengineering program. Code-level findings below are closed in the Phase 14 branch, but this document does **not** declare the program complete until the final supported-runtime CI, package artifact audit, dependency audit, benchmark comparison, merge, and post-merge verification have all passed on the locked final SHA.

Phase 13 package control point: `d19ccd31ec9f9ccabc4ebd5eaa51ff038f0343a5`.

Phase 0 benchmark control point: `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1`.

Release candidate version: `6.0.0`.

Supported Node line: `22.x || 24.x || 26.x`.

## Independent Phase 14 audit

Phase 14 re-runs the original audit instead of assuming previous phases were sufficient. The permanent gate is `scripts/phase14-final-audit.cjs`, enforced by both `test:ci` and `verify:release`.

The gate fails on:

- shell/process execution bypasses;
- direct arbitrary network clients outside the central media transport;
- synchronous filesystem APIs in runtime source;
- generic `Error` throws in runtime source;
- unfinished source markers;
- avoidable explicit `any`;
- package/export/license/release invariants.

It also enumerates every runtime `Map`, `Promise.all`, and large source file for manual classification. Those constructs are not automatically failures because bounded worker pools, finite per-call maps, and cohesive domain implementations can be valid; each occurrence must be justified or corrected.

## New findings discovered by Phase 14

The final audit found additional defects that earlier phase completion did not expose:

1. Video output overwrite checking still used synchronous `existsSync()` on a request path.
2. Native font registrations could grow process-wide without a finite admission bound.
3. `AssetManager` retained user-controlled registry entries without an explicit collection budget; nested values/palettes and image-buffer registration also needed direct admission checks.
4. Runtime source still contained 72 generic `throw new Error(...)` sites despite the structured error hierarchy.
5. `PluginHost` API registrations, installed/pending plugin names, and transactional rollback journal could grow without a finite collection budget.
6. Concurrent decoded-image in-flight promise entries could grow with unique sources even though the completed-image cache itself was bounded.
7. Template flex/grid children were not collection-limited and measured all children with one `Promise.all`, allowing user-controlled asynchronous fan-out.

All seven have code-level corrections and permanent regression coverage where they represent externally reachable resource/error contracts. Final CI remains the acceptance authority.

## Original 44-finding closure matrix

| # | Original finding | Code-level closure | Primary evidence / control |
|---:|---|---|---|
| 1 | Credential/token-looking Imgur fallback values | CLOSED | Embedded credential fallback removed; explicit configuration and secret scanning enforced. |
| 2 | FFmpeg/ffprobe shell-string execution | CLOSED | Central argv process runner uses non-shell execution; shell-metacharacter security tests are permanent. |
| 3 | Arbitrary HTTP(S) SSRF gaps | CLOSED | Central network policy validates protocol, hostname/IP, DNS and redirects; private/reserved targets blocked by default. |
| 4 | Remote maximum bytes inconsistent | CLOSED | Central remote byte limits and streaming/file transport checks enforce resource budgets. |
| 5 | Duplicated remote media acquisition | CLOSED | Image/GIF/video/general media paths route through shared source/remote-fetch infrastructure. |
| 6 | Decoded image cache unbounded | CLOSED | Bounded TTL/LRU byte/entry cache; failed/in-flight entries are removed; Phase 14 also bounds concurrent in-flight unique decodes. |
| 7 | Canvas dimensions positive but unbounded | CLOSED | Runtime dimension and total-pixel limits reject before large allocations. |
| 8 | Scene resource budgets incomplete | CLOSED | Scene depth/layer/surface/image/text/chart/pixel budgets are centrally validated. |
| 9 | Numeric runtime validation inconsistent | CLOSED | Shared validation primitives and domain semantic validators reject non-finite/out-of-range values. |
| 10 | Procedural audio allocation unbounded | CLOSED | Duration/sample-rate/channel/event/layer/partial/byte estimates are governed before allocation. |
| 11 | GIF `AsyncIterable` fully collected | CLOSED | Generated GIF frames are consumed incrementally and released before requesting the next frame. |
| 12 | GIF broad `Promise.all` | CLOSED | Ordered prefetch/resolution uses bounded concurrency tied to runtime limits. |
| 13 | GIF `onStart` bypassed validation | CLOSED | Common/output/overlay validation occurs before producer execution. |
| 14 | GIF attachment used `.js` | CLOSED | Attachment output uses GIF filename/MIME semantics and signature validation. |
| 15 | Remote video fully buffered before disk | CLOSED | Remote video acquisition supports bounded file streaming through central transport. |
| 16 | Multiple video source resolvers | CLOSED | Video source resolution is centralized and shared by operations/pipeline paths. |
| 17 | Shared/manual temp video files | CLOSED | Per-operation isolated workspaces with confinement and `finally` cleanup. |
| 18 | Video grid behaved as horizontal stack | CLOSED | Grid operation received complete grid semantics and validation in the Phase 8 rearchitecture. |
| 19 | Remote watermark filesystem inconsistency | CLOSED | Watermark/source resolution follows shared media semantics rather than ad-hoc filesystem detection. |
| 20 | Image utilities returned `[]`/`undefined` on operational failures | CLOSED | Operational failures use the structured error hierarchy instead of silent sentinel failure. |
| 21 | Reflect gradient implemented as ordinary repeat | CLOSED | Raster gradient behavior was corrected and covered by Phase 5 regression/golden tests. |
| 22 | `||` used where zero is valid | CLOSED | Rendering defaults were audited/migrated to zero-safe semantics with coordinate/opacity regressions. |
| 23 | Exact-pixel dominant-color analysis pathological | CLOSED | Analysis downsamples/quantizes before histogram construction; histogram state is finite and per-call. |
| 24 | Node `>=16` claim stale | CLOSED | Package and docs declare the verified Node 22/24/26 support line. |
| 25 | Nominal ESM could actually be CJS | CLOSED | Native ESM and CJS builds are separately generated and behaviorally installed/tested from the packed package. |
| 26 | README/export mismatch | CLOSED | Root exports are explicitly verified; documentation examples are checked against package exports/types. |
| 27 | Missing guaranteed prepack gate | CLOSED | `prepack` rebuilds; `prepublishOnly` runs the full release verification gate. |
| 28 | `rimraf` build dependency unclear | CLOSED | Cleanup uses controlled repository scripts; stale dependency path removed. |
| 29 | LICENSE absent | CLOSED | MIT `LICENSE` exists and is included in package files. |
| 30 | Package `files` stale/redundant | CLOSED | Publish surface restricted to intended distribution/docs/license/banner files and verified after packing. |
| 31 | CI too narrow | CLOSED | Multi-Node Linux full gate plus macOS/Windows package-runtime smoke; controlled FFmpeg integration on Linux. |
| 32 | Test coverage tiny | CLOSED | Unit, integration, security, golden, property/fuzz, phase regressions, FFmpeg/video, package and docs suites are permanent. |
| 33 | GitHub 5.4.5 diverged from immutable npm 5.4.5 | CLOSED | Reengineering is staged as a new `6.0.0` major rather than pretending modified source is the old immutable release. |
| 34 | No committed lockfile | CLOSED | `package-lock.json` is committed and CI uses locked `npm ci` with pinned npm tooling. |
| 35 | Giant mixed `video-helpers.ts` | CLOSED | Video was decomposed into source/process/workspace/operation/pipeline modules; no generic mixed video god helper remains. |
| 36 | Sync filesystem operations on request paths | CLOSED | Phase 14 final source audit rejects sync fs APIs in `lib-next`; final remaining video `existsSync()` was removed in Phase 14. |
| 37 | Error types/semantics inconsistent | CLOSED | Shared `ApexifyError` hierarchy is enforced; Phase 14 migrated the last 72 generic runtime throw sites. |
| 38 | Signed URLs could leak in errors/logs | CLOSED | URL redaction strips credentials/query/fragment; process/network diagnostics are sanitized and tested. |
| 39 | Image decompression/pixel limits insufficient | CLOSED | Source-byte, decoded-pixel/frame and SVG element limits are validated before/around decode. |
| 40 | Network concurrency inconsistent | CLOSED | Central remote request semaphore enforces `maxConcurrentRemoteFetches`; abort/queue cleanup is tested. |
| 41 | Package keywords excessive | CLOSED | Metadata was reduced to the maintained rendering/media/runtime scope. |
| 42 | Possible unused/redundant dependencies | CLOSED | Maintenance audit classifies direct dependencies and stale runtime dependencies were removed in cleanup phases. |
| 43 | Documentation examples not comprehensively executable | CLOSED | Package documentation examples/fixtures are verified in CI and clean packed-package ESM/CJS/types consumers run. |
| 44 | No shared runtime/security configuration | CLOSED | Central network/limits/cache/FFmpeg/temp/diagnostics configuration is the common policy source. |

## Manual `Map` audit

| Runtime map/state | Classification | Bound / lifecycle |
|---|---|---|
| Asset registry | Persistent user-controlled | Explicit `maxCollectionItems`; nested values/palettes and image bytes additionally bounded. |
| Combo-chart label positions | Per render | Finite chart input validated before render; discarded after call. |
| GIF pending frame resolver | Per GIF | Worker/prefetch count is capped by batch/network concurrency limits. |
| Image in-flight decodes | Process-shared transient | Phase 14 adds explicit `maxCollectionItems`; entries deleted in `finally`. |
| Dominant-color histogram | Per call | Input is downsampled and quantized; finite sample/key space. |
| Central media cache | Process-shared | TTL + max entries + max bytes + eviction + explicit clear/stats. |
| Compression histograms/octree maps | Per call | Quantized finite color space and finite sampled pixels; released after operation. |
| Plugin API registry | Persistent user-controlled | Phase 14 adds `maxCollectionItems`. |
| Plugin installed/pending names | Persistent/transient user-controlled | Combined admission bounded by `maxCollectionItems`. |
| Plugin rollback journal | Per installation | Phase 14 bounds unique transaction mutations with `maxCollectionItems`; discarded after install. |
| Pending/registered fonts | Process-shared native state | Phase 14 bounds registered + pending keys and removes failed pending entries. |

## Manual `Promise.all` audit

| Site | Classification |
|---|---|
| Batch worker pool | Bounded worker count: `min(items, maxBatchConcurrency)`. |
| Canvas background preflight | Background layer count is resource-limited; image decode concurrency also has a Phase 14 admission bound. |
| Output stitch/collage worker pool | Sources are collection-limited and workers are capped by batch concurrency. |
| Template flex measurement | **Corrected in Phase 14:** child count now uses `maxCollectionItems`, measurement uses a `maxBatchConcurrency` worker pool. |
| Template grid measurement | **Corrected in Phase 14:** child count now uses `maxCollectionItems`, measurement uses a `maxBatchConcurrency` worker pool. |

## Large-file audit

The final audit currently flags four source files above 50 KiB for human inspection: bar, combo, horizontal-bar, and line chart implementations. They are domain-specific chart implementations rather than generic cross-domain helper/god files, and remain below the Phase 14 audit's hard 100 KiB failure threshold. Their size is a maintainability observation, not evidence of mixed responsibility. Future chart decomposition must preserve the current chart semantic/golden test suite rather than perform a risky release-candidate rewrite solely to lower line count.

## Architecture map at the release candidate

```text
ApexPainter public facade
  -> canvas / image / text / render
  -> scene / template / components / assets / plugins
  -> chart
  -> GIF
  -> video pipeline + operations
  -> procedural audio
  -> batch / output

Cross-cutting runtime infrastructure
  -> runtime config + RenderLimits
  -> structured errors
  -> media source resolution
  -> SSRF-aware remote transport
  -> bounded cache
  -> safe process runner
  -> isolated temp workspace
  -> diagnostics
```

The dependency rule is that domain features consume shared infrastructure instead of implementing their own network/process/temp/cache/security policy.

## Security and resource-policy proof

| Area | Release-candidate control |
|---|---|
| Secrets | Repository secret scanner; no embedded credential fallbacks. |
| Process execution | Argument-vector process runner, `shell: false`, bounded output, timeout/abort, structured failures. |
| SSRF | Protocol validation, credential rejection, DNS/IP classification, private/reserved blocking, redirect revalidation, pinned validated addresses, trusted allowlist opt-in. |
| Remote bytes | Per-kind byte limits, content-length precheck plus streamed byte accounting. |
| Network fan-out | Central semaphore + bounded queue + abort cleanup. |
| Canvas/scene | Dimension, pixel, depth/layer/surface/content budgets. |
| Images | Source bytes, decoded pixels/frames, SVG element limits, bounded completed/in-flight cache state. |
| GIF | Frames, dimensions, aggregate resource cost, bounded resolver concurrency, incremental producer consumption. |
| Audio | Duration/sample/channels/events/layers/partials/byte estimates. |
| Video | Duration/fps/bitrate/overlays/merge inputs/extracted frames/audio tracks/pipeline layers plus safe process/workspace boundaries. |
| Assets/plugins/fonts | Phase 14 adds finite admission for persistent/native registries and transactional journals. |
| Temp files | Confined unique workspace, deterministic cleanup, explicit retain-for-debug option only. |
| Error privacy | Structured error fields and URL redaction; no raw signed-query diagnostics. |

## Test and CI matrix

Final acceptance requires a green run on the exact release-candidate SHA for:

- Linux Node 22 full gate + controlled FFmpeg;
- Linux Node 24 full gate + controlled FFmpeg;
- Linux Node 26 full gate + controlled FFmpeg;
- macOS Node 24 package/runtime smoke;
- Windows Node 24 package/runtime smoke.

The full gate includes build/typecheck, test inventory, secret scan, Phase 14 source audit, unit/internal/integration/security/golden/property/fuzz/regression tests, coverage, clean packed-package consumers, documentation example verification, benchmarks, and strict maintenance audit. Linux additionally runs dependency-security audits and tarball inspection.

**Final result:** pending final SHA verification.

## Package artifact audit

Required release-candidate checks:

- `npm pack`/dry-run or equivalent packed-content inspection;
- intended files only;
- no secrets or maintenance/source junk in the published surface;
- native ESM import works from a clean install;
- CommonJS `require` works from a clean install;
- ESM/CommonJS declaration trees typecheck from clean consumers;
- `apexify.js/types` type subpath resolves correctly;
- root exports match documentation;
- README, changelog and MIT license are present;
- lifecycle scripts cannot publish a stale build.

**Final packed result:** pending final SHA verification.

## Dependency audit

Direct runtime dependencies at the release candidate are intentionally small and domain-specific:

- `@napi-rs/canvas` — server raster/canvas backend;
- `@skyra/gifenc` — GIF encoding;
- `sharp` — raster decode/transform/metadata pipeline;
- `imgur` — explicit external upload feature.

The strict maintenance audit is responsible for import/reachability classification, and CI runs both full and production dependency vulnerability audits.

**Final dependency result:** pending final SHA verification.

## Phase 0 → Phase 14 performance comparison

`benchmarks/phase14-phase0-comparison.cjs` replays the Phase 0 named workloads against the release-candidate CommonJS package build and emits machine-readable comparison artifacts.

Phase 0 used Node 20 and a historical GitHub-hosted runner; Phase 14 uses the supported Node matrix and a newer runner image. Therefore percentage deltas are directional engineering evidence, not a hardware/runtime-normalized scientific A/B. Video had no Phase 0 number because FFmpeg was unavailable then; Phase 14 runs it when controlled FFmpeg is present.

| Workload | Phase 0 wall | Final wall | Change | Phase 0 peak RSS | Final peak RSS |
|---|---:|---:|---:|---:|---:|
| cold CJS import | 361.807 ms | pending | pending | n/a | pending |
| canvas 1200×630 | 26.981 ms | pending | pending | 126,730,240 B | pending |
| text render | 34.065 ms | pending | pending | 131,076,096 B | pending |
| single image composition | 34.305 ms | pending | pending | 135,966,720 B | pending |
| medium scene | 34.157 ms | pending | pending | 138,981,376 B | pending |
| chart render | 18.402 ms | pending | pending | 138,981,376 B | pending |
| GIF 30 frame | 546.915 ms | pending | pending | 161,935,360 B | pending |
| audio 10 second | 109.795 ms | pending | pending | 163,508,224 B | pending |
| video from frames | Phase 0 skipped | pending | n/a | Phase 0 skipped | pending |

Final values are filled only from the final CI artifact; they are not estimated.

## Release-candidate scorecard

Scores are intentionally withheld until the final CI/package/benchmark evidence is attached. The target categories are architecture/modularity, public API, TypeScript, feature completeness, runtime resilience, security, performance, memory efficiency, testing, CI/release engineering, documentation breadth/accuracy, maintainability, and trusted/untrusted production readiness.

A score above 9 will only be assigned when its supporting gate is green on the locked final release-candidate SHA.

## Remaining Phase 14 work

1. Complete final-head CI across supported Node/OS matrix.
2. Read the Phase 14 benchmark artifacts and replace every `pending` value above with measured data.
3. Inspect final package artifacts and dependency-audit outputs.
4. Attach evidence-backed score values; do not inflate scores to satisfy the target.
5. Merge the package PR only after every required check is green.
6. Re-run post-merge package CI and lock the resulting `main` SHA.
7. Synchronize the documentation repository to that exact package behavior, merge any required corrections, and verify its post-merge build.
8. Lock the final documentation SHA.
9. Only then mark Phase 14 and the original Phase 0–14 program `COMPLETE`.
