import { Canvas, SKRSContext2D } from "@napi-rs/canvas"
import { PathLike } from "fs";
/**
 * Configuration option to decide the outputformate from ApexPainter
 * @param {type} default - 'buffer', other formates: url, blob, base64, dataURL, arraybuffer.
 */

export interface OutputFormat {
    type?: 'buffer'  | 'url' | 'blob' | 'base64' | 'dataURL' | 'arraybuffer';
}

export type AlignMode =
  | 'center' | 'top' | 'bottom' | 'left' | 'right'
  | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type FitMode = 'fill' | 'contain' | 'cover';

export interface StrokeOptions {
  color?: string;
  gradient?: gradient;
width?: number;
position?: number;
blur?: number;
  opacity?: number;      // 0..1
  borderRadius?: number | 'circular';
  borderPosition?: borderPosition;
  style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double';
}

export interface ShadowOptions {
  color?: string;          // e.g. 'rgba(0,0,0,1)'
  gradient?: gradient;     // <— gradient-capable shadow
offsetX?: number;
offsetY?: number;
blur?: number;
  opacity?: number;        // 0..1
  borderRadius?: number | "circular";
  borderPosition?: borderPosition;
}

export interface BoxBackground {
  color?: string;
  gradient?: gradient;
}
export type GradientStop = { stop: number; color: string };

export type gradient =
  | {
      type: 'linear';
      // line from (startX,startY) to (endX,endY)
      startX?: number; startY?: number;
      endX?: number;   endY?: number;
      rotate?: number;           // degrees, rotation around pivot (default: canvas center)
pivotX?: number; pivotY?: number;
      repeat?: 'repeat' | 'reflect' | 'no-repeat'; // Repeat mode for gradient (default: 'no-repeat')
      colors: GradientStop[];
    }
  | {
      type: 'radial';
      // two circles (default to center-based radial if not supplied)
startX?: number; startY?: number; startRadius?: number;
      endX?: number;   endY?: number;   endRadius?: number;   // outer circle
      // rotation is NOP for perfectly concentric radial, but supported if centers aren't equal
      rotate?: number; pivotX?: number; pivotY?: number;
      repeat?: 'repeat' | 'reflect' | 'no-repeat'; // Repeat mode for gradient (default: 'no-repeat')
      colors: GradientStop[];
    }
  | {
      type: 'conic';
      // Conic gradient (sweeps around a point)
      centerX?: number; centerY?: number; // Center point (default: canvas center)
      startAngle?: number; // Starting angle in degrees (default: 0)
      rotate?: number; // Rotation around center in degrees (default: 0)
pivotX?: number; pivotY?: number;
      colors: GradientStop[];
    };

export type borderPosition = 'all' | 'top' | 'left' | 'right' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | string;

/**
 * Configuration options for the canvas.
 * @param {number} width - The width of the canvas.
 * @param {number} height - The height of the canvas.
 * @param {string} customBg - The URL or local path to the custom background image.
 * @param {string} colorBg - The background color of the canvas.
 * @param {object} gradientBg - The gradient settings for the canvas background.
 * @param {number | string} borderRadius - The border radius of the canvas.
 */
export interface CanvasConfig {
    width?: number;
    height?: number;
    x?: number;
    y?: number;

    customBg?: {
      source: string
      inherit?: boolean;
      fit?: 'fill' | 'contain' | 'cover';
      align?: 'center' | 'top' | 'bottom' | 'left' | 'right'
      | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
filters?: ImageFilter[];
opacity?: number;
    };
    videoBg?: {
      source: string | Buffer; // Video file path, URL, or Buffer
      frame?: number; // Extract specific frame number (default: 0)
      time?: number; // Extract frame at specific time in seconds (overrides frame if provided)
      loop?: boolean; // Loop video (default: false)
autoplay?: boolean;
      opacity?: number; // Video opacity (default: 1)
      format?: 'jpg' | 'png'; // Output format (default: 'jpg')
      quality?: number; // JPEG quality 1-31, lower = better (default: 2)
    };

