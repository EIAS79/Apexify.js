# Phase 9 — Procedural Audio Hardening

## Status

Phase 9 hardens Apexify.js procedural audio around bounded allocation, deterministic noise generation, DSP correctness, preset coverage, WAV validation, reentrancy, and video-pipeline integration.

The supported package API remains `ApexPainter#createAudio`; low-level audio helpers remain internal test/implementation surfaces and are not added to the package-root runtime export set.

## Allocation and resource policy

Procedural synthesis deliberately remains a complete-buffer API because `createAudio.*` returns a PCM16 WAV `Buffer`. Phase 9 therefore does **not** claim streaming output. Instead, all authoritative synthesis paths validate resource budgets before expensive allocation and use bounded transient-memory algorithms.

Default audio limits are:

| Limit | Default |
| --- | ---: |
| `maxAudioDurationSeconds` | 600 s |
| `maxAudioSampleRate` | 192,000 Hz |
| `maxAudioChannels` | 2 |
| `maxAudioEvents` | 20,000 |
| `maxAudioLayers` | 1,024 |
| `maxAudioPartials` | 4,096 |
| `maxAudioBytes` | 256 MiB |

`maxAudioBytes` is a peak-allocation guard, not merely a final-file-size check. Validation accounts for Float32 render storage, decoded/resampled sources where relevant, transient sequence/compose buffers, and coexistence of Float32 PCM with the final PCM16 WAV allocation.

Important implementation consequences:

- sound synthesis validates duration/rate/channels/layers/partials before the output `Float32Array` is allocated;
- sequence rendering keeps the output plus one rendered event instead of retaining every event buffer;
- composition keeps the output plus one processed clip rather than retaining all clip buffers;
- WAV decode validates RIFF metadata and decoded-memory bounds before allocating Float32 sample storage;
- final WAV encoding is included in pre-render peak estimates so a render cannot perform the expensive synthesis and only then discover that the PCM16 output exceeds policy;
- façade validation remains present for historical Phase-4 defense-in-depth, while authoritative synthesis helpers validate again so direct internal callers cannot bypass the limits.

Callers that need stricter deployment policy can lower these values with the existing Apexify runtime configuration. Phase 9 does not permit callers to raise channel count beyond the implementation's mono/stereo contract.

## Deterministic mode

`SynthSoundOptions`, sequence options, composition options, clips, and mix options accept an optional `seed: number | string`.

- numeric seeds must be safe integers;
- string seeds are deterministically hashed;
- noise and pink-noise generation use operation-local PRNG state;
- sequence events, composition clips, mix inputs, and individual layers receive independently derived streams;
- seeded synthesis does not depend on the process-global random stream; unseeded synthesis intentionally obtains nondeterministic values through the centralized audio RNG factory;
- seeded concurrent/reentrant renders are byte-stable and do not share filter or RNG state.

Locked deterministic WAV SHA-256 goldens:

| Case | SHA-256 |
| --- | --- |
| sine sweep | `895b389215df451bc511e73bc2a5245256204464f895e44727458f730a1c1932` |
| seeded pink noise | `001e4cead6b66b00aaa4d0c97764eaaa63213c29219a4874cfb47de1bfb44f83` |
| stereo composition | `1c1a6c6ff20e348dd43810e2613e34ab6ca1ea3278856ed22ff938aaccf92eea` |

These hashes are regression locks, not a promise that future major-version DSP changes can never intentionally update audio output. Any intentional update must change the goldens explicitly and be reviewed as an output-contract change.

## DSP contract audited in Phase 9

The Phase-9 numerical regression suite covers:

- oscillator phase starts at the mathematically expected phase and advances after sampling;
- sine, square, sawtooth, and triangle waveform normalization;
- linear frequency sweeps;
- ADSR boundaries, including proportional fitting when attack + decay + release exceeds layer duration;
- vibrato as frequency deviation in Hz and tremolo as non-negative amplitude modulation;
- harmonic partial aggregation with normalization;
- equal-power synthesis panning and stereo balance during clip processing;
- RBJ-style biquad low-pass/high-pass filters with validated cutoff/Q;
- finite-sample enforcement;
- peak normalization/limiter behavior;
- linear sample-rate conversion with explicit mono/stereo conversion semantics;
- playback-rate `speed` semantics: duration and pitch change together; it is not pitch-preserving time stretch.

