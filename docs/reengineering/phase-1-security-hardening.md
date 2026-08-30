# Phase 1 — P0 security incident remediation and critical execution hardening

## Phase

Phase 1 — P0 security incident remediation and critical execution hardening.

## Status

**COMPLETE for repository-controlled work.** All Phase 1 completion gates in the reengineering master plan are satisfied on the Phase 1 branch. External revocation/rotation of any Imgur credentials that were ever live remains an account-owner action and cannot be performed from repository access.

Phase 2 has not started.

## Baseline and scope

Phase 1 started from `main` commit `b4cfb598cfb779793e5e3e48faef5702cee8666a`, using the findings verified during Phase 0. The implementation intentionally stayed focused on embedded secrets, external-service configuration, FFmpeg/ffprobe execution, FFmpeg/filter text safety, temporary workspace isolation, cleanup, and security regression coverage.

The repository was searched beyond the originally known files. Unsafe or duplicated media execution was found in production video modules, canvas video-background fallback code, pipeline helpers, metadata/frame extractors, and space-shooter test/demo code. Those paths were migrated rather than leaving parallel exceptions.

## Work completed

### Credential and external-service remediation

- Removed committed Imgur credential/token fallback values from `lib-next/output/upload-imgur.ts`.
- `painter.output.url()` now requires explicit credentials or the documented `IMGUR_CLIENT_ID`, `IMGUR_CLIENT_SECRET`, `IMGUR_ACCESS_TOKEN`, and `IMGUR_REFRESH_TOKEN` environment variables.
- Missing credentials fail closed instead of falling back to package-owned values.
- Credential values are never included in the error message.
- Added `.env.example` with placeholders only.
- Updated public output types so the explicit credential object is represented by `PainterImgurCredentials`.
- Added automated current-tree secret-pattern scanning and regression tests for credential absence.
- Added website documentation for secure configuration and rotation guidance.

### Centralized process execution

Added `lib-next/video/process-runner.ts` as the sole Apexify.js FFmpeg/ffprobe process boundary.

The runner:

- uses `child_process.spawn`;
- accepts executable + argv arrays only;
- always sets `shell: false`;
- validates executable/argument tokens for NUL bytes;
- supports timeout and `AbortSignal` cancellation;
- bounds stdout and stderr capture;
- returns structured process results;
- throws structured `MediaProcessError` failures;
- supports custom executable paths;
- supports stderr streaming for FFmpeg progress parsing;
- redacts query strings/fragments from URL-like stderr before retaining it in errors.

`lib-next/video/ffmpeg-session.ts` now provides the shared session over this runner and supports:

- `APEXIFY_FFMPEG_PATH`;
- `APEXIFY_FFPROBE_PATH`;
- `APEXIFY_TEMP_DIR`;
- explicit programmatic session options.

Every repository-controlled FFmpeg/ffprobe execution path discovered during Phase 1 was migrated to this runner.

### FFmpeg/filter input hardening

- Removed shell-string FFmpeg/ffprobe command construction.
- Removed shell-pipeline scene parsing (`grep`/`awk`/`sed` style processing); scene timestamps are parsed from FFmpeg stderr in JavaScript.
- Added safe concat-manifest handling using Apexify-generated staged filenames instead of interpolating arbitrary user paths into concat syntax.
- Deprecated text-overlay compatibility paths render user text to PNG through the canvas layer before compositing instead of inserting arbitrary text into FFmpeg `drawtext` expressions.
- Advanced custom filter expressions are validated against a restricted supported syntax.
- LUT inputs are staged/normalized before being referenced by filter graphs.
- User-controlled paths remain argv elements rather than shell fragments.

### Temporary filesystem hardening

Added `lib-next/video/temp-workspace.ts`.

Each operation requiring ephemeral media state now uses an isolated `fs.mkdtemp()` directory under the OS temp directory or configured `APEXIFY_TEMP_DIR`.

The workspace abstraction:

- creates per-operation unique directories;
- prevents path escape from the workspace;
- cleans recursively in `finally` paths;
- is tested for success, failure, cancellation-related cleanup paths, and concurrent isolation;
- retains temp files only through an explicit debug option.

