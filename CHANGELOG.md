# Changelog

All notable changes to Apexify.js will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.2.5] - 2025-12-27

### ✨ Added

##### Advanced Text Metrics API ⭐ NEW!
- **Comprehensive Text Measurement** (`measureText`): Complete text metrics matching Canvas API + extensions
  - Standard Canvas API metrics: `width`, `actualBoundingBoxAscent/Descent`, `actualBoundingBoxLeft/Right`, `fontBoundingBoxAscent/Descent`
  - Advanced Canvas API metrics: `alphabeticBaseline`, `emHeightAscent/Descent`, `hangingBaseline`, `ideographicBaseline` (when available)
  - Enhanced Apexify.js metrics: `height`, `lineHeight`, `baseline`, `top`, `bottom`, `centerX`, `centerY`
  - Multi-line support: `lines`, `totalHeight`, `lineCount` when `maxWidth` is provided
  - Character-level metrics: `charWidths`, `charPositions` when `includeCharMetrics` is true
  - Full font support: custom fonts, bold, italic, letter spacing, word spacing
  - Perfect for dynamic layouts, text centering, and precise text positioning

##### Advanced Pixel Data API ⭐ NEW!
- **Pixel Manipulation** (`getPixelData`, `setPixelData`): Complete pixel-level control
  - Get pixel data from any region: `getPixelData(canvasBuffer, { x, y, width, height })`
  - Set pixel data back to canvas: `setPixelData(canvasBuffer, pixelData, { x, y })`
  - Access RGBA values directly: `pixelData.data` (Uint8ClampedArray)
  - Full Canvas ImageData compatibility

- **Pixel Manipulation Filters** (`manipulatePixels`): Advanced pixel processing
  - Custom processor functions: `processor: (r, g, b, a, x, y) => [r, g, b, a]`
  - Built-in filters: `grayscale`, `invert`, `sepia`, `brightness`, `contrast`, `saturate`
  - Intensity control for all filters (0-1)
  - Region-specific manipulation: Apply filters to specific areas
  - Perfect for custom effects, color adjustments, and advanced image processing

- **Pixel Color Utilities** (`getPixelColor`, `setPixelColor`): Quick pixel access
  - Get pixel color at coordinates: `getPixelColor(canvasBuffer, x, y)`
  - Set pixel color at coordinates: `setPixelColor(canvasBuffer, x, y, { r, g, b, a })`
  - Convenient helpers for pixel-level operations

##### Advanced Path2D API ⭐ NEW!
- **Path Creation** (`createPath2D`): Create complex paths from commands
  - Full Canvas Path2D compatibility
  - Comprehensive command set: `moveTo`, `lineTo`, `arc`, `arcTo`, `bezierCurveTo`, `quadraticCurveTo`, `rect`, `ellipse`, `closePath`
  - Advanced shape commands: `circle`, `roundedRect` (with per-corner radius), `polygon`, `star`, `arrow`
  - Build complex paths programmatically with type-safe command arrays
  - Perfect for complex shapes, custom graphics, and advanced path manipulation

- **Path Drawing** (`drawPath`): Draw paths with advanced styling options
  - Stroke options: color, width, lineCap, lineJoin, miterLimit, dashArray, dashOffset, opacity
  - Fill options: color, opacity, fill rule (nonzero/evenodd)
  - Transform support: translate, rotate, scale with custom origin point
  - Full integration with Apexify.js styling system
  - Works with both Path2D objects and command arrays

##### Advanced Hit Detection API ⭐ NEW!
- **Point-in-Path Detection** (`isPointInPath`): Check if point is inside a Path2D object
  - Detect hits in fill area and stroke edges
  - Configurable stroke width for stroke detection
  - Tolerance control for edge cases
  - Returns detailed hit information: `hit`, `hitType` ('fill'/'stroke'/'outside'), `distance`

- **Custom Region Detection** (`isPointInRegion`, `isPointInAnyRegion`): Advanced region-based hit detection
  - Multiple region types: `rect`, `circle`, `ellipse`, `polygon`, `path`, `custom`
  - Rectangle regions with precise boundary detection
  - Circle and ellipse regions (with rotation support)
  - Polygon regions with any number of points
  - Path2D-based regions for complex shapes
  - Custom function regions: `check: (x, y) => boolean` for any custom logic
  - Multi-region detection: Test point against multiple regions at once
  - Distance calculation: `getDistanceToRegion()` for spatial queries
  - Perfect for interactive graphics, collision detection, and UI elements