    colorBg?: string;
    gradientBg?: gradient;
    patternBg?: PatternOptions;
    noiseBg?: { intensity?: number };
    bgLayers?: Array<
      { type: "color"; value: string } |
      { type: "gradient"; value: gradient } |
      { type: "image"; source: string; opacity?: number } |
      { type: "pattern"; source: string; repeat?: string; opacity?: number } |
      { type: "noise"; intensity?: number }
    >;
    blendMode?: GlobalCompositeOperation;

    opacity?: number;
    blur?: number;

    rotation?: number;
    borderRadius?: number | "circular";
    borderPosition?: borderPosition;

    zoom?: {
scale?: number;
      centerX?: number;
      centerY?: number;
   };


    stroke?: {
        color?: string;
        blur?: number;
        width?: number;
        position?: number;
        borderRadius?: number | "circular";
        borderPosition?: borderPosition;
        gradient?: gradient;
        style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double';
    };
    shadow?: {
        color?: string;
        offsetX?: number;
        offsetY?: number;
        blur?: number;
        opacity?: number;
        borderRadius?: number | "circular";
        gradient?: gradient;
    };
};

/**
 * Properties of an image or shape to be drawn on the canvas.
 * @param {string} source - URL or path to the image or shape name.
 * @param {number} width - The width of the image or shape.
 * @param {number} height - The height of the image or shape.
 * @param {number} x - The x-coordinate of the image or shape.
 * @param {number} y - The y-coordinate of the image or shape.
 * @param {boolean} isFilled - Whether the shape is filled or not (Only applicable if source is a shape name).
 * @param {string} color - The color of the shape (Only applicable if source is a shape name).
 * @param {object} gradient - The gradient settings for the shape (Only applicable if source is a shape name).
 * @param {number} rotation - Rotation angle in degrees.
 * @param {number | string} borderRadius - The border radius of the image or shape.
 * @param {object} stroke - The stroke properties.
 * @param {string} stroke.color - The color of the stroke.
 * @param {number} stroke.width - The width of the stroke.
 * @param {number} stroke.position - Space between stroke and the image it's stroked on.
 * @param {number | string} stroke.borderRadius - The border radius of the stroke.
 * @param {object} shadow - The shadow properties.
 * @param {string} shadow.color - The color of the shadow.
 * @param {number} shadow.offsetX - The horizontal offset of the shadow.
 * @param {number} shadow.offsetY - The vertical offset of the shadow.
 * @param {number} shadow.blur - The blur radius of the shadow.
 * @param {number} shadow.opacity - The opacity of the shadow.
 * @param {number | string} shadow.borderRadius - The border radius of the shadow.
 */
export type ShapeType = 'rectangle' | 'square' | 'circle' | 'triangle' | 'trapezium' | 'star' | 'heart' | 'polygon' | 'arc' | 'pieSlice';

export interface ShapeProperties {
  fill?: boolean;
  color?: string;
  gradient?: gradient;
points?: { x: number; y: number }[];
radius?: number;
sides?: number;
innerRadius?: number;
outerRadius?: number;

  startAngle?: number; // Start angle in radians (default: 0, for arc/pieSlice)
  endAngle?: number; // End angle in radians (default: 2*PI, for arc/pieSlice)
  centerX?: number; // Center X for arc/pieSlice (default: shape center)
  centerY?: number; // Center Y for arc/pieSlice (default: shape center)
}

export interface ImageProperties {

  source: string | Buffer | ShapeType;
  x: number;
  y: number;

  // size (if omitted and inherit=true -> use intrinsic)
  width?: number;
  height?: number;
  inherit?: boolean;

  // fitting
fit?: FitMode;
align?: AlignMode;

  // visuals
  rotation?: number;       // deg around box center
  opacity?: number;        // bitmap alpha
  blur?: number;           // bitmap blur px
  borderRadius?: number | 'circular';
  borderPosition?: string;

  // image filters
  filters?: ImageFilter[];
  filterIntensity?: number; // Global filter intensity multiplier (default: 1)
filterOrder?: 'pre' | 'post';

  // image masking
  mask?: {
    source: string | Buffer; // Mask image
    mode?: 'alpha' | 'luminance' | 'inverse'; // Mask mode (default: 'alpha')
  };
clipPath?: Array<{ x: number; y: number }>;

