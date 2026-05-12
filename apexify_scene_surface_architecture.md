# Apexify.js Scene / Surface Rendering Architecture

## Purpose of this document

This document explains a proposed **Scene / Surface API** for Apexify.js.

### Source layout (library, `lib/Canvas/`)

Implementation work for this API should live next to the existing Canvas module:

| Folder | Role |
| --- | --- |
| `ApexPainter.ts` | Public façade; wires services and utils. |
| `services/` | Stateful **creators** (canvas, image, text, chart, GIF, video, path, hit-test, pixels, metrics). Formerly `extended/`. |
| `utils/types/` | Shared TypeScript types and option shapes. |
| `utils/foundation/` | Low-level helpers (`errorUtils`, `pathCmd`, `pathUtils`). Formerly `core/`. |
| `utils/chart/` | Chart renderers and chart-only layout. Formerly `Charts/`. |
| `utils/text/` | Text layout and rendering helpers. Formerly `Texts/`. |
| `utils/image/` | Raster ops, filters, masking. Formerly `Image/`. |
| `utils/shape/` | Vector shape helpers. Formerly `Shapes/`. |
| `utils/background/` | Background layers. Formerly `Background/`. |
| `utils/drawing/` | Custom lines / connectors. Formerly `Custom/`. |
| `utils/pattern/` | Pattern rendering. Formerly `Patterns/`. |
| `utils/video/` | Video helpers. Formerly `Video/`. |
| `utils/ops/` | Batching, I/O, stitching, conversion, compression. Formerly `general/`. |
| `utils/canvasUtils.ts` | Facade re-export barrel for npm `CanvasUtils` namespace. |

---

The goal is to make Apexify.js easier, faster, and more powerful when building complex visuals such as:

- dashboard posters
- sci-fi command interfaces
- AI product reveal graphics
- Open Graph images
- social media templates
- certificates
- reports
- animated GIF frames
- video frames
- reusable visual components

The current Apexify.js workflow is powerful, but complex designs usually require many sequential calls:

```ts
const canvas = await painter.createCanvas(...);
let buffer = canvas.buffer;

buffer = await painter.createImage(..., buffer);
buffer = await painter.createText(..., buffer);
buffer = await painter.createImage(..., buffer);
buffer = await painter.drawPath(..., buffer);
buffer = await painter.createText(..., buffer);
```

This works, but it becomes hard to manage and can become slow because the buffer is repeatedly decoded, drawn onto, and encoded again.

The Scene / Surface API is designed to solve that.

---

# 1. Core idea

## Scene

A **Scene** is the final output image.

Example:

```ts
const scene = painter.createScene({
  width: 1600,
  height: 1000,
});
```

This means:

> Create one final 1600 × 1000 output canvas.

Everything in the scene is painted onto this final output.

---

## Layer

A **Layer** is one drawable item painted into the scene.

Examples of layers:

- image layer
- text layer
- shape layer
- chart layer
- path layer
- surface layer
- group layer
- GIF/video frame layer in future workflows

Layers must be painted in order.

Example:

```ts
layers: [
  { type: "image", props: {...} },
  { type: "text", props: {...} },
  { type: "image", props: {...} },
]
```

The first layer is painted first. The second layer appears above the first. The third appears above both.

This is the same logic as Photoshop layers, Figma layers, or normal canvas paint order.

---

## Surface

A **Surface** is a mini-canvas inside the scene.

It has:

- its own width and height
- its own local coordinate system
- its own internal layers
- optional background
- optional clipping
- optional border radius
- optional shadow
- optional stroke
- optional opacity / rotation / scale / blur
- optional cache

A surface is rendered offscreen first, then placed onto the parent scene as one layer.

Example:

```ts
{
  type: "surface",
  x: 585,
  y: 115,
  width: 505,
  height: 765,
  layers: [
    { type: "image", props: {...} },
    { type: "text", props: {...} },
  ]
}
```

This means:

> Create a hidden 505 × 765 mini-canvas, draw its internal layers using local coordinates, then place the result at x=585, y=115 on the main scene.

