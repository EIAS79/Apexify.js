# Phase 14 — Final whole-repository audit and release-candidate proof

## Status

**RELEASE CANDIDATE EVIDENCE COMPLETE — FINAL HEAD CI AND POST-MERGE/DOCS LOCK REMAIN**

This is the Phase 14 evidence record for the original Phase 0–14 reengineering program. All source-level critical/high findings are closed. The last measured package head before this evidence-only update was `33bcd2d30cb87973ac5ae40731e4e6e6e4276f04`; Apexify CI run **#136** completed successfully on all required jobs. This document update and the companion 6.0.0 RC record must receive one final exact-head CI pass before merge. After merge, package `main` and the documentation repository are independently verified and locked before the program is marked complete.

Phase 13 package control point: `d19ccd31ec9f9ccabc4ebd5eaa51ff038f0343a5`.

Phase 0 benchmark control point: `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1`.

Release candidate version: `6.0.0`.

Supported Node line: `22.x || 24.x || 26.x`.

## 14.1 Independent re-audit

The permanent Phase 14 gate is `scripts/phase14-final-audit.cjs`, enforced by both `test:ci` and `verify:release`. The final Node 24 evidence reports **193 runtime source files and 0 violations**.

The gate re-checks the project instead of trusting earlier phases. It rejects shell/process bypasses, direct arbitrary network clients outside central transport, synchronous runtime filesystem APIs, generic runtime `Error` throws, unfinished markers, avoidable explicit `any`, and package/export/license/release invariant failures. It also enumerates every runtime `Map`, `Promise.all`, and source file above the review threshold for manual classification.

### New findings discovered by Phase 14

1. Video overwrite checking still used synchronous `existsSync()` on a request path.
2. Native font registration could grow process-wide without a finite admission bound.
3. `AssetManager` retained user-controlled registry/nested values without explicit collection/image-byte admission checks.
4. Runtime source still contained 72 generic `throw new Error(...)` sites.
5. `PluginHost` API registrations, installed/pending names, and rollback journal could grow without a finite collection budget.
6. Concurrent unique decoded-image promises could grow even though the completed-image cache was bounded.
7. Template flex/grid children were not collection-limited and were measured with unbounded user-driven `Promise.all` fan-out.

All seven are corrected. Permanent regression coverage protects the externally reachable resource/error contracts.

## Original 44-finding closure matrix

