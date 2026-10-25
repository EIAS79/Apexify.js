# Apexify.js S20 — CreateCanvas safe engine subset, owner approval

Status: ISOLATED REVIEW CANDIDATE ONLY. No Workspace installation, repin, push, merge, deployment or video decoding.

Engine repository: EIAS79/Apexify.js
Branch: codex/createcanvas-safe-subset-s20
Base parent: 379a5248f09ed39c1b1734fe104b6bd73a77857f
Reference S19 commit (preserved, untouched): 3bca54de95e578face6cfd7af8c57ea422b384b6
Accepted Workspace S18: 472ee4e598091139f2191619ad517ac6338b3b5a, 167/167 Workspace-ready strict FULL (not recertified or changed in this candidate).

## Exact four paths and source changes

| Public path | Original pinned behavior | S20 candidate behavior | Compatibility |
|---|---|---|---|
| canvas.patternBg.repeat | Accepts procedural mode, but paints complete viewport regardless of repeat value | 12 procedural types honor repeat, repeat-x, repeat-y and no-repeat using bounded local clipping | Omitted/explicit repeat preserves pinned pixels. Custom image pattern and its own repeat handling untouched. Shared renderer also used by Chart. |
| canvas.bgLayers.pattern.repeat | Same procedural repeat ineffectiveness in type=presetPattern, not the separate image-tile layer | Identical directional/no-repeat clipping within typed ordered layer | Omitted repeat maintains identical pixels. Layer order, opacity, blend and schema unaffected. Chart may also render these layers. |
| canvas.shadow.borderRadius | Canvas caller-supplied/root radius masked explicit shadow borderRadius | Explicit shadow borderRadius wins; otherwise inherit caller radius; otherwise zero | Omitted shadow override unchanged. Supports nonnegative finite numeric or circular. Image shares shadow helper but uses a separate first overload. |
| canvas.shadow.borderPosition | Deprecated alias accepted but masked behind caller/root position | roundedCorners wins, otherwise explicit deprecated shadow borderPosition wins, otherwise inherited caller/root, otherwise all | Alias remains deprecated. Omitted shadow alias unchanged; Image first overload logic unchanged. |

## Precise procedural period contract

In the pattern's original local viewport coordinates, width W and height H, let size default 20, spacing default 10, and period = min(max(size + spacing, 1), max(W,H)).
- repeat / omitted: full W x H viewport, original bytes unchanged.
- repeat-x: W x min(H,period).
- repeat-y: min(W,period) x H.
- no-repeat: min(W,period) x min(H,period).

Clip is applied before procedural rotation, scale and offsets. All twelve procedural named types are affected. Type custom (image-backed) is excluded. This is an intentional fix for previously ineffective accepted enum choices. Existing consumers selecting explicit non-repeat values will see different pixels; Chart is also a consumer. Owner must accept this definition before promotion.

## Shadow precedence and risk

Canvas shadow explicitly supplied borderRadius / borderPosition now take priority over root values; that intentionally changes previously masked explicit-value rasters. Missing explicit shadow override follows original caller/root behavior. Shadow roundedCorners remains higher priority than its deprecated borderPosition alias. Image's (ctx,rect,shadow) call is unchanged by source hunk; tested with direct shared render and actual public ApexPainter.createImage.

## Deliberately excluded

No code translating pattern.gradient.angle into rotate; no conic angle -> startAngle fallback; no gradient union changes; no engine dependency or package manifest changes; no Canvas 2D substitute rendering; no customBg.filters.radius semantics; no video decoding, FFmpeg, filesystem or URL privileges; no painter-level resolveAssetRefs change; no Workspace code/Inspector/Graph changes. Deferred S19 gradient-angle work remains preserved only on the original S19 branch and recovery.

## Native evidence and tests

- tests/canvas-s20-safe-subset.test.ts: 7/7 PASS, including all 12 procedural types in Canvas root + ordered layers, four repeat modes = 96 native render variants; 24 exact omitted/default matches; exact pinned default raster hashes; shadow radius/position/precedence + invalid input rejection; native Chart shared renderer; real Image public raster and shared helper; four cases verifying unapproved gradient-angle behavior remains unchanged.
- S20_NATIVE_SUBSET_FINAL.txt: exact native run, pass 7 fail 0.
- S20_ENGINE_UNIT_SECURITY_PHASE14.txt: 32/32 existing engine unit, process/security and Phase14 tests.
- S20_ENGINE_GOLDEN_IMAGES.txt: 5/5 existing golden images including Chart and scene composition.
- S20_PUBLIC_API_COMPATIBILITY.txt: public compatibility command exit 0.
- S20_ENGINE_BUILD_RETRY.txt: exact TypeScript + CommonJS/ESM + dual declaration build exit 0.
- S20_ENGINE_FIXTURE_BUILD.txt: generated local test fixtures exit 0.
- S20_PINNED_BEHAVIOR_COMPATIBILITY.json: source-backed compatibility evidence IDs and owner decisions.
- A first build wrapper was interrupted by PowerShell stderr handling; its log is preserved. Subsequent controlled redirected build PASSED without changing code.

## Integration approval conditions

This candidate is review-ready but NOT authorized to be installed:
1. Owner accepts the specified procedural period/clip contract, the intentional explicitly selected output changes for Canvas and Chart, and the shadow precedence/legacy alias behavior.
2. Owner checks Image/Chart downstream golden fixtures against the exact candidate SHA, alongside other engine consumers.
3. Separate owner authorization to create an isolated Documentation Workspace pin test branch with this engine candidate; do not change S18 baseline.
4. In that integration branch re-run 167 existing strict FULL regressions and prove each of four newly effective paths through actual native pixels, generated public-v6 Code, Code-to-Visual, Inspector, typed Graph, Undo/Redo, save/reload/export, real Chromium and security; record new evidence IDs without blanket promotion.
5. Require separate owner authorization for merge, remote push, engine repin or deployment. Video security RFC and other native defects remain independent. Production G09 NO-GO persists.

No claim of complete 208-path FULL certification or production readiness is made.