---

# 2. Why not call it another canvas?

The root output is already the main canvas.

If every mini-canvas is also called `canvas`, users may get confused:

```ts
scene({
  canvas: [
    {},
    {},
    {}
  ]
})
```

That raises questions:

- Which one is the real canvas?
- Which one controls the final output size?
- Are these separate files?
- Are they painted together?

So the cleaner terms are:

| Term | Meaning |
|---|---|
| Scene | final output composition |
| Root canvas | actual final drawing surface |
| Layer | one drawable item in paint order |
| Surface | mini-canvas / offscreen group inside the scene |
| Group | logical collection of layers, maybe without its own surface |
| Artboard | possible alternative name for surface, but more design-tool oriented |

Recommended name: **surface**.

Why?

Because it means:

> A drawable area that can contain its own children and be composited into a parent.

---

# 3. Why surfaces are useful

## 3.1 Local coordinates

Without a surface, every element uses global coordinates.

Example without surface:

```ts
{
  type: "image",
  props: {
    source: "circle",
    x: 710,
    y: 330,
    width: 250,
    height: 250,
  }
}
```

If this circle belongs to a center panel at:

```ts
center.x = 585;
center.y = 115;
```

You manually calculate:

```ts
globalX = 585 + 125 = 710
globalY = 115 + 215 = 330
```

With a surface, you write:

```ts
{
  type: "surface",
  x: 585,
  y: 115,
  width: 505,
  height: 765,
  layers: [
    {
      type: "image",
      props: {
        source: "circle",
        x: 125,
        y: 215,
        width: 250,
        height: 250,
      }
    }
  ]
}
```

Inside the surface:

```ts
x: 125
y: 215
```

means:

```ts
globalX = surface.x + localX
globalY = surface.y + localY
```

So:

```ts
globalX = 585 + 125 = 710
globalY = 115 + 215 = 330
```

Same visual result, much cleaner code.

---

## 3.2 Reusable components

A surface can act like a reusable component.

Example:

```ts
const metricCard = {
  type: "surface",
  width: 330,
  height: 235,
  layers: [
    {
      type: "text",
      props: {
        text: "SYSTEM HEALTH",
        x: 34,
        y: 52,
      }
    },
    {
      type: "text",
      props: {
        text: "98.7%",
        x: 34,
        y: 150,
      }
    }
  ]
};
```

Then reuse it:

```ts
layers: [
  { ...metricCard, x: 1130, y: 115 },
  { ...metricCard, x: 1130, y: 385 },
  { ...metricCard, x: 1130, y: 645 },
]
```

Without surfaces, you would need to manually recalculate every child’s x/y.

---

## 3.3 Group-level effects

A surface can receive effects after all its children are drawn.

Example:

```ts
{
  type: "surface",
  x: 585,
  y: 115,
  width: 505,
  height: 765,
  opacity: 0.9,
  rotation: -3,
  blur: 2,
  shadow: {
    color: "rgba(0,0,0,0.6)",
    blur: 40,
    offsetY: 20,
  },
  layers: [...]
}
```

This means:

1. Draw all children inside the surface.
2. Convert the surface to one composited layer.
3. Apply opacity / rotation / blur / shadow to the whole surface.
4. Draw it onto the parent scene.

Without surface, every child would need separate opacity/rotation/shadow. That is not the same result.

---

## 3.4 Clipping

A surface can clip its content.

Example:

```ts
{
  type: "surface",
  x: 100,
  y: 100,
  width: 400,
  height: 250,
  clip: true,
  borderRadius: 32,
  layers: [
    {
      type: "image",
      props: {
        source: "./large-background.png",
        x: -120,
        y: -80,
        width: 700,
        height: 420,
      }
    }
  ]
}
```

Anything outside the surface boundaries is cut off.

This is useful for:

- cards
- avatars
- thumbnails
- chart panels
- mini dashboards
- UI modules
- masks
- cinematic panels

---

## 3.5 Caching

A surface can be cached.

Example:

```ts
{
  type: "surface",
  id: "right-telemetry-panel",
  cache: true,
  layers: [...]
}
```

If the surface does not change, Apexify can reuse the rendered surface.

This is very useful for:

- GIF frames
- video frames
- repeated templates
- static backgrounds
- repeated card components
- expensive charts
- heavy text rendering

---

# 4. Recommended API styles

There are two good API styles:

1. object/config style
2. builder style

Both should be supported if possible.

---

## 4.1 Object/config style

Best for:

- JSON templates
- stored templates
- server-generated visuals
- no-code/low-code editors
- Studio UI
- reusable config files

Example:

```ts
const output = await painter.scene({
  width: 1600,
  height: 1000,

  background: {
    gradientBg: {
      type: "linear",
      colors: [
        { stop: 0, color: "#01030a" },
        { stop: 1, color: "#07142b" },
      ],
    },
    noiseBg: { intensity: 0.03 },
  },

  layers: [
    {
      type: "surface",
      id: "center-reactor",
      x: 585,
      y: 115,
      width: 505,
      height: 765,
      background: {
        transparentBase: true,
      },
      layers: [
        {
          type: "image",
          props: {
            source: "circle",
            x: 125,
            y: 215,
            width: 250,
            height: 250,
          },
        },
        {
          type: "text",
          props: {
            text: "AURORA",
            x: 252,
            y: 585,
            textAlign: "center",
          },
        },
      ],
    },
  ],
}).render();
```

---

## 4.2 Builder style

Best for:

- developers writing code
- dynamic generation
- loops
- conditionals
- reusable helper functions
- animation generation

Example:

```ts
const scene = painter.createScene({
  width: 1600,
  height: 1000,
});

scene.background({
  gradientBg: {
    type: "linear",
    colors: [
      { stop: 0, color: "#01030a" },
      { stop: 1, color: "#07142b" },
    ],
  },
});

scene.surface("center-reactor", {
  x: 585,
  y: 115,
  width: 505,
  height: 765,
  background: {
    transparentBase: true,
  },
  layers: [
    {
      type: "image",
      props: {
        source: "circle",
        x: 125,
        y: 215,
        width: 250,
        height: 250,
      },
    },
  ],
});

scene.text({
  text: "Generated with Apexify.js",
  x: 100,
  y: 930,
  font: { size: 24, family: "Arial" },
});

const buffer = await scene.render();
```

---

# 5. Important design rule: preserve paint order

A bad design would be:

```ts
scene({
  background: {},
  images: [],
  texts: [],
  charts: [],
});
```

Why is this bad?

Because it forces all images to render before all text, or all text before all charts.

But real designs need mixed order:

```txt
background
panel image
panel text
glow image
chart
overlay text
foreground particles
final title
```

So this is better:

```ts
scene({
  layers: [
    { type: "image", props: {...} },
    { type: "text", props: {...} },
    { type: "chart", ... },
    { type: "image", props: {...} },
    { type: "text", props: {...} },
  ]
})
```

A single ordered `layers[]` array is mandatory.

---

# 6. Proposed layer types

## 6.1 Image layer

Used for:

- images
- shapes
- rectangles
- circles
- stars
- polygons
- icons
- generated chart buffers
- external image URLs

Example:

```ts
{
  type: "image",
  props: {
    source: "rectangle",
    x: 100,
    y: 100,
    width: 400,
    height: 220,
    borderRadius: 32,
    shape: {
      fill: true,
      color: "rgba(255,255,255,0.05)",
    },
    stroke: {
      width: 1,
      color: "rgba(255,255,255,0.15)",
    },
  },
}
```

Internally this maps to current Apexify logic similar to `createImage`.

---

## 6.2 Text layer

Used for text.

Example:

```ts
{
  type: "text",
  props: {
    text: "AURORA CORE",
    x: 120,
    y: 160,
    font: {
      size: 48,
      family: "Arial",
    },
    bold: true,
    color: "#ffffff",
  },
}
```

Internally this maps to current Apexify logic similar to `createText`.

