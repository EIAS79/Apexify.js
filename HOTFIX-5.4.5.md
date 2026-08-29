# Apexify.js 5.4.5 — remote image hotfix

**Recorded:** 2026-08-29  
**Package version remains:** `5.4.5`

This maintenance update addresses intermittent remote-image failures reported in long-running bot/server deployments.

## Fixed

- **Rejected image-cache promises are evicted.** A temporary CDN/network failure no longer leaves the exact image source permanently broken until the process restarts.
- **Remote image requests use a bounded timeout and retries.** HTTP(S) image loads use a 15 second timeout and up to 3 attempts for transient `408`, `425`, `429`, `500`, `502`, `503`, and `504` responses.
- **Remote errors preserve useful context.** HTTP status/status text and network timeout/error codes are retained instead of collapsing all failures into a generic `Failed to load image` message.
- **Empty remote responses are rejected explicitly** before Sharp/canvas decoding.
- **Expired Discord attachment URLs are detected.** Signed Discord CDN URLs whose `ex` timestamp is already expired fail immediately with guidance to obtain a fresh URL. Expired signatures are not retried.
- **`painter.image.resize` and `painter.image.imgConverter`** now use the same resilient URL/data-URL/path/`Buffer` source resolver.
- **Custom canvas backgrounds are rendered once.** The duplicate `customBackground()` draw was removed; `customBg.opacity` is combined with canvas opacity and filtered backgrounds are processed on an isolated temporary canvas before composition.

## Regression coverage

`tests/remote-image-hotfix-smoke.ts` covers:

- transient HTTP failure followed by successful retry;
- a fully failed cached request followed by a successful second render, proving the rejected cache entry was evicted;
- Discord signed-URL expiry detection.

## Operational note: Discord attachments

Discord attachment URLs with signed query parameters such as `ex`, `is`, and `hm` are not permanent. Once the `ex` timestamp passes, Apexify.js cannot regenerate the Discord signature. Obtain a fresh attachment URL or use durable object storage/CDN hosting for persisted assets.

## npm publication constraint

npm registry versions are immutable. If `apexify.js@5.4.5` has already been published, npm will not allow its tarball to be replaced with these changes under the exact same semantic version. The source and documentation can remain recorded under the **5.4.5 hotfix** line, but distributing the changed package through npm requires a distinct publishable version (for example `5.4.5-hotfix.1` or `5.4.6`).