##### New Shape Types
- **Arc and PieSlice Shapes**: Added `'arc'` and `'pieSlice'` as new `ShapeType` options
  - Support for drawing arcs and pie slice sectors
  - Configurable start and end angles (in radians)
  - Support for donut slices with `innerRadius`
  - Custom pivot points with `centerX` and `centerY`
  - Full feature support: gradients, shadows, strokes, filters
  - Perfect for roulette wheels, pie charts, and circular segments

##### Enhanced GIF Creation with Callbacks
- **Programmatic Frame Generation** (`onStart` callback): Generate GIF frames using Apexify.js APIs
  - Callback receives frame count and painter instance
  - Generate frames entirely using Apexify.js (`createCanvas`, `createImage`, `createText`, etc.)
  - No file I/O needed - all frames generated in memory
  - Configurable frame count via `frameCount` or `duration` options
  - Perfect for animations, roulette wheels, spinners, and dynamic content

- **Static Final Frame Generation** (`onEnd` callback): Automatically generate static image from final frame
  - Receives final frame buffer and painter instance
  - Can process/add effects to final frame
  - Returns both GIF and static image when `onEnd` is provided
  - Perfect for showing "winner" frames or final states

##### Group Transform Operations
- **Grouped Drawing** (`isGrouped` option): Transform multiple elements together as a group
  - Apply rotations, scales, and translations to all elements simultaneously
  - Shared pivot point for rotation and scaling
  - All elements rotate around a common center point (not individual centers)
  - Perfect for roulette wheels, clocks, spinners, and grouped UI elements
  - Used with `createImage()` when passing array of elements

### 🔧 Improved

##### Text Metrics Enhancements
- **Customizable Measurement Canvas**: Made measurement canvas size configurable
  - Optional `measurementCanvas` option in `measureText()` for memory optimization
  - Smart auto-calculation based on text length, font size, and wrapping
  - Bounds protection: 1000-10000px width, 500-5000px height
  - Better memory efficiency for large text measurements

##### Image Creation Enhancements
- **Enhanced Shape Property Support**: Properly pass all shape properties through the rendering pipeline
  - Fixed passing of `points` array for custom polygons
  - Fixed passing of `startAngle`, `endAngle` for arcs/pieSlices
  - Fixed passing of `centerX`, `centerY` for custom pivot points
  - All shape properties now correctly propagated to drawing functions

##### Group Transform Implementation
- **Correct Transform Order**: Fixed transformation order in grouped mode
  - Proper order: translate to pivot → rotate → scale → translate → translate back
  - Prevents double rotation and transform conflicts
  - Ensures all elements transform correctly as a single unit

##### GIF Creation Workflow
- **Simplified Animation Creation**: Generate animated GIFs entirely using Apexify.js APIs
  - No need to save frames to files first
  - Generate frames programmatically in memory
  - Cleaner API without direct canvas manipulation
  - Better developer experience for animations

### 🐛 Fixed

##### Shape Drawing Fixes
- **Fixed Polygon Default Behavior**: Fixed issue where polygons without `points` were defaulting to hexagon
  - Custom `points` array now properly recognized and used
  - Polygon drawing correctly uses provided points or falls back to regular polygon
  - Fixed white hexagon appearing incorrectly

- **Fixed Shape Property Passing**: Fixed shape properties not being passed to drawing functions
  - `points`, `startAngle`, `endAngle`, `centerX`, `centerY` now properly passed through
  - Type definitions updated to include all shape properties
  - Shape rendering now works correctly for all shape types

##### Group Transform Fixes
- **Fixed Double Rotation Bug**: Fixed issue where elements in grouped mode were being rotated twice
  - Elements in grouped mode now have `rotation: 0` to prevent individual rotation
  - Group transform handles all transformations correctly
  - Elements now rotate together as intended

- **Fixed Transform Context**: Fixed canvas context state management in grouped transforms
  - Proper `ctx.save()` and `ctx.restore()` usage
  - Transform state correctly isolated per group operation
  - No interference between grouped and individual transforms