---

## 6.3 Path layer

Used for vector paths.

Example:

```ts
{
  type: "path",
  commands: [
    { type: "moveTo", x: 100, y: 100 },
    {
      type: "bezierCurveTo",
      cp1x: 300,
      cp1y: 50,
      cp2x: 500,
      cp2y: 300,
      x: 700,
      y: 200,
    },
  ],
  options: {
    stroke: {
      color: "rgba(0,234,255,0.5)",
      width: 4,
    },
  },
}
```

Internally this maps to `drawPath`.

---

## 6.4 Chart layer

Used for charts.

Example:

```ts
{
  type: "chart",
  chartType: "line",
  data: [
    {
      label: "Signal",
      color: "#00eaff",
      data: [
        { x: 1, y: 42 },
        { x: 2, y: 56 },
        { x: 3, y: 61 },
      ],
    },
  ],
  options: {
    dimensions: {
      width: 500,
      height: 260,
    },
  },
  placement: {
    x: 900,
    y: 600,
    width: 500,
    height: 260,
  },
}
```

Internal logic:

1. Render chart to a temporary buffer.
2. Draw that buffer into the parent scene at `placement`.

---

## 6.5 Surface layer

Used for mini-canvases / components.

Example:

```ts
{
  type: "surface",
  id: "metric-card",
  x: 100,
  y: 100,
  width: 330,
  height: 235,
  background: {
    transparentBase: true,
    borderRadius: 32,
  },
  layers: [
    {
      type: "text",
      props: {
        text: "SYSTEM HEALTH",
        x: 34,
        y: 52,
      },
    },
  ],
}
```

Internal logic:

1. Create offscreen canvas with size `width × height`.
2. Render surface background.
3. Render child layers using local coordinates.
4. Apply surface-level effects.
5. Draw the final surface onto parent at `x, y`.

---

## 6.6 Group layer

A group is similar to a surface, but may not create a separate backing canvas unless necessary.

Possible example:

```ts
{
  type: "group",
  opacity: 0.8,
  layers: [
    { type: "image", props: {...} },
    { type: "text", props: {...} },
  ],
}
```

Difference:

| Type | Creates offscreen canvas? | Has local coordinate system? | Can cache? | Best for |
|---|---:|---:|---:|---|
| group | optional | optional | maybe | simple logical grouping |
| surface | yes | yes | yes | components, clipping, effects, caching |

For first implementation, surface is more important than group.

---

# 7. Scene object shape proposal

A strong first design could be:

```ts
type SceneConfig = {
  width: number;
  height: number;
  background?: CanvasConfig;
  layers: SceneLayer[];
  output?: SceneOutputOptions;
};

type SceneLayer =
  | SceneImageLayer
  | SceneTextLayer
  | ScenePathLayer
  | SceneChartLayer
  | SceneSurfaceLayer;
```

Example:

```ts
const buffer = await painter.scene({
  width: 1600,
  height: 1000,
  background: {
    gradientBg: {...},
    bgLayers: [...],
    noiseBg: {...},
  },
  layers: [
    { type: "image", props: {...} },
    { type: "text", props: {...} },
    { type: "surface", ... },
  ],
}).render();
```

---

# 8. Surface object shape proposal

```ts
type SceneSurfaceLayer = {
  type: "surface";
  id?: string;

  x: number;
  y: number;
  width: number;
  height: number;

  background?: CanvasConfig;

  layers: SceneLayer[];

  opacity?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  translateX?: number;
  translateY?: number;
  blendMode?: GlobalCompositeOperation;

  clip?: boolean;
  borderRadius?: number | "circular";

  shadow?: ShadowOptions;
  stroke?: StrokeOptions;
  blur?: number;

  cache?: boolean | {
    key?: string;
    ttl?: number;
  };
};
```

---

# 9. Render logic

## 9.1 Current style

Current Apexify usage tends to do this:

```txt
createCanvas()
encode PNG
load PNG
draw image
encode PNG
load PNG
draw text
encode PNG
load PNG
draw path
encode PNG
```

