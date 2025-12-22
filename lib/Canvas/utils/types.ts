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
  width?: number;        // px
  position?: number;     // px (+out/-in)
  blur?: number;         // px
  opacity?: number;      // 0..1
  borderRadius?: number | 'circular';
  borderPosition?: borderPosition;
  style?: 'solid' | 'dashed' | 'dotted' | 'groove' | 'ridge' | 'double';
}

export interface ShadowOptions {
  color?: string;          // e.g. 'rgba(0,0,0,1)'
  gradient?: gradient;     // <— gradient-capable shadow
  offsetX?: number;        // px
  offsetY?: number;        // px
  blur?: number;           // px
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
      pivotX?: number; pivotY?: number; // optional pivot for rotation
      colors: GradientStop[];
    }
  | {
      type: 'radial';
      // two circles (default to center-based radial if not supplied)
      startX?: number; startY?: number; startRadius?: number; // inner circle
      endX?: number;   endY?: number;   endRadius?: number;   // outer circle
      // rotation is NOP for perfectly concentric radial, but supported if centers aren't equal
      rotate?: number; pivotX?: number; pivotY?: number;
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
      filters?: ImageFilter[]; // NEW: Apply filters to background image
      opacity?: number; // NEW: Background image opacity
    };
    videoBg?: {
      source: string | Buffer; // Video file path, URL, or Buffer
      frame?: number; // Extract specific frame number (default: 0)
      time?: number; // Extract frame at specific time in seconds (overrides frame if provided)
      loop?: boolean; // Loop video (default: false)
      autoplay?: boolean; // Autoplay (default: false)
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
      scale?: number;          // optional, defaults to 1
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
export type ShapeType = 'rectangle' | 'square' | 'circle' | 'triangle' | 'trapezium' | 'star' | 'heart' | 'polygon';

export interface ShapeProperties {
  fill?: boolean;
  color?: string;
  gradient?: gradient;
  points?: { x: number; y: number }[]; // for polygon
  radius?: number; // for circle
  sides?: number; // for polygon
  innerRadius?: number; // for star
  outerRadius?: number; // for star
}

export interface ImageProperties {
  // required
  source: string | Buffer | ShapeType;
  x: number;
  y: number;

  // size (if omitted and inherit=true -> use intrinsic)
  width?: number;
  height?: number;
  inherit?: boolean;

  // fitting
  fit?: FitMode;           // default 'fill'
  align?: AlignMode;       // default 'center'

  // visuals
  rotation?: number;       // deg around box center
  opacity?: number;        // bitmap alpha
  blur?: number;           // bitmap blur px
  borderRadius?: number | 'circular';
  borderPosition?: string;

  // image filters
  filters?: ImageFilter[];
  filterIntensity?: number; // Global filter intensity multiplier (default: 1)
  filterOrder?: 'pre' | 'post'; // Apply before or after transformations (default: 'post')

  // image masking
  mask?: {
    source: string | Buffer; // Mask image
    mode?: 'alpha' | 'luminance' | 'inverse'; // Mask mode (default: 'alpha')
  };
  clipPath?: Array<{ x: number; y: number }>; // Custom clipping path polygon

  // image distortion/transform
  distortion?: {
    type: 'perspective' | 'warp' | 'bulge' | 'pinch';
    points?: Array<{ x: number; y: number }>; // Control points for perspective/warp
    intensity?: number; // Intensity for bulge/pinch (default: 0.5)
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

  // independent passes
  shadow?: ShadowOptions;
  stroke?: StrokeOptions;
  boxBackground?: BoxBackground; // under bitmap, inside clip
}

export interface ImageFilter {
  type: 'gaussianBlur' | 'motionBlur' | 'radialBlur' | 'sharpen' | 'noise' | 'grain' | 
        'edgeDetection' | 'emboss' | 'invert' | 'grayscale' | 'sepia' | 'pixelate' | 
        'brightness' | 'contrast' | 'saturation' | 'hueShift' | 'posterize';
  intensity?: number;
  radius?: number;
  angle?: number;        // for motion blur
  centerX?: number;      // for radial blur
  centerY?: number;      // for radial blur
  value?: number;        // for brightness, contrast, saturation, hue shift
  levels?: number;       // for posterize
  size?: number;         // for pixelate
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
    // Advanced path options
    path?: {
        type: 'smooth' | 'bezier' | 'catmull-rom';
        tension?: number; // For smooth/catmull-rom (default: 0.5)
        closed?: boolean; // Close the path (default: false)
    };
    // Arrow markers
    arrow?: {
        start?: boolean; // Arrow at start (default: false)
        end?: boolean; // Arrow at end (default: false)
        size?: number; // Arrow size (default: 10)
        style?: 'filled' | 'outline'; // Arrow style (default: 'filled')
        color?: string; // Arrow color (default: line color)
    };
    // Path markers
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
            segments?: number[]; // For custom pattern
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

export interface ChartData {
    height?: number;
    width?: number;
    widthPerc?: number;
    heightPerc?: number;
    title?: {
        title?: string;
        color?: string;
        size?: number;
    };
    bg?: {
        image?: string;
        bgColor?: string;
    };
    grid?: {
        enable: boolean;
        color?: string;
        width?: number;
    };
    axis?: {
        color?: string;
        size?: number;
    };
    labels?: {
        color?: string;
        fontSize?: number;
    };
}

export interface DataPoint {
    label: string;
    barColor?: string;
    stroke?: { 
        color?: string;
        width?: number;
    }
    value: number;
    position: {
        startsXLabel: number;
        endsXLabel: number;
    };
}

export interface barChart_1 {
    chartData?: ChartData;
    xLabels: number[];
    yLabels: number[];
    data: {
        xAxis: DataPoint[];
        yAxis: number[];
        keys?: { [color: string]: string };
        keyColor?: string;
        xTitle?: string;
        yTitle?: string;
        labelStyle?: {
            color?: string;
            size?: number;
        };
    };
}


export interface bgConfig {
    width?: number;
    height?: number;
    bgcolor?: string;
  }
  
export interface KeyBoxConfig {
    width?: number;
    height?: number;
    radius?: number;
    bgcolor?: string;
    x?: number;
    y?: number;
    content?: KeyBoxContent;
  }
  
  export interface KeyBoxContent {
    keyTitle?: {
      text?: string;
      fontSize?: number;
      x?: number;
      y?: number;
    };
    keys?: {
      x?: number;
      y?: number;
      fontSize?: number;
    };
  }
  
export interface StrokeConfig {
    color?: string;
    size?: number;
  }
  
export interface TitleConfig {
    text?: string;
    color?: string;
    fontSize?: number;
    x?: number;
    y?: number;
  }
  
export interface PieDataConfig {
    x?: number;
    y?: number;
    stroke?: StrokeConfig;
    title?: TitleConfig;
    boxes?: {
      labelDistance?: number;
      width?: number;
      height?: number;
      fontSize?: number;
      labelColor?: string;
      boxColor?: string;
      strokeColor?: string;

    };
    radius?: number;
  }
  
export interface PieConfig {
    canvas?: bgConfig;
    keyBox?: KeyBoxConfig;
    pieData?: PieDataConfig;
  }
  
export  interface DataItem {
    label: string;
    color: string;
    value: number;
    key: string;
  }
  
export  interface PieChartData {
    data?: DataItem[];
    pieConfig?: PieConfig;
  }

  
export interface DataPoint {
    label: string;
    y: number;
}

export interface LineChartConfig {
    yLabels: string[];
    fillArea: { color: string }[];
    lineColor: string[];
    plot?: {
        enable: boolean;
        color: string[];
        size: number;
    };
    yaxisLabel?: {
        label?: string;
        x?: number;
        y?: number; 
        color?: string;
        fontSize?: string;
    };
    lineTension?: number[];
    grid?: {
        type: 'vertical' | 'horizontal' | 'both';
        color: string;
        width: number;
    };
    keys?: { [color: string]: string };
    keysConfig?: {
        radius?: number;
        keyPadding?: number;
        textPadding?: number;
        lineWidth?: number;
        fontColor?: string;
    }
    canvas?: {
        bgColor?: string;
        fontColor?: string;
        fontSize?: number;
        width?: number;
        height?: number;
        image?: string;
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
    type: 'linear' | 'radial';
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    startRadius?: number;
    endRadius?: number;
    angle?: number;
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
  type: 'canvas' | 'image' | 'text' | 'chart';
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
  progressive?: boolean; // For JPEG (default: false)
}

// Color palette extraction options
export interface PaletteOptions {
  count?: number; // Number of colors (default: 10)
  method?: 'kmeans' | 'median-cut' | 'octree';
  format?: 'hex' | 'rgb' | 'hsl';
}

  export interface ExtractFramesOptions {
  outputDirectory?: string; // Directory to save frames
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

  // Advanced Save Options
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
