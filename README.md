# Apexify.js

<div align="center">

![Apexify.js banner — charts, canvas, TypeScript](Apex-Banner.png)

**Programmatic graphics and media generation for Node.js.**

[Documentation](https://apexifyjs.vercel.app/docs#00-start-here) · [Gallery](https://apexifyjs.vercel.app/gallery) · [npm](https://www.npmjs.com/package/apexify.js)

</div>

Apexify.js 6 is a TypeScript-first, server-side Node.js library for canvas/image composition, styled text, charts, GIFs, FFmpeg-backed video workflows, procedural WAV/SFX generation, scenes, templates, assets, plugins, and batch/output utilities.

It is a **Node/server package**. Browser-native, React, Next.js, Render-IR, AI-assistant, and distributed-renderer APIs are not part of the current 6.0.0 package surface.

## Install

```bash
npm install apexify.js
```

### Runtime requirements

- **Node.js:** 22.x, 24.x, or 26.x
- **npm:** 10 or newer; the repository/release toolchain is pinned to npm 11.19.1
- **FFmpeg + ffprobe:** required only for video/FFmpeg operations
- **TypeScript:** optional; declarations ship with the package

Apexify.js is a dual ESM/CommonJS package:

```js
// ESM
import { ApexPainter } from "apexify.js";

// CommonJS
const { ApexPainter } = require("apexify.js");
```

The only supported package subpaths are the package root, type-only `apexify.js/types`, and `apexify.js/package.json`. Do not import internal `dist/*` or source paths.

## Quick start

```js
import { writeFile } from "node:fs/promises";
import { ApexPainter } from "apexify.js";

const painter = new ApexPainter({ type: "buffer" });
const canvas = await painter.createCanvas({
  width: 320,
  height: 180,
  colorBg: "#0f172a",
});

const png = await painter.createText(
  {
    text: "Apexify.js",
    x: 160,
    y: 90,
    font: { size: 36, family: "Arial" },
    fill: { color: "#ffffff" },
    placement: { textAlign: "center", textBaseline: "middle" },
  },
  canvas
);

await writeFile("output.png", png);
```

`createCanvas()` returns `CanvasResults` (`buffer` plus canvas metadata). Most raster drawing/rendering methods return a PNG `Buffer`.

The repository keeps equivalent ESM, CommonJS, and TypeScript examples under `examples/phase13/`; CI installs the packed `.tgz` into fresh consumer fixtures and executes/typechecks those examples.

## Package-root API

Runtime exports from `apexify.js` are:

- `ApexPainter`
- `configureApexifyRuntime`
- `resetApexifyRuntimeConfig`
- `getDefaultApexifyRuntimeConfig`
- `resolveApexifyRuntimeConfig`
- `DEFAULT_APEXIFY_RUNTIME_CONFIG`
- `ApexifyError`
- `ApexifyInputError`
- `ApexifyConfigError`
- `ApexifyResourceLimitError`
- `ApexifyRemoteFetchError`
- `ApexifyDecodeError`
- `ApexifyProcessError`
- `ApexifyExternalServiceError`
- `ApexifyAssetError`
- `ApexifyPluginError`

Public TypeScript types are re-exported from the package root and are also available through the **type-only** `apexify.js/types` subpath.

## `ApexPainter`

The main façade exposes these direct methods and domains:

| API | Purpose |
|---|---|
| `createCanvas()` | Create a validated raster canvas |
| `createImage()` | Draw images/shapes onto an existing canvas |
| `createText()` | Draw styled text onto an existing canvas |
| `measureText()` | Measure text without rendering a final image |
| `createChart()` | Pie, bar, horizontal bar, line, scatter, radar, or polar-area chart |
| `createComparisonChart()` / `createComboChart()` | Higher-level chart compositions |
| `createScene()` / `renderScene()` | Ordered validated scene composition |
| `validateSceneRenderInput()` | Explicit scene preflight |
| `renderSceneToGIF()` | Compose a scene into GIF work |
| `renderSceneToVideoFrames()` | Compose scene frames into a video workflow |
| `createTemplate()` | Immutable reusable scene definition with data binding/layout |
| `prepareForRender()` | Resolve named `$asset` references through JSON-like input |
| `createGIF()` / `animate()` | GIF/frame workflows |
| `createVideo()` / `videoPipeline()` | One-shot and declarative FFmpeg video workflows |
| `getVideoInfo()` | Probe video metadata |
| `extractFrames()` / `extractAllFrames()` | Extract frame sequences |
| `extractFrameAtTime()` / `extractFrameByNumber()` / `extractMultipleFrames()` | Targeted frame extraction |
| `batch()` / `chain()` | Bounded parallel and sequential operations |
| `save()` / `saveMultiple()` | Persist image output |
| `toOutput()` | Convert a rendered Buffer to the constructor-selected output representation |
| `outPut()` | Deprecated compatibility alias for `toOutput()` |
| `await use(plugin)` | Serialized asynchronous transactional plugin installation |
| `assets` | Named image/font/palette/value registry |
| `components` | `badge`, `progressBar`, `avatar`, `card`, `watermark` layer factories |
| `image` | Stitch, collage, compress, palette, resize, convert, filters, blend, crop, mask, gradient, helpers |
| `path2d` | Path creation, drawing, and custom connectors |
| `pixels` | Pixel read/write/manipulation |
| `detect` | Hit detection |
| `output` | data URL, base64, Blob, ArrayBuffer, and explicit Imgur upload |
| `createAudio` | Procedural audio presets, synthesis, sequencing, composition, mix, save |
| `video` | Advanced video stack/session access |
| `plugins` | Named extension API registry |

Full signatures, options, defaults, error behavior, and resource constraints are maintained in the documentation site's API Reference.

## Named assets and composition

`painter.assets` registers named composition values and `prepareForRender()` resolves `$name` / `$object.path` references.

```js
painter.assets.loadPalette("brand", {
  primary: "#6366f1",
  ink: "#0f172a",
});

const config = painter.prepareForRender({
  width: 640,
  height: 360,
  colorBg: "$brand.ink",
});

const canvas = await painter.createCanvas(config);
```

Resolution defaults are intentionally different by surface:

- `renderScene`, `renderSceneToGIF`, and `renderSceneToVideoFrames`: asset resolution **on by default**; use `resolveAssetRefs: false` to skip.
- `TemplateHandle.render()`: resolves template assets as part of template resolution.
- `SceneBuilder.render()`: asset resolution **off by default**; opt in with `{ resolveAssetRefs: true }`.
- imperative helpers (`createCanvas`, `createImage`, `createText`, `measureText`, chart/GIF/video helpers): opt in with their trailing painter option or preprocess using `prepareForRender()`.
- `batch()` / `chain()`: opt in with `{ resolveAssetRefs: true }`.

## Scenes, templates, components, plugins

Scenes are validated bottom-to-top layer graphs. Nested `surface` layers composite directly without a forced PNG encode/decode boundary.

Templates add placeholders, nullish defaults, `visible` conditionals, named assets, deep overrides, deterministic insertions, and flex/grid layout before final scene validation.

`painter.components` returns normal `SceneLayer[]`; the built-ins are rendering helpers, not DOM widgets.

Plugins are executable trusted application code. Installation is asynchronous-capable and must be awaited:

```js
await painter.use({
  name: "example",
  async install(host) {
    host.plugins.use("example", { version: 1 });
  },
});
```

Install mutations made through `PluginHost` are transactionally rolled back if installation fails. There is currently no automatic teardown lifecycle and Apexify cannot roll back arbitrary external side effects performed by plugin code.

## Charts, GIF, audio, and video

Charts support `pie`, `bar`, `horizontalBar`, `line`, `scatter`, `radar`, and `polarArea`; comparison and combo charts use their dedicated helpers.

`createGIF()` supports bounded frame arrays and generated `AsyncIterable` frames. Generated frames are pulled incrementally so the producer is backpressured rather than collected wholesale.

`createAudio` produces WAV `Buffer`s:

```js
const laser = painter.createAudio.preset("laser");
const sequence = painter.createAudio.sequence({
  events: [
    { at: 0, preset: "coin" },
    { at: 0.15, preset: "laser", gain: 0.9 },
  ],
  tail: 0.2,
});
```

Video operations require FFmpeg and ffprobe:

```js
const info = await painter.createVideo({
  source: "./input.mp4",
  getInfo: true,
});
```

Custom binaries can be configured programmatically or with `APEXIFY_FFMPEG_PATH` / `APEXIFY_FFPROBE_PATH`.

## Output behavior

The constructor's `type` controls `toOutput()` conversion; it does not change the normal raster rendering pipeline.

```js
const painter = new ApexPainter({ type: "dataURL" });
const image = await painter.renderScene({ width: 100, height: 100, layers: [] });
const dataUrl = await painter.toOutput(image);
```

Supported painter output forms are `buffer`, `url`, `dataURL`, `blob`, `base64`, and `arraybuffer`. Imgur upload requires caller-supplied credentials or the documented `IMGUR_*` environment variables; the package contains no built-in credentials.

## Runtime policy and resource limits

Runtime policy is available from the package root:

```js
import {
  configureApexifyRuntime,
  getDefaultApexifyRuntimeConfig,
  resetApexifyRuntimeConfig,
} from "apexify.js";

configureApexifyRuntime({
  limits: {
    maxCanvasDimension: 8192,
    maxBatchConcurrency: 2,
  },
  network: {
    timeoutMs: 10_000,
  },
});

console.log(getDefaultApexifyRuntimeConfig().limits);
resetApexifyRuntimeConfig();
```

The built-in policy bounds canvas/scene pixels and nesting, decoded images, remote bytes/assets, GIF frames/cost, audio duration/memory, video duration/FPS/bitrate/layers, batch work, remote concurrency, cache size, FFmpeg process output/time, and temporary workspace behavior. Raise limits only after measuring the deployment's actual memory/CPU capacity.

## Remote-network security

Remote image/GIF/video acquisition is governed by one network policy. By default Apexify:

- allows only configured `http:` / `https:` protocols;
- rejects credentials embedded in URLs;
- resolves DNS and rejects loopback, private, link-local, multicast, reserved, documentation, translation/tunnel, and other non-public address classes;
- applies the same validation to redirects;
- enforces retry, timeout, redirect, transfer-byte, and global remote-concurrency bounds;
- redacts URL credentials/query/hash from structured errors/diagnostics.

Private/local access is **off by default**. Enabling `trustedNetworkAccess` also requires an explicit `allowedHosts` entry. Do not enable broad private-network access for untrusted user input.

For public upload/render endpoints, additionally enforce authentication/authorization, request-body limits, MIME/content checks, deployment-specific Apexify limits, and application-level rate/concurrency limits. Apexify's renderer policy is not a substitute for endpoint security.

## Structured errors

Public package-root error classes have stable `code` values:

| Class | Code |
|---|---|
| `ApexifyInputError` | `APEXIFY_INPUT` |
| `ApexifyConfigError` | `APEXIFY_CONFIG` |
| `ApexifyResourceLimitError` | `APEXIFY_RESOURCE_LIMIT` |
| `ApexifyRemoteFetchError` | `APEXIFY_REMOTE_FETCH` |
| `ApexifyDecodeError` | `APEXIFY_DECODE` |
| `ApexifyProcessError` | `APEXIFY_PROCESS` |
| `ApexifyExternalServiceError` | `APEXIFY_EXTERNAL_SERVICE` |
| `ApexifyAssetError` | `APEXIFY_ASSET` |
| `ApexifyPluginError` | `APEXIFY_PLUGIN` |

`ApexifyResourceLimitError` additionally exposes `limit`, `maximum`, and `actual`. `ApexifyRemoteFetchError` may expose redacted `requestUrl` and HTTP `status`.

## FFmpeg and temporary files

FFmpeg/ffprobe are executed through a centralized argv-based process runner with `shell: false`, bounded stdout/stderr, timeout/abort handling, and process cleanup.

Temporary media work uses an isolated `fs.mkdtemp()` workspace under:

1. explicit operation/session option;
2. runtime `temp.rootDirectory`;
3. `APEXIFY_TEMP_DIR`;
4. the operating-system temp directory.

Workspaces are cleaned by default. `APEXIFY_RETAIN_TEMP_FILES=true` or runtime/session retain settings are **debug-only** and should not be enabled in normal production workloads.

## Cache and performance

Decoded image reuse uses a bounded cache. Defaults are:

- enabled: `true`
- TTL: 5 minutes
- entries: 128
- bytes: 128 MiB

For production workloads:

- reuse an `ApexPainter` when repeated operations should share bounded runtime resources;
- reuse named assets/templates instead of re-fetching/rebuilding identical inputs;
- use scenes/templates when the composition is naturally layered/reusable;
- use `batch()` for independent bounded parallel work and `chain()` for dependent sequential work;
- keep canvas/decoded image dimensions only as large as required;
- prefer generated GIF `AsyncIterable` frames for long generated animations;
- remote video is staged by streaming to isolated workspace files rather than first buffering the whole download;
- avoid unnecessary encode/decode round trips between intermediate operations;
- benchmark your actual filters/codecs/fonts and choose concurrency from measured peak memory, not CPU count alone.

The repository's Phase 12 benchmark gate records five-run medians and detects material regressions on supported Linux Node versions.

## Migration notes for 6.0

Current 6.0 behavior to account for when upgrading older code:

- Node support is **22.x / 24.x / 26.x**.
- ESM and CommonJS are both tested from the packed artifact.
- `toOutput()` is the preferred output conversion method; `outPut()` remains a deprecated compatibility alias.
- runtime configuration and structured errors are package-root exports.
- remote/private networking is deny-by-default unless explicit trusted-host policy is configured.
- resource limits are enforced at runtime; TypeScript is not the security boundary.
- `ApexPainter.use(plugin)` must be awaited because plugin installation may be asynchronous.
- supported public imports are package exports; old internal/deep source imports are not supported.

See the documentation site's migration guide for detailed behavior and deployment changes.

## Documentation

- [Start here](https://apexifyjs.vercel.app/docs#00-start-here)
- [API reference](https://apexifyjs.vercel.app/docs)
- [Runtime/resource governance](https://apexifyjs.vercel.app/docs#01-runtime-resource-governance)
- [Gallery](https://apexifyjs.vercel.app/gallery)
- [Changelog](./CHANGELOG.md)

## License

MIT. See [LICENSE](./LICENSE).