  // image distortion/transform
  distortion?: {
    type: 'perspective' | 'warp' | 'bulge' | 'pinch';
    points?: Array<{ x: number; y: number }>; // Control points for perspective/warp
intensity?: number;
  };
  meshWarp?: {
    gridX?: number; // Grid divisions X (default: 10)
    gridY?: number; // Grid divisions Y (default: 10)
    controlPoints?: Array<Array<{ x: number; y: number }>>; // Control point grid
  };

  // image effects stack
  effects?: {
    vignette?: { intensity: number; size: number }; // Vignette effect (0-1, 0-1)
    lensFlare?: { x: number; y: number; intensity: number }; // Lens flare position and intensity
    chromaticAberration?: { intensity: number }; // Chromatic aberration (0-1)
    filmGrain?: { intensity: number }; // Film grain effect (0-1)
  };

  // shape properties (when source is a shape)
  shape?: ShapeProperties;

  shadow?: ShadowOptions;
  stroke?: StrokeOptions;
  boxBackground?: BoxBackground; // under bitmap, inside clip
}

/**
 * Group transform options for grouped drawing operations
 */
export interface GroupTransformOptions {
  /** Rotation in degrees - applies to all elements together */
  rotation?: number;
  /** Translation X - applies to all elements together */
  translateX?: number;
  /** Translation Y - applies to all elements together */
  translateY?: number;
  /** Scale X - applies to all elements together */
  scaleX?: number;
  /** Scale Y - applies to all elements together */
  scaleY?: number;
  /** Pivot point X for rotation/scale (default: group center) */
  pivotX?: number;
  /** Pivot point Y for rotation/scale (default: group center) */
  pivotY?: number;
}

/**
 * Options for createImage method when drawing multiple elements
 */
export interface CreateImageOptions {
  /** If true, apply transformations to all elements as a group */
  isGrouped?: boolean;
  /** Group transform options (only used when isGrouped is true) */
  groupTransform?: GroupTransformOptions;
}

/**
 * Comprehensive text metrics interface matching Canvas API + extensions
 */
export interface TextMetrics {
  // Standard Canvas API metrics
  width: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
  actualBoundingBoxLeft: number;
  actualBoundingBoxRight: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;

  alphabeticBaseline?: number;
  emHeightAscent?: number;
  emHeightDescent?: number;
  hangingBaseline?: number;
  ideographicBaseline?: number;

  // Enhanced metrics (Apexify.js extensions)
  height: number;
  lineHeight: number;
  baseline: number;
  top: number;
  bottom: number;
  centerX: number;
  centerY: number;

  // Multi-line metrics (if maxWidth provided)
  lines?: Array<{
    text: string;
    width: number;
    height: number;
    metrics: Omit<TextMetrics, 'lines' | 'totalHeight' | 'lineCount'>;
  }>;
  totalHeight?: number;
  lineCount?: number;

  // Character-level metrics (optional)
  charWidths?: number[];
  charPositions?: Array<{ x: number; width: number }>;
}

/**
 * Pixel data interface
 */
export interface PixelData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace?: 'srgb' | 'display-p3' | 'rec2020';
}

/**
 * Pixel manipulation options
 */
export interface PixelManipulationOptions {
  /** Custom pixel processing function: (r, g, b, a, x, y) => [r, g, b, a] */
  processor?: (r: number, g: number, b: number, a: number, x: number, y: number) => [number, number, number, number];
  /** Apply to specific region */
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** Apply filter */
  filter?: 'grayscale' | 'invert' | 'sepia' | 'brightness' | 'contrast' | 'saturate';
  /** Filter intensity (0-1) */
  intensity?: number;
}

export interface ImageFilter {
  type: 'gaussianBlur' | 'motionBlur' | 'radialBlur' | 'sharpen' | 'noise' | 'grain' |
        'edgeDetection' | 'emboss' | 'invert' | 'grayscale' | 'sepia' | 'pixelate' |
        'brightness' | 'contrast' | 'saturation' | 'hueShift' | 'posterize';
  intensity?: number;
  radius?: number;
angle?: number;
centerX?: number;
centerY?: number;
value?: number;
levels?: number;
size?: number;
}

