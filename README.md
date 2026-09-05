# Apexify.js

<div align="center">

![Apexify.js banner — charts, canvas, TypeScript](Apex-Banner.png)

**Programmatic visual generation for Node.js.**

Create images, charts, styled text, GIFs, video, procedural SFX, scenes, templates, and reusable composition systems from JavaScript or TypeScript.

[![npm version](https://badge.fury.io/js/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![npm downloads](https://img.shields.io/npm/dt/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22%2F24%2F26-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[Documentation](https://apexifyjs.vercel.app/docs#00-start-here) ·
[Gallery](https://apexifyjs.vercel.app/gallery) ·
[Studio](https://apexifyjs.vercel.app/studio) ·
[npm](https://www.npmjs.com/package/apexify.js)

</div>

---

## What is Apexify.js?

Apexify.js is a TypeScript-first, server-side Node.js rendering library. It combines:

- canvas and image composition
- styled text and custom fonts
- shapes, paths, pixels, and hit testing
- charts
- GIF creation
- FFmpeg-backed video processing and `videoPipeline`
- procedural WAV/SFX generation with `createAudio`
- layered scenes and nested surfaces
- immutable templates with placeholders, layout, visibility, overrides, and insertions
- named composition assets (`$name`, dotted paths, palettes, Buffers, arbitrary values)
- preset scene components (`badge`, `progressBar`, `avatar`, `card`, `watermark`)
- asynchronous transactional plugins
- batch/chain and output utilities

The public package is intended for Node.js/server-side workloads.

---

## Install

```bash
npm install apexify.js
```

### Requirements

- Node.js 22.x, 24.x, or 26.x
- npm 10+ (repository/release tooling is pinned to npm 11.19.1)
- TypeScript recommended
- FFmpeg/ffprobe only for video features

### ESM and CommonJS

Apexify.js 6 is a dual package with separate ESM/CommonJS runtimes and matching declaration modes.

```js
// ESM
import { ApexPainter } from "apexify.js";

// CommonJS
const { ApexPainter } = require("apexify.js");
```

`ApexPainter` is the main runtime façade. The package root also exposes supported runtime policy/configuration functions and structured Apexify error classes. Public TypeScript types are re-exported from the package root; advanced type-only imports may use `apexify.js/types`. The `apexify.js/types` subpath has no runtime JavaScript target.

---

## Quick start

```ts
import { writeFileSync } from "node:fs";
import { ApexPainter } from "apexify.js";

const painter = new ApexPainter({ type: "buffer" });

const base = await painter.createCanvas({
  width: 1200,
  height: 630,
  gradientBg: {
    type: "linear",
    startX: 0,
    startY: 0,
    endX: 1200,
    endY: 630,
    colors: [
      { stop: 0, color: "#667eea" },
      { stop: 1, color: "#764ba2" },
    ],
  },
});

const output = await painter.createText(
  {
    text: "Hello Apexify.js",
    x: 600,
    y: 315,
    font: { size: 72, family: "Arial" },
    decorations: { bold: true },
    fill: { color: "#ffffff" },
    placement: { textAlign: "center", textBaseline: "middle" },
  },
  base
);

writeFileSync("output.png", output);
```

---

# Composition architecture

## Named assets (`painter.assets`)

`AssetManager` is a single named registry for images, font paths, palettes, and arbitrary JSON-like composition values.

```ts
painter.assets.loadImage("logo", "./brand/logo.png");
painter.assets.loadFont("heading", "./fonts/Inter-Bold.ttf");
painter.assets.loadPalette("brand", {
  primary: "#6366f1",
  ink: "#0f172a",
});
painter.assets.loadValue("copy", {
  hero: { title: "Apexify.js" },
  spacing: [8, 16, 24],
});
```

Root names are unique across the registry. Duplicate `load*` calls throw `ApexifyAssetError`; replacement must be explicit with `replaceImage`, `replaceFont`, `replacePalette`, or `replaceValue`. Replacement of an unknown name also throws.

Reference rules:

- `$logo` — whole asset value
- `$brand.primary` — dotted own-property path
- `$copy.spacing.1` — array-index path
- `color=$brand.primary` — embedded scalar reference
- `$$brand.primary` — literal `$brand.primary`

Whole-field references may resolve to structured data or Buffers where the target field accepts them. Embedded references must resolve to string/number/boolean scalars. Unknown/unsafe paths, unsupported embedded structured values, and cyclic composition graphs fail with structured errors.

Asset registrations and resolutions are cloned so caller mutation does not silently mutate registry storage.

### Where `$` resolution happens

- `renderScene`, `renderSceneToGIF`, `renderSceneToVideoFrames`: **on by default**; pass `resolveAssetRefs: false` to skip.
- templates: resolved during `TemplateHandle.toRenderInput()` / `render()`.
- `SceneBuilder.render()`: **off by default**; opt in with `{ resolveAssetRefs: true }`.
- imperative APIs: opt in using the supported trailing `{ resolveAssetRefs: true }` option or preprocess with `painter.prepareForRender(value)`.
- `batch` / `chain`: accept `{ resolveAssetRefs: true }` and an optional custom resolver.

```ts
const cfg = painter.prepareForRender({
  width: 400,
  height: 200,
  colorBg: "$brand.primary",
});

await painter.createCanvas(cfg);
```

---

## Scenes

A scene is a validated ordered `SceneLayer[]` graph. Array order is deterministic bottom → top.

```ts
const scene = painter
  .createScene(640, 360)
  .setBackground({ colorBg: "#0f172a" })
  .addLayers([
    {
      type: "text",
      texts: { text: "Scene", x: 48, y: 80, fontSize: 36, color: "#f8fafc" },
    },
  ]);

const png = await scene.render();
```

`SceneBuilder` supports `addLayer(s)`, `insertLayer(s)`, `insertBefore`, `insertAfter`, `replaceLayer(s)`, `moveLayer`, `removeLayer`, `clearLayers`, and `toRenderInput()`.

Builder inputs are copied on ingress. `toRenderInput()` and render operations use isolated snapshots, so later caller mutation cannot change an already-created composition.

Nested `surface` layers render to child canvases and composite directly into the parent; they are not PNG-encoded and decoded at every nesting boundary.

### Scene validation

Scene safety validation is mandatory. The deprecated `SceneRenderOptions.validate` property is retained only for source compatibility and does not disable validation.

Validation enforces root/surface dimensions, aggregate scene pixel budget, total layers, surface depth/count, image/text/chart counts, total text content, remote assets, domain-specific image/text validation, finite transforms/opacities, and configured runtime limits. `maxSurfaceDepth` may make one render stricter but cannot raise the global limit.

```ts
painter.validateSceneRenderInput({
  width: 1200,
  height: 630,
  layers: [],
});
```

---

## Templates

`createTemplate(definition, options?)` captures an immutable definition and returns a `TemplateHandle`.

Supported behavior includes:

- required `{{key}}` placeholders
- nullish-only defaults: `{{key | default}}`
- native whole-placeholder values (`0`, `false`, and `""` are preserved)
- dotted placeholder paths
- `visible`
- `$` asset resolution
- unique layer `id` values
- deep render-time overrides
- deterministic insertions before/after ids
- flex and grid layout nodes
- final scene validation
- immutable definition/data snapshots across asynchronous layout work

```ts
const card = painter.createTemplate({
  width: 560,
  height: 220,
  background: { colorBg: "$brand.primary" },
  layers: [
    {
      id: "title",
      type: "text",
      text: "{{title}}",
      x: 32,
      y: 48,
      fontSize: 28,
      color: "#ffffff",
    },
    {
      id: "details",
      type: "text",
      visible: "{{showDetails}}",
      text: "{{details | No details}}",
      x: 32,
      y: 100,
      fontSize: 16,
      color: "#ffffff",
    },
  ],
});

const png = await card.render({
  title: "Build complete",
  showDetails: false,
});
```

Template resolution is deterministic: insertions → id validation → overrides → visibility → placeholders → assets → numeric/layout normalization → scene validation. Hidden subtrees are removed before their other missing placeholders/assets are resolved.

---

## Components

`painter.components` exposes static factories that return ordinary `SceneLayer[]`:

- `badge.toLayers(options)`
- `progressBar.toLayers(options)`
- `avatar.toLayers(options)`
- `card.toLayers(options)`
- `watermark.toLayers(options)`

Built-ins validate finite/positive geometry and relevant limits. Watermark placement is canvas-aware and rejects impossible position/margin/text-fit combinations.

These are rendering helpers, not DOM widgets; generated layers do not carry ARIA/alt semantics. Provide accessible names/descriptions in the HTML/UI that displays the generated image.

```ts
const layers = [
  ...painter.components.badge.toLayers({ text: "NEW", x: 20, y: 20 }),
  ...painter.components.progressBar.toLayers({
    x: 20,
    y: 64,
    width: 300,
    height: 18,
    value: 72,
    max: 100,
    showLabel: true,
  }),
];

await painter.renderScene({
  width: 380,
  height: 130,
  background: { colorBg: "#020617" },
  layers,
});
```

---

## Plugins

There are two extension surfaces:

- `painter.plugins.use(name, api)` registers a named API object.
- `await painter.use(plugin)` installs an `ApexifyPlugin` once per plugin name.

**Always await `painter.use(plugin)`.** `plugin.install(host)` may be asynchronous. Plugin installs are serialized, same-name installed/pending duplicates are rejected, and `ApexPainter.use()` resolves only after installation completes.

PluginHost registry mutations performed inside a failing plugin's own async installation context are rolled back. Pre-existing APIs removed by the failing plugin are restored; unrelated application registry writes that happen concurrently are preserved. A failed plugin name may be retried. The current lifecycle is install-only—there is no automatic teardown hook, and Apexify.js cannot roll back arbitrary external side effects performed by plugin code.

```ts
await painter.use({
  name: "watermark-kit",
  async install(host) {
    await Promise.resolve();
    host.plugins.use("watermark-kit", {
      layers(text: string) {
        return host.components.watermark.toLayers({
          text,
          canvasWidth: 640,
          canvasHeight: 360,
        });
      },
    });
  },
});
```

---

# Main rendering features

## Canvas & backgrounds

```ts
const { buffer } = await painter.createCanvas({
  width: 1200,
  height: 630,
  colorBg: "#0f172a",
});
```

Backgrounds include solid colors, linear/radial/conic gradients, image/video-frame backgrounds, layered backgrounds, patterns, noise, borders, shadows, and transforms.

## Text

```ts
const output = await painter.createText(
  {
    text: "Apexify.js",
    x: 600,
    y: 300,
    font: { size: 80, family: "Arial" },
    decorations: { bold: true },
    fill: { color: "#ffffff" },
    placement: { textAlign: "center", textBaseline: "middle" },
  },
  canvasBuffer
);
```

Text supports fonts, wrapping, spacing, gradients, opacity, shadows, strokes, glow, line decorations, rotation, curved text, and metrics.

## Images & shapes

```ts
const output = await painter.createImage(
  {
    source: "rectangle",
    x: 100,
    y: 100,
    width: 400,
    height: 220,
    shape: { fill: true, color: "#ffffff" },
    borderRadius: 32,
  },
  canvasBuffer
);
```

Image workflows include bitmap drawing, shape drawing, resize, crop, mask, clip, rotation, opacity, shadows, strokes, blend modes, filters, groups, perspective, and distortion tools.

## Charts

```ts
const chart = await painter.createChart(
  "line",
  [{ label: "Revenue", data: [{ x: 1, y: 12 }, { x: 2, y: 18 }], color: "#7c3aed" }],
  { dimensions: { width: 900, height: 500 } }
);
```

Supported families include pie/donut, bar, horizontal bar, line, scatter, radar, polar area, comparison, and combo charts.

## GIF

```ts
const gif = await painter.createGIF(
  [
    { buffer: frameA, duration: 80 },
    { buffer: frameB, duration: 80 },
  ],
  { width: 600, height: 600, outputFormat: "buffer" }
);
```

For long generated animations, `onStart` may return an `AsyncIterable<GIFEncodedFrame>`. Apexify pulls one generated frame at a time and completes resolve → decode → overlay → encode before requesting the next frame, so producer backpressure is preserved instead of collecting the stream first. Static frame arrays use bounded ordered resolution tied to the central batch/network concurrency policy.

GIF frame/watermark URLs use the shared media/network layer, including SSRF/host policy and remote-byte limits. `createGIF` supports file, Buffer, base64, and Buffer-backed `.gif` attachment outputs; `AbortSignal`, rich text overlays, watermark positioning/sizing/opacity, transparency/disposal overrides, GIF signature checks, and partial-file cleanup are supported. Scene compositions can also feed `renderSceneToGIF`.

```ts
await painter.createGIF(undefined, {
  outputFormat: "file",
  outputFile: "./out/streamed.gif",
  width: 640,
  height: 360,
  frameCount: 120,
  signal: abortController.signal,
  onStart: async () => (async function* () {
    for (let i = 0; i < 120; i++) {
      yield { buffer: await renderFrame(i), duration: 50 };
    }
  })(),
});
```

## Procedural audio (`createAudio`)

```ts
const laser = painter.createAudio.preset("laser");

const sfx = painter.createAudio.sequence({
  events: [
    { at: 0, preset: "coin" },
    { at: 0.15, preset: "laser", gain: 0.9 },
  ],
  tail: 0.2,
});
```

`createAudio` produces WAV Buffers and provides presets, custom synthesis, sequences, composition, mixing, saving, and preset discovery.

## Video

Video operations require FFmpeg/ffprobe.

```ts
const info = await painter.createVideo({
  source: "./input.mp4",
  getInfo: true,
});
```

`createVideo` covers one-off operations such as trim, conversion, frame-based encoding, text overlays, transitions, and audio mixing.

### `videoPipeline`

```ts
const result = await painter
  .videoPipeline("./uploads/user.mp4")
  .trim(0, 60, "trim")
  .text(
    {
      text: "Chapter 1",
      x: 48,
      y: 80,
      startTime: 0,
      endTime: 10,
      font: { size: 42, family: "Arial" },
      fill: { color: "#ffffff" },
    },
    "titles"
  )
  .render({ outputPath: "./out/final.mp4" });

console.log(result.passes);
```

Also available as `painter.video.videoPipeline()`.

---

# Advanced APIs

Apexify.js also exposes grouped APIs on:

- `painter.image` — raster utilities
- `painter.path2d` — path creation/drawing/custom connectors
- `painter.pixels` — pixel read/write/manipulation
- `painter.detect` — hit testing
- `painter.output` — buffer encodings
- `painter.video` — video stack/probe/frame helpers

```ts
const metrics = await painter.measureText({
  text: "Hello Apexify.js",
  font: { size: 48, family: "Arial" },
  includeCharMetrics: true,
});
```

---

## API overview

| Method / API | Purpose |
|---|---|
| `assets` (`AssetManager`) | `loadImage`, `loadFont`, `loadPalette`, `loadValue`, explicit `replace*`, dotted `$` resolution |
| `prepareForRender()` | Deep-resolve `$refs` in JSON-like composition data |
| `createCanvas()` | Base canvas (`CanvasResults`) |
| `createText()` / `createImage()` | Draw on an existing canvas |
| `image.*` | Stitch, collage, compress, resize, filters, blend, crop, mask, palette, … |
| `createChart()` / comparison / combo | Chart PNGs |
| `createScene()` | Mutable copy-on-ingress `SceneBuilder` |
| `renderScene()` | Validated layer graph → PNG; asset resolution defaults on |
| `renderSceneToGIF()` / `renderSceneToVideoFrames()` | Scene → GIF/video workflow |
| `validateSceneRenderInput()` | Mandatory scene-contract preflight helper |
| `createTemplate()` | Immutable template handle: placeholders, visibility, assets, overrides, insertions, flex/grid |
| `components.*` | Preset scene-layer factories |
| `plugins.use()` | Register a named PluginHost API |
| `await use(plugin)` | Serialized asynchronous transactional plugin installation |
| `createGIF()` / `animate()` | GIF/frame workflows |
| `createAudio` | Procedural WAV/SFX APIs |
| `videoPipeline()` | Declarative layered video editing |
| `createVideo()` | Single FFmpeg operation |
| `measureText()` | Text layout metrics |
| `path2d.*` | Path APIs |
| `pixels.*` | Pixel APIs |
| `detect.*` | Hit testing |
| `output.*` | Buffer encodings |
| `batch()` / `chain()` | Parallel/sequential pipelines |
| `save()` / `saveMultiple()` | Persist output files |
| `outPut()` | Convert buffer to configured output form |

---

## Output forms

Depending on the API/configuration, Apexify.js works with:

- `Buffer`
- files
- base64/data URLs
- Blob-like output
- `ArrayBuffer`
- URL/upload helpers where supported

Most raster `create*` APIs return a Buffer. `createCanvas()` returns `CanvasResults` (`buffer` plus canvas metadata).

---

## Typical use cases

- Open Graph/social images
- Discord/bot cards
- certificates and reports
- dashboard snapshots
- chart exports
- product/marketing assets
- animated GIFs
- video thumbnails and editor backends
- procedural game/UI SFX
- batch-generated visual assets

---

## Documentation

Full documentation: [https://apexifyjs.vercel.app/docs#00-start-here](https://apexifyjs.vercel.app/docs#00-start-here)

- [Gallery](https://apexifyjs.vercel.app/gallery)
- [Studio](https://apexifyjs.vercel.app/studio)
- [Recipes](https://apexifyjs.vercel.app/docs#00-recipes-overview)
- [npm](https://www.npmjs.com/package/apexify.js)

---

## TypeScript

Apexify.js ships public declarations for ESM and CommonJS.

```ts
import { ApexPainter } from "apexify.js";
import type { CanvasConfig, SceneRenderInput } from "apexify.js";
// or: import type { … } from "apexify.js/types";

const painter = new ApexPainter({ type: "buffer" });

const config: CanvasConfig = {
  width: 1200,
  height: 630,
  colorBg: "#111827",
};

const scene: SceneRenderInput = {
  width: 1200,
  height: 630,
  layers: [],
};

painter.validateSceneRenderInput(scene);
```

---

## Performance and safety

Performance depends on canvas size, layer count, filters, chart complexity, animation/frame counts, codecs, and host resources. Apexify.js uses bounded runtime limits, mandatory scene validation, bounded image decode caching with repeated-source reuse, bounded media/network concurrency, and incremental generated-GIF processing with producer backpressure. Benchmark with workloads representative of your deployment.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Contributing

Contributions are welcome. Open an issue before major architectural changes.

## License

MIT License. See [LICENSE](./LICENSE).

---

<div align="center">

**Apexify.js**  
Programmatic visual generation for Node.js.

[Documentation](https://apexifyjs.vercel.app/docs#00-start-here) ·
[Gallery](https://apexifyjs.vercel.app/gallery) ·
[Studio](https://apexifyjs.vercel.app/studio) ·
[npm](https://www.npmjs.com/package/apexify.js) ·
[Issues](https://github.com/EIAS79/Apexify.js/issues)

</div>