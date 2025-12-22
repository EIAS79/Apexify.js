# 🎨 ApexPainter - Advanced Canvas Rendering Library

<div align="center">

![ApexPainter Banner](https://imgur.com/0E9GTmP)

**🚀 One Library. Infinite Possibilities. Professional Results.**

[![npm version](https://badge.fury.io/js/apexify.js.svg)](https://badge.fury.io/js/apexify.js)
[![npm downloads](https://img.shields.io/npm/dt/apexify.js.svg)](https://www.npmjs.com/package/apexify.js)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green.svg)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-Compatible-black?logo=next.js)](https://nextjs.org/)
[![Discord](https://img.shields.io/badge/Discord-Bot%20Ready-7289DA?logo=discord)](https://discord.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**The most powerful, versatile canvas rendering library for Node.js, Next.js, Discord bots, and beyond.**

*Create stunning visuals, generate images on-the-fly, build design tools, and power your applications with professional-grade canvas rendering and image processing.*

</div>

## 🌟 Why ApexPainter?

**ApexPainter is not just another canvas library** - it's a complete visual creation toolkit that works everywhere:

- ✅ **Next.js** - Perfect for both frontend and backend image generation
- ✅ **Discord Bots** - Create dynamic images, welcome cards, level-up cards, and more
- ✅ **Server-Side Rendering** - Generate images in API routes, server actions, and edge functions
- ✅ **Design Tools** - Build Photoshop-like applications with code export capabilities
- ✅ **Web Applications** - Power your websites with dynamic image generation
- ✅ **Automation** - Batch process images, create thumbnails, generate social media assets
- ✅ **E-commerce** - Generate product images, banners, and marketing materials
- ✅ **Social Media** - Create profile pictures, cover images, and post graphics
- ✅ **Gaming** - Generate game assets, UI elements, and character cards
- ✅ **Business** - Create business cards, certificates, and professional documents

**One library. Every use case. Zero compromises.**

---

## 🎯 Perfect For

### 🚀 **Next.js Applications**
Generate images in your Next.js app - both client and server-side. Perfect for:
- **API Routes**: Generate images on-demand via API endpoints
- **Server Actions**: Create images in server-side functions
- **Static Generation**: Pre-generate images at build time
- **Edge Functions**: Lightweight image generation at the edge
- **ISR (Incremental Static Regeneration)**: Update images dynamically

```typescript
// Next.js API Route Example
// app/api/generate-image/route.ts
import { ApexPainter } from 'apexify.js';
import { NextResponse } from 'next/server';

export async function GET() {
  const painter = new ApexPainter();
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
  return new NextResponse(canvas.buffer, {
    headers: { 'Content-Type': 'image/png' }
  });
}
```

### 🤖 **Discord Bots**
Create stunning visuals for your Discord bot:
- **Welcome Cards**: Personalized welcome images for new members
- **Level-Up Cards**: Celebrate user achievements with custom graphics
- **Profile Cards**: Generate user profile images with stats
- **Leaderboards**: Visual leaderboard images
- **Custom Commands**: Generate images on-demand via slash commands
- **Event Graphics**: Create event banners and announcements

```typescript
// Discord Bot Example (discord.js)
import { ApexPainter } from 'apexify.js';
import { AttachmentBuilder } from 'discord.js';

const painter = new ApexPainter();
const canvas = await painter.createCanvas({
  width: 800,
  height: 400,
  customBg: { source: userAvatar },
  // Add welcome text, decorations, etc.
});

const attachment = new AttachmentBuilder(canvas.buffer, { name: 'welcome.png' });
await channel.send({ files: [attachment] });
```

### 🎨 **Design Tools & Photoshop-Like Apps**
Build powerful design applications:
- **Visual Design Editors**: Create drag-and-drop design tools
- **Code Export**: Convert visual designs into ApexPainter code
- **Template Systems**: Pre-built templates for common designs
- **Layer Management**: Complex compositions with multiple layers
- **Export Options**: Multiple formats (PNG, JPEG, WebP, AVIF)
- **Batch Processing**: Process multiple designs at once

```typescript
// Design Tool with Code Export
const design = {
  canvas: { width: 1920, height: 1080, colorBg: '#ffffff' },
  elements: [
    { type: 'shape', source: 'rectangle', x: 100, y: 100, /* ... */ },
    { type: 'text', text: 'Hello World', x: 200, y: 200, /* ... */ }
  ]
};

// Generate code from design
const code = generateApexPainterCode(design);
// Export as: await painter.createCanvas(...)
```

### 🌐 **Web Applications**
Power your websites with dynamic image generation:
- **OG Images**: Generate Open Graph images for social sharing
- **Thumbnails**: Auto-generate thumbnails for content
- **Banners**: Create dynamic banners and headers
- **User Avatars**: Generate custom avatars with initials
- **Charts & Graphs**: Visualize data with beautiful charts
- **QR Codes**: Generate QR codes with custom styling

### 📱 **Social Media & Marketing**
Create professional marketing materials:
- **Social Media Posts**: Generate posts for Instagram, Twitter, Facebook
- **Story Graphics**: Create engaging story images
- **Banner Ads**: Design eye-catching banner advertisements
- **Email Graphics**: Generate images for email campaigns
- **Product Images**: Create product showcases and catalogs

### 🎮 **Gaming Applications**
Generate game assets and UI elements:
- **Character Cards**: Create character profile cards
- **Achievement Badges**: Design achievement and trophy graphics
- **Game UI**: Generate UI elements and HUD components
- **Loading Screens**: Create dynamic loading screen graphics
- **Leaderboards**: Visual leaderboard displays

---

## ✨ Features Overview

### 🖼️ **Advanced Image Processing**
- **Professional Filters**: 22+ filters including blur, sharpen, vintage, cinematic effects
- **Image Masking**: Apply masks with alpha, luminance, or inverse modes
- **Image Distortion**: Perspective, bulge, pinch, and mesh warping effects
- **Effects Stack**: Vignette, lens flare, chromatic aberration, film grain
- **Shape Drawing**: 8+ shapes (rectangle, circle, heart, star, polygon, etc.)
- **Gradient Support**: Linear and radial gradients for fills and strokes
- **Shadow & Stroke Effects**: Customizable shadows and strokes for all shapes
- **Rotation & Positioning**: Full control over image placement and rotation
- **Image Stitching**: Combine multiple images into panoramas or grids
- **Collage Maker**: Create beautiful collages with multiple layout options
- **Image Compression**: Optimize images with quality control (JPEG, WebP, AVIF)
- **Color Palette Extraction**: Extract color palettes using multiple algorithms

### 🎨 **Rich Background System**
- **Multiple Background Types**: Solid colors, gradients, custom images
- **Video Backgrounds**: Extract frames from videos for dynamic backgrounds
- **Background Filters**: Apply filters directly to background images
- **Pattern Overlays**: 12+ built-in patterns (grid, dots, stripes, hexagons, etc.)
- **Custom Patterns**: Use your own images as repeating patterns
- **Blend Modes**: 11+ blend modes for professional compositing
- **Noise Effects**: Add texture with customizable noise intensity

### 📝 **Enhanced Text Rendering**
- **Font Management**: Custom fonts, sizes, families, and styles
- **Text on Paths**: Render text along curves (line, arc, bezier, quadratic)
- **Text Decorations**: Bold, italic, underline, overline, strikethrough, highlight
- **Advanced Effects**: Glow, shadow, stroke with gradient support
- **Spacing Control**: Letter spacing, word spacing, line height
- **Text Wrapping**: Automatic text wrapping with size constraints
- **Rotation**: Full 360° text rotation support

### 🎯 **Advanced Custom Lines**
- **Smooth Paths**: Bezier, Catmull-Rom, and smooth interpolation
- **Arrow Markers**: Customizable start/end arrows with multiple styles
- **Path Markers**: Add markers at any position along paths
- **Line Patterns**: Dots, dashes, and custom pattern segments
- **Line Textures**: Apply texture images to lines

### 🔧 **Professional Tools**
- **Chart Generation**: Bar charts, pie charts, line charts
- **GIF Creation**: Animated GIFs from image sequences
- **Format Conversion**: Convert between PNG, JPEG, WebP, AVIF, and more
- **Image Manipulation**: Crop, resize, background removal
- **Color Detection**: Extract and analyze colors from images
- **Batch Operations**: Process multiple operations in parallel
- **Chain Operations**: Chain operations sequentially for complex workflows
- **Advanced File Saving**: Save buffers to local files with smart naming, format conversion, and batch support

### 🎬 **Comprehensive Video Processing** (v5.2.0+)
- **Frame Extraction**: Extract single frames, multiple frames, or all frames from videos
- **Video Information**: Get video metadata (duration, resolution, FPS, bitrate, codec)
- **Thumbnail Generation**: Create grid thumbnails with multiple frames
- **Format Conversion**: Convert videos between MP4, WebM, AVI, MOV, MKV
- **Video Trimming**: Cut and trim video segments
- **Audio Extraction**: Extract audio tracks (MP3, WAV, AAC, OGG)
- **Watermarking**: Add image watermarks to videos with position and opacity control
- **Speed Control**: Change video playback speed (slow motion, fast forward)
- **Preview Generation**: Generate preview frames for video browsing
- **Video Effects**: Apply filters (blur, brightness, contrast, saturation, grayscale, sepia, invert, sharpen, noise)
- **Video Merging**: Concatenate videos sequentially, side-by-side, or in grids
- **Rotation & Flipping**: Rotate videos (90°, 180°, 270°) and flip horizontally/vertically
- **Video Cropping**: Crop videos to specific regions
- **Compression**: Optimize video file sizes with quality presets
- **Text Overlays**: Add text/subtitles to videos with positioning and timing
- **Fade Effects**: Add fade in/out transitions
- **Reverse Playback**: Reverse video and audio playback
- **Video Loops**: Create seamless video loops
- **Batch Processing**: Process multiple videos with different operations
- **Scene Detection**: Automatically detect scene changes
- **Video Stabilization**: Reduce camera shake and stabilize shaky footage
- **Color Correction**: Professional color grading (brightness, contrast, saturation, hue, temperature)
- **Picture-in-Picture**: Add overlay videos with position, size, and opacity control
- **Split Screen**: Create side-by-side, top-bottom, or grid layouts with multiple videos
- **Time-lapse Creation**: Speed up videos to create time-lapse effects
- **Audio Control**: Mute videos or adjust audio volume
- **Format Detection**: Analyze video codec, container, and properties

---

## 🚀 Quick Start

### Installation

```bash
# npm
npm install apexify.js

# yarn
yarn add apexify.js

# pnpm
pnpm add apexify.js
```

### Platform Support

✅ **Node.js** - Full support (v16+)  
✅ **Next.js** - Frontend & Backend (App Router & Pages Router)  
✅ **Discord.js** - Perfect for Discord bots  
✅ **Express.js** - API endpoints and server-side rendering  
✅ **Serverless** - AWS Lambda, Vercel, Netlify Functions  
✅ **Docker** - Containerized applications  
✅ **Edge Runtime** - Vercel Edge, Cloudflare Workers (with limitations)

### Works Everywhere

- 🖥️ **Server-Side**: Full feature support
- 🌐 **API Routes**: Generate images on-demand
- ⚡ **Edge Functions**: Lightweight image generation
- 🤖 **Discord Bots**: Dynamic image creation
- 🎨 **Design Tools**: Build visual editors
- 📱 **Web Apps**: Client and server-side rendering

### Basic Usage

```typescript
import { ApexPainter } from 'apexify';

const painter = new ApexPainter();

// Create a canvas with gradient background
const canvas = await painter.createCanvas({
  width: 800,
  height: 600,
  gradientBg: {
    type: 'linear',
    colors: [
      { color: '#FF6B6B', position: 0 },
      { color: '#4ECDC4', position: 0.5 },
      { color: '#45B7D1', position: 1 }
    ],
    direction: { x1: 0, y1: 0, x2: 800, y2: 600 }
  },
  shadow: {
    color: '#000',
    offsetX: 10,
    offsetY: 10,
    blur: 20
  },
  borderRadius: 20
});

// Add a beautiful heart shape (single object)
const heartImage = await painter.createImage({
  source: 'heart',
  x: 300,
  y: 200,
  width: 200,
  height: 200,
  shape: {
    fill: true,
    gradient: {
      type: 'radial',
      colors: [
        { color: '#FF6B6B', position: 0 },
        { color: '#FF1744', position: 1 }
      ],
      center: { x: 100, y: 100 },
      radius: 100
    }
  },
  shadow: {
    color: '#000',
    offsetX: 15,
    offsetY: 15,
    blur: 25
  },
  stroke: {
    color: '#FFF',
    width: 5
  }
}, canvas.buffer);

// Add stunning text (single object)
const textImage = await painter.createText({
  text: 'ApexPainter',
  x: 400,
  y: 450,
  fontSize: 48,
  fontFamily: 'Arial',
  bold: true,
  gradient: {
    type: 'linear',
    colors: [
      { color: '#FFD700', position: 0 },
      { color: '#FF6B6B', position: 1 }
    ],
    direction: { x1: 0, y1: 0, x2: 300, y2: 0 }
  },
  glow: {
    color: '#FFD700',
    intensity: 0.8,
    opacity: 0.9
  },
  shadow: {
    color: '#000',
    offsetX: 8,
    offsetY: 8,
    blur: 15
  },
  stroke: {
    color: '#FFF',
    width: 3
  }
}, heartImage);

// Save the result using the advanced save method
const saveResult = await painter.save(textImage, {
  directory: './output',
  filename: 'beautiful-artwork',
  format: 'png'
});
console.log(`Saved to: ${saveResult.path} (${saveResult.size} bytes)`);

// Or use the simple approach (auto-generated filename)
const autoSave = await painter.save(textImage);
// Saves to: ./ApexPainter_output/20241220_143025_123.png
```

### 💾 **Advanced Save Method**

The `save()` method provides powerful file saving capabilities with extensive customization:

```typescript
// Simple save with auto-generated timestamp name
const canvas = await painter.createCanvas({ width: 800, height: 600 });
const result = await painter.save(canvas.buffer);
// Saves to: ./ApexPainter_output/20241220_143025_123.png

// Custom filename and directory
await painter.save(canvas.buffer, {
  directory: './my-images',
  filename: 'my-canvas',
  format: 'jpg',
  quality: 95
});

// Save with counter naming
await painter.save(canvas.buffer, {
  naming: 'counter',
  prefix: 'image-',
  counterStart: 1
});
// Saves to: ./ApexPainter_output/image-1.png, image-2.png, etc.

// Save multiple buffers in batch
const buffers = [canvas1.buffer, canvas2.buffer, canvas3.buffer];
const results = await painter.saveMultiple(buffers, {
  prefix: 'batch-',
  naming: 'counter'
});
// Saves: batch-1.png, batch-2.png, batch-3.png
```

**Save Options:**
- `directory` - Output directory (default: `./ApexPainter_output`)
- `filename` - Custom filename (auto-generated if not provided)
- `format` - File format: `png`, `jpg`, `jpeg`, `webp`, `avif`, `gif` (default: `png`)
- `quality` - Quality for JPEG/WebP (0-100, default: 90)
- `naming` - Naming pattern: `timestamp`, `counter`, or `custom` (default: `timestamp`)
- `prefix` / `suffix` - Add prefix/suffix to filenames
- `overwrite` - Overwrite existing files (default: `false`, auto-renames if exists)
- `createDirectory` - Auto-create directory if missing (default: `true`)

### 📝 **Flexible Array Support**

Both `createImage()` and `createText()` methods accept **single objects** OR **arrays of objects**:

```typescript
// ✅ Single Object
await painter.createImage({
  source: 'heart',
  x: 100, y: 100,
  width: 200, height: 200,
  shape: { fill: true, color: '#ff6b6b' }
}, canvasBuffer);

// ✅ Array of Objects
await painter.createImage([
  {
    source: 'rectangle',
    x: 50, y: 50,
    width: 100, height: 80,
    shape: { fill: true, color: '#ff6b6b' }
  },
  {
    source: 'circle',
    x: 200, y: 50,
    width: 80, height: 80,
    shape: { fill: true, color: '#4ecdc4' }
  },
  {
    source: 'star',
    x: 350, y: 50,
    width: 80, height: 80,
    shape: { fill: true, color: '#45b7d1' }
  }
], canvasBuffer);

// ✅ Single Text Object
await painter.createText({
  text: 'Hello World',
  x: 100, y: 100,
  fontSize: 24,
  color: '#ff6b6b'
}, canvasBuffer);

// ✅ Array of Text Objects
await painter.createText([
  {
    text: 'Title',
    x: 100, y: 50,
    fontSize: 32,
    bold: true,
    color: '#2c3e50'
  },
  {
    text: 'Subtitle',
    x: 100, y: 100,
    fontSize: 18,
    color: '#666'
  },
  {
    text: 'Body text with effects',
    x: 100, y: 150,
    fontSize: 14,
    color: '#333',
    glow: { color: '#ffd700', intensity: 0.5 },
    shadow: { color: '#000', offsetX: 2, offsetY: 2, blur: 4 }
  }
], canvasBuffer);
```

### 🎨 **Advanced Stroke Styles**

All stroke properties now support **6 different stroke styles**:

```typescript
// ✅ Basic Stroke Styles
await painter.createImage({
  source: 'rectangle',
  x: 100, y: 100,
  width: 200, height: 150,
  shape: { fill: true, color: '#ffffff' },
  stroke: {
    color: '#ff6b6b',
    width: 8,
    style: 'dashed'  // solid, dashed, dotted, groove, ridge, double
  }
}, canvasBuffer);

// ✅ Gradient Strokes with Styles
await painter.createImage({
  source: 'circle',
  x: 200, y: 200,
  width: 150, height: 150,
  shape: { fill: true, color: '#ffffff' },
  stroke: {
    gradient: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#ff6b6b' },
        { stop: 1, color: '#4ecdc4' }
      ]
    },
    width: 6,
    style: 'ridge'  // Works with all styles!
  }
}, canvasBuffer);

// ✅ Text Strokes with Styles
await painter.createText({
  text: 'Styled Text',
  x: 100, y: 100,
  fontSize: 32,
  color: '#ffffff',
  stroke: {
    color: '#ff6b6b',
    width: 4,
    style: 'double'  // All 6 styles supported!
  }
}, canvasBuffer);
```

**Available Stroke Styles:**
- `solid` - Clean solid line (default)
- `dashed` - Dashed line pattern
- `dotted` - Dotted line pattern  
- `groove` - 3D grooved effect (dark outer, light inner)
- `ridge` - 3D ridged effect (light outer, dark inner)
- `double` - Double parallel lines

### 🔤 **Organized Font Management**

Text fonts are now organized in a clean `font` object structure:

```typescript
// ✅ New Font Object Structure
await painter.createText({
  text: 'Organized Font',
  x: 100, y: 100,
  font: {
    size: 24,           // Font size in pixels
    family: 'Arial',    // Font family name
    name: 'customFont', // Custom font name (for registration)
    path: './fonts/custom.ttf' // Path to custom font file
  },
  color: '#333333',
  bold: true,
  italic: true
}, canvasBuffer);

// ✅ Backward Compatibility (Legacy Properties)
await painter.createText({
  text: 'Legacy Font Properties',
  x: 100, y: 150,
  fontSize: 24,         // Still works!
  fontFamily: 'Arial',  // Still works!
  fontName: 'customFont', // Still works!
  fontPath: './fonts/custom.ttf', // Still works!
  color: '#333333'
}, canvasBuffer);

// ✅ Mixed Usage (New Object Takes Priority)
await painter.createText({
  text: 'Mixed Usage',
  x: 100, y: 200,
  font: {
    size: 28,
    family: 'Georgia'
  },
  fontSize: 24,        // Ignored (font.size takes priority)
  fontFamily: 'Arial', // Ignored (font.family takes priority)
  color: '#333333'
}, canvasBuffer);
```

**Font Object Properties:**
- `size` - Font size in pixels (replaces `fontSize`)
- `family` - Font family name (replaces `fontFamily`)
- `name` - Custom font name for registration (replaces `fontName`)
- `path` - Path to custom font file (replaces `fontPath`)

**Benefits:**
- **Cleaner Structure**: All font properties in one organized object
- **Better IntelliSense**: IDE autocomplete for font properties
- **Backward Compatible**: Legacy properties still work
- **Priority System**: New `font` object overrides legacy properties

### 🌈 **Advanced Text Gradient Features**

Text effects now support **gradients** for enhanced visual appeal:

```typescript
// ✅ Gradient Glow
await painter.createText({
  text: 'Gradient Glow Text',
  x: 100, y: 100,
  fontSize: 32,
  color: '#ffffff',
  glow: {
    gradient: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#ff6b6b' },
        { stop: 1, color: '#4ecdc4' }
      ]
    },
    intensity: 15,
    opacity: 0.9
  }
}, canvasBuffer);

// ✅ Gradient Highlight
await painter.createText({
  text: 'Gradient Highlight',
  x: 100, y: 150,
  fontSize: 24,
  color: '#000000',
  highlight: {
    gradient: {
      type: 'radial',
      colors: [
        { stop: 0, color: '#ffd700' },
        { stop: 1, color: '#ff6b6b' }
      ]
    },
    opacity: 0.6
  }
}, canvasBuffer);

// ✅ Gradient Text Decorations
await painter.createText({
  text: 'Styled Decorations',
  x: 100, y: 200,
  fontSize: 28,
  color: '#ffffff',
  underline: {
    gradient: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#ff6b6b' },
        { stop: 1, color: '#4ecdc4' }
      ]
    },
    width: 4
  },
  overline: {
    gradient: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#feca57' },
        { stop: 1, color: '#ff9ff3' }
      ]
    },
    width: 3
  },
  strikethrough: {
    gradient: {
      type: 'linear',
      colors: [
        { stop: 0, color: '#96ceb4' },
        { stop: 1, color: '#45b7d1' }
      ]
    },
    width: 5
  }
}, canvasBuffer);

// ✅ Backward Compatibility (Simple Boolean)
await painter.createText({
  text: 'Simple Decorations',
  x: 100, y: 250,
  fontSize: 24,
  color: '#ffffff',
  underline: true,        // Uses default color
  overline: true,         // Uses default color  
  strikethrough: true     // Uses default color
}, canvasBuffer);
```

**Gradient Support:**
- **Glow**: Gradient glow effects with intensity and opacity
- **Highlight**: Gradient background highlights
- **Underline**: Custom gradient underlines with width control
- **Overline**: Custom gradient overlines with width control  
- **Strikethrough**: Custom gradient strikethrough with width control
- **Backward Compatible**: Simple `boolean` values still work

---

## 🎯 Real-World Examples

### 🏢 **Business Cards & Marketing Materials**

```typescript
// Create a professional business card
const businessCard = await painter.createCanvas({
  width: 400,
  height: 250,
  gradientBg: {
    type: 'linear',
    colors: [
      { color: '#2C3E50', position: 0 },
      { color: '#34495E', position: 1 }
    ],
    direction: { x1: 0, y1: 0, x2: 400, y2: 250 }
  },
  patternBg: {
    type: 'dots',
    color: '#FFF',
    opacity: 0.1,
    size: 5,
    spacing: 20
  }
});

// Add company logo (star shape)
const logo = await painter.createImage({
  source: 'star',
  x: 50,
  y: 50,
  width: 60,
  height: 60,
  fill: true,
  color: '#FFD700',
  shadow: { color: '#000', offsetX: 3, offsetY: 3, blur: 8 }
}, businessCard.buffer);

// Add company name
const companyText = await painter.createText({
  text: 'ACME Corp',
  x: 130,
  y: 80,
  fontSize: 24,
  fontFamily: 'Arial',
  bold: true,
  color: '#FFF',
  shadow: { color: '#000', offsetX: 2, offsetY: 2, blur: 4 }
}, logo);

// Add contact info
const contactText = await painter.createText({
  text: 'john@acme.com\n+1 (555) 123-4567',
  x: 50,
  y: 150,
  fontSize: 14,
  fontFamily: 'Arial',
  color: '#BDC3C7',
  lineHeight: 1.5
}, companyText);
```

### 🎮 **Game UI Elements**

```typescript
// Create a game button
const gameButton = await painter.createCanvas({
  width: 200,
  height: 60,
  gradientBg: {
    type: 'linear',
    colors: [
      { color: '#FF6B6B', position: 0 },
      { color: '#FF1744', position: 1 }
    ],
    direction: { x1: 0, y1: 0, x2: 200, y2: 60 }
  },
  shadow: {
    color: '#000',
    offsetX: 5,
    offsetY: 5,
    blur: 15
  },
  borderRadius: 30
});

// Add button text with glow effect
const buttonText = await painter.createText({
  text: 'PLAY NOW',
  x: 100,
  y: 35,
  fontSize: 20,
  fontFamily: 'Arial',
  bold: true,
  color: '#FFF',
  textAlign: 'center',
  textBaseline: 'middle',
  glow: {
    color: '#FFD700',
    intensity: 0.6,
    opacity: 0.8
  },
  shadow: {
    color: '#000',
    offsetX: 2,
    offsetY: 2,
    blur: 4
  }
}, gameButton.buffer);
```

---

## 📚 API Reference

### 🔄 **Flexible Parameters**

Both `createImage()` and `createText()` methods accept:
- **Single Object**: `ImageProperties` or `TextProperties`
- **Array of Objects**: `ImageProperties[]` or `TextProperties[]`

This allows you to add multiple elements in one call for better performance and cleaner code.

### Shape Types

- `rectangle` - Standard rectangle
- `square` - Perfect square
- `circle` - Perfect circle
- `triangle` - Equilateral triangle
- `trapezium` - Trapezoid shape
- `star` - 5-pointed star
- `heart` - Heart shape with bezier curves
- `polygon` - Custom polygon

### Pattern Types

- `grid` - Grid pattern
- `dots` - Dot pattern
- `diagonal` - Diagonal lines
- `stripes` - Horizontal/vertical stripes
- `waves` - Wave pattern
- `crosses` - Cross pattern
- `hexagons` - Hexagonal pattern
- `checkerboard` - Checkerboard pattern
- `diamonds` - Diamond pattern
- `triangles` - Triangle pattern
- `stars` - Star pattern
- `polka` - Polka dot pattern
- `custom` - Custom image pattern

---

## 🆕 What's New

### 🎬 v5.2.0 - Comprehensive Video Processing Suite

#### 18 New Video Features
- 🎥 **Video Effects & Filters**: Apply professional filters (blur, brightness, contrast, saturation, grayscale, sepia, invert, sharpen, noise)
- 🔗 **Video Merging**: Concatenate videos sequentially, side-by-side, or in grid layouts
- 🔄 **Rotation & Flipping**: Rotate videos (90°, 180°, 270°) and flip horizontally/vertically
- ✂️ **Video Cropping**: Crop videos to specific regions with precise control
- 📦 **Video Compression**: Optimize video file sizes with quality presets and custom bitrate
- 📝 **Text Overlays**: Add text/subtitles to videos with 7 position options and time-based visibility
- 🌅 **Fade Effects**: Add fade in/out transitions at video start/end
- ⏪ **Reverse Playback**: Reverse video and audio playback
- 🔁 **Video Loops**: Create seamless video loops
- ⚡ **Batch Processing**: Process multiple videos with different operations
- 🎬 **Scene Detection**: Automatically detect scene changes with configurable threshold
- 📹 **Video Stabilization**: Reduce camera shake and stabilize shaky footage
- 🎨 **Color Correction**: Professional color grading (brightness, contrast, saturation, hue, temperature)
- 📺 **Picture-in-Picture**: Add overlay videos with position, size, and opacity control
- 🖼️ **Split Screen**: Create side-by-side, top-bottom, or grid layouts with multiple videos
- ⏱️ **Time-lapse Creation**: Speed up videos to create time-lapse effects
- 🔇 **Audio Control**: Mute videos or adjust audio volume
- 🔍 **Format Detection**: Analyze video codec, container, and properties

#### Enhanced Video Methods
- ✅ **Smart Audio Detection**: Automatically detects if videos have audio streams
- ✅ **Unified API**: All video features accessible through single `createVideo()` method
- ✅ **Better Error Handling**: Clear error messages with FFmpeg installation guides
- ✅ **Resource Management**: Automatic cleanup of temporary files

### 🎉 v5.0.0 - Major Feature Release

#### Background Enhancements
- ✨ **Video Backgrounds**: Use video frames as dynamic backgrounds
- 🎨 **Background Filters**: Apply filters directly to background images
- 🔧 **Background Opacity**: Control transparency of background images

#### Image Processing
- 🎭 **Image Masking**: Apply masks with multiple modes (alpha, luminance, inverse)
- 🔄 **Image Distortion**: Perspective, bulge, pinch, and mesh warping
- ✨ **Effects Stack**: Vignette, lens flare, chromatic aberration, film grain
- 🎛️ **Enhanced Filters**: Filter intensity and order control

#### Text Features
- 📐 **Text on Paths**: Render text along curves and custom paths

#### Custom Lines
- ➡️ **Arrow Markers**: Start/end arrows with customizable styles
- 📍 **Path Markers**: Add markers at any position along paths
- 🎨 **Line Patterns**: Dots, dashes, and custom patterns
- 🖼️ **Line Textures**: Apply texture images to lines

#### New Utilities
- ⚡ **Batch Operations**: Process multiple operations in parallel
- 🔗 **Chain Operations**: Chain operations sequentially
- 🖼️ **Image Stitching**: Combine images into panoramas
- 🎨 **Collage Maker**: Create beautiful image collages
- 📦 **Image Compression**: Optimize images with quality control
- 🎨 **Color Palette Extraction**: Extract color palettes from images
- 💾 **Advanced Save Method**: Save buffers to files with smart naming, format conversion, and batch support

See [CHANGELOG.md](CHANGELOG.md) for complete details.

---

## 💼 Real-World Use Cases

### 🎯 **Next.js Image Generation API**

```typescript
// app/api/og-image/route.ts
import { ApexPainter } from 'apexify.js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get('title') || 'Default Title';
  
  const painter = new ApexPainter();
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
  
  const image = await painter.createText({
    text: title,
    x: 600,
    y: 315,
    fontSize: 72,
    bold: true,
    color: '#FFFFFF',
    textAlign: 'center'
  }, canvas);
  
  return new NextResponse(image, {
    headers: { 'Content-Type': 'image/png' }
  });
}
```

### 🤖 **Discord Bot Welcome Card**

```typescript
// discord-bot.ts
import { ApexPainter } from 'apexify.js';
import { Client, GatewayIntentBits, AttachmentBuilder } from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.GuildMembers] });
const painter = new ApexPainter();

client.on('guildMemberAdd', async (member) => {
  // Create welcome card
  const canvas = await painter.createCanvas({
    width: 1024,
    height: 500,
    customBg: { source: './assets/welcome-bg.jpg' }
  });
  
  const image = await painter.createText([
    {
      text: `Welcome ${member.user.username}!`,
      x: 512,
      y: 200,
      fontSize: 48,
      bold: true,
      color: '#FFFFFF',
      textAlign: 'center'
    },
    {
      text: `You are member #${member.guild.memberCount}`,
      x: 512,
      y: 280,
      fontSize: 32,
      color: '#CCCCCC',
      textAlign: 'center'
    }
  ], canvas);
  
  const attachment = new AttachmentBuilder(image, { name: 'welcome.png' });
  await member.guild.systemChannel?.send({ files: [attachment] });
});
```

### 🎨 **Design Tool with Code Export**

```typescript
// design-editor.ts
import { ApexPainter } from 'apexify.js';

class DesignEditor {
  private painter = new ApexPainter();
  private design: any = { elements: [] };
  
  // Add element to design
  addElement(element: any) {
    this.design.elements.push(element);
  }
  
  // Render design
  async render() {
    const canvas = await this.painter.createCanvas(this.design.canvas);
    let buffer = canvas.buffer;
    
    for (const element of this.design.elements) {
      if (element.type === 'shape') {
        buffer = await this.painter.createImage(element, buffer);
      } else if (element.type === 'text') {
        buffer = await this.painter.createText(element, buffer);
      }
    }
    
    return buffer;
  }
  
  // Export as ApexPainter code
  exportCode() {
    return `
import { ApexPainter } from 'apexify.js';

const painter = new ApexPainter();
const canvas = await painter.createCanvas(${JSON.stringify(this.design.canvas, null, 2)});
${this.design.elements.map((el: any, i: number) => 
  `const step${i} = await painter.${el.type === 'shape' ? 'createImage' : 'createText'}(${JSON.stringify(el, null, 2)}, ${i === 0 ? 'canvas' : `step${i-1}`});`
).join('\n')}
    `.trim();
  }
}
```

### 📊 **Dynamic Chart Generation**

```typescript
// analytics-dashboard.ts
import { ApexPainter } from 'apexify.js';

async function generateAnalyticsChart(data: number[]) {
  const painter = new ApexPainter();
  
  const chart = await painter.createChart({
    chartType: 'bar',
    chartNumber: 1,
    data: {
      chartData: { width: 800, height: 400 },
      xLabels: data.map((_, i) => i),
      yLabels: [0, 25, 50, 75, 100],
      data: {
        xAxis: data.map((value, i) => ({
          label: `Day ${i + 1}`,
          value,
          position: { startsXLabel: i * 80, endsXLabel: (i + 1) * 80 }
        })),
        yAxis: data
      }
    }
  });
  
  return chart;
}
```

### 🖼️ **Batch Image Processing**

```typescript
// image-processor.ts
import { ApexPainter } from 'apexify.js';

async function processUserUploads(images: string[]) {
  const painter = new ApexPainter();
  
  // Process all images in parallel
  const results = await painter.batch(
    images.map(image => ({
      type: 'image' as const,
      config: {
        source: image,
        x: 0,
        y: 0,
        filters: [{ type: 'gaussianBlur', radius: 5 }],
        borderRadius: 20
      }
    }))
  );
  
  // Save all processed images
  await painter.saveMultiple(results, {
    directory: './processed',
    prefix: 'processed-',
    naming: 'counter'
  });
  
  return results;
}
```

---

## 🎓 Learning Resources

### 📺 **Video Tutorials**
Comprehensive video series covering:
- Getting started with ApexPainter
- Next.js integration
- Discord bot development
- Building design tools
- Advanced features and techniques

### 📚 **Documentation**
- [Full API Reference](https://apexifyjs.vercel.app)
---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. **Report Bugs**: Found a bug? Open an issue with detailed information
2. **Feature Requests**: Have an idea? We'd love to hear it!
3. **Code Contributions**: Submit pull requests for improvements
4. **Documentation**: Help improve our docs and examples

### Development Setup

```bash
# Clone the repository
git clone https://github.com/EIAS79/Apexify.js.git

# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build
```

---

## 📞 Support & Community

<div align="center">

### Join Our Discord Community

[![Jedi Studio](https://img.shields.io/badge/Discord-Jedi%20Studio-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/CS2NRSPyze)
[![Ethical Programming](https://img.shields.io/badge/Discord-FresedGPT-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/94qUZWhwFE)


### Documentation & Resources

[![Documentation](https://img.shields.io/badge/Docs-Apexify.js-blue?style=for-the-badge)](https://apexifyjs.vercel.app)
[![Support Server](https://img.shields.io/badge/Support-Discord-7289DA?style=for-the-badge&logo=discord)](https://discord.gg/mDyXV9hzXw)

</div>

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **@napi-rs/canvas** - High-performance canvas rendering
- **Sharp** - Professional image processing
- **Jimp** - JavaScript image manipulation
- **TypeScript** - Type-safe development

---

<div align="center">

**Made with ❤️ by [Jedi Studio](https://discord.gg/CS2NRSPyze)**

*Create stunning visuals with ApexPainter - The ultimate canvas library for Node.js*

</div>
