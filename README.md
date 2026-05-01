# 🎨 Apexify.js - The Ultimate Canvas & Image Processing Library

<div align="center">

![Apexify.js Banner](https://imgur.com/0E9GTmP)

**🚀 One Library. Infinite Possibilities. Professional Results.**

[![npm version](https://badge.fury.io/js/apexify.js.svg)](https://badge.fury.io/js/apexify.js)
[![npm downloads](https://img.shields.io/npm/dt/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**The most powerful, all-in-one canvas rendering and image processing library for Node.js**

**🚀 Now Even More Advanced: Full Canvas API Compatibility + Advanced Extensions**

</div>

---

## 🏆 Why Apexify.js is Better Than Everything Else

### **The Only Library That Does It All**

While other libraries force you to install multiple packages for different tasks, **Apexify.js gives you everything in one place**:

| Feature | Apexify.js | Other Libraries |
|---------|-----------|-----------------|
| **Canvas Rendering** | ✅ Built-in | ❌ Separate library needed |
| **Image Processing** | ✅ Built-in | ❌ Requires Sharp/Jimp |
| **Video Processing** | ✅ Built-in (33+ features) | ❌ Requires FFmpeg wrapper |
| **Chart Generation** | ✅ Built-in (6 chart types) | ❌ Requires Chart.js/Recharts |
| **GIF Creation** | ✅ Built-in | ❌ Separate library needed |
| **Text Rendering** | ✅ Advanced (gradients, paths, effects) | ❌ Basic only |
| **Shape Drawing** | ✅ Complex shapes (heart, star, custom) | ❌ Basic shapes only |
| **Batch Processing** | ✅ Built-in | ❌ Manual implementation |
| **Text Metrics API** | ✅ Advanced (Canvas API + extensions) | ❌ Not available |
| **Pixel Data API** | ✅ Advanced (get/set/manipulate) | ❌ Not available |
| **Path2D API** | ✅ Advanced (full Canvas compatibility) | ⚠️ Basic only |
| **Hit Detection** | ✅ Advanced (multi-region, custom) | ❌ Not available |
| **TypeScript Support** | ✅ Full type safety | ⚠️ Partial or none |
| **Performance** | ✅ Rust-powered (@napi-rs) | ⚠️ JavaScript-only |

### **Why Developers Choose Apexify.js**

✅ **Zero Configuration** - Works out of the box, no complex setup  
✅ **TypeScript First** - Complete type definitions for everything  
✅ **Rust-Powered Performance** - Built on @napi-rs/canvas for blazing speed  
✅ **Modular Architecture** - Clean, maintainable codebase  
✅ **Comprehensive Features** - 200+ methods covering every use case  
✅ **Canvas API Compatible** - Full Canvas API support with advanced extensions  
✅ **Advanced APIs** - Text Metrics, Pixel Data, Path2D, Hit Detection  
✅ **Active Development** - Regular updates with new features  
✅ **Production Ready** - Used in production by thousands of projects  

---

## 🎯 Where Apexify.js Shines

### **Perfect For:**

- 🚀 **Next.js Applications** - Server-side image generation, API routes, ISR
- 🤖 **Discord Bots** - Welcome cards, level-up graphics, profile images
- 🛒 **E-commerce** - Product image generation, banners, marketing materials
- 📱 **Social Media** - Profile pictures, cover images, post graphics
- 🎮 **Gaming** - Game assets, UI elements, character cards
- 💼 **Business** - Business cards, certificates, professional documents
- 🎨 **Design Tools** - Build Photoshop-like applications
- 📊 **Data Visualization** - Charts, graphs, infographics
- 🎬 **Video Editing** - Thumbnails, previews, effects, transitions
- 🔄 **Automation** - Batch processing, thumbnail generation, asset creation

---

## ✨ Complete Feature List

### 🎨 **Canvas & Backgrounds**

| Feature | Description |
|---------|-------------|
| **Solid Colors** | Custom background colors with opacity control |
| **Gradients** | Linear, radial, and conic gradients with custom stops |
| **Image Backgrounds** | Custom images with filters, opacity, and positioning |
| **Video Backgrounds** | Extract frames from videos as backgrounds |
| **Patterns** | Professional pattern overlays (dots, lines, grids, custom) |
| **Noise Effects** | Add texture and grain to backgrounds |
| **Zoom Effects** | Apply zoom transformations to backgrounds |
| **Layered backgrounds (`bgLayers`)** | Stack color, gradient, image, pattern, or noise passes after the base fill — each layer supports opacity and blend mode |

### 🖼️ **Image Processing**

| Feature | Description |
|---------|-------------|
| **Image Drawing** | Draw images with positioning, scaling, rotation |
| **Image Filters** | Blur, sharpen, brightness, contrast, saturation |
| **Color Filters** | Grayscale, sepia, invert, custom color adjustments |
| **Professional Filters** | Vintage, cinematic, black & white, custom presets |
| **Image Effects** | Vignette, lens flare, chromatic aberration, film grain |
| **Image Masking** | Alpha, luminance, and inverse masking modes |
| **Image Distortion** | Perspective, bulge/pinch, mesh warping |
| **Image Cropping** | Inner and outer cropping with precise control |
| **Image Resizing** | Smart resizing with aspect ratio preservation |
| **Background Removal** | AI-powered background removal |
| **Color Detection** | Extract dominant colors from images |
| **Color Removal** | Remove specific colors from images |
| **Image Rotation** | Rotate images with custom angles |
| **Image Blending** | 15+ blend modes (multiply, screen, overlay, etc.); **`createImage`** supports per-layer **`blendMode`** (bitmaps & shapes) and **`blendMode`** on grouped **`createImage`** options |
| **Image Stitching** | Stitch multiple images together (horizontal, vertical, grid) |
| **Image Collage** | Create collages with grid, masonry, carousel layouts |
| **Image Compression** | Compress images (JPEG, WebP, AVIF) with quality control |
| **Color Palette Extraction** | Extract color palettes using k-means, median-cut, octree |

### 📝 **Text Rendering**

| Feature | Description |
|---------|-------------|
| **Basic Text** | Simple text rendering with fonts and colors |
| **Enhanced Text** | Advanced text with shadows, strokes, glows |
| **Text Gradients** | Gradient text fills (linear, radial, conic) |
| **Text on Paths** | Render text along curves, arcs, and bezier paths |
| **Custom Fonts** | Load custom fonts (.ttf, .otf, .woff) |
| **Text Decorations** | Bold, italic, underline, strikethrough |
| **Text Effects** | Shadows, strokes, glows, outlines |
| **Text Alignment** | Left, center, right, justify alignment |
| **Text Wrapping** | Automatic text wrapping with custom widths |
| **Text Rotation** | Rotate text at any angle |
| **Text Spacing** | Letter spacing and line height control |
| **Text Metrics API** | Advanced text measurement (Canvas API + extensions) |
| **Character Metrics** | Per-character width and position metrics |
| **Multi-line Metrics** | Line-by-line text metrics for wrapped text |

### 🔷 **Shape Drawing**

| Feature | Description |
|---------|-------------|
| **Basic Shapes** | Rectangle, circle, ellipse, line, polygon |
| **Complex Shapes** | Heart, star, custom path shapes |
| **Shape Fills** | Solid colors, gradients, patterns, images |
| **Shape Strokes** | Custom stroke width, color, style (solid, dashed, dotted) |
| **Shape Shadows** | Drop shadows with blur, offset, color |
| **Shape Rotation** | Rotate shapes with custom angles |
| **Shape Scaling** | Scale shapes with custom factors |
| **Advanced Strokes** | Groove, ridge, double, inset, outset styles |
| **Arc & PieSlice** | Draw arcs and pie slice sectors with custom angles |
| **Path2D API** | Advanced path creation and manipulation |
| **Hit Detection** | Point-in-shape detection with custom regions |

### 📊 **Chart Generation**

| Feature | Description |
|---------|-------------|
| **Pie Charts** | Standard and donut pie charts with gradients |
| **Bar Charts** | Standard, grouped, stacked, waterfall, lollipop charts |
| **Horizontal Bar Charts** | All bar chart types in horizontal orientation |
| **Line Charts** | Multi-series line charts with gradients |
| **Axis readability** | Tick labels inherit axis colors (readable on dark chart backgrounds); rotated Y-axis titles spaced from tick numbers; X-axis title spaced below tick labels |
| **Line chart frame** | Optional **`borderRadius` / `borderWidth` / `borderColor`** on line chart appearance — frame drawn after plot content |
| **Comparison Charts** | Side-by-side comparison of any two chart types |
| **Chart Customization** | Gradients, custom fonts, legends, labels, titles |
| **Data Visualization** | Professional charts for data presentation |

### 🎬 **Video Processing** (33+ Features)

| Feature | Description |
|---------|-------------|
| **Video Info** | Extract video metadata (duration, resolution, FPS, bitrate) |
| **Frame Extraction** | Extract single or multiple frames at specific times |
| **Video Thumbnails** | Generate thumbnail grids from videos |
| **Video Conversion** | Convert between formats (MP4, WebM, AVI, MOV, MKV) |
| **Video Trimming** | Trim videos to specific time ranges |
| **Audio Extraction** | Extract audio tracks from videos |
| **Video Watermarking** | Add image or text watermarks to videos |
| **Speed Control** | Change video playback speed (slow motion, time-lapse) |
| **Video Effects** | Apply filters (blur, brightness, contrast, saturation) |
| **Video Merging** | Merge multiple videos (sequential, side-by-side, grid) |
| **Segment Replacement** | Replace video segments with other videos or frames |
| **Video Rotation** | Rotate videos (90°, 180°, 270°) |
| **Video Cropping** | Crop videos to specific regions |
| **Video Compression** | Compress videos with quality presets |
| **Text Overlays** | Add text/subtitles to videos with positioning |
| **Fade Effects** | Add fade in/out transitions |
| **Reverse Playback** | Reverse video and audio |
| **Video Loops** | Create seamless video loops |
| **Batch Processing** | Process multiple videos in parallel |
| **Scene Detection** | Detect scene changes in videos |
| **Video Stabilization** | Reduce camera shake and stabilize footage |
| **Color Correction** | Professional color grading (brightness, contrast, saturation, hue) |
| **Picture-in-Picture** | Add overlay videos with positioning |
| **Split Screen** | Create multi-video layouts (side-by-side, grid) |
| **Time-lapse Creation** | Speed up videos to create time-lapses |
| **Audio Control** | Mute, adjust volume, normalize audio levels |
| **Format Detection** | Analyze video properties and formats |
| **Freeze Frame** | Hold a frame for dramatic effect |
| **Export Presets** | Platform-optimized presets (YouTube, Instagram, TikTok, etc.) |
| **Progress Tracking** | Real-time progress callbacks for all operations |
| **Audio Normalization** | Professional audio leveling (LUFS, Peak, RMS) |
| **LUT Support** | Apply Look-Up Tables for cinematic color grading |
| **Video Transitions** | 9 transition types (fade, wipe, slide, zoom, rotate, etc.) |
| **Animated Text** | 8 animation types (fadeIn, slideIn, zoom, bounce, typewriter, etc.) |
| **Frame-to-Video (`createFromFrames`)** | Encode a sequence of image paths or buffers to MP4/WebM/etc. (requires **FFmpeg** on the host) |

### 🎞️ **GIF Creation**

| Feature | Description |
|---------|-------------|
| **GIF Generation** | Create animated GIFs from image sequences |
| **Typed frames** | **`GIFInputFrame`** / **`GIFEncodedFrame`** — buffers, paths, URLs, durations, optional per-frame **`dispose`**, **`transparentColor`**, **`watermark`** |
| **Programmatic frames (`onStart`)** | Build frames in code without passing all frames up front; return an array or **`AsyncIterable`** of encoded frames for streaming / lower peak memory |
| **Globals & hints** | **`transparentColor`**, **`defaultDispose`**, global watermark, **`skipResizeWhenDimensionsMatch`**, **`delay`** / **`frameCount`** / **`duration`** hints, **`textOverlay`**, **`onEnd`** (post-process final composite) |
| **Frame Management** | Add frames with custom durations |
| **GIF Watermarking** | Global or per-frame watermarks (**`GIFWatermarkSpec`**) |
| **Text Overlays** | Add text to GIF frames |
| **Output Formats** | File, buffer, base64, attachment output |
| **Quality Control** | Adjust GIF quality and optimization |

### 🔬 **Advanced APIs** ⭐ NEW!

| Feature | Description |
|---------|-------------|
| **Text Metrics API** | Complete text measurement matching Canvas API + extensions |
| **Pixel Data API** | Direct pixel manipulation (get/set/manipulate pixels) |
| **Pixel Filters** | Built-in filters (grayscale, invert, sepia, brightness, contrast) |
| **Custom Pixel Processors** | Custom functions for pixel-level processing |
| **Path2D API** | Advanced path creation with commands (moveTo, lineTo, arc, bezier, etc.) |
| **Path Drawing** | Draw paths with stroke, fill, and transform options |
| **Hit Detection** | Point-in-path and point-in-region detection |
| **Custom Regions** | Rectangle, circle, ellipse, polygon, path, and custom function regions |
| **Multi-Region Detection** | Test points against multiple regions simultaneously |
| **Distance Calculation** | Calculate distances from points to region edges |

### 🛠️ **Utilities & Tools**

| Feature | Description |
|---------|-------------|
| **Batch Operations** | Process multiple operations in parallel |
| **Chain Operations** | Chain operations sequentially |
| **Format Conversion** | Convert between PNG, JPEG, WebP, AVIF, SVG |
| **Smart Saving** | Save with timestamps, counters, custom naming |
| **Multiple Formats** | Export to PNG, JPEG, WebP, AVIF, GIF |
| **Custom Lines** | Advanced line drawing with arrows, markers, patterns |
| **Smooth Paths** | Create smooth curves with tension control |
| **Catmull-Rom Splines** | Professional curve interpolation |

---

## 🚀 Quick Start

```bash
npm install apexify.js
```

```typescript
import { ApexPainter } from 'apexify.js';

const painter = new ApexPainter();

// Create a canvas
  const canvas = await painter.createCanvas({
    width: 1200,
    height: 630,
    gradientBg: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#667EEA' },
        { stop: 1, color: '#764BA2' }
      ]
    }
  });
  
// Add text
const text = await painter.createText({
  text: 'Hello, World!',
    x: 600,
    y: 315,
  fontSize: 48,
    color: '#FFFFFF',
  fontFamily: 'Arial'
}, canvas);

// Add image
const image = await painter.createImage({
  source: 'path/to/image.png',
  x: 100,
  y: 100,
  width: 200,
  height: 200
  }, canvas);

// Advanced: Text Metrics API
const metrics = await painter.measureText({
  text: 'Hello, World!',
  fontSize: 48,
  fontFamily: 'Arial',
  includeCharMetrics: true
});
console.log(`Text width: ${metrics.width}px`);

// Advanced: Pixel Data API
const pixelData = await painter.getPixelData(image.buffer, {
  x: 0, y: 0, width: 100, height: 100
});
const processed = await painter.manipulatePixels(image.buffer, {
  filter: 'grayscale',
  intensity: 1.0
});

// Advanced: Path2D API
const path = painter.createPath2D([
  { type: 'moveTo', x: 0, y: 0 },
  { type: 'lineTo', x: 100, y: 100 },
  { type: 'arc', x: 150, y: 150, radius: 50, startAngle: 0, endAngle: Math.PI }
]);
await painter.drawPath(canvas.buffer, path, {
  stroke: { color: '#ff0000', width: 2 },
  fill: { color: '#00ff00', opacity: 0.5 }
});

// Advanced: Hit Detection API
const hitResult = await painter.isPointInRegion({
  type: 'circle',
  x: 100, y: 100, radius: 50
}, 120, 120);
console.log(`Point hit: ${hitResult.hit}`);
  
// Save result
await painter.save(image, { 
  path: './output.png',
  format: 'png'
});
```

---

## 📦 Installation

```bash
npm install apexify.js
# or
yarn add apexify.js
# or
pnpm add apexify.js
```

**Requirements:**
- Node.js 16+ 
- TypeScript 5+ (optional but recommended)

---

## 🎯 Use Cases

### **Next.js Applications**
Generate images in API routes, server actions, and edge functions. Perfect for dynamic OG images, social media previews, and on-demand image generation.

### **Discord Bots**
Create stunning welcome cards, level-up graphics, profile images, and leaderboards. All with a simple API.

### **E-commerce Platforms**
Generate product images, banners, marketing materials, and promotional graphics automatically.

### **Social Media Tools**
Create profile pictures, cover images, post graphics, and story templates programmatically.

### **Design Tools**
Build Photoshop-like applications with code export capabilities and professional image processing.

### **Data Visualization**
Generate charts, graphs, and infographics for reports, dashboards, and presentations.

### **Video Production**
Create thumbnails, previews, apply effects, transitions, and process videos at scale.

---

## 🔥 Performance

- **Rust-Powered**: Built on @napi-rs/canvas for native performance
- **Optimized Algorithms**: Efficient image processing and rendering
- **Batch Processing**: Process multiple operations in parallel
- **Memory Efficient**: Smart resource management and cleanup
- **Canvas API Native**: Direct access to Canvas APIs for maximum performance

---

## 📚 Documentation

- **Full Documentation**: [https://apexifyjs.vercel.app](https://apexifyjs.vercel.app)
- **GitHub Repository**: [https://github.com/EIAS79/Apexify.js](https://github.com/EIAS79/Apexify.js)
- **Changelog**: See [CHANGELOG.md](./CHANGELOG.md) for version history

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

## ⭐ Star History

If you find Apexify.js useful, please consider giving it a star on GitHub!

---

<div align="center">

**Made with ❤️ by the Apexify.js community**

[Documentation](https://apexifyjs.vercel.app) • [GitHub](https://github.com/EIAS79/Apexify.js) • [npm](https://www.npmjs.com/package/apexify.js) • [Report Bug](https://github.com/EIAS79/Apexify.js/issues)

</div>
