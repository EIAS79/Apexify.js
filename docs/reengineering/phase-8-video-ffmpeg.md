# Phase 8 — Video / FFmpeg rearchitecture

Status: implementation complete; final same-head Node 22/24/26 release-gate verification is required before merge.

Phase 8 reworks the video subsystem around one typed operation contract, one media-source policy, safe process execution, cohesive operation modules, deterministic pipeline semantics, explicit resource limits, integration coverage, cleanup guarantees, and measured performance.

## Completion gates

| Master-plan gate | Evidence |
| --- | --- |
| No giant mixed-responsibility video helper | The legacy `lib-next/video/video-helpers.ts` god class was removed. Responsibilities now live in `operations/runtime.ts`, `filter-graph.ts`, `transcode.ts`, `merge.ts`, `overlays.ts`, `audio.ts`, `frames.ts`, `structure.ts`, and `advanced.ts`. `scripts/phase8-video-scan.cjs` fails if the old helper returns. |
| No shell execution | `MediaProcessRunner` uses `spawn(executable, args, { shell: false })`. The Phase 8 architecture scan rejects `exec`, `execSync`, and `spawnSync` in the video subsystem and permits `child_process` only in the process runner. |
| Actual grid merge | Grid mode uses generated FFmpeg `xstack` layouts for arbitrary validated input counts. Cell geometry, gap/background, audio policy, and shortest-input output duration are explicit. |
| Secure streamed remote video handling | Buffer/local/HTTP(S) video sources enter the centralized media policy. Remote media is streamed to an isolated workspace with protocol/host/SSRF/redirect/retry/timeout/byte/concurrency controls rather than first accumulated as one full Buffer. |
| Pipeline tests cover advertised layers | `tests/phase8-pipeline.cjs` exercises source, trim, video splice, frame splice, text, file/preset/synth/sequence/WAV audio, stable-id merge/replace, remove/clear, undo/redo, versioned snapshots, Buffer revival, deterministic splice ordering, preview, progress, overwrite refusal, and cleanup. |
| Temporary files are cleaned | Integration tests assert workspace removal after success, explicit failure, overwrite refusal, abort, remote input, and pipeline completion. Temporary retention remains an explicit runtime opt-in. |
| Performance is measured | `tests/phase8-benchmark.cjs` records wall time, actual FFmpeg pass count, temp-disk high-water, RSS/external/ArrayBuffer high-water, and cleanup for representative convert/grid/pipeline workloads. |

## Architecture

### Canonical public contract

`lib-next/video/video-options.ts` is the canonical `VideoCreationOptions` contract. `VideoCreator` validates the complete request first and delegates to `VideoOperations`; it no longer owns a duplicate option type or helper-injection bridge.

A `createVideo` request contains exactly one video operation plus shared execution controls:

- `signal?: AbortSignal`
- `timeoutMs?: number`
- `overwrite?: boolean`
- `onProgress?: (progress) => void`

Unsupported or ambiguous option combinations are rejected rather than silently ignored.

### Shared operation runtime

`VideoOperationRuntime` centralizes:

- source resolution into isolated workspaces;
- ffprobe calls;
- output-path and overwrite policy;
- FFmpeg execution;
- cancellation and timeout propagation;
- machine-readable progress via `-progress pipe:2`;
- workspace lifecycle.

`overwrite: false` performs a library-level destination preflight and still passes FFmpeg `-n` as a TOCTOU backstop because FFmpeg versions are not consistent about returning a nonzero status when `-n` finds an existing file.

### Process safety

`MediaProcessRunner`:

- never constructs shell command strings;
- uses argv arrays with `shell: false`;
- captures bounded stdout/stderr tails;
- supports AbortSignal and process timeouts;
- attempts SIGTERM first and escalates to SIGKILL;
- reports structured process metadata;
- parses machine FFmpeg progress records.

### Source policy

Video source resolution supports:

- `Buffer`;
- local filesystem paths;
- HTTP(S) URLs under the central network trust policy.

Remote video uses `fetchRemoteMediaToFile`, preserving the same DNS/SSRF, host allowlist, redirect, retry, timeout, byte-limit, error-redaction, and global concurrency controls used by the shared media layer.

### Typed ffprobe metadata

`ffprobe-metadata.ts` produces typed container/video/audio/codec metadata and rejects malformed or no-video inputs instead of silently substituting zero/unknown values for required video metadata.

### Resource limits

Phase 8 adds operation-specific limits:

- `maxVideoMergeInputs`
- `maxVideoExtractedFrames`
- `maxVideoAudioTracks`
- `maxVideoPipelineLayers`

These caps are independent of legacy collection limits so a caller can tighten one domain without accidentally invalidating unrelated runtime configuration.

## Operation semantics covered

### Conversion, trim, geometry, speed, and effects

- conversion validates format/codecs/pixel format/fps/resolution/fit;
- trim supports accurate and copy modes explicitly;
- speed is bounded to `0.125..16` and audio uses chained `atempo` filters where required;
- all advertised effects are exercised: blur, brightness, contrast, saturation, grayscale, sepia, invert, sharpen, and noise;
- malformed/no-video metadata and timeout termination are integration-tested.

