# Phase 14-P — Performance Normalization and Regression Recovery

## Status

**COMPLETE**

Phase 14-P is complete. The final compatibility/performance control point is the immutable `phase14p-baseline` branch at:

```text
5d9b71f185140d6c3477286b8fb111f293e52b48
```

This SHA passed the normalized performance gate, targeted Phase 14-P verification, and the full Phase 0–14 CI/release acceptance gate before the baseline branch was created.

The closure report itself is intentionally committed after the freeze on `phase14p-performance-recovery`; it does **not** move the frozen baseline SHA.

---

## 1. Comparison subjects

### Phase 0 historical subject

- package SHA: `5bb74cb3ab385cd161d98c783aa2fa08ee89acd1`
- immutable benchmark control SHA: `679da1ae0210b1ed9d52bdd89db41f73f5ec46bd`
- package version: `5.4.5`
- CJS entry: `dist/cjs/index.js`
- historical subject has no committed lockfile; normalized setup therefore uses `npm install --ignore-scripts --no-audit --no-fund`

### Phase 14 pre-recovery subject

- authoritative Phase 14 closure SHA: `dbed9743353593eafae9a7b1c25312d7170a233b`
- recorded functional source SHA: `c2b8eb01b071c0ddff18f3cd0fef0431e5150981`
- package version: `6.0.0`
- CJS entry: `dist/cjs/index.cjs`
- install: `npm ci --ignore-scripts`

### Phase 14-P post-recovery/final subject

- final baseline SHA: `5d9b71f185140d6c3477286b8fb111f293e52b48`
- branch: `phase14p-baseline`
- package version: `6.0.0`
- CJS entry: `dist/cjs/index.cjs`
- install: `npm ci --ignore-scripts`

The machine-readable subject/environment contract is `benchmarks/phase14p/comparison-manifest.json`.

---

## 2. Normalized environment

The authoritative final normalized comparison ran all three subjects in the same Node 24 job/environment:

- runner image: Ubuntu 24.04
- architecture: Linux x86_64 / `linux-x64`
- Node: `v24.20.0`
- npm: `11.19.1`
- FFmpeg: `6.1.1-3ubuntu5`
- font: DejaVu Sans (`fonts-dejavu-core`)
- timezone: `UTC`
- locale: `C.UTF-8`
- GC: `node --expose-gc`, explicit GC before timed samples
- identical deterministic raster fixtures
- identical benchmark harness and environment variables
- no network fixture in representative normalized workloads

The hosted CPU model is runner-provided rather than a stable hardware contract; Phase 0, pre-recovery Phase 14, and post-recovery Phase 14-P ran sequentially inside the same normalized job so subject comparisons do not cross runner generations.

The only install-strategy exception is Phase 0 because its historical subject has no committed lockfile. Install time is not included in measured workloads.

---

## 3. Benchmark methodology

### Cheap workloads

- warm-ups: 10
- measured samples: 30

### Expensive workloads

- warm-ups: 3
- measured samples: 10

### Memory

- separated from timing samples
- memory samples: 3

### Statistics captured

- mean
- median / P50
- P90
- P95
- P99
- min / max
- standard deviation
- coefficient of variation
- peak RSS where meaningful
- heap/external/native process memory in the normalized harness payload
- representative output bytes/hash

Output hashing is outside timed regions. Environment identity, fixture identity and stable-output checks are mandatory before the final gate accepts a result.

---

## 4. Apparent regressions from the old directional comparison

The old cross-generation evidence suggested:

| Workload | Old directional delta |
|---|---:|
| Canvas | +6.58% slower |
| Text | +20.42% slower |
| Image composition | +6.17% slower |
| Chart | +10.40% slower |
| Scene | -1.53% faster |
| GIF | -32.70% faster |
| Audio | -3.88% faster |
| Cold import | -42.66% faster |

Those numbers mixed different Node/runtime/runner conditions and were never acceptable as a final regression verdict.

---

## 5. Confirmed regressions under normalized conditions

The normalized **pre-recovery** Phase 14 subject produced:

| Workload | Phase 0 median | Phase 14 pre median | Pre vs Phase 0 |
|---|---:|---:|---:|
| Cold CJS import | 227.372 ms | 148.154 ms | -34.84% |
| Canvas 1200×630 | 20.078 ms | 19.884 ms | -0.97% |
| Text render | 22.844 ms | 22.657 ms | -0.82% |
| Single image composition | 23.061 ms | 22.107 ms | -4.14% |
| Medium scene | 22.907 ms | 21.496 ms | -6.16% |
| Chart render | 11.345 ms | 11.217 ms | -1.13% |
| GIF 30 frame | 277.189 ms | 245.340 ms | -11.49% |
| Audio 10 second | 51.353 ms | 63.828 ms | **+24.29%** |

### Verdict

- Canvas, text, image and chart were **not real regressions**. The old reported slowdowns were environment/runtime/runner noise.
- Cold import, scene and GIF were genuine improvements, although the old directional GIF/import magnitudes were overstated by the uncontrolled environment.
- **Audio was the real regression.** The old directional comparison actually hid it: normalized Phase 14 audio was **24.29% slower** than normalized Phase 0.

---

## 6. Root cause of the real regression

### Audio

The normalized audit and source/profiler work identified avoidable CPU work in the procedural-audio hot path:

1. `synthesizeSound()` validated the request and then called `renderSound()`, which validated the same sound again.
2. `synthesizeSequence()` similarly crossed an already-validated public boundary and then entered a renderer that repeated sequence/sound validation.
3. `renderLayer()` called the generic ADSR helper for every generated sample. That helper repeatedly merged/defaulted/fitted the same envelope and rebuilt derived sustain/release boundaries instead of resolving them once per layer.
4. audio finalization performed separate full-array passes for master gain, finite-value verification, peak scanning and limiter preparation.
5. WAV encoding performed another O(n) finite-sample scan even when the trusted renderer had already proven samples finite.

### Applied recovery

- introduced validated internal render paths (`renderValidatedSound`, `renderValidatedSequence`) while retaining public validation and allocation/resource checks;
- resolved ADSR state once per layer and used a resolved hot-loop helper;
- fused gain/finite/peak work into a single finalization pass where semantics allow;
- added `encodeValidatedWavPcm16`, which retains structural/resource validation but skips the duplicate finite scan only for trusted already-validated PCM;
- kept public `renderSound`/generic WAV APIs defensive for direct callers.

Result: audio moved from **+24.29% slower than Phase 0 pre-recovery** to **-11.51% faster than Phase 0**, and **-28.81% faster than the pre-recovery Phase 14 subject**.

---

## 7. Other measured recovery work

### Text

Normalized pre-recovery text was already approximately Phase-0-equivalent, proving the historical +20.42% slowdown was environmental. Profiling still showed the text end-to-end path was dominated by final PNG encoding.

Recovery work therefore targeted measured encoding cost rather than inventing speculative layout changes:

- reduced repeated text style/metric normalization work;
- retained trusted decoded-base paths only after public/resource validation;
- added a lossless text PNG fast path using a raw unpremultiplied snapshot and Sharp encoding;
- normalized PNG metadata to the existing Skia semantic contract;
- capped the extra raw RGBA snapshot at **16 MiB**;
- retained native Skia async encoding as the fallback for large canvases or any semantic/backend anomaly;
- added semantic regression coverage for the fast path and fallback.

Final text is **53.70% faster than normalized Phase 0**.

### Image composition

The image pipeline was audited for metadata/decode/transcode/copy overhead. A safe fast path for ordinary single-frame PNG buffers now performs header/resource preflight before the native canvas decode and reuses the bounded decoded-image cache. It does not bypass decoded-pixel, frame, byte or canvas limits.

Final image composition is **8.06% faster than Phase 0**.

### Chart

The normalized comparison proved there was no real chart regression. Validation/layout/text stages were still instrumented permanently, but a broad speculative chart rewrite/global cache was rejected because measured data did not justify semantic/maintenance risk.

