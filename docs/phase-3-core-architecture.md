# Phase 3 core architecture

Phase 3 establishes authoritative shared infrastructure for runtime policy, media acquisition, caching, diagnostics, and errors. Domain code must depend on these modules rather than implementing parallel network or cache behavior.

## Dependency direction

```text
image / canvas / gif / video / output / general utilities
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

## Remote media policy

All arbitrary HTTP(S) media acquisition must use `media/remote-fetch.ts` through `media/source.ts`.

The policy:

- accepts only configured HTTP(S) protocols;
- rejects URL-embedded credentials;
- resolves DNS before connecting;
- rejects loopback, private, link-local, multicast, documentation, benchmark, and other reserved IPv4/IPv6 ranges by default;
- pins the HTTP connection lookup to the validated DNS result;
- revalidates every redirect target and caps redirects;
- enforces response byte limits before and during streaming;
- supports timeout and `AbortSignal` cancellation;
- retries transient failures with bounded exponential delay and jitter;
- honors `Retry-After` where configured;
- redacts credentials, query strings, and fragments from URL-bearing diagnostics/errors;
- bounds concurrent remote requests globally.

The only intentional direct `fetch()` remaining in library source is the fixed `https://api.remove.bg/v1.0/removebg` external-service POST. The endpoint is not selected by the caller and Apexify does not fetch the caller-provided image URL in that path. `scripts/phase3-bypass-scan.cjs` enforces this exception explicitly.

## Media sources

`media/source.ts` is the authoritative resolver for:

- `Buffer`;
- local filesystem paths;
- base64 `data:image/...` URLs;
- HTTP(S) media.

Image, GIF, compression/output, general image utilities, background rendering (through the decoded image loader), and video input resolution consume this shared path.

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

Errors preserve `cause` while exposing safe structured fields. Optional diagnostic events are delivered through the configured diagnostics handler; library internals must not emit arbitrary `console.error`.

## Verification

`tests/phase3-runtime.cjs` uses a deterministic local HTTP server to cover IP classification, default SSRF blocking, explicit trusted allowlisting, redirect revalidation, redirect caps, byte limits, timeout, abort, retries, `Retry-After`, URL redaction, bounded concurrency, cache LRU/TTL/failure behavior, cache controls/statistics, config inheritance, and resource-limit helpers.

`scripts/phase3-bypass-scan.cjs` fails CI if unmanaged `axios`, arbitrary `fetch`, raw HTTP clients outside the central remote fetcher, library `console.error`, legacy resolver references, or known unmanaged cache maps return to `lib-next`.