/**
 * Enhanced text properties interface with comprehensive styling options
 */
export interface TextProperties {
  // === CORE TEXT PROPERTIES ===
  /** Text content to render */
  text: string;
  /** X position on canvas */
  x: number;
  /** Y position on canvas */
  y: number;

  // === FONT MANAGEMENT ===
  /** Font configuration object */
  font?: {
    /** Font size in pixels (default: 16) */
    size?: number;
    /** Font family name (e.g., 'Arial', 'Helvetica', 'Times New Roman') */
    family?: string;
    /** Custom font name (used with fontPath) */
    name?: string;
    /** Path to custom font file (.ttf, .otf, .woff, etc.) */
    path?: string;
  };

  // === LEGACY FONT PROPERTIES (for backward compatibility) ===
  /** @deprecated Use font.size instead */
  fontSize?: number;
  /** @deprecated Use font.family instead */
  fontFamily?: string;
  /** @deprecated Use font.name instead */
  fontName?: string;
  /** @deprecated Use font.path instead */
  fontPath?: string;

  // === TEXT DECORATION ===
  /** Make text bold */
  bold?: boolean;
  /** Make text italic */
  italic?: boolean;
  /** Add underline decoration */
  underline?: boolean | {
    /** Underline color */
    color?: string;
    /** Underline gradient (overrides color) */
    gradient?: gradient;
    /** Underline width (default: 1px) */
    width?: number;
  };
  /** Add overline decoration */
  overline?: boolean | {
    /** Overline color */
    color?: string;
    /** Overline gradient (overrides color) */
    gradient?: gradient;
    /** Overline width (default: 1px) */
    width?: number;
  };
  /** Add strikethrough decoration */
  strikethrough?: boolean | {
    /** Strikethrough color */
    color?: string;
    /** Strikethrough gradient (overrides color) */
    gradient?: gradient;
    /** Strikethrough width (default: 1px) */
    width?: number;
  };
  /** Highlight text with background color */
  highlight?: {
    /** Highlight color (hex, rgb, rgba, hsl, etc.) */
    color?: string;
    /** Highlight gradient (overrides color) */
    gradient?: gradient;
    /** Highlight opacity (0-1, default: 0.3) */
    opacity?: number;
  };

  // === SPACING & POSITIONING ===
  /** Line height multiplier (default: 1.4) */
  lineHeight?: number;
  /** Space between letters in pixels */
  letterSpacing?: number;
  /** Space between words in pixels */
  wordSpacing?: number;
  /** Maximum width for text wrapping */
  maxWidth?: number;
  /** Maximum height for text (truncates with ellipsis) */
  maxHeight?: number;

  // === TEXT ALIGNMENT ===
  /** Horizontal text alignment */
  textAlign?: 'left' | 'center' | 'right' | 'start' | 'end';
  /** Vertical text baseline */
  textBaseline?: 'alphabetic' | 'bottom' | 'hanging' | 'ideographic' | 'middle' | 'top';

  // === TEXT COLORING ===
  /** Text color (hex, rgb, rgba, hsl, etc.) */
  color?: string;
  /** Gradient fill for text */
  gradient?: gradient;
  /** Text opacity (0-1, default: 1) */
  opacity?: number;

  // === TEXT EFFECTS ===
  /** Text glow effect */
  glow?: {
    /** Glow color */
    color?: string;
    /** Glow gradient (overrides color) */
    gradient?: gradient;
    /** Glow intensity/blur radius */
    intensity?: number;
    /** Glow opacity (0-1) */
    opacity?: number;
  };
  /** Text shadow effect */
  shadow?: {
    /** Shadow color */
    color?: string;
    /** Horizontal shadow offset */
    offsetX?: number;
    /** Vertical shadow offset */
    offsetY?: number;
    /** Shadow blur radius */
    blur?: number;
    /** Shadow opacity (0-1) */
    opacity?: number;
  };
  /** Text stroke/outline */
  stroke?: {
    /** Stroke color */
    color?: string;
    /** Stroke width in pixels */
    width?: number;
    /** Gradient stroke */
    gradient?: gradient;
    /** Stroke opacity (0-1) */
    opacity?: number;
    /** Stroke style */
    style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double';
  };