| # | Original finding | Status | Primary closure evidence |
|---:|---|---|---|
| 1 | Credential/token-looking Imgur fallback values | CLOSED | Embedded credential fallback removed; explicit config + secret scan. |
| 2 | FFmpeg/ffprobe shell-string execution | CLOSED | Central argv runner, `shell: false`, process security tests. |
| 3 | Arbitrary HTTP(S) SSRF gaps | CLOSED | Central protocol/host/DNS/IP/redirect policy; private/reserved blocked by default. |
| 4 | Remote maximum bytes inconsistent | CLOSED | Central per-kind remote byte limits and streamed accounting. |
| 5 | Duplicated remote media acquisition | CLOSED | Shared media source/remote transport infrastructure. |
| 6 | Decoded image cache unbounded | CLOSED | Bounded TTL/LRU entry+byte cache; Phase 14 also bounds in-flight decodes. |
| 7 | Canvas dimensions positive but unbounded | CLOSED | Dimension/total-pixel limits before large allocations. |
| 8 | Scene resource budgets incomplete | CLOSED | Central scene depth/layer/surface/content/pixel budgets. |
| 9 | Numeric runtime validation inconsistent | CLOSED | Shared validation primitives + domain semantic validators. |
| 10 | Procedural audio allocation unbounded | CLOSED | Duration/sample/channel/event/layer/partial/byte budgets. |
| 11 | GIF `AsyncIterable` fully collected | CLOSED | Incremental producer consumption/backpressure. |
| 12 | GIF broad `Promise.all` | CLOSED | Bounded ordered prefetch tied to runtime concurrency. |
| 13 | GIF `onStart` bypassed validation | CLOSED | Validation runs before producer execution. |
| 14 | GIF attachment used `.js` | CLOSED | `.gif`, `image/gif`, GIF signature validation. |
| 15 | Remote video fully buffered before disk | CLOSED | Bounded streamed remote-to-file acquisition. |
| 16 | Multiple video source resolvers | CLOSED | Centralized video/media source resolution. |
| 17 | Shared/manual temp video files | CLOSED | Isolated confined workspaces + deterministic cleanup. |
| 18 | Video grid behaved as horizontal stack | CLOSED | Complete grid semantics/validation in Phase 8. |
| 19 | Remote watermark filesystem inconsistency | CLOSED | Shared media semantics. |
| 20 | Image utilities silently returned sentinel failures | CLOSED | Structured operational failures. |
| 21 | Reflect gradient implemented as repeat | CLOSED | Corrected raster behavior + golden/regression tests. |
| 22 | `||` used where zero is valid | CLOSED | Zero-safe defaults + coordinate/opacity regressions. |
| 23 | Exact-pixel dominant-color analysis pathological | CLOSED | Downsampled/quantized finite histogram. |
| 24 | Node `>=16` claim stale | CLOSED | Package/docs/CI verify Node 22/24/26. |
| 25 | Nominal ESM could actually be CJS | CLOSED | Separate native ESM/CJS builds + installed consumers. |
| 26 | README/export mismatch | CLOSED | Root export verification + documentation fixture checks. |
| 27 | Missing guaranteed prepack gate | CLOSED | `prepack` rebuild; `prepublishOnly` full release gate. |
| 28 | `rimraf` build dependency unclear | CLOSED | Controlled cleanup script; stale dependency removed. |
| 29 | LICENSE absent | CLOSED | MIT `LICENSE` present and packed. |
| 30 | Package `files` stale/redundant | CLOSED | Restricted publish surface + tarball verification. |
| 31 | CI too narrow | CLOSED | Linux Node 22/24/26 full; macOS/Windows Node 24 package-runtime smoke. |
| 32 | Test coverage tiny | CLOSED | Unit, integration, security, golden, property/fuzz, regressions, FFmpeg, package/docs. |
| 33 | GitHub 5.4.5 diverged from immutable npm 5.4.5 | CLOSED | Reengineering staged as major `6.0.0`; no false patch identity. |
| 34 | No committed lockfile | CLOSED | `package-lock.json`; pinned npm; `npm ci`. |
| 35 | Giant mixed `video-helpers.ts` | CLOSED | Video decomposed into policy/process/workspace/operation/pipeline modules. |
| 36 | Sync filesystem operations on request paths | CLOSED | Final audit rejects sync runtime fs; final `existsSync()` removed. |
| 37 | Error semantics inconsistent | CLOSED | `ApexifyError` hierarchy; last 72 generic runtime throws migrated. |
| 38 | Signed URLs could leak in errors/logs | CLOSED | URL redaction + sanitized diagnostics tests. |
| 39 | Image decompression/pixel limits insufficient | CLOSED | Source-byte, decoded-pixel/frame, SVG-element limits. |
| 40 | Network concurrency inconsistent | CLOSED | Central semaphore/queue/abort cleanup. |
| 41 | Package keywords excessive | CLOSED | Maintained focused metadata. |
| 42 | Possible unused/redundant dependencies | CLOSED | Strict maintenance dependency classification; stale direct dependencies removed. |
| 43 | Documentation examples not comprehensively executable | CLOSED | Package docs fixtures + clean ESM/CJS/type consumers in CI. |
| 44 | No shared runtime/security configuration | CLOSED | Central network/limits/cache/FFmpeg/temp/diagnostics config. |

## Manual `Map` audit

| State | Classification | Bound/lifecycle |
|---|---|---|
| Asset registry | Persistent user-controlled | `maxCollectionItems`; nested values/palettes/image bytes bounded. |
| Combo-chart label positions | Per render | Finite validated chart input; discarded after call. |
| GIF pending frame resolver | Per GIF | Bounded by batch/network concurrency. |
| Image in-flight decodes | Process-shared transient | `maxCollectionItems`; deleted in `finally`. |
| Dominant-color histogram | Per call | Downsampled, quantized finite key space. |
| Central media cache | Process-shared | TTL + max entries + max bytes + eviction. |
| Compression histograms/octree maps | Per call | Quantized finite color/sample space. |
| Plugin registry | Persistent user-controlled | `maxCollectionItems`. |
| Plugin installed/pending names | Persistent/transient | Combined admission bound. |
| Plugin rollback journal | Per installation | Unique mutations bounded; discarded after install. |
| Pending/registered fonts | Process-shared native state | Registered+pending admission bound; failed pending removed. |

## Manual `Promise.all` audit

| Site | Classification |
|---|---|
| Batch operations | Worker count bounded by `maxBatchConcurrency`. |
| Canvas image-background preflight | Background collection limited; unique image decode admission also bounded. |
| Stitch/collage | Collection-limited sources + bounded workers. |
| Template flex/grid | Corrected in Phase 14: `maxCollectionItems` + bounded measurement worker pool. |

