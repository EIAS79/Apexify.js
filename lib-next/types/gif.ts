import type { Canvas, SKRSContext2D } from "@napi-rs/canvas";
import type { GradientConfig } from "./common";

export type GIFDisposalMethod = 0 | 1 | 2 | 3;

export interface GIFWatermarkSpec {
  enable?: boolean;
  url: string;
  x?: number;
  y?: number;
}

export interface GIFInputFrame {
  duration: number;
  buffer?: Buffer;
  background?: string | Buffer;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export interface GIFEncodedFrame {
  buffer: Buffer;
  duration?: number;
  dispose?: GIFDisposalMethod;
  transparentColor?: number | string | null;
  watermark?: GIFWatermarkSpec;
}

export interface GIFOptions {
  outputFormat: "file" | "base64" | "attachment" | "buffer" | string;
  outputFile?: string;
  width?: number;
  height?: number;
  repeat?: number;
  quality?: number;
  delay?: number;
  watermark?: {
    enable: boolean;
    url: string;
    x?: number;
    y?: number;
  };
  transparentColor?: number | string | null;
  defaultDispose?: GIFDisposalMethod;
  textOverlay?: {
    text: string;
    fontName?: string;
    fontPath?: string;
    fontSize?: number;
    fontColor?: string;
    x?: number;
    y?: number;
  };
  basDir?: unknown;
  skipResizeWhenDimensionsMatch?: boolean;
  onStart?: (
    frameCountHint: number,
    painter: unknown
  ) => Promise<GIFEncodedFrame[] | AsyncIterable<GIFEncodedFrame>>;
  frameCount?: number;
  duration?: number;
  onEnd?: (finalFrameBuffer: Buffer, painter: unknown) => Promise<Buffer | undefined>;
}

export interface GIFResults {
  buffer?: Buffer;
  base64?: string;
  attachment?: { attachment: NodeJS.ReadableStream | unknown; name: string };
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
