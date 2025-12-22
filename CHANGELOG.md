# Changelog

All notable changes to Apexify.js will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.1.0] - 2024-12-20

### ✨ Added

##### New Video Methods
- **`createVideo()`**: New method to create canvas with video frame as background
  - Extract frames at specific time or frame number
  - Custom canvas dimensions or auto-use video dimensions
  - Returns `CanvasResults` compatible with other ApexPainter methods

##### Comprehensive Video Processing Features (18 New Features!)
- **Video Effects/Filters** (`applyEffects`): Apply professional filters to entire videos
  - Blur, brightness, contrast, saturation adjustments
  - Grayscale, sepia, invert effects
  - Sharpen and noise filters
  - Chain multiple filters together

- **Video Merging** (`merge`): Combine multiple videos
  - Sequential concatenation (one after another)
  - Side-by-side layout
  - Grid layouts with customizable rows/columns

- **Video Rotation/Flip** (`rotate`): Transform video orientation
  - Rotate 90°, 180°, 270°
  - Horizontal, vertical, or both flips
  - Combined rotation and flip support

- **Video Cropping** (`crop`): Crop videos to specific regions
  - Precise x, y, width, height control
  - Remove black bars or focus on specific areas
  - Maintain aspect ratio or create custom crops

- **Video Compression** (`compress`): Optimize video file sizes
  - Quality presets: low, medium, high, ultra
  - Custom bitrate control
  - Target file size optimization
  - Returns compression statistics (original vs compressed size)

- **Text Overlay** (`addText`): Add text/subtitles to videos
  - 7 position options (top-left, top-center, top-right, center, bottom-left, bottom-center, bottom-right)
  - Customizable font size, color, background
  - Time-based visibility (start/end time control)
  - Professional subtitle styling

- **Fade Effects** (`addFade`): Add fade transitions
  - Fade in at video start
  - Fade out at video end
  - Configurable fade duration

- **Reverse Playback** (`reverse`): Reverse video and audio
  - Create rewind effects
  - Perfect for creative video editing

- **Video Loop Creation** (`createLoop`): Create seamless loops
  - Automatic loop generation
  - Smooth loop detection (optional)

- **Batch Processing** (`batch`): Process multiple videos at once
  - Apply same or different operations to multiple videos
  - Parallel processing support
  - Comprehensive result reporting

- **Scene Detection** (`detectScenes`): Detect scene changes
  - Automatic scene boundary detection
  - Configurable threshold sensitivity
  - Export scene markers to JSON

- **Video Stabilization** (`stabilize`): Reduce camera shake
  - Two-pass stabilization algorithm
  - Configurable smoothing factor
  - Fallback to simple deshake if advanced features unavailable

- **Color Correction** (`colorCorrect`): Professional color grading
  - Brightness, contrast, saturation adjustments
  - Hue rotation
  - Color temperature adjustment
  - Professional color grading tools

- **Picture-in-Picture** (`pictureInPicture`): Add overlay videos
  - 5 position options
  - Customizable overlay size
  - Opacity control
  - Perfect for video overlays and annotations

- **Split Screen** (`splitScreen`): Create multi-video layouts
  - Side-by-side layout
  - Top-bottom layout
  - Grid layouts (2x2, 3x3, etc.)
  - Support for multiple video sources

- **Time-lapse Creation** (`createTimeLapse`): Speed up videos
  - Configurable speed multiplier
  - Create time-lapse from regular videos
  - Maintain video quality

- **Mute Video** (`mute`): Remove audio track
  - Quick audio removal
  - Maintains video quality

- **Volume Adjustment** (`adjustVolume`): Control audio levels
  - Volume multiplier (0.0 to 10.0)
  - Mute, reduce, or amplify audio
  - Precise volume control

- **Format Detection** (`detectFormat`): Analyze video properties
  - Detect codec, container format
  - Get resolution, FPS, bitrate
  - Complete video metadata extraction

### 🔧 Improved

##### Enhanced `createVideo()` Method
- **Unified API**: All video features now accessible through single `createVideo()` method
- **Nested Options**: Clean, organized API with nested option objects
- **Better Error Handling**: Comprehensive error messages with FFmpeg installation guides
- **Resource Management**: Automatic cleanup of temporary files
- **Path Resolution**: Improved handling of relative paths and Buffer inputs

