# Apexify.js

<div align="center">

![Apexify.js Banner](https://imgur.com/0E9GTmP)

**Programmatic visual generation for Node.js.**

Create images, charts, text effects, shapes, GIFs, and video outputs from JavaScript or TypeScript.

[![npm version](https://badge.fury.io/js/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![npm downloads](https://img.shields.io/npm/dt/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)

[Documentation](https://apexifyjs.vercel.app/docs#00-start-here) ·
[Gallery](https://apexifyjs.vercel.app/gallery) ·
[Studio](https://apexifyjs.vercel.app/studio) ·
[npm](https://www.npmjs.com/package/apexify.js)

</div>

---

## What is Apexify.js?

**Apexify.js** is a TypeScript-first Node.js rendering library for generating visual assets from code.

It is built for developers who need to create images, charts, banners, cards, reports, GIFs, or video-related outputs without manually designing every asset.

Apexify.js combines:

- canvas rendering
- image composition
- text rendering
- shape drawing
- chart generation
- GIF creation
- video processing
- batch output utilities
- pixel/path/hit-testing APIs

under one programmable workflow.

---

## Install

```bash
npm install apexify.js
```

```bash
yarn add apexify.js
```

```bash
pnpm add apexify.js
```

### Requirements

- Node.js 16+
- TypeScript recommended
- FFmpeg required only for video features

---

## Quick Start

Create a canvas, draw text on it, and save the result.

```ts
import { ApexPainter } from "apexify.js";
import fs from "fs";

const painter = new ApexPainter();

const { buffer: base } = await painter.createCanvas({
  width: 1200,
  height: 630,
  gradientBg: {
    type: "linear",
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
    font: {
      size: 72,
      family: "Arial",
    },
    bold: true,
    color: "#ffffff",
    textAlign: "center",
    textBaseline: "middle",
    shadow: {
      color: "rgba(0,0,0,0.35)",
      offsetX: 0,
      offsetY: 14,
      blur: 28,
      opacity: 1,
    },
  },
  base
);

fs.writeFileSync("output.png", output);
```

---

## Core Workflow

Apexify.js uses a simple buffer-based rendering flow:

```txt
createCanvas()
     ↓
createText() / createImage() / createChart()
     ↓
save / export / return buffer
```

Most APIs return a `Buffer`, which can be saved to disk, sent through an API route, uploaded, attached to a bot message, or passed into another Apexify operation.

---

## Why Use Apexify.js?

Apexify.js is useful when your application needs to generate visuals automatically.

Examples:

- dynamic Open Graph images
- social media banners
- Discord welcome cards
- product cards
- certificates
- reports and chart images
- dashboard snapshots
- animated GIFs
- video thumbnails
- frame-based videos
- batch-generated marketing assets

Instead of designing every asset manually, you define the visual structure in code and generate outputs on demand.

---

## Main Features

### Canvas & Backgrounds

Create base canvases with solid colors, gradients, images, layered backgrounds, patterns, noise, shadows, borders, and transformations.

```ts
const { buffer } = await painter.createCanvas({
  width: 1200,
  height: 630,
  colorBg: "#0f172a",
});
```

Supported background tools include:

- solid colors
- linear, radial, and conic gradients
- image backgrounds
- video frame backgrounds
- layered backgrounds with `bgLayers`
- pattern overlays
- noise effects
- borders and shadows

---

### Text Rendering

Render styled text with layout control, gradients, shadows, strokes, glow effects, decorations, wrapping, custom fonts, rotation, and curved text.

```ts
const output = await painter.createText(
  {
    text: "Apexify.js",
    x: 600,
    y: 300,
    font: {
      size: 80,
      family: "Arial",
    },
    bold: true,
    color: "#ffffff",
    textAlign: "center",
    textBaseline: "middle",
  },
  canvasBuffer
);
```

Text capabilities include:

- font size and family
- custom fonts
- bold and italic
- alignment and baseline control
- wrapping
- gradients
- shadows
- strokes
- glows
- underline, overline, strikethrough
- curved text
- text metrics

---

### Images & Shapes

Draw images or vector-style shapes on top of an existing canvas.

```ts
const output = await painter.createImage(
  {
    source: "rectangle",
    x: 100,
    y: 100,
    width: 400,
    height: 220,
    shape: {
      fill: true,
      color: "#ffffff",
    },
    borderRadius: 32,
    shadow: {
      color: "rgba(0,0,0,0.25)",
      offsetX: 0,
      offsetY: 16,
      blur: 32,
    },
  },
  canvasBuffer
);
```

Image and shape features include:

- bitmap drawing
- shape drawing
- resizing
- cropping
- masking
- clipping
- rotation
- opacity
- shadows
- strokes
- blend modes
- filters
- group transforms
- perspective and distortion tools

---

### Charts

Generate static chart images directly from data.

```ts
const chart = await painter.createChart(
  "line",
  [
    {
      label: "Revenue",
      data: [12, 18, 24, 31, 42],
      color: "#7c3aed",
    },
  ],
  {
    width: 900,
    height: 500,
    title: "Revenue Growth",
  }
);
```

Supported chart types include:

- pie
- donut
- bar
- horizontal bar
- line
- scatter
- radar
- polar area
- comparison charts
- combo charts

---

### GIF Creation

Create animated GIFs from frames, buffers, image paths, or programmatic frame generation.

```ts
const gif = await painter.createGIF(
  undefined,
  {
    width: 600,
    height: 600,
    frameCount: 30,
    delay: 40,
    outputFormat: "buffer",
    async onStart(frameCount, painter) {
      const frames = [];

      for (let i = 0; i < frameCount; i++) {
        const { buffer } = await painter.createCanvas({
          width: 600,
          height: 600,
          colorBg: "#111827",
        });

        const frame = await painter.createText(
          {
            text: `Frame ${i + 1}`,
            x: 300,
            y: 300,
            font: { size: 48, family: "Arial" },
            color: "#ffffff",
            textAlign: "center",
            textBaseline: "middle",
          },
          buffer
        );

        frames.push({
          buffer: frame,
          duration: 40,
        });
      }

      return frames;
    },
  }
);
```

GIF features include:

- frame-based animation
- custom frame duration
- programmatic frame generation
- transparent color support
- per-frame disposal
- watermark support
- buffer, file, base64, and attachment outputs

---

### Video Processing

Apexify.js includes FFmpeg-backed video utilities for workflows such as metadata extraction, frame extraction, conversion, trimming, thumbnails, audio operations, transitions, and frame-to-video encoding.

```ts
const info = await painter.createVideo({
  source: "./input.mp4",
  getInfo: true,
});
```

Create a video from generated frames:

```ts
await painter.createVideo({
  source: "./placeholder.mp4",
  createFromFrames: {
    frames: ["./frame-001.png", "./frame-002.png", "./frame-003.png"],
    outputPath: "./output.mp4",
    fps: 30,
    format: "mp4",
  },
});
```

> Video features require FFmpeg and ffprobe to be available on the host system.

---

### Advanced APIs

Apexify.js also exposes lower-level APIs for advanced rendering and analysis.

#### Text Metrics

```ts
const metrics = await painter.measureText({
  text: "Hello Apexify.js",
  font: {
    size: 48,
    family: "Arial",
  },
  includeCharMetrics: true,
});
```

#### Pixel Data

```ts
const pixelData = await painter.getPixelData(canvasBuffer, {
  x: 0,
  y: 0,
  width: 100,
  height: 100,
});
```

#### Pixel Manipulation

```ts
const processed = await painter.manipulatePixels(canvasBuffer, {
  filter: "grayscale",
  intensity: 1,
});
```

#### Path2D

```ts
const path = painter.createPath2D([
  { type: "moveTo", x: 100, y: 100 },
  { type: "lineTo", x: 300, y: 100 },
  { type: "lineTo", x: 300, y: 300 },
  { type: "closePath" },
]);

const output = await painter.drawPath(canvasBuffer, path, {
  stroke: {
    color: "#ffffff",
    width: 4,
  },
  fill: {
    color: "#7c3aed",
    opacity: 0.6,
  },
});
```

#### Hit Detection

```ts
const hit = await painter.isPointInRegion(
  {
    type: "circle",
    x: 200,
    y: 200,
    radius: 80,
  },
  220,
  210
);
```

---

## API Overview

The main entry point is:

```ts
import { ApexPainter } from "apexify.js";

const painter = new ApexPainter();
```

Common methods:

| Method | Purpose |
|---|---|
| `createCanvas()` | Create a base canvas |
| `createText()` | Draw text on an existing canvas |
| `createImage()` | Draw images or shapes on an existing canvas |
| `createCustom()` | Draw custom lines, arrows, and connectors |
| `createChart()` | Generate a chart image |
| `createComparisonChart()` | Generate multi-chart comparison layouts |
| `createComboChart()` | Generate combined bar/line charts |
| `createGIF()` | Generate animated GIFs |
| `createVideo()` | Run FFmpeg-backed video operations |
| `measureText()` | Measure text layout |
| `getPixelData()` | Read pixel data from a canvas |
| `setPixelData()` | Write pixel data back to a canvas |
| `manipulatePixels()` | Apply pixel-level processing |
| `createPath2D()` | Build a path from path commands |
| `drawPath()` | Draw a path onto a canvas |
| `isPointInRegion()` | Test whether a point is inside a region |
| `batch()` | Run multiple operations |
| `chain()` | Run sequential operations |
| `save()` | Save output files |
| `outPut()` | Convert output to configured format |

---

## Output Formats

Apexify.js can work with multiple output forms depending on the operation and configuration:

- `Buffer`
- file output
- base64
- data URL
- Blob-like output
- ArrayBuffer
- URL/upload helpers where supported

Most rendering APIs return a `Buffer`, which gives you full control over how the result is stored or sent.

---

## Use Cases

### Server-side image generation

Generate Open Graph images, banners, reports, cards, and previews from API routes or background jobs.

### Discord and bot graphics

Create welcome cards, profile images, level cards, badges, and generated attachments.

### Marketing and social media automation

Generate post images, product visuals, quote cards, thumbnails, and campaign assets in bulk.

### Data visualization

Render chart images for reports, dashboards, email attachments, and static exports.

### Media pipelines

Extract frames, generate thumbnails, build GIFs, create video from frames, or process videos through FFmpeg-backed workflows.

---

## Documentation

Full documentation is available at:

[https://apexifyjs.vercel.app/docs#00-start-here](https://apexifyjs.vercel.app/docs#00-start-here)

Useful links:

- [Start Here](https://apexifyjs.vercel.app/docs#00-start-here)
- [Gallery](https://apexifyjs.vercel.app/gallery)
- [Studio](https://apexifyjs.vercel.app/studio)
- [API Reference](https://apexifyjs.vercel.app/docs#api-reference)
- [npm package](https://www.npmjs.com/package/apexify.js)

---

## Gallery and Studio

The gallery contains real generated outputs with matching TypeScript and JavaScript snippets.

Use it to explore what Apexify.js can produce:

[Open Gallery](https://apexifyjs.vercel.app/gallery)

The Studio lets you edit and run snippets in a browser-based code playground:

[Open Studio](https://apexifyjs.vercel.app/studio)

---

## TypeScript

Apexify.js is written in TypeScript and ships type definitions.

```ts
import { ApexPainter, CanvasTypes } from "apexify.js";

const painter = new ApexPainter();

const config: CanvasTypes.CanvasConfig = {
  width: 1200,
  height: 630,
  colorBg: "#111827",
};

const { buffer } = await painter.createCanvas(config);
```

---

## Performance

Apexify.js is built on top of `@napi-rs/canvas`, using native rendering foundations for server-side canvas workloads.

Performance depends on:

- canvas size
- number of layers
- image filters
- chart complexity
- GIF frame count
- video duration and codec
- available CPU/memory
- FFmpeg availability for video workflows

For heavy workloads, use batching carefully and benchmark with your own input sizes.

---

## Notes

- Apexify.js is primarily designed for Node.js/server-side usage.
- Video features require FFmpeg and ffprobe.
- Some advanced image/video workflows may require additional host capabilities.
- Large images, long GIFs, and video pipelines can be memory-intensive.
- For browser-based exploration, use the Studio.

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

---

## Contributing

Contributions are welcome.

Recommended contribution areas:

- examples
- documentation
- bug fixes
- additional recipes
- chart improvements
- performance benchmarks
- test cases

Open an issue before major architectural changes.

---

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