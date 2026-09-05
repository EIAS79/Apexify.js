import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";
import type { GradientConfig } from "./common";
import type { TextProperties } from "./text";

export type GIFDisposalMethod = 0 | 1 | 2 | 3;
export type GIFOutputFormat = "file" | "base64" | "attachment" | "buffer";
export type GIFFrameSource = string | Buffer | Uint8Array | URL;
export type GIFWatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/** Watermark image applied after the frame raster and before GIF encoding. */
export interface GIFWatermarkSpec {
  enable?: boolean;
  url: GIFFrameSource;
  x?: number;
  y?: number;
  opacity?: number;
  width?: number;
  height?: number;
  scale?: number;
  margin?: number;
  position?: GIFWatermarkPosition;
}

/** Static text overlay. It uses the same renderer as `createText`; x/y default to 10/30. */
export type GIFTextOverlaySpec = Omit<TextProperties, "x" | "y"> & {
  x?: number;
  y?: number;
  /** Legacy alias for `color`/`fill.color`. */
  fontColor?: string;
};

export interface GIFInputFrame {
  /** Milliseconds. If omitted, `GIFOptions.delay` (default 100ms) is used. */
  duration?: number;
  buffer?: GIFFrameSource;
  background?: GIFFrameSource;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export interface GIFEncodedFrame {
  buffer: GIFFrameSource;
  /** Milliseconds. If omitted, `GIFOptions.delay` (default 100ms) is used. */
  duration?: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export interface GIFOptions {
  outputFormat: GIFOutputFormat;
  outputFile?: string;
  /** Attachment filename; `.gif` is appended when omitted. */
  attachmentName?: string;
  width?: number;
  height?: number;
  /** -1 = play once, 0 = loop forever, positive values = finite repeat count. */
  repeat?: number;
  /** Quantizer sample interval 1..30; lower is higher quality/slower. Default 10. */
  quality?: number;
  /** Default frame delay in milliseconds. GIF timing is rounded to 10ms units. */
  delay?: number;
  watermark?: GIFWatermarkSpec;
  transparentColor?: number | string | null;
  defaultDispose?: GIFDisposalMethod;
  textOverlay?: GIFTextOverlaySpec;
  /** Kept for source compatibility; ignored. */
  basDir?: unknown;
  /** Frames are stretched to the output dimensions; this only skips redundant scaling for exact-size frames. */
  skipResizeWhenDimensionsMatch?: boolean;
  /**
   * Generated-frame mode. Returning an AsyncIterable is the memory-bounded streaming path:
   * one yielded frame is resolved, decoded, drawn and encoded before the next is requested.
   */
  onStart?: (
    frameCountHint: number,
    painter: unknown
  ) => Promise<GIFEncodedFrame[] | AsyncIterable<GIFEncodedFrame>>;
  frameCount?: number;
  duration?: number;
  onEnd?: (finalFrameBuffer: Buffer, painter: unknown) => Promise<Buffer | undefined>;
  /** Cancels further frame pulls, media requests, and encoding work where the encoder permits. */
  signal?: AbortSignal;
}

export interface GIFAttachment {
  attachment: Buffer;
  name: string;
  contentType: "image/gif";
}

export interface GIFResults {
  buffer?: Buffer;
  base64?: string;
  attachment?: GIFAttachment;
}

export interface Frame {
  backgroundColor?: string;
  gradient?: GradientConfig;
  pattern?: {
    source: string;
    repeat?: "repeat" | "repeat-x" | "repeat-y" | "no-repeat";
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
}