##### GIF Callback Fixes
- **Fixed Return Type**: Fixed TypeScript return type for GIF creation with `onEnd` callback
  - Returns `{ gif: Buffer | string, static: Buffer }` when `onEnd` is provided
  - Returns just GIF buffer when `onEnd` is not provided
  - Proper type handling for file output format

- **Fixed Frame Count Calculation**: Improved frame count estimation when using `onStart` callback
  - Better default frame count (30 frames)
  - Proper calculation from `duration` and `delay` options
  - More accurate animation timing

##### Code Quality Improvements
- **Comment Cleanup**: Removed descriptive inline comments throughout codebase
  - Cleaned up redundant code comments that don't add value
  - Improved code readability and maintainability
  - Preserved important comments (eslint, TODO, FIXME, JSDoc)
  - Total cleanup: ~58,000 characters removed across 42 files
  - All code functionality preserved, cleaner codebase

## [5.2.0] - 2025-12-25

### ✨ Added

##### Chart System Enhancements (Complete Rewrite & Major Upgrades!)

- **Gradient Support for All Charts**: Professional gradient fills throughout
  - **Background Gradients**: Apply linear, radial, or conic gradients to chart backgrounds
  - **Bar/Line Gradients**: Individual bars and lines can use gradient fills
  - **Title Gradients**: Chart titles support gradient text colors
  - **Label Gradients**: Bar labels, value labels, and point labels support gradients
  - **Legend Gradients**: Legend boxes and legend text support gradient fills
  - Full gradient control with custom color stops and positioning

- **Enhanced Text Styling for All Charts**: Professional typography
  - **Custom Fonts**: Support for custom font files (`.ttf`, `.otf`, `.woff`)
  - **Text Effects**: Shadows, strokes, glows for all text elements
  - **Text Decorations**: Bold, italic, underline, strikethrough support
  - **Advanced Styling**: Custom font families, sizes, and spacing
  - Applied to titles, labels, legends, and all chart text elements

- **Enhanced Pie Charts**:
  - Gradient slice fills
  - Enhanced title and label styling
  - Gradient legend backgrounds and text
  - Connected legend with gradient support
  - Small slice label positioning improvements

- **Enhanced Bar Charts**:
  - Gradient bar fills (standard, grouped, stacked charts)
  - Enhanced title, bar label, and value label styling
  - Gradient legend backgrounds and text
  - Support for gradient bars in all chart types (standard, grouped, stacked, waterfall, lollipop)

- **Enhanced Horizontal Bar Charts**:
  - Gradient bar fills (standard, grouped, stacked charts)
  - Enhanced title, bar label, and value label styling
  - Gradient legend backgrounds and text
  - Support for gradient bars in all chart types

- **Enhanced Line Charts**:
  - Gradient line fills
  - Enhanced title and point label styling
  - Gradient legend backgrounds and text
  - Support for gradient lines in all series

- **Comparison Charts** (`createComparisonChart`): Compare any two chart types side by side
  - Compare any combination: pie/bar, line/bar, pie/line, line/line, bar/bar, pie/pie, pie/donut, horizontal/bar, horizontal/horizontal, horizontal/line, horizontal/pie
  - Side-by-side or top-bottom layouts
  - Shared background with gradient/image support
  - General top title with gradient and enhanced text styling
  - Individual chart titles, data, configs, and legends
  - Full feature support: gradients for all elements, custom fonts, enhanced text styling
  - Each chart maintains its own legend with full customization
  - Configurable spacing between charts

- **Comprehensive Test Suite**:
  - Enhanced test files for all chart types
  - Tests for gradients, custom fonts, and advanced styling
  - 11+ tests per chart type covering all new features
  - Comparison chart tests with full feature demonstrations
  - Organized test structure with dedicated output folders

### 🔧 Improved