  // === TRANSFORMATIONS ===
  /** Text rotation in degrees */
  rotation?: number;

  // === TEXT PATH/CURVE FOLLOWING ===
  /** Path for text to follow */
  path?: {
    type: 'line' | 'arc' | 'bezier' | 'quadratic';
    points: Array<{ x: number; y: number }>;
    offset?: number; // Distance from path (default: 0)
  };
  /** Render text along path */
  textOnPath?: boolean;
  /** Include character-level metrics in measureText (optional) */
  includeCharMetrics?: boolean;
  /** Optional: Canvas size for text measurement (default: auto-calculated based on text size) */
  measurementCanvas?: {
    width?: number;
    height?: number;
  };
}

/**
 * Legacy TextObject interface for backward compatibility
 * @deprecated Use TextProperties instead
 */
export interface TextObject extends TextProperties {
  /** @deprecated Use bold instead */
  isBold?: boolean;
  /** @deprecated Use outlined instead of stroke */
  outlined?: boolean;
}

/**
 * Options for creating a GIF.
 * @param outputFormat The format of the output ('file', 'base64', 'attachment', or 'buffer').
 * @param outputFile The file path if output format is 'file'.
 * @param width The width of the GIF.
 * @param height The height of the GIF.
 * @param repeat The number of times the GIF should repeat.
 * @param quality The quality of the GIF.
 * @param delay The delay between frames in milliseconds.
 * @param watermark The watermark settings.
 * @param textOverlay The text overlay settings.
 * @param basDir The base directory for files.
 * @param onStart Frame generation callback - generates frames using Apexify.js APIs (returns Buffer array)
 * @param onEnd Callback after GIF creation - receives final frame buffer and can return static image buffer
 */
export interface GIFOptions {
    outputFormat: 'file' | 'base64' | 'attachment' | 'buffer' | string;
    outputFile?: string;
    width?: number;
    height?: number;
    repeat?: number;
    quality?: number;
    delay?: number;
    watermark?: {
        enable: boolean;
        url: string;
    };
    textOverlay?: {
        text: string;
        fontName?: string;
        fontPath?: string;
        fontSize?: number;
        fontColor?: string;
        x?: number;
        y?: number;
    };
    basDir?: any;
    /**
     * Frame generation callback - called before GIF creation
     * Receives frame count and painter instance, returns array of frame buffers
     * If provided, overrides gifFrames parameter
     * @param frameCount - Estimated frame count (based on duration/delay or default 30)
     * @param painter - ApexPainter instance for using Apexify.js APIs
     * @returns Array of frame objects with buffer and duration
     */
    onStart?: (
        frameCount: number,
painter: any
    ) => Promise<Array<{ buffer: Buffer; duration: number }>>;
    /**
     * Frame count for animation (used when onStart is provided)
     * If not provided, defaults to 30 frames
     */
    frameCount?: number;
    /**
     * Animation duration in milliseconds (used to calculate frame count if frameCount not provided)
     * Defaults to 3000ms (3 seconds)
     */
    duration?: number;
    /**
     * Callback after GIF creation - receives final frame buffer
     * Can return a static image buffer (e.g., final frame) that will be included in result
     * @param finalFrameBuffer - Buffer of the last frame
     * @param painter - ApexPainter instance
     * @returns Optional static image buffer (will be added to result if provided)
     */
    onEnd?: (
        finalFrameBuffer: Buffer,
painter: any
    ) => Promise<Buffer | undefined>;
}

/**
 * Results of creating a GIF.
 * @param buffer The buffer containing the GIF data.
 * @param base64 The base64 representation of the GIF.
 * @param attachment The attachment containing the GIF stream.
 */
export interface GIFResults {
    buffer?: Buffer;
    base64?: string;
    attachment?: { attachment: NodeJS.ReadableStream | any; name: string };
}

/**
 * Custom options for drawing.
 * @param startCoordinates The starting coordinates.
 * @param endCoordinates The ending coordinates.
 * @param lineStyle The style of the line.
 */