Final chart render is **1.08% faster than Phase 0**.

### Canvas

Canvas allocation/background/encode stages were isolated. PNG encode remains the dominant cost. Backend/initialization probes did not justify replacing the established canvas path solely to chase the strong target.

Final canvas is **0.85% faster than Phase 0**.

### Scene / GIF / import

Existing wins were preserved:

- scene: **8.13% faster** than Phase 0;
- GIF: **16.86% faster** than Phase 0 and **6.07% faster** than pre-recovery Phase 14;
- cold CJS import: **34.43% faster** than Phase 0.

---

## 8. Final normalized results

| Workload | Phase 0 median | Pre-recovery median | Post-recovery median | Post vs Phase 0 | Post vs pre | Post P95 | Post peak RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| Cold CJS import | 227.372 ms | 148.154 ms | 149.083 ms | -34.43% | +0.63% | 157.468 ms | n/a |
| Canvas 1200×630 | 20.078 ms | 19.884 ms | 19.907 ms | -0.85% | +0.12% | 20.777 ms | 240.09 MiB (-4.84%) |
| Text render | 22.844 ms | 22.657 ms | 10.576 ms | **-53.70%** | **-53.32%** | 10.831 ms | 159.56 MiB (+7.02%) |
| Single image composition | 23.061 ms | 22.107 ms | 21.203 ms | -8.06% | -4.09% | 22.483 ms | 149.53 MiB (-4.19%) |
| Medium scene | 22.907 ms | 21.496 ms | 21.045 ms | -8.13% | -2.10% | 22.237 ms | 154.50 MiB (-3.53%) |
| Chart render | 11.345 ms | 11.217 ms | 11.222 ms | -1.08% | +0.04% | 11.728 ms | 209.16 MiB (-2.78%) |
| GIF 30 frame | 277.189 ms | 245.340 ms | 230.445 ms | -16.86% | -6.07% | 238.793 ms | 230.11 MiB (+1.06%) |
| Audio 10 second | 51.353 ms | 63.828 ms | 45.440 ms | **-11.51%** | **-28.81%** | 49.539 ms | 233.04 MiB (+2.44%) |

All normalized final integrity checks passed:

- environment match: true;
- fixture match: true;
- stable outputs: true;
- final median/P95/CV gates: pass;
- text recovery gate: pass.

---

## 9. Stage-level final evidence

Permanent budget IDs are versioned in `benchmarks/baselines/phase14p-stage-linux-x64-node24-schema2.json`.

The final acceptance artifact measured:

| Permanent budget | Median | P95 |
|---|---:|---:|
| `bench:canvas:create` | 28.2316 ms | 29.3198 ms |
| `bench:text:measure` | 2.6551 ms | 3.0625 ms |
| `bench:text:render` | 15.7427 ms | 16.1973 ms |
| `bench:image:decode` | 0.2287 ms | 0.8788 ms |
| `bench:image:compose` | 29.5673 ms | 30.6169 ms |
| `bench:chart:layout` | 0.3244 ms | 0.3574 ms |
| `bench:chart:render` | 15.3936 ms | 16.0070 ms |
| `bench:scene:render` | 30.8369 ms | 31.0815 ms |
| `bench:validation` | 0.2069 ms | 0.2580 ms |
| `bench:runtime-config` | 0.0362 ms | 0.0541 ms |
| `bench:encode-png` | 27.6212 ms | 28.5683 ms |

### Selected domain stages

| Domain/stage | Median | P95 |
|---|---:|---:|
| text measurement | 2.6551 ms | 3.0625 ms |
| text line wrapping/layout | 0.1948 ms | 0.2316 ms |
| text draw | 0.1804 ms | 0.2611 ms |
| image metadata inspection | 0.5153 ms | 0.9783 ms |
| image decode | 0.2287 ms | 0.8788 ms |
| image effects | 2.0838 ms | 4.3129 ms |
| chart layout | 0.3244 ms | 0.3574 ms |
| chart text measurement | 0.1330 ms | 0.1583 ms |
| chart geometry | 0.3081 ms | 0.3707 ms |
| chart data draw | 0.4537 ms | 0.5363 ms |
| chart encode | 10.0072 ms | 10.6427 ms |