##### Major Architectural Restructuring (Complete Refactor!)
- **Modular Architecture Implementation**: Complete restructure of `ApexPainter` into specialized Creator classes
  - Created `extended/` folder with dedicated Creator classes:
    - `CanvasCreator.ts` - Handles all canvas creation logic
    - `ImageCreator.ts` - Handles all image and shape drawing logic
    - `TextCreator.ts` - Handles all text rendering logic
    - `GIFCreator.ts` - Handles all GIF creation logic
    - `ChartCreator.ts` - Handles all chart generation logic
    - `VideoCreator.ts` - Handles all video processing operations
  - **ApexPainter as Facade Pattern**: Refactored `ApexPainter` to act as a facade/delegator
    - All `create*` methods now delegate to corresponding Creator classes
    - Clean separation of concerns between orchestration and implementation
    - Better maintainability and testability
    - Reduced `ApexPainter.ts` from monolithic to clean orchestrator

- **Video Helpers Modularization**: Moved all video processing helper methods to dedicated `VideoHelpers` class
  - Extracted 33+ video helper methods from `ApexPainter.ts` to `utils/Video/videoHelpers.ts`
  - Moved `executeFFmpegWithProgress` method to `VideoHelpers` where it belongs
  - Improved code organization and maintainability
  - Reduced `ApexPainter.ts` size by ~2300+ lines

- **Error Handling Standardization**: Created centralized error utility functions
  - Added `getErrorMessage()` utility function to standardize error message extraction
  - Added `getCanvasContext()` utility function for consistent canvas context handling
  - Replaced 36+ duplicate error handling patterns across all files
  - Replaced 23+ duplicate context error patterns
  - Consistent error handling throughout the codebase

- **Code Duplication Removal**: Removed redundant code and methods
  - Removed duplicate `CanvasResults` interface (now imported from `CanvasCreator`)
  - Removed redundant validation methods from `ApexPainter.ts`:
    - `#validateImageProperties`, `#validateTextProperties`, `#validateCanvasConfig`, `#validateGIFOptions`
    - `#validateImageArray`, `#validateTextArray`, `#renderEnhancedText`
  - Removed redundant shape drawing methods (~500+ lines):
    - `#drawImageBitmap`, `#drawShape`, `#isComplexShape`
    - `#applyShapeShadow`, `#applyShapeStroke`, `#applyShapeStrokeStyle`
    - `#applyComplexShapeStroke`, `#darkenColor`, `#lightenColor`
  - All functionality properly delegated to Creator classes

- **Improved Code Organization**:
  - **Modular File Structure**: Organized code into logical modules:
    - `extended/` - Specialized Creator classes for each feature type
    - `utils/` - Shared utilities organized by category (Video, Image, Text, Charts, etc.)
    - Clear separation between core functionality and utilities
  - Better separation of concerns between `ApexPainter` and specialized Creator classes
  - Cleaner `ApexPainter.ts` acting as a facade/delegator (reduced from ~6000+ lines to ~4300 lines)
  - Video-specific functionality properly isolated in `VideoHelpers`
  - Consistent import patterns and type definitions
  - **Dependency Injection**: Creator classes use dependency injection for shared functionality
  - **Type Safety**: Improved TypeScript types with proper interface exports from Creator classes

##### Chart Architecture
- **Code Organization**: Charts moved to dedicated `lib/Canvas/utils/Charts/` directory
- **Unified API**: All charts accessible through single `ApexPainter.createChart()` method
- **Type Safety**: Enhanced TypeScript types for all chart options
- **Modularity**: Better code organization with shared utilities

##### Chart Rendering
- **Gradient Integration**: Full integration of ApexPainter's gradient system into all charts
- **Text Rendering**: Enhanced text renderer used throughout all chart types
- **Legend Styling**: Consistent legend styling across all chart types
- **Background Support**: Unified background gradient/image/color support

##### Chart Features
- **Flexible Legend Positioning**: All charts support top, bottom, left, right legend positions
- **Enhanced Label Styling**: All labels (titles, bar labels, value labels, point labels) support gradients and enhanced styling
- **Consistent API**: Same styling options available across all chart types

### 🐛 Fixed

##### Chart Fixes
- Fixed legend positioning issues when legend is at top with title
- Fixed Y-axis label overlap with left-positioned legends in bar and horizontal bar charts
- Fixed horizontal bar chart bars not showing when legend is at top
- Improved legend spacing calculations to account for axis labels
- Fixed async/await handling in legend rendering functions