export interface CustomOptions {
    startCoordinates: {
        x: number;
        y: number;
    };
    endCoordinates: {
        x: number;
        y: number;
    };

    path?: {
        type: 'smooth' | 'bezier' | 'catmull-rom';
tension?: number;
        closed?: boolean; // Close the path (default: false)
    };

    arrow?: {
start?: boolean;
end?: boolean;
size?: number;
style?: 'filled' | 'outline';
color?: string;
    };

    markers?: Array<{
        position: number; // 0-1 along path
        shape: 'circle' | 'square' | 'diamond' | 'arrow';
        size: number;
        color: string;
    }>;
    lineStyle?: {
        width?: number;
        color?: string;
        gradient?: gradient;
        lineRadius?: number | string;
        lineJoin?: 'round' | 'bevel' | 'miter';
        lineCap?: 'butt' | 'round' | 'square';
        singleLine?: boolean;
        lineDash?: {
            dashArray?: number[];
            offset?: number;
        };
        // Line patterns
        pattern?: {
            type: 'dots' | 'dashes' | 'custom';
segments?: number[];
            offset?: number; // Pattern offset
        };
        texture?: string | Buffer; // Texture image for line
        stroke?: {
            color?: string;
            gradient?: gradient;
            width?: number;
            lineRadius?: number | string;
            lineCap?: 'butt' | 'round' | 'square';
        };
        shadow?: {
            offsetX?: number;
            offsetY?: number;
            blur?: number;
            color?: string;
            gradient?: gradient;
            lineRadius?: number | string;
        };
    };
}

export interface cropCoordinate {
    from: { x: number; y: number };
    to: { x: number; y: number };
    tension?: number;
}

export interface cropOptions {
    coordinates: cropCoordinate[];
    imageSource: string;
    crop: 'inner' | 'outer';
    radius: number | "circular"
}

export interface GradientConfig{
    type: 'linear' | 'radial' | 'conic';
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    startRadius?: number;
    endRadius?: number;
    angle?: number;
centerX?: number;
centerY?: number;
startAngle?: number;
    repeat?: 'repeat' | 'reflect' | 'no-repeat'; // Repeat mode for linear and radial gradients
    colors: {
      stop: number;
      color: string;
    }[];
  };

  export interface Frame{
    backgroundColor?: string;
    gradient?: GradientConfig;
    pattern?: {
        source: string;
        repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
    };
    source?: string;
    blendMode?: GlobalCompositeOperation;
    transformations?: {
        scaleX?: number;
        scaleY?: number;
        rotate?: number;
        translateX?: number;
        translateY?: number;
    };
    duration?: number;
    width?: number;
    height?: number;
    onDrawCustom?: (ctx: SKRSContext2D, canvas: Canvas) => void;
  };


  /**
   * Enhanced pattern options supporting all pattern types
   */
  export interface PatternOptions {
    // === PATTERN TYPE ===
    /** Pattern type: built-in patterns or custom image */
    type: 'grid' | 'dots' | 'diagonal' | 'stripes' | 'waves' | 'crosses' |
          'hexagons' | 'checkerboard' | 'diamonds' | 'triangles' | 'stars' | 'polka' | 'custom';

    // === PATTERN COLORS ===
    /** Primary pattern color (default: '#ffffff') */
    color?: string;
    /** Secondary pattern color for two-color patterns (default: 'transparent') */
    secondaryColor?: string;
    /** Pattern opacity (0-1, default: 0.3) */
    opacity?: number;

    // === PATTERN SIZING ===
    /** Pattern element size in pixels (default: 20) */
    size?: number;
    /** Spacing between pattern elements in pixels (default: 10) */
    spacing?: number;
    /** Pattern rotation angle in degrees (default: 0) */
    rotation?: number;

    // === CUSTOM PATTERN ===
    /** Custom pattern image path/URL (for type: 'custom') */
    customPatternImage?: string;
    /** Custom pattern repeat mode (default: 'repeat') */
    repeat?: 'repeat' | 'repeat-x' | 'repeat-y' | 'no-repeat';
    /** Custom pattern scale multiplier (default: 1) */
    scale?: number;

    // === PATTERN POSITIONING ===
    /** Pattern offset X position (default: 0) */
    offsetX?: number;
    /** Pattern offset Y position (default: 0) */
    offsetY?: number;

    // === ADVANCED OPTIONS ===
    /** Pattern blend mode (default: 'overlay') */
    blendMode?: GlobalCompositeOperation;
    /** Pattern gradient (overrides color) */
    gradient?: GradientConfig;
  }