Sub-millisecond stages naturally show high percentage CV. The stage-budget policy therefore uses a small absolute noise floor for micro-stages while the normalized end-to-end acceptance remains percentage-strict.

---

## 10. Profiler evidence

Profiler workflow: `34168200827`.

Frozen pre-recovery artifact:

- artifact ID: `10034856270`
- digest: `sha256:b3ec9b6b516ba184be2e4c16faa4bb8afb78f6b8cc3ec02981e6054eb0bd37fd`

Post-recovery artifact:

- artifact ID: `10034853576`
- profiled SHA: `3cd1330d8b698a2035ba7edd626945f050c9332a`
- digest: `sha256:af146ac489fa4adf780bdd39d60a2da1b1a14d7951384745566ec3964444245c`

No runtime/library source changed between that post-recovery profile SHA and the final baseline SHA; subsequent changes were scanner/benchmark-manifest closure fixes. Therefore the profile remains representative of the frozen runtime.

Key observations:

- pre-recovery text CPU samples were dominated by `createText`/native encoding;
- post-recovery text shifts measured CPU work into the bounded `encodeTextCanvasPng` path while substantial wall time is native/idle async work;
- canvas, chart, image and scene remain dominated by their established render/encode entry points rather than repeated JS validation/config work;
- package/import allocation profiles still expose dependency/module-load allocations, which is expected background debt for the current monolithic Node package and will be addressed structurally only by later package-boundary phases.

---

## 11. Memory results

The generic rule is no **unexplained** >5% peak-RSS regression.

Final Phase-0-relative RSS changes:

- canvas: -4.84%
- text: +7.02%
- image: -4.19%
- scene: -3.53%
- chart: -2.78%
- GIF: +1.06%
- audio: +2.44%

Text is the sole >5% increase and is explicitly explained/bounded: the fast path may hold one additional unpremultiplied RGBA snapshot, capped at **16 MiB**, and automatically falls back to native Skia above that ceiling or on any semantic/backend anomaly. The final CI gate deliberately permits at most +10% text RSS only with that independent bounded-fallback regression coverage.

No new unbounded cache or permanent retained native benchmark-only object was introduced.

---

## 12. Safety invariants preserved

The executable `validation-config-audit.cjs` passed **20/20** checks across validation, memory, configuration and security.

Preserved invariants include:

- public text validation before trusted fast paths;
- public audio validation before trusted render/encode helpers;
- scene public validation retained;
- generated GIF frame limits retained;
- 16 MiB text fast-path allocation ceiling plus fallback;
- decoded-image cache remains LRU/TTL and byte/entry bounded;
- in-flight image decode dedupe remains bounded and cleared in `finally`;
- GIF prefetch remains centrally bounded;
- nested scene surfaces avoid unnecessary PNG roundtrips without bypassing resource checks;
- runtime defaults/resolved config objects remain frozen and independent;
- partial runtime overrides do not mutate defaults;
- unsafe/zero concurrency limits are rejected;
- trusted network mode requires explicit allowlisting;
- SSRF private/loopback/link-local policy remains intact;
- remote redirect/byte controls remain intact;
- process execution remains argv-based/no shell opt-in;
- temp workspace cleanup remains explicit.

The Phase 3 media-boundary scanner and Phase 4 validation/resource scanner also pass on the frozen SHA.

---

## 13. Tests and CI changed

Added or strengthened:

- normalized Phase 0/pre/post harness;
- comparison/statistics tooling;
- final median/P95/CV/RSS performance assertion;
- permanent multi-domain stage benchmark suite;
- versioned Node 24 stage budget baseline;
- stage-budget assertion;
- text PNG semantic/fallback regression suite;
- validation/config/security/memory executable audit;
- CPU/allocation profiler workflow and summary tooling;
- source verification workflow;
- full Phase 14-P final acceptance workflow;
- Phase 3/Phase 4 static safety scanners updated to validate the current cache/delegation architecture and ordering, rather than stale function names.