The previous cwd/shared `.temp-frames` video-background fallback was removed.

### Duplicate/unsafe implementation cleanup

Superseded execution logic was removed from or replaced in:

- `lib-next/video/ffmpeg-session.ts`
- `lib-next/video/ffprobe-metadata.ts`
- `lib-next/video/video-input-resolve.ts`
- `lib-next/video/extract-frame.ts`
- `lib-next/video/extract-interval-frames.ts`
- `lib-next/video/extract-all-frames.ts`
- `lib-next/video/video-stack.ts`
- `lib-next/video/video-helpers.ts`
- `lib-next/video/video-creator.ts`
- `lib-next/video/video-pipeline-render.ts`
- `lib-next/video/video-text-overlay-filters.ts`
- `lib-next/canvas/canvas-creator.ts`
- `tests/space-shooter-video/space-shooter-video.ts`
- `tests/space-shooter-video/split-output.ts`

The private duplicate video resolver and independent `VideoCreator` process boundary were removed. The remaining large `video-helpers.ts` file is still an architectural hotspot and is owned by later modularity/video phases, but it no longer owns a separate unsafe process/temp implementation.

## Problems discovered

1. The initial repository security scan found unsafe process execution in test/demo video code as well as production code.
2. After those paths were migrated, TypeScript compilation exposed one stale unused `CanvasResults` import in the rewritten `VideoCreator` router.
3. Fresh Node 20 installation continues to report one high-severity production dependency advisory. Current external advisory data identifies the resolved `sharp@0.34.5` / bundled libvips line as affected; the patched Sharp 0.35.x line requires Node >=20.9.0 and intentionally drops Node 18. The master plan assigns the supported Node-baseline decision to Phase 2, so this dependency upgrade is explicitly owned by Phase 2 rather than silently introducing a runtime-baseline breaking change in Phase 1.
4. Any previously committed Imgur credentials may remain present in immutable Git history/package history. Current-tree removal does not revoke an external credential.

## What went wrong

The first version of the Phase 1 scanner correctly failed because migration had focused on library code and two space-shooter integration/demo files still invoked media processes through unsafe legacy execution. The scanner was not weakened or scoped down; those call sites were migrated to the same `MediaProcessRunner` used by production code.

The next run reached compilation and failed because `lib-next/video/video-creator.ts` retained an unused `CanvasResults` type import after the router was simplified. The import was removed in commit `f68278a35516a9d55833065ebfe32eaeadfa438f`.

A subsequent Phase 1 security workflow run (`33296223652`) passed source scan, build, built-artifact scan, real FFmpeg security regression tests, and `npm pack --dry-run`.

## How fixed

- Expanded scanning to production source, tests/scripts, examples and generated distribution output instead of whitelisting test/demo exceptions.
- Migrated all discovered FFmpeg/ffprobe process calls to argv-based `MediaProcessRunner` execution.
- Replaced shared/manual temporary files with `TempWorkspace` and `finally` cleanup.
- Reworked concat, text-overlay and filter-input handling so hostile paths/text are not shell-interpolated.
- Removed the stale TypeScript import and reran the complete security workflow.
- Added website documentation for the new safe configuration contract.

## Tests added/updated

Added `tests/security-phase1.cjs` covering:

- shell-metacharacter filenames;
- semicolons;
- single and double quotes;
- spaces;
- Unicode;
- `$()`-style payload text;
- wildcard-like input;
- marker-file checks proving arguments are not executed by a shell;
- argv fidelity;
- process timeout;
- process abort;
- stdout size enforcement;
- URL query/fragment redaction;
- concurrent workspace isolation;
- workspace cleanup on success;
- workspace cleanup on thrown failure;
- hostile concat filenames;
- custom-filter rejection;
- Imgur credential absence/no fallback;
- real FFmpeg execution with hostile filenames;
- FFmpeg failure-path cleanup.

Added `scripts/phase1-security-scan.cjs` to reject:

- unauthorized `child_process` use;
- FFmpeg/ffprobe `exec`/shell-string execution;
- legacy temp-frame implementations;
- embedded Imgur fallback material;
- secret-shaped Imgur values in relevant current repository files;
- unsafe built-artifact regressions.