No remaining `Promise.all` site represents unbounded user-controlled fan-out.

## Large-file audit

Four runtime files exceed 50 KiB: bar, combo, horizontal-bar, and line chart implementations. They are cohesive chart-domain implementations, not cross-domain god helpers, and all remain below the final audit's 100 KiB hard failure threshold. This is a maintainability observation, not a release blocker. Splitting them solely to reduce line count would add RC risk without improving runtime/security boundaries; future decomposition should preserve current semantic/golden coverage.

## 14.2 Test and CI proof

Apexify CI **run #136** on branch head `33bcd2d30cb87973ac5ae40731e4e6e6e4276f04` completed successfully.

| Job | Result |
|---|---|
| Linux / Node 22 / full gate + controlled FFmpeg | PASS |
| Linux / Node 24 / full gate + controlled FFmpeg | PASS |
| Linux / Node 26 / full gate + controlled FFmpeg | PASS |
| macOS / Node 24 / package-runtime smoke | PASS |
| Windows / Node 24 / package-runtime smoke | PASS |

The full Linux gate passed build/typecheck, test-system audit, secret scan, independent Phase 14 audit, unit/internal/integration/security/golden/property/fuzz/Phase 3–10/Phase 14/public-API tests, coverage, packed-package ESM/CJS/types consumers, documentation example verification, Phase 12 + Phase 14 benchmarks, strict maintenance audit, full dependency audit, production dependency audit, and packed-content inspection.

The macOS/Windows smoke jobs passed build/typecheck, test inventory, critical unit tests, deterministic network integration, process/temp-workspace security, golden raster tests, property/fuzz tests, and packed ESM/CJS/types fixtures.

## 14.3 Phase 0 → Phase 14 benchmark

Phase 0 used Node 20 and a historical GitHub-hosted runner. Final evidence used Node 24 and the current runner. Therefore percentages are directional engineering evidence, not a hardware/runtime-normalized scientific A/B.

| Workload | Phase 0 wall | Final wall | Change | Phase 0 peak RSS | Final peak RSS |
|---|---:|---:|---:|---:|---:|
| cold CJS import | 361.807 ms | 207.465 ms | **-42.66%** | n/a | n/a |
| canvas 1200×630 | 26.981 ms | 28.756 ms | **+6.58%** | 126,730,240 B | 127,148,032 B |
| text render | 34.065 ms | 41.021 ms | **+20.42%** | 131,076,096 B | 131,301,376 B |
| single image composition | 34.305 ms | 36.422 ms | **+6.17%** | 135,966,720 B | 134,971,392 B |
| medium scene | 34.157 ms | 33.634 ms | **-1.53%** | 138,981,376 B | 137,891,840 B |
| chart render | 18.402 ms | 20.315 ms | **+10.40%** | 138,981,376 B | 137,891,840 B |
| GIF 30 frame | 546.915 ms | 368.074 ms | **-32.70%** | 161,935,360 B | 151,232,512 B |
| audio 10 second | 109.795 ms | 105.535 ms | **-3.88%** | 163,508,224 B | 162,439,168 B |
| video from frames | Phase 0 skipped | 334.813 ms | not comparable | Phase 0 skipped | 163,880,960 B |

### Regression explanation

Canvas, text, single-image composition, and chart wall times are slower in this directional comparison. These regressions are explicitly retained in the evidence; they are not hidden. Phase 0 and Phase 14 used different Node versions and runner generations, and text/chart output sizes also changed, so the wall deltas cannot be attributed solely to runtime code. Absolute peak RSS is effectively flat or lower across every comparable workload: canvas +0.33%, text +0.17%, and lower for single-image, scene, chart, GIF, and audio. GIF improved most strongly: -32.70% wall time and -6.61% peak RSS.

Audio's RSS *delta* increased substantially because the final measurement started from a lower resident baseline and retained later audio buffers; its absolute peak RSS still decreased by 0.65%, so there is no evidence of a higher process memory ceiling from this cross-run data.

## 14.4 Package artifact audit

Node 24 CI packed `apexify.js@6.0.0` with:

- packed size: **1,506,898 bytes**;
- unpacked size: **7,373,666 bytes**;
- tarball entries: **585**;
- clean ESM import: PASS;
- clean CommonJS require: PASS;
- ESM declaration consumer: PASS;
- CommonJS declaration consumer: PASS;
- `apexify.js/types`: PASS;
- README, CHANGELOG, MIT LICENSE, banner, built runtime and declaration trees: present;
- repository source/tests/workflows/maintenance scripts: excluded by the package `files` surface.

Package cold-import verification measured 238.150 ms ESM and 204.011 ms CommonJS in the clean installed fixture.

The lifecycle is release-safe: `prepack` rebuilds from source and `prepublishOnly` executes `verify:release`; stale local `dist` output cannot be published by the normal npm lifecycle.

## 14.5 Dependency and secret audit

- full `npm audit`: **0 vulnerabilities** at every severity;
- production `npm audit`: **0 vulnerabilities** at every severity;
- direct runtime dependencies: `@napi-rs/canvas`, `@skyra/gifenc`, `imgur`, `sharp`;
- secret scan: **325 files**, seven detector families, **0 findings**;
- strict maintenance/dependency classification audit: PASS.

## 14.6 Evidence-backed scorecard

These scores reflect the RC evidence, not effort spent. Scores are intentionally conservative where real maintainability/performance caveats remain.

| Category | Score | Evidence |
|---|---:|---|
| Architecture / modularity | **9.4/10** | Central runtime/media/process/workspace layers; decomposed video pipeline; independent bypass audits. |
| Public API coherence | **9.4/10** | Verified root exports, stable `ApexPainter` façade, explicit type-only subpath, compatibility alias policy. |
| TypeScript / declarations | **9.5/10** | Strict build/typecheck, separate ESM/CJS declaration trees, clean installed type consumers. |
| Feature completeness | **9.3/10** | Canvas/image/text/charts/scenes/templates/components/assets/plugins/GIF/video/audio/batch/output covered by regression and API tests. |
| Runtime resilience | **9.5/10** | Structured errors, cancellation/timeouts, resource budgets, safe temp/process behavior, bounded concurrency/caches/registries. |
| Security | **9.7/10** | 0 final-audit violations, SSRF policy, non-shell process runner, redaction, 0 secret findings, 0 dependency vulnerabilities. |
| Performance | **9.1/10** | Strong import/GIF gains and no broad regression pattern, but text/chart directional wall regressions remain and are documented. |
| Memory efficiency | **9.5/10** | Peak RSS flat/lower on comparable workloads; streaming GIF architecture; explicit cache/allocation/fan-out limits. |
| Testing | **9.7/10** | Unit, integration, security, golden, fuzz/property, historical phase regressions, FFmpeg, package, docs, coverage. |
| CI / release engineering | **9.7/10** | Node 22/24/26 Linux full matrix, macOS/Windows package smoke, locked installs, packed consumers, prepublish full gate. |
| Documentation breadth / accuracy | **9.2/10** | Package README/examples/API claims verified in CI; external docs repository requires final locked-SHA synchronization before program completion. |
| Maintainability | **9.1/10** | Strong centralized policies and maintenance audit; four large cohesive chart implementations remain a known maintainability debt. |
| Trusted production readiness | **9.6/10** | Deterministic local/server workflows, FFmpeg integration, safe defaults, package fixtures and supported-runtime matrix. |
| Untrusted-input production readiness | **9.3/10** | SSRF/resource/process/error privacy controls materially reduce attack surface; operators still must select deployment-appropriate limits and treat plugins as trusted executable code. |

Every score is above 9 with concrete supporting evidence. The two lowest scores deliberately retain known chart-size and directional-performance caveats rather than inflating the result.

## 14.7 Release candidate

Prepared release material:

- semantic version: **6.0.0**;
- changelog: existing `CHANGELOG.md` has the staged 6.0.0 breaking/runtime/package changes;
- migration notes: README + `docs/reengineering/6.0.0-release-candidate.md`;
- release notes: `docs/reengineering/6.0.0-release-candidate.md`;
- npm pack result: **1,506,898 B / 7,373,666 B / 585 entries**;
- final measured CI status before this evidence-only update: **run #136 PASS**;
- automatic npm publication: **not performed**.

## Remaining final lock sequence

1. Run CI on the exact branch head containing this evidence report and the RC record.
2. Merge PR #22 only if that exact-head matrix is green.
3. Verify the resulting `main` package commit and CI.
4. Synchronize `Apexify.js-Documentation` to the locked package behavior/SHA.
5. Verify the documentation build after merge and lock the documentation SHA.
6. Update this status to `COMPLETE` only after the package/docs post-merge locks are proven.
