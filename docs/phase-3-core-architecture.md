# Phase 3 core architecture

Phase 3 establishes authoritative shared infrastructure for runtime policy, media acquisition, caching, diagnostics, process integration, temporary workspaces, and errors. Domain code depends on these modules rather than implementing parallel network, cache, process-policy, or source-resolution behavior.

## Dependency direction

```text
image / canvas / gif / video / output / general utilities / version services
                      |
          +-----------+-----------+
          |                       |
          v                       v
     media/source            video session
    /           \            /           \
media/cache   media/remote-fetch   process-runner  temp-workspace
                   |                   |              |
                   v                   +------+-------+
           media/network-policy              |
                   |                          v
                   +----------------------> runtime
```

`runtime` does not import high-level rendering domains. `media` does not import image/canvas/GIF/video domains. The process runner imports only the central runtime/error/network-redaction infrastructure, not high-level video operations.

## Runtime configuration

The process-wide runtime policy is configured with `configureApexifyRuntime()` and restored with `resetApexifyRuntimeConfig()`. Configuration sections are merged with the current resolved policy, so changing one section does not reset unrelated settings.

The runtime contains:

- `network`: protocol policy, timeout, redirect/retry policy, trusted-network allowlist, and user agent;
- `limits`: canvas/pixel, remote-byte, decoded-image, GIF, audio/video, and concurrency budgets;
- `cache`: enablement, TTL, maximum entries, and maximum bytes;
- `ffmpeg`: optional executable paths plus process/probe timeouts and stdout/stderr byte ceilings;
- `temp`: optional workspace root and debug-only retention policy;
- `diagnostics`: an optional event handler used instead of unconditional library warnings/errors.

FFmpeg session options remain supported as explicit per-session overrides. Otherwise FFmpeg/ffprobe paths and process bounds inherit the runtime policy, with environment variables retained as compatibility fallbacks for executable/temp locations. Temporary workspaces inherit the central `temp` policy and still use an isolated `fs.mkdtemp()` directory per operation.

Trusted local/private network access is disabled by default. Enabling it requires both `trustedNetworkAccess: true` and an explicit `allowedHosts` entry.

## Render/resource limits

`RenderLimits` is the authoritative cross-domain budget model. Phase 3 directly enforces limits owned by infrastructure migrated in this phase:

- canvas dimensions and total pixels at migrated allocation boundaries;
- remote image/video response bytes;
- decoded-image pixel count before native canvas decode;
- GIF dimensions/frame count/aggregate resource cost in the GIF infrastructure;
- global remote-fetch concurrency.

The model also defines scene/text/audio/video-domain budgets that later domain validation can apply consistently rather than inventing parallel constants.

## Remote network policy

All library-owned HTTP(S) transfers use `media/remote-fetch.ts`; arbitrary media sources reach it through `media/source.ts`. Fixed-service transfers such as remove.bg also use the bounded transport, so no direct `fetch()` or Axios transport remains in `lib-next`.

The policy:

- accepts only configured HTTP(S) protocols;
- rejects URL-embedded credentials;
- resolves DNS before connecting;
- rejects loopback, private, link-local, multicast, documentation, benchmarking, translation/tunneling, and other reserved IPv4/IPv6 ranges by default;
- detects and classifies IPv4-mapped IPv6 addresses;
- pins the HTTP connection lookup to the validated DNS result, preventing an uncontrolled second lookup after validation;
- revalidates every redirect target and caps redirects;
- enforces response byte limits from both `Content-Length` and streamed bytes;
- uses a hard wall-clock deadline plus socket-idle timeout, so trickle responses cannot evade timeout enforcement;
- supports `AbortSignal` cancellation both in-flight and while queued behind the concurrency gate;
- retries transient GET failures with bounded exponential delay and jitter;
- honors `Retry-After` where configured;
- defaults non-idempotent POST requests to one attempt unless the caller explicitly overrides it;
- redacts credentials, query strings, and fragments from URL-bearing diagnostics/errors;
- bounds concurrent remote requests globally;
- requires explicit trusted-network opt-in and host allowlisting before private/local targets are accepted.