Final candidate acceptance:

- Source Verification run `34168508553`: **success**
- Normalized Performance Gate run `34168508549`: **success** on Node 24 comparison and Node 26 runtime-effect control
- Final Acceptance run `34168508538`: **success**
- full repository `npm run test:ci`: **success** inside Final Acceptance

---

## 14. Problems discovered during closure

1. The original directional benchmark overstated canvas/text/image/chart regressions and hid the real audio regression.
2. An early text PNG fast-path implementation used seven plain `Error` throws internally. The Phase 14 structured-error scanner correctly rejected it; all were converted to `ApexifyDecodeError`.
3. The image fast path initially exposed a direct `loadImage(buffer)` call to the Phase 3 bypass scanner. The path was changed to an explicit already-validated buffer boundary; byte/frame/pixel/canvas checks remain before native decode.
4. The Phase 4 scanner encoded stale implementation details (`inspectDecodedImageSource` and direct audio-facade validator names). It was upgraded to verify the stronger actual invariants:
   - decoded-image cache misses enter `decodeImageSource`;
   - cached decoded dimensions are rechecked before rendering;
   - audio façade methods delegate to validated synthesizer boundaries;
   - synthesizer validation/resource checks precede rendering.
5. The machine-readable comparison manifest still named Node 20.20.2 after CI had standardized Phase 14-P on Node 24.20.0. It was corrected before the final freeze.

No failed gate was suppressed or downgraded to obtain completion.

---

## 15. What went wrong / rejected optimizations

### Rejected or constrained

- **Removing validation for speed:** rejected. Trusted internal paths were introduced only after public/resource validation, with scanners proving the ordering.
- **Direct unvalidated canvas decode for low-copy image composition:** rejected. Low-copy decode is allowed only after explicit buffer/resource validation.
- **Unbounded text/image/chart caches:** rejected. Existing bounded caches remain bounded; render-local/trusted representations are preferred.
- **Unbounded raw text PNG snapshots:** rejected. The text encoder has a hard 16 MiB ceiling and native fallback.
- **Broad chart rewrite/global chart cache:** rejected because the normalized chart was not regressed and profiler/stage evidence did not justify added semantic/maintenance risk.
- **Canvas backend replacement solely to hit the strong 5% target:** rejected because normalized canvas was already non-regressed and PNG encode dominates; backend churn would create disproportionate correctness/portability risk.
- **Output-changing PNG optimization:** rejected. The accepted fast path restores the expected Skia-oriented metadata contract and falls back if semantic validation fails.

### Closure failures that were fixed rather than ignored

- structured-error audit failure in the new text encoder;
- Phase 3 media-boundary scanner failure;
- stale Phase 4 base-canvas boundary assertion;
- stale Phase 4 audio-facade validation assertion;
- stale Node version in the comparison manifest.

---

## 16. Remaining performance debt

No minimum Phase 14-P regression remains.

The following **strong targets** remain optional future optimization debt and must not be confused with completion failures:

| Workload | Final vs Phase 0 | Strong target | Gap to strong target |
|---|---:|---:|---:|
| Canvas | -0.85% | ≤ -5% | 4.15 percentage points |
| Chart | -1.08% | ≤ -10% | 8.92 percentage points |
| GIF | -16.86% | ≤ -25% | 8.14 percentage points |

The normalized pre-recovery GIF gain was only -11.49%, proving much of the old -32.70% directional gain came from environment differences. Phase 14-P nevertheless improved GIF a further 6.07% versus the pre-recovery subject.

Other strong targets were reached or exceeded:

- cold import: -34.43% (target ≥30% faster);
- text: -53.70% (target ≥10% faster);
- image composition: -8.06% (target ≥5% faster);
- scene: -8.13% (target ≥5% faster);
- audio: -11.51% (no-regression/modest-improvement target exceeded).