### Merge and composition

Sequential merge normalizes dimensions/fps and synthesizes silence when an input lacks audio so A/V concat remains valid. Side-by-side is exactly two inputs. Grid uses a generated `xstack` layout for 2+ validated inputs. Composite output is explicitly bounded to the shortest probed input so independently mapped audio cannot extend the muxed result.

### Watermark, text, and audio

Watermark media enters the centralized media resolver and supports Buffer/local/remote sources. Timed text overlays render through canvas to safe temporary PNGs and use filter graphs rather than shell interpolation. Temporal alpha uses alpha-aware FFmpeg `fade`; scalar opacity remains scalar; validated custom alpha expressions use the timestamp-capable `geq` path. Repeated still overlays receive advancing timestamps so animated scale/alpha filters are meaningful.

Audio mixing supports original audio plus multiple overlays, volume, pan, fades, speed, pitch, and explicit duration policy. Pipeline audio also supports procedural preset/synth/sequence/WAV sources.

### Segment replacement and continuity

Segment replacement uses normalized filter graphs rather than raw stream-copy concat assumptions. It supports replacement video or replacement frames, normalizes dimensions/fps/audio layout, synthesizes silence where needed, and exposes `fit`, `trim`, and `preserve` duration policies. The surrounding source audio is retained so the replacement does not accidentally discard timeline audio continuity.

## Deterministic video pipeline

`VideoPipeline` supports these layer kinds:

1. source;
2. trim;
3. splice;
4. text;
5. audio.

Rendering order is deterministic:

1. source resolution;
2. trim;
3. splices sorted by target start, then stable id;
4. text;
5. audio;
6. optional preview encode.

The builder supports stable IDs, transactional mutation, bounded undo/redo history, layer removal/clearing, and versioned snapshots (`version: 1`). Serialized Node Buffers (`{ type: "Buffer", data: [...] }`) and live Buffers are safely revived during snapshot restoration. Overlapping splice ranges are rejected. Multiple duration-changing `preserve` splices are rejected because later source coordinates would be ambiguous.

`render()` returns the actual pass count and `executionPlan`. `preset: "preview"` is a real final proxy encode rather than an ignored flag.

## Test gates

`npm test` includes `npm run test:phase8`, which runs:

1. `scripts/phase8-video-scan.cjs` — architecture/process/source/merge/pipeline contract scan;
2. `scripts/build-phase8-fixture.mjs` — private source fixture outside `dist`;
3. `tests/phase8-video.cjs` — primary FFmpeg integration suite;
4. `tests/phase8-edges.cjs` — malformed/no-video metadata, timeout, 0.125x/16x speed, effect matrix and validation edges;
5. `tests/phase8-pipeline.cjs` — complete pipeline behavior and cleanup;
6. `tests/phase8-benchmark.cjs` — performance/resource measurements.

The primary integration suite covers metadata, conversion, accurate/copy trim, 3-input 2x2 grid, sequential missing-audio continuity, Buffer watermark, speed, segment replacement, WAV Buffer mixing, Unicode/multiline/quoted text, frame extraction, AbortSignal process termination, workspace failure cleanup, streamed local-HTTP video, remote byte limits, remote concurrency cleanup, and overwrite refusal.

## Benchmark evidence

Representative CI sample from Node `v24.13.1`, Linux x64, FFmpeg `6.1.1`:

| Workload | Wall time | FFmpeg passes | Temp disk high-water | Peak RSS delta |
| --- | ---: | ---: | ---: | ---: |
| Convert 320x180 → 240x135 | 203.16 ms | 1 | 0 B | 0 B observed |
| 3-input 2x2 grid | 245.83 ms | 1 | 0 B | 0 B observed |
| Pipeline: trim + text + audio + preview | 592.82 ms | 4 | 296,577 B | 5,529,600 B |

For the pipeline workload the measured external-memory high-water delta was 6,403,451 B and ArrayBuffer high-water delta was 4,932,807 B. Every benchmark workload also asserts that its temporary workspace is empty after completion.

These figures are CI workload measurements, not API performance guarantees. They exist to make regressions visible and to record the pass/resource shape of representative Phase 8 operations.

## Explicitly rejected semantics

Phase 8 prefers explicit rejection over silently ignored options. Examples include:

- sequential merge `audioPolicy: "first" | "mix"` where those semantics are not implemented for sequential concat;
- partial LUT intensity where only full LUT application is supported;
- loop `smooth: true` where no correct smooth-loop implementation exists yet.

Callers therefore receive a validation error instead of an output that pretends the requested option was honored.

## Release verification

The phase is merge-ready only when the same final source head passes the complete Runtime, Package, and Release Gate on Node 22, 24, and 26, including:

- source install/build/typecheck;
- Phases 1–8 test suites;
- clean ESM/CJS packed-package installs;
- clean prepack rebuild;
- npm pack content inspection;
- production dependency audit.

After merge, `main` must pass the same post-merge release gate before Phase 8 is considered closed.