This is simple but can be slow.

---

## 9.2 Scene render style

Scene rendering should do this:

```txt
create root canvas once
draw background
for each layer:
  draw directly onto active context
encode once at end
```

For surfaces:

```txt
create offscreen canvas
draw surface background
draw surface child layers
apply surface effects
draw offscreen canvas onto parent context
```

This avoids unnecessary encoding between every layer.

---

# 10. Recursive rendering

Surfaces can contain surfaces.

Example:

```ts
{
  type: "surface",
  id: "right-panel",
  x: 1130,
  y: 115,
  width: 330,
  height: 765,
  layers: [
    {
      type: "surface",
      id: "health-card",
      x: 0,
      y: 0,
      width: 330,
      height: 235,
      layers: [...]
    },
    {
      type: "surface",
      id: "telemetry-card",
      x: 0,
      y: 270,
      width: 330,
      height: 225,
      layers: [...]
    },
  ]
}
```

Rendering should be recursive:

```ts
async function renderLayer(layer, ctx, parentState) {
  switch (layer.type) {
    case "image":
      drawImageLayer(layer, ctx);
      break;

    case "text":
      drawTextLayer(layer, ctx);
      break;

    case "path":
      drawPathLayer(layer, ctx);
      break;

    case "chart":
      renderChartToBufferThenDraw(layer, ctx);
      break;

    case "surface":
      const surfaceBuffer = await renderSurface(layer);
      drawSurfaceBuffer(surfaceBuffer, ctx, layer);
      break;
  }
}
```

---

# 11. Coordinate logic

## 11.1 Root scene

Root scene coordinates:

```txt
0,0 = top-left of final output
```

Example:

```ts
{
  type: "text",
  props: {
    x: 100,
    y: 100,
  }
}
```

This appears at x=100, y=100 in the final image.

---

## 11.2 Surface coordinates

Surface child coordinates:

```txt
0,0 = top-left of the surface
```

Example:

```ts
{
  type: "surface",
  x: 500,
  y: 200,
  width: 300,
  height: 200,
  layers: [
    {
      type: "text",
      props: {
        x: 20,
        y: 40,
      }
    }
  ]
}
```

The text global position is:

```txt
x = 500 + 20 = 520
y = 200 + 40 = 240
```

But the user does not need to calculate that manually.

---

# 12. Surface-level transformation logic

A surface can be transformed as one object.

Recommended transform order:

```txt
render surface offscreen
save parent ctx
apply parent transform around surface pivot
apply opacity/blend/blur
draw surface image
restore parent ctx
```

Example:

```ts
{
  type: "surface",
  x: 500,
  y: 200,
  width: 300,
  height: 200,
  rotation: -4,
  pivot: "center",
  opacity: 0.9,
  layers: [...]
}
```

Default pivot:

```txt
center of surface
```

Equivalent:

```ts
pivotX = x + width / 2
pivotY = y + height / 2
```

---

# 13. Background logic for scene and surface

A root scene background can use the existing `CanvasConfig`.

Example:

```ts
background: {
  gradientBg: {...},
  bgLayers: [...],
  patternBg: {...},
  noiseBg: {...},
}
```

A surface background can also use the same config, but with local size.

Example:

```ts
{
  type: "surface",
  width: 400,
  height: 250,
  background: {
    transparentBase: true,
    bgLayers: [
      { type: "color", value: "rgba(255,255,255,0.04)" },
      { type: "noise", intensity: 0.03 },
    ],
    stroke: {...},
    shadow: {...},
  },
}
```

Important:

A surface background should be rendered inside the surface’s local canvas, not globally.

---

# 14. How this maps to current Apexify features

Current Apexify has:

- `createCanvas`
- `createImage`
- `createText`
- `createChart`
- `drawPath`
- `createGIF`
- `createVideo`
- `measureText`
- `getPixelData`
- `manipulatePixels`

The scene API should not replace these.

It should sit above them.

Current API:

```ts
painter.createImage(...)
```

New high-level API:

```ts
painter.scene({ layers: [...] }).render()
```

Both should exist.

---

# 15. Why this improves performance

The current buffer chain repeatedly does expensive work:

```txt
PNG encode
PNG decode
canvas redraw
PNG encode again
```

The scene renderer can keep one context alive.

Better:

```txt
draw everything
encode once
```

Surfaces may still use offscreen canvases, but only where useful.

Performance benefits:

- fewer PNG encodes
- fewer image reloads
- fewer buffer conversions
- easier batching
- reusable cached modules
- better animation frame generation

---

# 16. What should be cached?

Cacheable items:

- static surfaces
- static charts
- repeated panels
- loaded images
- loaded fonts
- generated patterns
- masks
- expensive text blocks
- background layers

Example:

```ts
{
  type: "surface",
  id: "static-bg",
  cache: true,
  layers: [...]
}
```

Cache key logic:

```txt
cacheKey = layer.id + hash(layer config)
```

If same key appears again, reuse rendered buffer.

---

# 17. Animation support later

The scene/surface architecture becomes very powerful for animation.

Example:

```ts
const timeline = painter.timeline({
  width: 1600,
  height: 1000,
  frames: 120,
});

timeline.scene((frame) => ({
  width: 1600,
  height: 1000,
  layers: [
    {
      type: "surface",
      x: 585,
      y: 115,
      width: 505,
      height: 765,
      rotation: frame * 0.2,
      layers: [...]
    }
  ]
}));
```

Then:

```ts
await timeline.renderGIF();
await timeline.renderVideo();
await timeline.renderFrames();
```

Surfaces make animation easier because you animate entire modules, not every child.

---

# 18. Example: full scene with surfaces

```ts
const buffer = await painter.scene({
  width: 1600,
  height: 1000,

  background: {
    gradientBg: {
      type: "linear",
      startX: 0,
      startY: 0,
      endX: 1600,
      endY: 1000,
      colors: [
        { stop: 0, color: "#01030a" },
        { stop: 1, color: "#07142b" },
      ],
    },
    noiseBg: { intensity: 0.03 },
  },

  layers: [
    {
      type: "surface",
      id: "left-panel",
      x: 115,
      y: 115,
      width: 430,
      height: 765,
      background: {
        transparentBase: true,
      },
      layers: [
        {
          type: "image",
          props: {
            source: "rectangle",
            x: 0,
            y: 0,
            width: 430,
            height: 255,
            borderRadius: 34,
            shape: {
              fill: true,
              color: "rgba(255,255,255,0.05)",
            },
          },
        },
        {
          type: "text",
          props: {
            text: "AURORA CORE",
            x: 32,
            y: 62,
            font: { size: 33, family: "Arial" },
            bold: true,
            color: "rgba(255,255,255,0.72)",
          },
        },
      ],
    },

    {
      type: "surface",
      id: "center-reactor",
      x: 585,
      y: 115,
      width: 505,
      height: 765,
      background: {
        transparentBase: true,
      },
      layers: [
        {
          type: "image",
          props: {
            source: "circle",
            x: 125,
            y: 215,
            width: 250,
            height: 250,
            shape: {
              fill: true,
              gradient: {
                type: "radial",
                colors: [
                  { stop: 0, color: "rgba(0,234,255,0.9)" },
                  { stop: 1, color: "rgba(0,0,0,0)" },
                ],
              },
            },
          },
        },
        {
          type: "text",
          props: {
            text: "AURORA",
            x: 252,
            y: 585,
            textAlign: "center",
            font: { size: 64, family: "Arial" },
            bold: true,
            color: "#ffffff",
          },
        },
      ],
    },
  ],
}).render();
```

---

# 19. Builder API full example