Procedural pitch controls (`transpose`, `detune`, `pitch`) operate on synthesized sources. Existing WAV clips use `speed` for playback-rate pitch/duration changes; Phase 9 rejects procedural-only pitch overrides on decoded WAV input instead of silently ignoring them.

## Presets

All 39 advertised built-in presets are enumerated and rendered in `tests/phase9-presets.cjs`. The suite verifies:

- non-empty valid WAV output;
- finite PCM samples;
- bounded peak;
- non-silent RMS;
- no extreme DC offset;
- seeded repeatability for noise-bearing presets;
- different seeds alter stochastic output;
- zero-valued overrides are preserved;
- nested preset overrides merge without mutating the catalog;
- reusable caller configurations remain unchanged after synthesis.

Preset definitions returned to callers/tests are cloned so nested layer/filter/envelope mutation cannot corrupt the shared preset catalog.

## WAV contract

Phase 9's PCM16 WAV reader/writer validates RIFF rather than assuming fixed offsets.

Covered cases include:

- RIFF/WAVE signatures and declared RIFF bounds;
- chunk iteration independent of `fmt ` / `data` ordering;
- unknown chunks and odd-size padding;
- PCM format and 16-bit depth;
- mono/stereo channels;
- positive sample rate;
- byte-rate and block-alignment consistency;
- complete frame data;
- missing/truncated/oversized chunks;
- structured decode/resource-limit failures;
- exact signed PCM16 conversion boundaries;
- finite input samples before encoding.

## Additional hardening tests

Beyond the master-plan completion gates, Phase 9 includes:

- deterministic bounded fuzzing of oscillators, ADSR, filters, noise, and malformed WAV mutations;
- concurrent/reentrant seeded-render tests with memory stability checks;
- integration of generated procedural WAVs into the Phase-8 FFmpeg audio/video pipeline;
- a static audio self-challenge scan that rejects uncontrolled RNG use outside the centralized factory, unfinished markers, legacy retained-buffer paths, missing WAV hardening, and unguarded allocation sites.

## Benchmark evidence

Validated on GitHub Actions Ubuntu 24.04 / Node 22.23.2 in PR workflow run `34031521597` (the same suite also passed on Node 24 and Node 26).

Representative Phase-9 Node-22 measurements:

| Workload | 3-run wall time | Output/working bytes reported |
| --- | ---: | ---: |
| short simple sine | 9.99 ms | 24,044 B WAV |
| explosion preset | 9.59 ms | 44,144 B WAV |
| engine preset | 9.57 ms | 70,604 B WAV |
| 8-event sequence | 10.12 ms | 151,088 B WAV |
| overlapping composition | 15.01 ms | 64,044 B WAV |
| 10-second stereo synthesis | 98.20 ms | 1,764,044 B WAV |
| 48 kHz → 44.1 kHz resample | 6.04 ms | 1,764,000 B Float32 output |
| 5-second stereo WAV encode | 5.98 ms | 960,044 B WAV |
| 5-second stereo WAV decode | 3.23 ms | 1,920,000 B Float32 output |

The Phase-0 historical `audio-10-second` measurement was 109.795 ms on Node 20 Linux. Phase 9 measured 98.204 ms on Node 22.23.2, about 10.6% lower wall time. This comparison is directional only because the runtime/runner conditions differ. RSS delta was higher in the Phase-9 run, so Phase 9 does not claim a controlled memory-performance win from that cross-runtime comparison; the meaningful memory guarantee is the explicit pre-allocation budget and bounded transient architecture.

## Completion gates

Phase 9 is considered complete only when all of the following are true on the final PR head and again after merge to `main`:

- no unbounded procedural-audio allocation path remains;
- all 39 presets pass;
- DSP numerical regressions pass;
- deterministic seeded mode and locked goldens pass;
- strict WAV tests pass;
- fuzz, concurrency, and video-integration tests pass;
- package build, dual declarations, ESM/CJS packed-package install, prepack rebuild, production audit, and the historical Phase 1/3/4/5/6/7/8 suites remain green on Node 22/24/26.