##### Video Processing Performance
- **Optimized FFmpeg Commands**: Better command construction for all operations
- **Efficient Resource Usage**: Proper cleanup and memory management
- **Timeout Handling**: Appropriate timeouts for different operation types
- **Buffer Management**: Optimized buffer sizes for different operations

##### Video Processing Enhancements
- **Better Path Resolution**: Relative video paths are now properly resolved
  - Automatically resolves paths relative to `process.cwd()`
  - Consistent with how `customBg` handles image paths
  - Better error messages when video files are not found

- **Enhanced Error Handling**: More informative error messages
  - Detailed FFmpeg installation instructions in error messages
  - OS-specific installation guides (Windows, macOS, Linux)
  - Clear error messages when frame extraction fails
  - Validation for empty buffers and invalid dimensions

- **Improved Frame Loading**: Better compatibility with `loadImage`
  - Fallback to file-based loading if buffer loading fails
  - Automatic cleanup of temporary files
  - Better handling of different pixel formats


### 🐛 Fixed

##### Video Background Fixes
- **Fixed Black Background Issue**: Resolved issue where `videoBg` in `createCanvas` was showing black background
  - Restructured background drawing logic to include `videoBg` in if/else chain
  - Prevents default black background from being drawn on top of video frames
  - Video backgrounds now render correctly without black overlay

- **Fixed FFmpeg Command Issues**: Improved video frame extraction reliability
  - Removed invalid format flags (`-f png`, `-f mjpeg`) that caused extraction failures
  - Improved pixel format handling: PNG uses `rgba`, JPEG uses default format
  - Better path resolution for relative video file paths
  - Enhanced error messages with detailed FFmpeg installation instructions

- **Fixed Frame Extraction Quality**: Improved video frame extraction accuracy
  - Better seeking accuracy by placing `-ss` after `-i` in FFmpeg commands
  - Added fallback mechanism: saves frame to temp file if buffer loading fails
  - Force PNG format for `videoBg` to ensure compatibility with `loadImage`
  - Proper pixel format handling for color accuracy


---

## [5.0.5] - 2024-12-20

### ✨ Enhanced

##### Ultra-Smooth Line Rendering
- **Improved Smooth Path Algorithm**: Enhanced `createSmoothPath` function for graph-like smoothness
  - Increased resolution from 20 to 50 segments per curve for ultra-smooth rendering
  - Added high-quality anti-aliasing (`imageSmoothingQuality: 'high'`)
  - Optimized Cardinal Spline algorithm for better curve interpolation
  - Improved control point calculation for seamless transitions

- **Enhanced Catmull-Rom Spline**: Upgraded `createCatmullRomPath` for professional graph quality
  - Increased resolution from 30 to 60 segments per curve (graph-quality smoothness)
  - Fixed Catmull-Rom formula for correct tension handling
  - Added high-quality anti-aliasing for pixel-perfect rendering
  - Optimized spline interpolation for maximum smoothness

- **Anti-Aliasing Support**: Enabled high-quality image smoothing across all custom line rendering
  - Automatic anti-aliasing in `customLines` function
  - High-quality smoothing in both smooth and Catmull-Rom path types
  - Ensures graph-like smoothness with no visible segments or sharp edges

#### 🎯 Performance & Quality
- **Ultra-High Resolution Curves**: Lines now render with 50-60 segments per curve (previously 20-30)
- **Graph-Quality Smoothness**: Lines match the smoothness of professional graphing libraries
- **Optimized Tension Values**: Lower default tension (0.15-0.2) for maximum smoothness
- **Seamless Transitions**: Improved curve interpolation eliminates visible segments

#### 📝 Usage Improvements
- **Better Defaults**: Optimized tension values for graph-like smoothness
- **Enhanced Documentation**: Updated examples with recommended settings for ultra-smooth lines
- **Flexible Configuration**: Support for tension values 0.1-0.3 for different smoothness levels

---

## [5.0.0] - 2024-12-20

### 🎉 Major Feature Release - Advanced Image & Canvas Features

#### ✨ Added

##### Background Enhancements
- **Background Image Filters**: Apply filters directly to background images via `customBg.filters`
- **Background Image Opacity**: Control background image transparency with `customBg.opacity`
- **Video Backgrounds**: Support for video backgrounds with frame extraction via `videoBg` option
  - Extract specific frames from videos
  - Loop and autoplay support
  - Opacity control for video backgrounds