// Batch operation types
export interface BatchOperation {
  type: 'canvas' | 'image' | 'text';
  config: any;
}

export interface ChainOperation {
  method: string;
  args: any[];
}

// Image stitching options
export interface StitchOptions {
  direction?: 'horizontal' | 'vertical' | 'grid';
  overlap?: number; // Percentage overlap for auto-alignment (0-100)
  blend?: boolean; // Blend overlapping areas (default: false)
  spacing?: number; // Spacing between images in pixels (default: 0)
}

// Collage layout options
export interface CollageLayout {
  type: 'grid' | 'masonry' | 'carousel' | 'custom';
  columns?: number;
  rows?: number;
  spacing?: number;
  background?: string;
  borderRadius?: number;
}

// Image compression options
export interface CompressionOptions {
  quality?: number; // 0-100 (default: 90)
  format?: 'jpeg' | 'webp' | 'avif';
  maxWidth?: number;
  maxHeight?: number;
progressive?: boolean;
}

export interface PaletteOptions {
count?: number;
  method?: 'kmeans' | 'median-cut' | 'octree';
  format?: 'hex' | 'rgb' | 'hsl';
}

  export interface ExtractFramesOptions {
outputDirectory?: string;
    interval: number;
    outputFormat?: 'jpg' | 'png';
    frameSelection?: {
        start?: number;
        end?: number;
    };
    watermark?: string;
  }

  /**
   * Options for resizing an image.
   */
  export interface ResizeOptions {
    imagePath: string;
    size?: {
      width?: number;
      height?: number;
    };
    maintainAspectRatio?: boolean;
    quality?: number;
    outputFormat?: 'png' | 'jpeg';
  }

  export interface Point {
    x: number;
    y: number;
  }

  export interface Coordinate {
    from: Point;
    to: Point;
    tension?: number;
  }

  export interface CropOptions {
    imageSource: string;
    coordinates: Coordinate[];
    crop: 'inner' | 'outer';
    radius?: number | "circular" | null;
  }

  export interface MaskOptions {
    type?: "alpha" | "grayscale" | "color";
    threshold?: number;
    invert?: boolean;
    colorKey?: string;
  }

  export interface BlendOptions {
    type?: "linear" | "radial" | "conic";
    angle?: number;
    colors: { stop: number; color: string }[];
    blendMode?: "multiply" | "overlay" | "screen" | "darken" | "lighten" | "difference";
    maskSource?: string | Buffer | PathLike | Uint8Array;
  }

  export interface SaveOptions {
    /** Output directory path (default: './output') */
    directory?: string;
    /** File name or name pattern (default: auto-generated timestamp) */
    filename?: string;
    /** File format/extension (default: 'png') */
    format?: 'png' | 'jpg' | 'jpeg' | 'webp' | 'avif' | 'gif';
    /** Quality for JPEG/WebP (0-100, default: 90) */
    quality?: number;
    /** Auto-create directory if it doesn't exist (default: true) */
    createDirectory?: boolean;
    /** Naming pattern: 'timestamp' | 'counter' | 'custom' (default: 'timestamp') */
    naming?: 'timestamp' | 'counter' | 'custom';
    /** Counter starting value (for 'counter' naming, default: 1) */
    counterStart?: number;
    /** Prefix for filename (default: '') */
    prefix?: string;
    /** Suffix for filename (default: '') */
    suffix?: string;
    /** Overwrite existing files (default: false) */
    overwrite?: boolean;
  }

  export interface SaveResult {
    /** Full path to saved file */
    path: string;
    /** File name */
    filename: string;
    /** File size in bytes */
    size: number;
    /** File format */
    format: string;
  }