##### Code Quality Fixes
- Fixed TypeScript compilation errors from duplicate interfaces
- Resolved import path issues for `CanvasResults` interface
- Fixed error handling inconsistencies across Creator classes
- Improved type safety by removing redundant type definitions

##### Professional Video Editing Features (10 Major Features!)

- **Freeze Frame** (`freezeFrame`): Hold a frame for dramatic effect
  - Freeze video at any specific time
  - Configurable freeze duration
  - Perfect for highlighting moments or creating photo-like effects
  - Seamlessly merges with video before and after

- **Export Presets** (`exportPreset`): Quick export with platform-optimized settings
  - 10 pre-configured presets: YouTube, Instagram, TikTok, Twitter, Facebook, 4K, 1080p, 720p, Mobile, Web
  - Automatic resolution, FPS, and bitrate optimization per platform
  - One-command export for social media platforms
  - Web-optimized formats (WebM for web preset)

- **Progress Callbacks** (`onProgress`): Real-time progress tracking
  - Track processing progress for all video operations
  - Provides percent complete, elapsed time, and processing speed
  - Perfect for progress bars and user feedback
  - Works with all video operations (compress, convert, transitions, etc.)

- **Audio Normalization** (`normalizeAudio`): Professional audio leveling
  - Three normalization methods: LUFS (broadcast standard), Peak, RMS
  - Configurable target levels
  - Broadcast-compliant audio (-23 LUFS default)
  - Consistent audio levels across videos

- **LUT Support** (`applyLUT`): Cinematic color grading
  - Apply Look-Up Tables (.cube files) for professional color grades
  - Intensity control (0-1) for subtle or full application
  - Film emulation and cinematic looks
  - Consistent color grading across videos

- **Video Transitions** (`addTransition`): Professional transitions between videos
  - 9 transition types: fade, wipe, slide, zoom, rotate, dissolve, blur, circle, pixelize
  - Direction support for wipe, slide, and zoom transitions
  - Single-video fade in/out support
  - Configurable transition duration
  - Automatic video resolution matching

- **Animated Text** (`addAnimatedText`): Advanced text animations with custom fonts
  - 8 animation types: fadeIn, fadeOut, slideIn, slideOut, zoom, bounce, rotate, typewriter
  - Custom font support (reuses `createText` font system)
  - Font file loading (`.ttf`, `.otf`, `.woff`)
  - Font name and family support
  - Time-based text visibility
  - Position control (coordinates or preset positions)
  - Background color and styling options

- **Create Video from Frames** (`createFromFrames`): Compile frames into video
  - Create videos from edited frames/images
  - Supports Buffers and file paths
  - Configurable FPS, format, quality, and resolution
  - Automatic dimension detection from first frame
  - Perfect for frame-by-frame editing workflows

- **Replace Video Segments** (`replaceSegment`): Replace video segments
  - Replace segments with video from another source
  - Replace segments with edited frames
  - Precise time range control
  - Flexible replacement duration
  - Seamless merging with original video

- **Partial Audio Muting** (`mute.ranges`): Mute specific time ranges
  - Mute audio for specific time segments (e.g., 7-13 seconds)
  - Multiple mute ranges support
  - Full mute still supported (backward compatible)
  - Professional audio editing capabilities

### 🔧 Improved

##### Enhanced Video Processing
- **Progress Tracking**: All video operations now support progress callbacks
- **Better Error Messages**: More descriptive errors with context
- **Resource Management**: Improved cleanup of temporary files
- **Font System Integration**: Animated text uses same font system as `createText`
- **Transition Quality**: Optimized transition rendering with proper video scaling

##### Video Workflow Enhancements
- **Frame-to-Video Pipeline**: Complete workflow from frame extraction → editing → compilation
- **Segment Replacement**: Advanced video editing with frame or video replacement
- **Audio Control**: Fine-grained audio control with partial muting
- **Export Optimization**: Platform-specific optimizations for better quality and file sizes

### 🐛 Fixed

- Fixed type definitions for `replaceSegment` to support both video and frame replacement
- Improved error handling in transition operations
- Better path resolution for LUT files
- Fixed font path handling in animated text (consistent with `createText`)

---

## [5.1.0] - 2025-12-20

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

## [5.0.5] - 2025-09-24

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

## [5.0.0] - 2025-08-13

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