Memory debt to monitor: text peak RSS is +7.02% relative to Phase 0 because of the bounded 16 MiB raw snapshot. It is explained, hard-capped and regression-tested, but remains a future optimization opportunity if an equally fast lossless path can remove the snapshot without changing output semantics.

Micro-stage CV for sub-millisecond operations can be high in percentage terms; these are protected with absolute hosted-runner noise floors plus strict end-to-end gates rather than by weakening representative-workload thresholds.

---

## 17. Final package and evidence record

### Final package artifact

Final Acceptance workflow artifact:

- workflow run: `34168508538`
- artifact ID: `10034980746`
- artifact name: `phase14p-final-acceptance-5d9b71f185140d6c3477286b8fb111f293e52b48`
- artifact digest: `sha256:dec24881d8c4caa6622027a33e5bfd096c95ab0a0c274c36d2bb12b7e1845e1b`

Packed npm artifact:

- file: `apexify.js-6.0.0.tgz`
- size: 1,524,593 bytes
- unpacked size: 7,423,990 bytes
- SHA-1 recorded by npm: `374f8b2980e64e29f29eafd28460b4f256e7624b`
- SHA-256 closure digest: `57cde5f660cdb059859185dfd7ffbf7afd63160884031cb8597f8924c4245086`

### Export map

The final artifact records:

- package: `apexify.js@6.0.0`
- Node engines: `22.x || 24.x || 26.x`
- npm engine: `>=10`
- root native ESM import entry: `./dist/esm/index.js`
- root CJS require entry: `./dist/cjs/index.cjs`
- dual ESM/CJS type declarations
- `./types` type-only export
- `./package.json` export

### Normalized benchmark evidence

- workflow run: `34168508549`
- Node 24 artifact ID: `10034965476`
- digest: `sha256:5b7685b8efff335efd95bac5092a200c6ad5e08954dfe3302e4ed96b4c8bf083`
- Node 26 control artifact ID: `10034950887`
- digest: `sha256:134550751c0494e7437337af56114afc2b7ed936b4bba0051bfe68f5432e75a0`

### Targeted/stage evidence

- Source Verification run: `34168508553`
- artifact ID: `10034955307`
- digest: `sha256:6e6cb334b250c5fbcf4dc6a86f76f8a4b64523c38fa6afdc1e8db5c7e4cce1be`

### Benchmark baseline file

```text
benchmarks/baselines/phase14p-stage-linux-x64-node24-schema2.json
```

Its versioning dimensions are Linux/x64, Node 24 and benchmark schema 2 as required by the Phase 14-P policy.

---

## 18. Final baseline SHA

```text
5d9b71f185140d6c3477286b8fb111f293e52b48
```

Immutable control branch:

```text
phase14p-baseline
```

This is the final original-engine compatibility/performance control point for the documentation architecture pre-phase and, after that program completes, Advanced Engine Phase 15+ comparisons.

Do not use the older uncontrolled Phase 14 directional benchmark as the Phase 15 baseline.

---

## 19. Acceptance checklist

- [x] immutable Phase 0 and Phase 14 pre-recovery subjects recorded
- [x] normalized same-environment harness
- [x] statistical warm-up/repeated sampling
- [x] identical deterministic fixtures/output verification
- [x] permanent canvas/text/image/scene/chart/GIF/audio stage benchmarks
- [x] CPU/allocation profiling artifacts
- [x] repeated validation/normalization audit
- [x] runtime configuration audit
- [x] text recovery
- [x] chart non-regression
- [x] canvas non-regression
- [x] image composition recovery
- [x] cold-import/GIF/audio/scene preservation gates
- [x] memory/RSS audit
- [x] permanent versioned regression budgets in CI
- [x] full Phase 0–14 correctness/security/package/documentation gate
- [x] final normalized Phase 0 vs pre vs post table
- [x] package artifact/export map captured
- [x] exact baseline SHA frozen on `phase14p-baseline`
- [x] no unresolved representative regression >10%
- [x] no unresolved safety/validation bypass

**Phase 14-P is COMPLETE.**