Added `.github/workflows/phase-1-security.yml` to gate the migration on Node 20 with real FFmpeg/ffprobe installed.

## Verification performed

Verified in GitHub Actions workflow run `33296223652` on Ubuntu 24.04 / Node 20.20.2 / FFmpeg 6.1.1:

| Gate | Result |
|---|---|
| install package graph | PASS |
| source security scan | PASS |
| TypeScript ESM/CJS build | PASS |
| source + built-artifact security scan | PASS |
| Phase 1 security regression suite | PASS |
| real FFmpeg hostile-path tests | PASS (part of security suite) |
| package dry run | PASS |

The workflow emitted `security-phase1: all security regression tests passed` and uploaded packaging evidence.

The documentation changes were made in `EIAS79/Apexify.js-Documentation` under a dedicated Phase 1 documentation branch and cover FFmpeg runtime security plus Imgur credential configuration.

## Performance impact

Phase 1 was not a performance phase. The security architecture introduces small bounded overhead from:

- per-operation `mkdtemp()` creation/removal;
- staging arbitrary concat/LUT inputs under generated workspace names;
- JavaScript-side parsing where shell pipelines previously parsed output.

It removes the shell process layer from media execution itself. No Phase 0 benchmark was rerun because Phase 1 completion gates do not require a performance target and the relevant changes are process/security boundary changes rather than the representative raster/GIF/audio workloads. Performance optimization remains owned by later phases.

## Compatibility impact

- `painter.output.url()` no longer works without caller-owned Imgur credentials. This is an intentional security compatibility break: preserving the historical fallback would preserve exposed secret material.
- Credentials can be passed explicitly or through the documented four `IMGUR_*` environment variables.
- FFmpeg/ffprobe custom binary paths can be configured through `APEXIFY_FFMPEG_PATH` and `APEXIFY_FFPROBE_PATH`.
- Temporary media root can be configured through `APEXIFY_TEMP_DIR`.
- Hostile/custom FFmpeg filter expressions outside the supported restricted syntax now fail validation instead of being forwarded unchecked.
- Filenames containing shell metacharacters no longer require shell quoting because paths are argv entries.
- The formal Node engine declaration is unchanged in Phase 1; correcting the already-false `>=16` metadata remains Phase 2 work.

## Files removed

No entire tracked file was removed in Phase 1.

Superseded implementations inside existing files were deleted, including shell-exec process code, duplicate video-source/process helpers, shell-pipeline parsing, raw drawtext interpolation paths, and cwd/shared temp-frame handling. The Phase 1 diff removes substantially more legacy code than it adds in the largest migrated video modules.

## Files added

Package repository:

- `.env.example`
- `.github/workflows/phase-1-security.yml`
- `lib-next/video/process-runner.ts`
- `lib-next/video/temp-workspace.ts`
- `lib-next/video/safe-concat.ts`
- `scripts/phase1-security-scan.cjs`
- `tests/security-phase1.cjs`
- `docs/reengineering/phase-1-security-hardening.md`

Documentation repository:

- `content/docs/03-feature-guides/video-ffmpeg/09-security-runtime-configuration.mdx`
- `content/docs/03-feature-guides/batch-save-output/03-imgur-output-security.mdx`

## Not completed

Two items are intentionally outside repository-controlled Phase 1 completion:

1. External Imgur credential revocation/rotation cannot be performed without the account owner's external-service access.
2. The Sharp 0.34.5 high-severity dependency advisory is not upgraded in Phase 1 because the patched 0.35.x line changes the Node runtime floor. The master plan explicitly assigns the supported Node baseline and dependency/runtime reconciliation to Phase 2.

Neither item invalidates the five explicit Phase 1 completion gates: no unsafe FFmpeg/ffprobe exec strings, no committed secret fallback, centralized process execution, isolated tested temp lifecycle, and passing security regressions.

## Why not completed

### External credential rotation

Repository access can remove exposed values and prevent recurrence but cannot revoke credentials in the Imgur account. If the historical values were live, the account owner must revoke/rotate them and update deployment secrets.