##### Image Processing Enhancements
- **Image Masking**: Apply masks to images with multiple modes (`alpha`, `luminance`, `inverse`)
- **Custom Clip Paths**: Define custom polygon clipping paths for images
- **Image Distortion**: 
  - Perspective distortion with 4-point control
  - Bulge/pinch effects with intensity control
  - Mesh warping with customizable grid control points
- **Effects Stack**: Professional image effects
  - Vignette effect with intensity and size control
  - Lens flare with position and intensity
  - Chromatic aberration effect
  - Film grain effect
- **Enhanced Filters**: 
  - `filterIntensity` - Global intensity multiplier for all filters
  - `filterOrder` - Control when filters are applied (`pre` or `post` transformation)

##### Text Enhancements
- **Text on Paths**: Render text along curves and paths
  - Support for line, arc, bezier, and quadratic curve paths
  - Offset control for text distance from path
  - Automatic text distribution along path

##### Custom Lines Enhancements
- **Advanced Path Options**:
  - Smooth path interpolation with tension control
  - Bezier curve paths
  - Catmull-Rom spline paths
  - Closed path support
- **Arrow Markers**: 
  - Start and end arrows on lines
  - Customizable arrow size and style (filled/outline)
  - Color control for arrows
- **Path Markers**: 
  - Add markers at any position along a path (0-1)
  - Multiple marker shapes: circle, square, diamond, arrow
  - Customizable marker size and color
- **Line Patterns**: 
  - Built-in patterns: dots, dashes, custom segments
  - Pattern offset control
- **Line Textures**: Apply texture images to lines

##### New Utility Methods
- **Batch Operations**: `batch()` - Process multiple operations in parallel
- **Chain Operations**: `chain()` - Chain operations sequentially
- **Image Stitching**: `stitchImages()` - Stitch multiple images together
  - Horizontal, vertical, and grid layouts
  - Overlap and blend support
  - Spacing control
- **Collage Maker**: `createCollage()` - Create image collages
  - Grid, masonry, carousel, and custom layouts
  - Automatic spacing and alignment
  - Background and border radius support
- **Image Compression**: `compress()` - Compress images with quality control
  - Support for JPEG, WebP, and AVIF formats
  - Progressive JPEG support
  - Max width/height constraints
- **Color Palette Extraction**: `extractPalette()` - Extract color palettes from images
  - Multiple algorithms: k-means, median-cut, octree
  - Customizable color count
  - Multiple output formats: hex, rgb, hsl
- **Advanced Save Method**: `save()` - Save buffers to local files with extensive customization
  - Multiple file formats: PNG, JPEG, WebP, AVIF, GIF
  - Smart naming patterns: timestamp, counter, or custom
  - Auto-create directories
  - Quality control for JPEG/WebP
  - Prefix/suffix support
  - Overwrite protection with auto-renaming
  - Batch saving with `saveMultiple()`
  - Counter management with `resetSaveCounter()`

#### 🔧 Technical Improvements
- Added comprehensive TypeScript type definitions for all new features
- Created utility modules for better code organization:
  - `imageMasking.ts` - Image masking and distortion utilities
  - `imageEffects.ts` - Image effects utilities
  - `textPathRenderer.ts` - Text path rendering utilities
  - `advancedLines.ts` - Advanced line drawing utilities
  - `batchOperations.ts` - Batch and chain operation utilities
  - `imageStitching.ts` - Image stitching and collage utilities
  - `imageCompression.ts` - Image compression and palette extraction utilities
- Enhanced error handling and validation
- Improved type safety across all new features

#### 📚 Documentation
- Updated README with new features
- Added comprehensive examples for all new features
- Enhanced API documentation

---

## [4.9.28] - Previous Release

### Features
- Enhanced text renderer with decorations
- Professional pattern system
- Advanced gradient support
- Comprehensive shape drawing
- Chart generation capabilities
- GIF creation support

---

## [4.9.0] - Initial Major Release

### Features
- Core canvas creation
- Image and shape drawing
- Text rendering
- Basic filters and effects
- Format conversion
- Background removal

---

For a complete list of changes, please refer to the [GitHub repository](https://github.com/zenith-79/apexify.js).