```ts
const scene = painter.createScene({
  width: 1600,
  height: 1000,
});

scene.background({
  gradientBg: {
    type: "linear",
    colors: [
      { stop: 0, color: "#01030a" },
      { stop: 1, color: "#07142b" },
    ],
  },
});

const leftPanel = scene.surface("left-panel", {
  x: 115,
  y: 115,
  width: 430,
  height: 765,
  background: {
    transparentBase: true,
  },
});

leftPanel.image({
  source: "rectangle",
  x: 0,
  y: 0,
  width: 430,
  height: 255,
  borderRadius: 34,
  shape: {
    fill: true,
    color: "rgba(255,255,255,0.05)",
  },
});

leftPanel.text({
  text: "AURORA CORE",
  x: 32,
  y: 62,
  font: { size: 33, family: "Arial" },
  bold: true,
  color: "rgba(255,255,255,0.72)",
});

const center = scene.surface("center-reactor", {
  x: 585,
  y: 115,
  width: 505,
  height: 765,
});

center.image({
  source: "circle",
  x: 125,
  y: 215,
  width: 250,
  height: 250,
});

center.text({
  text: "AURORA",
  x: 252,
  y: 585,
  textAlign: "center",
  font: { size: 64, family: "Arial" },
});

const buffer = await scene.render();
```

---

# 20. Implementation plan

## Phase 1: basic scene renderer

Add:

```ts
painter.scene(config).render()
painter.createScene(config)
```

Support layers:

- image
- text
- path
- chart
- surface

Do not implement animation first.

---

## Phase 2: direct context drawing

Avoid calling public methods that return buffers between each layer.

Instead expose internal renderer functions that can draw directly onto an existing context:

```ts
drawImageLayer(ctx, imageProps)
drawTextLayer(ctx, textProps)
drawPathLayer(ctx, commands, options)
```

This is the actual performance win.

---

## Phase 3: surface rendering

Add recursive offscreen rendering:

```ts
renderSurface(surfaceLayer): Promise<CanvasLike>
```

Features:

- local coordinates
- local background
- clipping
- border radius
- stroke
- shadow
- opacity
- blend mode
- transform
- cache

---

## Phase 4: chart placement

Charts can initially render to buffer, then draw as image.

Later, charts can draw directly to context.

---

## Phase 5: cache manager

Add:

```ts
SceneRenderCache
AssetCache
FontCache
ChartCache
SurfaceCache
```

---

## Phase 6: timeline / animation

After scene works:

```ts
painter.timeline()
```

Generate frames using scenes.

---

# 21. Things to avoid

Do not do this:

```ts
scene({
  images: [],
  texts: [],
  charts: []
})
```

It destroys paint order.

Do not do this:

```ts
scene({
  canvas: [{}, {}, {}]
})
```

It confuses root canvas and mini canvases.

Do not require users to manually calculate global coordinates for components.

Do not encode PNG after every layer.

Do not make the scene API replace the existing API. Keep both.

---

# 22. Final architecture summary

Recommended mental model:

```txt
Scene
 ├─ background
 ├─ Layer: image
 ├─ Layer: text
 ├─ Layer: surface
 │   ├─ local background
 │   ├─ local image
 │   ├─ local text
 │   ├─ local chart
 │   └─ local path
 ├─ Layer: chart
 ├─ Layer: path
 └─ final encode
```

Short explanation:

> A scene is the final output.  
> A surface is a mini-canvas inside the scene.  
> Layers paint in order.  
> Surfaces allow local coordinates, clipping, reusable components, group effects, and caching.  
> The renderer should draw everything into live canvases and encode only once at the end.

---

# 23. Best naming recommendation

Use:

```ts
painter.createScene()
```

and:

```ts
type: "surface"
```

Do not call sub-canvases `canvas`.

Recommended names:

| Feature | Name |
|---|---|
| final output | scene |
| mini canvas | surface |
| ordered drawable item | layer |
| reusable visual block | component |
| group without offscreen canvas | group |
| final PNG/JPEG/WebP result | render output |

---

# 24. Why this matters for Apexify.js

Apexify already has many primitives.

The missing step is composition architecture.

This feature would move Apexify from:

> a collection of drawing utilities

to:

> a programmable visual rendering engine

That is a much stronger position.

It would make advanced visuals easier, performance better, templates cleaner, and animations more realistic to build later.