## Media sources and decoding

`media/source.ts` is the authoritative source normalizer/resolver for:

- `Buffer`;
- `Uint8Array`;
- filesystem path strings;
- `file:` URL objects;
- base64 `data:image/...` URLs;
- HTTP(S) URLs.

Transport policy and source normalization are separate from raster decoding. `image/image-properties.ts` is the shared raster decode/cache boundary: it obtains bytes/path data through `media/source`, checks decoded pixel metadata through Sharp, and only then hands a normalized PNG buffer to the native canvas loader.

Image utilities, masks, gradient blending, line textures, patterns, GIF creation/animation frames, compression/output, stitching/collage, background rendering, update checks, and video input materialization consume shared media/network infrastructure rather than implementing independent source download/decode paths.

Remote cache hits are revalidated against the current network policy, so data fetched under a temporary trusted allowlist cannot bypass a later stricter SSRF configuration. Cache keys include media kind and effective byte ceiling, preventing a permissive fetch from satisfying a later stricter byte policy. Header-dependent remote requests bypass the shared representation cache.

## Cache

`BoundedCache` is the single cache implementation. It provides TTL and LRU eviction, entry and byte bounds, clear/enable/disable controls, failed-factory eviction, and statistics. Remote source bytes are accounted by actual `Buffer.byteLength`. Decoded image entries are accounted using an RGBA memory estimate (`width × height × 4`).

## Errors, process integration, and diagnostics

Cross-cutting failures use the Apexify error hierarchy:

- `ApexifyError`;
- `ApexifyInputError`;
- `ApexifyConfigError`;
- `ApexifyResourceLimitError`;
- `ApexifyRemoteFetchError`;
- `ApexifyDecodeError`;
- `ApexifyProcessError`;
- `ApexifyExternalServiceError`.

Errors preserve `cause` while exposing safe structured fields. `MediaProcessError` remains as a compatibility subtype of `ApexifyProcessError`; process stderr uses the authoritative network URL redactor before it is exposed. Optional diagnostic events are delivered through the configured diagnostics handler. Library internals do not emit arbitrary `console.error`/`console.warn` diagnostics.

## Dependency cleanup

Apexify source no longer directly imports Axios, and Axios is not a direct package dependency. The refreshed lockfile still contains Axios transitively because the retained `imgur` SDK depends on it; that transitive dependency does not constitute an Apexify network bypass.

## Verification

`tests/phase3-runtime.cjs` uses deterministic local HTTP servers and local files to cover:

- IPv4/IPv6/IPv4-mapped classification;
- DNS/localhost default blocking and explicit trusted allowlisting;
- protocol rejection, redirect target revalidation, and redirect caps;
- `Content-Length` and streaming byte limits;
- idle and hard wall-clock timeouts;
- in-flight and queued abort behavior;
- retries, bounded `Retry-After`, and diagnostics;
- URL redaction and structured error safety;
- bounded concurrency;
- Buffer/Uint8Array/data/path/file-URL source normalization;
- LRU/TTL/max-entry/max-byte/failure eviction/clear/enable/disable/cache statistics;
- cache policy revalidation and byte-policy isolation;
- runtime defaults, section merge/inheritance, and invalid-value rejection;
- canvas/GIF resource-limit helpers.

`tests/phase3-post.cjs` covers bounded POST behavior, 303 method conversion, and safe default POST retry semantics for fixed external-service transport.

`scripts/phase3-bypass-scan.cjs` fails CI if unmanaged Axios, direct `fetch`, raw HTTP clients outside the central transport, arbitrary library console warnings/errors, duplicate URL-redaction helpers, obsolete resolver references, known unmanaged cache maps, obvious direct caller sources passed to canvas `loadImage`, or a direct Axios manifest dependency return.

The Phase 3 test fixture is bundled privately into `node_modules/.cache`; internal runtime/media modules are not added as package export subpaths merely to make tests possible.