### Sharp advisory

Sharp 0.35.x is a runtime-baseline change (Node >=20.9.0). Phase 2 section 2.1 explicitly requires deciding the supported Node baseline from Sharp and other dependencies and then updating engines/docs/CI together. Upgrading Sharp alone in Phase 1 would knowingly make the package metadata even more inconsistent before the Phase 2 compatibility work.

## Alternative solution

For external credentials, an account owner can revoke all historical Imgur tokens/credentials and provision a fresh application/token set in a secret manager, then verify `painter.output.url()` using only the new values.

For the Sharp advisory, the preferred Phase 2 solution is to move Apexify.js to a modern supported Node baseline and upgrade Sharp to a non-vulnerable 0.35.x release, then run the full raster regression/package matrix. A temporary alternative would be a narrowly verified patched libvips override, but that risks ABI/version mismatch and is not preferred over the planned runtime-baseline upgrade.

## Remaining risk

Phase 1 removes the immediate embedded-secret and shell/process/temp hazards, but Apexify.js is not yet safe for arbitrary untrusted server input as a whole. Remaining security work includes:

- centralized SSRF/DNS/redirect policy for remote media;
- download byte ceilings and decompression/image pixel limits;
- scene/resource budgets;
- bounded caches and network concurrency;
- GIF/video/audio duration/frame/memory controls;
- dependency/runtime baseline remediation including Sharp;
- broader structured runtime security policy.

Those risks are assigned to later phases in the master plan and are reflected in the score rather than hidden.

## Completion gate checklist

- [x] No `child_process.exec` for FFmpeg/ffprobe command strings.
- [x] No committed secret fallback in the current source/build surface.
- [x] All discovered FFmpeg/ffprobe process invocations use the centralized safe runner.
- [x] Temp workspace lifecycle is isolated and tested.
- [x] Security regression tests pass with real FFmpeg available.
- [x] Relevant public documentation updated.
- [x] Package build and `npm pack --dry-run` pass.

## Score update

Phase 0 baseline scores are retained for categories this phase did not materially address. Scores are deliberately conservative because SSRF/resource controls, package correctness, broad CI and dependency/runtime alignment are still pending.

| Category | Phase 0 | After Phase 1 | Rationale |
|---|---:|---:|---|
| Architecture / modularity | 5.1 | **5.8** | one authoritative media process boundary and temp workspace; giant modules remain |
| Public API organization | 5.7 | **5.8** | explicit Imgur credential contract/types; broader API issues remain |
| TypeScript design | 6.0 | **6.2** | structured process/config types added; existing `any`/declaration issues remain |
| Feature completeness | 5.4 | **5.4** | not a feature-completion phase |
| Runtime resilience | 4.2 | **5.5** | timeout/abort/bounded process output/finally cleanup/structured process errors |
| Security hardening | 2.2 | **6.3** | embedded secrets and shell execution removed; temp isolation done; SSRF/resource/dependency risk remains |
| Performance | 5.3 | **5.3** | no performance target in this phase |
| Memory efficiency | 4.3 | **4.4** | process output now bounded; broad media/resource bounds remain |
| Testing | 2.0 | **3.8** | dedicated hostile-input security integration suite added; broad suite still small |
| CI / release engineering | 2.4 | **3.8** | real FFmpeg security gate and artifact scan added; full matrix/release work remains |
| Documentation breadth | 8.0 | **8.2** | added security/runtime and Imgur configuration guidance |
| Documentation accuracy | 5.6 | **6.2** | public configuration docs synchronized with current Phase 1 behavior |
| Maintainability | 4.8 | **5.5** | duplicate execution/temp implementations removed; video helper remains large |
| Production trusted input | 4.8 | **5.8** | safer process/temp failure behavior |
| Production untrusted server input | 1.9 | **3.2** | command injection/temp hazards reduced, but SSRF/resource exhaustion remain significant |
| **Overall** | **4.6** | **5.3** | meaningful P0 hardening without overstating later-phase work |

Phase 1 therefore materially raises the security/process baseline but does not approach the final 9+/10 target until later security, runtime, packaging, resource-control, testing and documentation phases are complete.
