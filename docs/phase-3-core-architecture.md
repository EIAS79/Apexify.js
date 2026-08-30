# Phase 3 core architecture

Phase 3 establishes authoritative shared infrastructure for runtime policy, media acquisition, caching, diagnostics, and errors. Domain code must depend on these modules rather than implementing parallel network or cache behavior.

## Dependency direction

```text
image / canvas / gif / video / output / general utilities / version services
                      |
                      v
                 media/source
                /           \
         media/cache   media/remote-fetch
                            |
                            v
                    media/network-policy
                            |
                            v
                         runtime
```

`runtime` and `media` do not import high-level rendering domains.

## Runtime configuration

The process-wide runtime policy is configured with `configureApexifyRuntime()` and restored with `resetApexifyRuntimeConfig()`. Configuration sections are merged with the current resolved policy, so changing one section does not reset unrelated settings.

The runtime contains:

- `network`: protocol policy, timeout, redirect and retry policy, trusted-network allowlist, user agent;
- `limits`: canvas/pixel, remote-byte, decoded-image, GIF, audio/video, and concurrency budgets;
- `cache`: enablement, TTL, maximum entries, and maximum bytes;
- `diagnostics`: an optional event handler used instead of unconditional library logging.

Trusted local/private network access is disabled by default. Enabling it requires both `trustedNetworkAccess: true` and an explicit `allowedHosts` entry.

## Remote network policy

All library-owned HTTP(S) transfers use `media/remote-fetch.ts`; arbitrary media sources reach it through `media/source.ts`. The same transport also supports bounded fixed-service POST requests, so no direct `fetch()` or Axios transport remains in `lib-next`.

The policy:

- accepts only configured HTTP(S) protocols;
- rejects URL-embedded credentials;
- resolves DNS before connecting;
- rejects loopback, private, link-local, multicast, documentation, benchmarking, translation/tunneling, and other reserved IPv4/IPv6 ranges by default;
- pins the HTTP connection lookup to the validated DNS result;
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

## Media sources

`media/source.ts` is the authoritative resolver for:

- `Buffer`;
- local filesystem paths;
- base64 `data:image/...` URLs;
- HTTP(S) media.

Image utilities, masks, line textures, GIF creation and animation frames, compression/output, background rendering, update checks, and video input materialization consume shared media/network infrastructure rather than implementing their own source download logic.

Remote cache hits are revalidated against the current network policy, so data fetched under a temporary trusted allowlist cannot bypass a later stricter SSRF configuration. Cache keys include media kind and effective byte ceiling, preventing a permissive fetch from satisfying a later stricter byte policy. Header-dependent remote requests bypass the shared representation cache.

## Cache

`BoundedCache` is the single cache implementation. It provides TTL and LRU eviction, entry and byte bounds, clear/disable controls, failed-factory eviction, and statistics. Remote source bytes are accounted by actual `Buffer.byteLength`. Decoded image entries are accounted using an RGBA memory estimate (`width × height × 4`).

## Errors and diagnostics

Cross-cutting failures use the Apexify error hierarchy:

- `ApexifyError`;
- `ApexifyInputError`;
- `ApexifyConfigError`;
- `ApexifyResourceLimitError`;
- `ApexifyRemoteFetchError`;
- `ApexifyDecodeError`;
- `ApexifyProcessError`;
- `ApexifyExternalServiceError`.

Errors preserve `cause` while exposing safe structured fields. Optional diagnostic events are delivered through the configured diagnostics handler; library internals do not emit arbitrary `console.error`.

## Verification

`tests/phase3-runtime.cjs` uses a deterministic local HTTP server under explicit trusted-host configuration to cover:

- IPv4 and IPv6 classification;
- default SSRF blocking and trusted allowlisting;
- redirect target revalidation and redirect caps;
- response byte limits;
- idle and hard wall-clock timeouts;
- in-flight and queued abort behavior;
- retries, jitter configuration, and `Retry-After` handling;
- URL redaction;
- bounded concurrency;
- LRU/TTL/failure eviction/clear/disable/cache statistics;
- cache policy revalidation and byte-policy isolation;
- runtime configuration inheritance;
- canvas/GIF resource-limit helpers.

`scripts/phase3-bypass-scan.cjs` fails CI if unmanaged Axios, direct `fetch`, raw HTTP clients outside the central transport, arbitrary library `console.error`, obsolete resolver references, known unmanaged cache maps, obvious direct caller sources passed to canvas `loadImage`, or a direct Axios manifest dependency return.

The Phase 3 test fixture is bundled privately into `node_modules/.cache`; internal runtime/media modules are not added as package export subpaths merely to make tests possible.
