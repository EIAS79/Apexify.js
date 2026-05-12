import fs from "fs";
import path from "path";
import { performance } from "node:perf_hooks";
import { ApexPainter } from "./lib/index";
import type { GIFInputFrame, ImageProperties, TextProperties } from "./lib/index";
import type { SceneLayer } from "./lib/Canvas/services/SceneCreator";

const W = 1600;
const H = 1000;

const C = {
  cyan: "#00eaff",
  pink: "#ff5bd6",
  violet: "#7a5cff",
  white: "#f6fbff",
};

/** Use in big `TextProperties[]` literals with spreads so `textAlign` / `textBaseline` do not widen to `string`. */
const TEXT_ALIGN_CENTER: NonNullable<TextProperties["textAlign"]> = "center";
const TEXT_ALIGN_RIGHT: NonNullable<TextProperties["textAlign"]> = "right";
const TEXT_BASELINE_MIDDLE: NonNullable<TextProperties["textBaseline"]> = "middle";

function rgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function panel(
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 34
): ImageProperties {
  return {
    source: "rectangle",
    x,
    y,
    width,
    height,
    borderRadius: radius,
    shape: {
      fill: true,
      gradient: {
        type: "linear",
        startX: x,
        startY: y,
        endX: x + width,
        endY: y + height,
        colors: [
          { stop: 0, color: "rgba(255,255,255,0.105)" },
          { stop: 0.55, color: "rgba(255,255,255,0.038)" },
          { stop: 1, color: "rgba(0,234,255,0.035)" },
        ],
      },
    },
    stroke: {
      width: 1.4,
      color: "rgba(255,255,255,0.16)",
      borderRadius: radius,
    },
    shadow: {
      color: "rgba(0,0,0,0.55)",
      offsetX: 0,
      offsetY: 28,
      blur: 55,
      opacity: 0.85,
      borderRadius: radius,
    },
  };
}

function ringTicks(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  tickW: number,
  tickH: number,
  color: string,
  opacity = 0.65,
  anglePhaseRad = 0
): ImageProperties[] {
  const out: ImageProperties[] = [];

  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + anglePhaseRad;
    const x = cx + Math.cos(a) * radius - tickW / 2;
    const y = cy + Math.sin(a) * radius - tickH / 2;

    out.push({
      source: "rectangle",
      x,
      y,
      width: tickW,
      height: tickH,
      rotation: (a * 180) / Math.PI + 90,
      opacity,
      borderRadius: 4,
      shape: { fill: true, color },
      shadow: {
        color,
        blur: 10,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.55,
      },
    });
  }

  return out;
}

function particles(
  cx: number,
  cy: number,
  radius: number,
  count: number,
  color: string,
  anglePhaseRad = 0
): ImageProperties[] {
  const out: ImageProperties[] = [];

  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count + (i % 3) * 0.21 + anglePhaseRad;
    const r = radius + ((i % 5) - 2) * 9;
    const size = 4 + (i % 3) * 2;

    out.push({
      source: "circle",
      x: cx + Math.cos(a) * r - size / 2,
      y: cy + Math.sin(a) * r - size / 2,
      width: size,
      height: size,
      opacity: 0.5 + (i % 4) * 0.1,
      shape: { fill: true, color },
      shadow: {
        color,
        blur: 12,
        offsetX: 0,
        offsetY: 0,
      },
    });
  }

  return out;
}

/** Small electric pulses orbiting the core / inner rings (GIF frames). */
function engineSparks(cx: number, cy: number, ringR: number, t: number): ImageProperties[] {
  const n = 10;
  const out: ImageProperties[] = [];
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + t * Math.PI * 2 * 1.35;
    const wobble = 1 + 0.07 * Math.sin(t * Math.PI * 2 * 3 + i * 0.7);
    const r = ringR * wobble;
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 5 + i * 1.1));
    const sz = 4 + (i % 3);
    out.push({
      source: "circle",
      x: cx + Math.cos(a) * r - sz / 2,
      y: cy + Math.sin(a) * r - sz / 2,
      width: sz,
      height: sz,
      opacity: pulse,
      blendMode: "screen",
      shape: { fill: true, color: "rgba(180,255,255,0.95)" },
      shadow: {
        color: C.cyan,
        blur: 12 + Math.round(10 * pulse),
        offsetX: 0,
        offsetY: 0,
        opacity: 0.85,
      },
    });
  }
  return out;
}

function scanlines(
  x: number,
  y: number,
  width: number,
  height: number,
  gap = 14
): ImageProperties[] {
  const out: ImageProperties[] = [];

  for (let yy = y; yy < y + height; yy += gap) {
    out.push({
      source: "rectangle",
      x,
      y: yy,
      width,
      height: 1,
      opacity: 0.08,
      shape: { fill: true, color: "rgba(255,255,255,0.22)" },
    });
  }

  return out;
}


/**
 * Same dashboard as {@link renderAuroraFrameBufferChain}, built as one {@link ApexPainter.renderScene}
 * (single raster pass per frame — much faster for GIF frame loops).
 */
async function renderAuroraFrameWithScene(painter: ApexPainter, t: number): Promise<Buffer> {
  const pulse = Math.sin(t * Math.PI * 2);
  const pump = Math.sin(t * Math.PI * 2 * 2);
  const ripple = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3);

  const frame = { x: 70, y: 62, w: 1460, h: 870 };
  const left = { x: 115, y: 115, w: 430, h: 765 };
  const center = { x: 585, y: 115, w: 505, h: 765 };
  const right = { x: 1130, y: 115, w: 330, h: 765 };

  const cx = center.x + center.w / 2;
  const cy = center.y + 350;
  const ringDiameter = 350;
  const ringRadius = ringDiameter / 2;

  const cyanSeries = [42, 56, 61, 70, 78, 88, 94].map((y, i) => ({
    x: i + 1,
    y: Math.max(2, Math.min(98, y + 4 * Math.sin(t * Math.PI * 2 + i * 0.55))),
  }));
  const pinkSeries = [70, 66, 60, 51, 43, 34, 29].map((y, i) => ({
    x: i + 1,
    y: Math.max(2, Math.min(98, y + 3.5 * Math.sin(t * Math.PI * 2 * 1.3 + i * 0.5 + 1))),
  }));

  const barX = right.x + 34;
  const barW = right.w - 68;
  const bars = [
    { y: right.y + 371, label: "signal integrity", val: 0.92, color: C.cyan },
    { y: right.y + 421, label: "model confidence", val: 0.86, color: C.pink },
    { y: right.y + 471, label: "workflow sync", val: 0.74, color: C.violet },
  ];
  const barPulses = bars.map((_, bi) => 0.94 + 0.06 * Math.sin(t * Math.PI * 2 + bi * 1.7));

  const gridX = left.x + 30;
  const gridY = left.y + 360;
  const cellW = 174;
  const cellH = 76;
  const gap = 18;
  const cells = [
    ["VISION", "active", C.cyan],
    ["ROUTING", "stable", C.violet],
    ["RISK", "low", C.pink],
    ["SYNC", "99.2%", C.cyan],
  ] as const;

  const layers: SceneLayer[] = [];

  layers.push({
    type: "image",
    images: [
      {
        source: "rectangle",
        x: frame.x,
        y: frame.y,
        width: frame.w,
        height: frame.h,
        borderRadius: 46,
        shape: { fill: true, color: "rgba(255,255,255,0.018)" },
        stroke: {
          width: 2,
          color: "rgba(255,255,255,0.13)",
          borderRadius: 46,
        },
        shadow: {
          color: "rgba(0,0,0,0.75)",
          offsetX: 0,
          offsetY: 36,
          blur: 75,
          opacity: 0.86,
          borderRadius: 46,
        },
      },
      panel(left.x, left.y, left.w, 255, 34),
      panel(left.x, left.y + 295, left.w, 470, 34),
      panel(center.x, center.y, center.w, center.h, 44),
      panel(right.x, right.y, right.w, 235, 34),
      panel(right.x, right.y + 270, right.w, 225, 34),
      panel(right.x, right.y + 530, right.w, 235, 34),
    ],
  });

  layers.push({
    type: "image",
    images: [
      {
        source: "circle",
        x: cx - 300,
        y: cy - 300,
        width: 600,
        height: 600,
        opacity: 0.25 + 0.1 * pulse,
        blur: 24,
        blendMode: "screen",
        shape: {
          fill: true,
          gradient: {
            type: "radial",
            colors: [
              { stop: 0, color: `rgba(0,234,255,${0.55 + 0.25 * ripple})` },
              { stop: 0.38, color: "rgba(122,92,255,0.18)" },
              { stop: 1, color: "rgba(0,0,0,0)" },
            ],
          },
        },
      },
      {
        source: "circle",
        x: cx - ringRadius,
        y: cy - ringRadius,
        width: ringDiameter,
        height: ringDiameter,
        opacity: 0.88 + 0.12 * pump,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 2.4 + 0.8 * Math.abs(pump),
          color: `rgba(0,234,255,${0.35 + 0.35 * ripple})`,
          style: "dashed",
        },
      },
      {
        source: "circle",
        x: cx - 125,
        y: cy - 125,
        width: 250,
        height: 250,
        shape: {
          fill: true,
          gradient: {
            type: "radial",
            colors: [
              { stop: 0, color: "rgba(255,255,255,0.96)" },
              { stop: 0.18, color: "rgba(0,234,255,0.9)" },
              { stop: 0.52, color: "rgba(49,81,255,0.42)" },
              { stop: 1, color: "rgba(0,0,0,0.05)" },
            ],
          },
        },
        stroke: {
          width: 2,
          color: "rgba(255,255,255,0.56)",
          borderRadius: "circular",
        },
        shadow: {
          color: `rgba(0,234,255,${0.65 + 0.25 * pulse})`,
          offsetX: 0,
          offsetY: 0,
          blur: 40 + 22 * Math.abs(pump),
          opacity: 0.85 + 0.12 * ripple,
        },
      },
      {
        source: "star",
        x: cx - 46,
        y: cy - 46,
        width: 92,
        height: 92,
        rotation: 12 + t * 360 + 8 * Math.sin(t * Math.PI * 4),
        shape: {
          fill: true,
          gradient: {
            type: "linear",
            colors: [
              { stop: 0, color: "#ffffff" },
              { stop: 1, color: "#9df8ff" },
            ],
          },
          innerRadius: 20,
          outerRadius: 45,
        },
        shadow: {
          color: "rgba(255,255,255,0.7)",
          blur: 20 + 16 * ripple,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.75 + 0.25 * pulse,
        },
      },
    ],
  });

  layers.push({
    type: "image",
    images: [
      ...ringTicks(cx, cy, 214, 72, 3, 14, "rgba(0,234,255,0.72)", 0.42 + 0.22 * ripple, t * Math.PI * 2 * 0.18),
      ...ringTicks(cx, cy, 150, 42, 3, 10, "rgba(255,91,214,0.55)", 0.28 + 0.18 * pulse, -t * Math.PI * 2 * 0.12),
      ...particles(cx, cy, 205, 34, "rgba(0,234,255,0.92)", t * Math.PI * 2 * 0.25),
      ...particles(cx, cy, 118, 18, "rgba(255,255,255,0.82)", -t * Math.PI * 2 * 0.2),
      ...engineSparks(cx, cy, ringRadius - 4, t),
      ...engineSparks(cx, cy, 82, t + 0.37),
      {
        source: "circle",
        x: cx - 205,
        y: cy - 205,
        width: 410,
        height: 410,
        opacity: 0.55 + 0.45 * ripple,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 1.2,
          color: `rgba(255,255,255,${0.12 + 0.14 * pulse})`,
          style: "dotted",
        },
      },
      {
        source: "circle",
        x: cx - 82,
        y: cy - 82,
        width: 164,
        height: 164,
        opacity: 0.7 + 0.3 * pump,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 1.5,
          color: `rgba(255,255,255,${0.2 + 0.18 * ripple})`,
          style: "dashed",
        },
      },
    ],
    options: {
      isGrouped: true,
      groupTransform: {
        rotation: -11 + 5 * Math.sin(t * Math.PI * 2),
        opacity: 0.88 + 0.1 * pulse,
      },
    },
  });

  layers.push({
    type: "path",
    path: [
      { type: "moveTo", x: left.x + left.w, y: left.y + 420 },
      {
        type: "bezierCurveTo",
        cp1x: 575,
        cp1y: 510,
        cp2x: 615,
        cp2y: 470,
        x: cx - 176,
        y: cy,
      },
      { type: "moveTo", x: cx + 176, y: cy },
      {
        type: "bezierCurveTo",
        cp1x: 1060,
        cp1y: 470,
        cp2x: 1090,
        cp2y: 330,
        x: right.x,
        y: right.y + 150,
      },
      { type: "moveTo", x: cx + 126, y: cy + 120 },
      {
        type: "bezierCurveTo",
        cp1x: 1094,
        cp1y: 648,
        cp2x: 1082,
        cp2y: 698,
        x: right.x,
        y: right.y + 650,
      },
    ],
    options: {
      stroke: {
        color: `rgba(0,234,255,${0.32 + 0.22 * pulse})`,
        width: 3.2 + 0.6 * Math.abs(pump),
        style: "dashed",
        dashArray: [14, 12],
        dashOffset: -t * 52,
      },
      shadow: {
        color: "rgba(0,234,255,0.45)",
        blur: 8 + 12 * ripple,
        offsetX: 0,
        offsetY: 0,
      },
      opacity: 0.72 + 0.2 * ripple,
    },
  });

  layers.push({
    type: "image",
    images: [
      {
        source: "circle",
        x: left.x + left.w - 7,
        y: left.y + 411,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * ripple,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * pulse, offsetX: 0, offsetY: 0 },
      },
      {
        source: "circle",
        x: right.x - 7,
        y: right.y + 150 - 7,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * pulse,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * ripple, offsetX: 0, offsetY: 0 },
      },
      {
        source: "circle",
        x: right.x - 7,
        y: right.y + 643,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * pump,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * Math.abs(pulse), offsetX: 0, offsetY: 0 },
      },
    ],
  });

  layers.push({
    type: "image",
    images: scanlines(center.x + 28, center.y + 105, center.w - 56, center.h - 155, 16),
  });

  layers.push({
    type: "chart",
    chartType: "line",
    data: [
      {
        label: "Prediction Accuracy",
        color: C.cyan,
        lineWidth: 4,
        smoothness: "bezier",
        marker: { type: "circle", size: 6, show: true, filled: true },
        area: {
          show: true,
          type: "below",
          color: "rgba(0,234,255,0.20)",
          opacity: 0.42 + 0.12 * pulse,
        },
        data: cyanSeries,
      },
      {
        label: "Decision Latency",
        color: C.pink,
        lineWidth: 4,
        smoothness: "bezier",
        marker: { type: "diamond", size: 6, show: true, filled: true },
        area: {
          show: true,
          type: "below",
          color: "rgba(255,91,214,0.12)",
          opacity: 0.32 + 0.1 * ripple,
        },
        data: pinkSeries,
      },
    ],
    options: {
      dimensions: {
        width: 400,
        height: 200,
        padding: { top: 25, right: 25, bottom: 36, left: 50 },
      },
      appearance: { backgroundColor: "rgba(0,0,0,0)" },
      axes: {
        x: {
          values: [1, 2, 3, 4, 5, 6, 7],
          color: "rgba(255,255,255,0.25)",
          labelColor: "rgba(255,255,255,0.55)",
          tickFontSize: 11,
        },
        y: {
          range: { min: 0, max: 100, step: 25 },
          color: "rgba(255,255,255,0.25)",
          labelColor: "rgba(255,255,255,0.55)",
          tickFontSize: 11,
        },
      },
      grid: {
        show: true,
        color: "rgba(255,255,255,0.075)",
        width: 1,
      },
      legend: { show: false },
    },
    x: left.x - 20,
    y: left.y + 555,
    width: 450,
    height: 225,
    opacity: 0.94 + 0.06 * pulse,
  });

  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi]!;
    const bPulse = barPulses[bi]!;
    const fillW = Math.round(barW * b.val * bPulse);
    layers.push({
      type: "image",
      images: [
        {
          source: "rectangle",
          x: barX,
          y: b.y,
          width: barW,
          height: 10,
          borderRadius: 10,
          shape: { fill: true, color: "rgba(255,255,255,0.10)" },
        },
        {
          source: "rectangle",
          x: barX,
          y: b.y,
          width: fillW,
          height: 10,
          borderRadius: 10,
          opacity: 0.88 + 0.12 * pulse,
          shape: { fill: true, color: b.color },
          shadow: {
            color: rgba(b.color, 0.45 + 0.35 * ripple),
            blur: 14 + 10 * Math.abs(pump),
            offsetX: 0,
            offsetY: 0,
          },
        },
      ],
    });
  }

  for (let i = 0; i < cells.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridX + col * (cellW + gap);
    const y = gridY + row * (cellH + gap);
    const c = cells[i]!;
    layers.push({
      type: "image",
      images: [
        {
          source: "rectangle",
          x,
          y,
          width: cellW,
          height: cellH,
          borderRadius: 20,
          shape: { fill: true, color: "rgba(255,255,255,0.045)" },
          stroke: {
            width: 1,
            color: "rgba(255,255,255,0.13)",
            borderRadius: 20,
          },
        },
        {
          source: "circle",
          x: x + 17,
          y: y + 25,
          width: 14,
          height: 14,
          opacity: 0.72 + 0.28 * Math.sin(t * Math.PI * 2 * 1.4 + i * 1.3),
          shape: { fill: true, color: c[2] },
          shadow: {
            color: rgba(c[2], 0.8),
            blur: 12 + 8 * ripple,
            offsetX: 0,
            offsetY: 0,
            opacity: 0.7 + 0.3 * pulse,
          },
        },
      ],
    });
  }

  const textBlocks: TextProperties[] = [
    {
      text: "AURORA CORE",
      x: left.x + 32,
      y: left.y + 62,
      font: { size: 33, family: "Arial" },
      bold: true,
      letterSpacing: 5,
      color: "rgba(255,255,255,0.72)",
    },
    {
      text: "AI Operational\nCommand Interface",
      x: left.x + 32,
      y: left.y + 138,
      font: { size: 40, family: "Arial" },
      bold: true,
      lineHeight: 1.02,
      gradient: {
        type: "linear",
        colors: [
          { stop: 0, color: "#ffffff" },
          { stop: 0.55, color: "#bdfaff" },
          { stop: 1, color: "#ff83df" },
        ],
      },
      shadow: {
        color: "rgba(0,234,255,0.32)",
        blur: 20,
        offsetX: 0,
        offsetY: 0,
        opacity: 0.8,
      },
    },
    ...cells.flatMap((c, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = gridX + col * (cellW + gap);
      const y = gridY + row * (cellH + gap);
      return [
        {
          text: c[0],
          x: x + 42,
          y: y + 31,
          font: { size: 15, family: "Arial" },
          bold: true,
          color: "rgba(255,255,255,0.78)",
        },
        {
          text: c[1],
          x: x + 42,
          y: y + 55,
          font: { size: 16, family: "Arial" },
          color: "rgba(255,255,255,0.48)",
        },
      ];
    }),
    {
      text: "NEURAL DECISION ENGINE",
      x: cx + 2,
      y: center.y + 75,
      font: { size: 28, family: "Arial" },
      bold: true,
      letterSpacing: 4,
      color: "rgba(0,234,255,0.95)",
      textAlign: TEXT_ALIGN_CENTER,
      opacity: 0.92 + 0.08 * pulse,
      glow: {
        color: "rgba(0,234,255,0.65)",
        intensity: 12 + 8 * ripple,
        opacity: 0.55 + 0.35 * pulse,
      },
    },
    {
      text: "AURORA",
      x: cx + 5,
      y: cy + 217,
      font: { size: 64, family: "Arial" },
      bold: true,
      textAlign: TEXT_ALIGN_CENTER,
      gradient: {
        type: "linear",
        colors: [
          { stop: 0, color: "#ffffff" },
          { stop: 1, color: "#8ff8ff" },
        ],
      },
      shadow: {
        color: "rgba(0,234,255,0.45)",
        blur: 26,
        offsetX: 0,
        offsetY: 0,
      },
    },
    {
      text: "live intelligence layer",
      x: cx + 5,
      y: cy + 262,
      font: { size: 22, family: "Arial" },
      textAlign: TEXT_ALIGN_CENTER,
      color: "rgba(255,255,255,0.52)",
    },
    {
      text: "REAL TIME OPERATIONS",
      x: cx,
      y: cy - ringRadius - 10,
      font: { size: 23, family: "Arial" },
      bold: true,
      letterSpacing: 3,
      color: "rgba(255,255,255,0.75)",
      textAlign: TEXT_ALIGN_CENTER,
      textBaseline: TEXT_BASELINE_MIDDLE,
      textOnCurve: {
        sweepAngle: 118,
        radius: ringRadius,
        up: true,
        layoutMode: "override",
        startAngleDeg: 8 * Math.sin(t * Math.PI * 2),
        baselineOffset: 2 + 4 * pulse,
      },
      glow: {
        color: "rgba(0,234,255,0.4)",
        intensity: 8 + 6 * ripple,
        opacity: 0.45 + 0.45 * pulse,
      },
    },
    {
      text: "CORE TEMP  41.8°C      LATENCY  12ms      LOAD  68%",
      x: cx,
      y: center.y + center.h - 70,
      font: { size: 14, family: "Arial" },
      bold: true,
      letterSpacing: 1.6,
      color: "rgba(255,255,255,0.45)",
      textAlign: TEXT_ALIGN_CENTER,
    },
    {
      text: "VECTOR SYNC ONLINE",
      x: cx,
      y: center.y + center.h - 42,
      font: { size: 15, family: "Arial" },
      bold: true,
      letterSpacing: 2.4,
      color: `rgba(0,234,255,${0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2))})`,
      textAlign: TEXT_ALIGN_CENTER,
      glow: {
        color: "rgba(0,234,255,0.55)",
        intensity: 6 + 8 * ripple,
        opacity: 0.4 + 0.4 * pulse,
      },
    },
    {
      text: "SYSTEM HEALTH",
      x: right.x + 34,
      y: right.y + 52,
      font: { size: 22, family: "Arial" },
      bold: true,
      letterSpacing: 3,
      color: "rgba(0,234,255,0.95)",
    },
    {
      text: "98.7%",
      x: right.x + 34,
      y: right.y + 150,
      font: { size: 82, family: "Arial" },
      bold: true,
      gradient: {
        type: "linear",
        colors: [
          { stop: 0, color: C.cyan },
          { stop: 1, color: "#ffffff" },
        ],
      },
      shadow: {
        color: "rgba(0,234,255,0.44)",
        blur: 28,
        offsetX: 0,
        offsetY: 0,
      },
    },
    {
      text: "deployment confidence",
      x: right.x + 38,
      y: right.y + 198,
      font: { size: 19, family: "Arial" },
      color: "rgba(255,255,255,0.52)",
    },
    {
      text: "CORE TELEMETRY",
      x: right.x + 34,
      y: right.y + 323,
      font: { size: 21, family: "Arial" },
      bold: true,
      letterSpacing: 3,
      color: "rgba(255,255,255,0.78)",
    },
    ...bars.flatMap((b, bi) => [
      {
        text: b.label.toUpperCase(),
        x: barX,
        y: b.y - 12,
        font: { size: 13, family: "Arial" },
        bold: true,
        letterSpacing: 1.4,
        color: "rgba(255,255,255,0.52)",
      },
      {
        text: `${Math.round(b.val * barPulses[bi]! * 100)}%`,
        x: barX + barW - 2,
        y: b.y - 12,
        font: { size: 14, family: "Arial" },
        bold: true,
        color: "rgba(255,255,255,0.72)",
        textAlign: TEXT_ALIGN_RIGHT,
      },
    ]),
    {
      text: "OUTPUT STREAM",
      x: right.x + 34,
      y: right.y + 585,
      font: { size: 20, family: "Arial" },
      bold: true,
      letterSpacing: 3,
      color: "rgba(255,255,255,0.78)",
    },
    {
      text: "• predictive routing\n• approval intelligence\n• anomaly detection\n• executive signal layer",
      x: right.x + 34,
      y: right.y + 636,
      font: { size: 20, family: "Arial" },
      color: "rgba(255,255,255,0.55)",
      lineHeight: 1.55,
    },
    {
      text: "SIGNAL TREND / 7-DAY MODEL",
      x: left.x + 75,
      y: left.y + 575,
      font: { size: 16, family: "Arial" },
      bold: true,
      letterSpacing: 2,
      color: "rgba(255,255,255,0.72)",
    },
  ];

  layers.push({ type: "text", texts: textBlocks });

  return painter.renderScene({
    width: W,
    height: H,
    background: {
      gradientBg: {
        type: "linear",
        startX: 0,
        startY: 0,
        endX: W,
        endY: H,
        colors: [
          { stop: 0, color: "#01030a" },
          { stop: 0.42, color: "#07142b" },
          { stop: 0.72, color: "#06152a" },
          { stop: 1, color: "#01070c" },
        ],
      },
      bgLayers: [
        {
          type: "gradient",
          opacity: 0.85,
          blendMode: "screen",
          value: {
            type: "radial",
            startX: 760,
            startY: 430,
            startRadius: 20,
            endX: 760,
            endY: 430,
            endRadius: 680,
            colors: [
              { stop: 0, color: "rgba(0,234,255,0.33)" },
              { stop: 0.4, color: "rgba(122,92,255,0.14)" },
              { stop: 1, color: "rgba(0,0,0,0)" },
            ],
          },
        },
        {
          type: "gradient",
          opacity: 0.65,
          blendMode: "screen",
          value: {
            type: "radial",
            startX: 1430,
            startY: 180,
            startRadius: 10,
            endX: 1430,
            endY: 180,
            endRadius: 520,
            colors: [
              { stop: 0, color: "rgba(255,91,214,0.30)" },
              { stop: 0.45, color: "rgba(122,92,255,0.14)" },
              { stop: 1, color: "rgba(0,0,0,0)" },
            ],
          },
        },
        { type: "noise", intensity: 0.04, blendMode: "overlay" },
      ],
      patternBg: {
        type: "grid",
        color: "rgba(255,255,255,0.035)",
        spacing: 38,
        size: 1,
      } as any,
      noiseBg: { intensity: 0.026 },
    },
    layers,
  });
}

async function renderAuroraFrameBufferChain(painter: ApexPainter, t: number): Promise<Buffer> {
  const pulse = Math.sin(t * Math.PI * 2);
  const pump = Math.sin(t * Math.PI * 2 * 2);
  const ripple = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3);

  const frame = { x: 70, y: 62, w: 1460, h: 870 };
  const left = { x: 115, y: 115, w: 430, h: 765 };
  const center = { x: 585, y: 115, w: 505, h: 765 };
  const right = { x: 1130, y: 115, w: 330, h: 765 };

  const canvas = await painter.createCanvas({
    width: W,
    height: H,
    gradientBg: {
      type: "linear",
      startX: 0,
      startY: 0,
      endX: W,
      endY: H,
      colors: [
        { stop: 0, color: "#01030a" },
        { stop: 0.42, color: "#07142b" },
        { stop: 0.72, color: "#06152a" },
        { stop: 1, color: "#01070c" },
      ],
    },
    bgLayers: [
      {
        type: "gradient",
        opacity: 0.85,
        blendMode: "screen",
        value: {
          type: "radial",
          startX: 760,
          startY: 430,
          startRadius: 20,
          endX: 760,
          endY: 430,
          endRadius: 680,
          colors: [
            { stop: 0, color: "rgba(0,234,255,0.33)" },
            { stop: 0.4, color: "rgba(122,92,255,0.14)" },
            { stop: 1, color: "rgba(0,0,0,0)" },
          ],
        },
      },
      {
        type: "gradient",
        opacity: 0.65,
        blendMode: "screen",
        value: {
          type: "radial",
          startX: 1430,
          startY: 180,
          startRadius: 10,
          endX: 1430,
          endY: 180,
          endRadius: 520,
          colors: [
            { stop: 0, color: "rgba(255,91,214,0.30)" },
            { stop: 0.45, color: "rgba(122,92,255,0.14)" },
            { stop: 1, color: "rgba(0,0,0,0)" },
          ],
        },
      },
      { type: "noise", intensity: 0.04, blendMode: "overlay" },
    ],
    patternBg: {
      type: "grid",
      color: "rgba(255,255,255,0.035)",
      spacing: 38,
      size: 1,
    } as any,
    noiseBg: { intensity: 0.026 },
  });

  let buffer = canvas.buffer;

  buffer = await painter.createImage(
    [
      {
        source: "rectangle",
        x: frame.x,
        y: frame.y,
        width: frame.w,
        height: frame.h,
        borderRadius: 46,
        shape: { fill: true, color: "rgba(255,255,255,0.018)" },
        stroke: {
          width: 2,
          color: "rgba(255,255,255,0.13)",
          borderRadius: 46,
        },
        shadow: {
          color: "rgba(0,0,0,0.75)",
          offsetX: 0,
          offsetY: 36,
          blur: 75,
          opacity: 0.86,
          borderRadius: 46,
        },
      },
      panel(left.x, left.y, left.w, 255, 34),
      panel(left.x, left.y + 295, left.w, 470, 34),
      panel(center.x, center.y, center.w, center.h, 44),
      panel(right.x, right.y, right.w, 235, 34),
      panel(right.x, right.y + 270, right.w, 225, 34),
      panel(right.x, right.y + 530, right.w, 235, 34),
    ],
    buffer
  );

  const cx = center.x + center.w / 2;
  const cy = center.y + 350;
  const ringDiameter = 350;
  const ringRadius = ringDiameter / 2;

  buffer = await painter.createImage(
    [
      {
        source: "circle",
        x: cx - 300,
        y: cy - 300,
        width: 600,
        height: 600,
        opacity: 0.25 + 0.1 * pulse,
        blur: 24,
        blendMode: "screen",
        shape: {
          fill: true,
          gradient: {
            type: "radial",
            colors: [
              { stop: 0, color: `rgba(0,234,255,${0.55 + 0.25 * ripple})` },
              { stop: 0.38, color: "rgba(122,92,255,0.18)" },
              { stop: 1, color: "rgba(0,0,0,0)" },
            ],
          },
        },
      },
      {
        source: "circle",
        x: cx - ringRadius,
        y: cy - ringRadius,
        width: ringDiameter,
        height: ringDiameter,
        opacity: 0.88 + 0.12 * pump,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 2.4 + 0.8 * Math.abs(pump),
          color: `rgba(0,234,255,${0.35 + 0.35 * ripple})`,
          style: "dashed",
        },
      },
      {
        source: "circle",
        x: cx - 125,
        y: cy - 125,
        width: 250,
        height: 250,
        shape: {
          fill: true,
          gradient: {
            type: "radial",
            colors: [
              { stop: 0, color: "rgba(255,255,255,0.96)" },
              { stop: 0.18, color: "rgba(0,234,255,0.9)" },
              { stop: 0.52, color: "rgba(49,81,255,0.42)" },
              { stop: 1, color: "rgba(0,0,0,0.05)" },
            ],
          },
        },
        stroke: {
          width: 2,
          color: "rgba(255,255,255,0.56)",
          borderRadius: "circular",
        },
        shadow: {
          color: `rgba(0,234,255,${0.65 + 0.25 * pulse})`,
          offsetX: 0,
          offsetY: 0,
          blur: 40 + 22 * Math.abs(pump),
          opacity: 0.85 + 0.12 * ripple,
        },
      },
      {
        source: "star",
        x: cx - 46,
        y: cy - 46,
        width: 92,
        height: 92,
        rotation: 12 + t * 360 + 8 * Math.sin(t * Math.PI * 4),
        shape: {
          fill: true,
          gradient: {
            type: "linear",
            colors: [
              { stop: 0, color: "#ffffff" },
              { stop: 1, color: "#9df8ff" },
            ],
          },
          innerRadius: 20,
          outerRadius: 45,
        },
        shadow: {
          color: "rgba(255,255,255,0.7)",
          blur: 20 + 16 * ripple,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.75 + 0.25 * pulse,
        },
      },
    ],
    buffer
  );

  buffer = await painter.createImage(
    [
      ...ringTicks(cx, cy, 214, 72, 3, 14, "rgba(0,234,255,0.72)", 0.42 + 0.22 * ripple, t * Math.PI * 2 * 0.18),
      ...ringTicks(cx, cy, 150, 42, 3, 10, "rgba(255,91,214,0.55)", 0.28 + 0.18 * pulse, -t * Math.PI * 2 * 0.12),
      ...particles(cx, cy, 205, 34, "rgba(0,234,255,0.92)", t * Math.PI * 2 * 0.25),
      ...particles(cx, cy, 118, 18, "rgba(255,255,255,0.82)", -t * Math.PI * 2 * 0.2),
      ...engineSparks(cx, cy, ringRadius - 4, t),
      ...engineSparks(cx, cy, 82, t + 0.37),
      {
        source: "circle",
        x: cx - 205,
        y: cy - 205,
        width: 410,
        height: 410,
        opacity: 0.55 + 0.45 * ripple,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 1.2,
          color: `rgba(255,255,255,${0.12 + 0.14 * pulse})`,
          style: "dotted",
        },
      },
      {
        source: "circle",
        x: cx - 82,
        y: cy - 82,
        width: 164,
        height: 164,
        opacity: 0.7 + 0.3 * pump,
        shape: { fill: false, color: "rgba(0,0,0,0)" },
        stroke: {
          width: 1.5,
          color: `rgba(255,255,255,${0.2 + 0.18 * ripple})`,
          style: "dashed",
        },
      },
    ],
    buffer,
    {
      isGrouped: true,
      groupTransform: {
        rotation: -11 + 5 * Math.sin(t * Math.PI * 2),
        opacity: 0.88 + 0.1 * pulse,
      },
    }
  );

  buffer = await painter.drawPath(
    buffer,
    [
      { type: "moveTo", x: left.x + left.w, y: left.y + 420 },
      {
        type: "bezierCurveTo",
        cp1x: 575,
        cp1y: 510,
        cp2x: 615,
        cp2y: 470,
        x: cx - 176,
        y: cy,
      },
      { type: "moveTo", x: cx + 176, y: cy },
      {
        type: "bezierCurveTo",
        cp1x: 1060,
        cp1y: 470,
        cp2x: 1090,
        cp2y: 330,
        x: right.x,
        y: right.y + 150,
      },
      { type: "moveTo", x: cx + 126, y: cy + 120 },
      {
        type: "bezierCurveTo",
        cp1x: 1094,
        cp1y: 648,
        cp2x: 1082,
        cp2y: 698,
        x: right.x,
        y: right.y + 650,
      },
    ],
    {
      stroke: {
        color: `rgba(0,234,255,${0.32 + 0.22 * pulse})`,
        width: 3.2 + 0.6 * Math.abs(pump),
        style: "dashed",
        dashArray: [14, 12],
        dashOffset: -t * 52,
      },
      shadow: {
        color: "rgba(0,234,255,0.45)",
        blur: 8 + 12 * ripple,
        offsetX: 0,
        offsetY: 0,
      },
      opacity: 0.72 + 0.2 * ripple,
    }
  );

  buffer = await painter.createImage(
    [
      {
        source: "circle",
        x: left.x + left.w - 7,
        y: left.y + 411,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * ripple,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * pulse, offsetX: 0, offsetY: 0 },
      },
      {
        source: "circle",
        x: right.x - 7,
        y: right.y + 150 - 7,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * pulse,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * ripple, offsetX: 0, offsetY: 0 },
      },
      {
        source: "circle",
        x: right.x - 7,
        y: right.y + 643,
        width: 14,
        height: 14,
        opacity: 0.65 + 0.35 * pump,
        shape: { fill: true, color: C.cyan },
        shadow: { color: C.cyan, blur: 18 + 14 * Math.abs(pulse), offsetX: 0, offsetY: 0 },
      },
    ],
    buffer
  );

  buffer = await painter.createImage(
    scanlines(center.x + 28, center.y + 105, center.w - 56, center.h - 155, 16),
    buffer
  );

  const cyanSeries = [42, 56, 61, 70, 78, 88, 94].map((y, i) => ({
    x: i + 1,
    y: Math.max(2, Math.min(98, y + 4 * Math.sin(t * Math.PI * 2 + i * 0.55))),
  }));
  const pinkSeries = [70, 66, 60, 51, 43, 34, 29].map((y, i) => ({
    x: i + 1,
    y: Math.max(2, Math.min(98, y + 3.5 * Math.sin(t * Math.PI * 2 * 1.3 + i * 0.5 + 1))),
  }));

  const chart = await painter.createChart(
    "line",
    [
      {
        label: "Prediction Accuracy",
        color: C.cyan,
        lineWidth: 4,
        smoothness: "bezier",
        marker: { type: "circle", size: 6, show: true, filled: true },
        area: {
          show: true,
          type: "below",
          color: "rgba(0,234,255,0.20)",
          opacity: 0.42 + 0.12 * pulse,
        },
        data: cyanSeries,
      },
      {
        label: "Decision Latency",
        color: C.pink,
        lineWidth: 4,
        smoothness: "bezier",
        marker: { type: "diamond", size: 6, show: true, filled: true },
        area: {
          show: true,
          type: "below",
          color: "rgba(255,91,214,0.12)",
          opacity: 0.32 + 0.1 * ripple,
        },
        data: pinkSeries,
      },
    ],
    {
      dimensions: {
        width: 400,
        height: 200,
        padding: { top: 25, right: 25, bottom: 36, left: 50 },
      },
      appearance: { backgroundColor: "rgba(0,0,0,0)" },
      axes: {
        x: {
          values: [1, 2, 3, 4, 5, 6, 7],
          color: "rgba(255,255,255,0.25)",
          labelColor: "rgba(255,255,255,0.55)",
          tickFontSize: 11,
        },
        y: {
          range: { min: 0, max: 100, step: 25 },
          color: "rgba(255,255,255,0.25)",
          labelColor: "rgba(255,255,255,0.55)",
          tickFontSize: 11,
        },
      },
      grid: {
        show: true,
        color: "rgba(255,255,255,0.075)",
        width: 1,
      },
      legend: { show: false },
    }
  );

  buffer = await painter.createImage(
    {
      source: chart,
      x: left.x - 20,
      y: left.y + 555,
      width: 450,
      height: 225,
      opacity: 0.94 + 0.06 * pulse,
    },
    buffer
  );

  const barX = right.x + 34;
  const barW = right.w - 68;
  const bars = [
    { y: right.y + 371, label: "signal integrity", val: 0.92, color: C.cyan },
    { y: right.y + 421, label: "model confidence", val: 0.86, color: C.pink },
    { y: right.y + 471, label: "workflow sync", val: 0.74, color: C.violet },
  ];
  const barPulses = bars.map((_, bi) => 0.94 + 0.06 * Math.sin(t * Math.PI * 2 + bi * 1.7));

  for (let bi = 0; bi < bars.length; bi++) {
    const b = bars[bi];
    const bPulse = barPulses[bi];
    const fillW = Math.round(barW * b.val * bPulse);
    buffer = await painter.createImage(
      [
        {
          source: "rectangle",
          x: barX,
          y: b.y,
          width: barW,
          height: 10,
          borderRadius: 10,
          shape: { fill: true, color: "rgba(255,255,255,0.10)" },
        },
        {
          source: "rectangle",
          x: barX,
          y: b.y,
          width: fillW,
          height: 10,
          borderRadius: 10,
          opacity: 0.88 + 0.12 * pulse,
          shape: { fill: true, color: b.color },
          shadow: {
            color: rgba(b.color, 0.45 + 0.35 * ripple),
            blur: 14 + 10 * Math.abs(pump),
            offsetX: 0,
            offsetY: 0,
          },
        },
      ],
      buffer
    );
  }

  const gridX = left.x + 30;
  const gridY = left.y + 360;
  const cellW = 174;
  const cellH = 76;
  const gap = 18;
  const cells = [
    ["VISION", "active", C.cyan],
    ["ROUTING", "stable", C.violet],
    ["RISK", "low", C.pink],
    ["SYNC", "99.2%", C.cyan],
  ];

  for (let i = 0; i < cells.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = gridX + col * (cellW + gap);
    const y = gridY + row * (cellH + gap);

    buffer = await painter.createImage(
      [
        {
          source: "rectangle",
          x,
          y,
          width: cellW,
          height: cellH,
          borderRadius: 20,
          shape: { fill: true, color: "rgba(255,255,255,0.045)" },
          stroke: {
            width: 1,
            color: "rgba(255,255,255,0.13)",
            borderRadius: 20,
          },
        },
        {
          source: "circle",
          x: x + 17,
          y: y + 25,
          width: 14,
          height: 14,
          opacity: 0.72 + 0.28 * Math.sin(t * Math.PI * 2 * 1.4 + i * 1.3),
          shape: { fill: true, color: cells[i][2] },
          shadow: {
            color: rgba(cells[i][2], 0.8),
            blur: 12 + 8 * ripple,
            offsetX: 0,
            offsetY: 0,
            opacity: 0.7 + 0.3 * pulse,
          },
        },
      ],
      buffer
    );
  }

  // buffer = await painter.drawPath(
  //   buffer,
  //   waveformPath(right.x + 34, right.y + 760, right.w - 68, 58),
  //   {
  //     stroke: {
  //       color: "rgba(0,234,255,0.55)",
  //       width: 2.4,
  //     },
  //     opacity: 0.85,
  //   }
  // );

  buffer = await painter.createText(
    [
      {
        text: "AURORA CORE",
        x: left.x + 32,
        y: left.y + 62,
        font: { size: 33, family: "Arial" },
        bold: true,
        letterSpacing: 5,
        color: "rgba(255,255,255,0.72)",
      },
      {
        text: "AI Operational\nCommand Interface",
        x: left.x + 32,
        y: left.y + 138,
        font: { size: 40, family: "Arial" },
        bold: true,
        lineHeight: 1.02,
        gradient: {
          type: "linear",
          colors: [
            { stop: 0, color: "#ffffff" },
            { stop: 0.55, color: "#bdfaff" },
            { stop: 1, color: "#ff83df" },
          ],
        },
        shadow: {
          color: "rgba(0,234,255,0.32)",
          blur: 20,
          offsetX: 0,
          offsetY: 0,
          opacity: 0.8,
        },
      },

      ...cells.flatMap((c, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = gridX + col * (cellW + gap);
        const y = gridY + row * (cellH + gap);
        return [
          {
            text: c[0],
            x: x + 42,
            y: y + 31,
            font: { size: 15, family: "Arial" },
            bold: true,
            color: "rgba(255,255,255,0.78)",
          },
          {
            text: c[1],
            x: x + 42,
            y: y + 55,
            font: { size: 16, family: "Arial" },
            color: "rgba(255,255,255,0.48)",
          },
        ];
      }),

      {
        text: "NEURAL DECISION ENGINE",
        x: cx + 2,
        y: center.y + 75,
        font: { size: 28, family: "Arial" },
        bold: true,
        letterSpacing: 4,
        color: "rgba(0,234,255,0.95)",
        textAlign: TEXT_ALIGN_CENTER,
        opacity: 0.92 + 0.08 * pulse,
        glow: {
          color: "rgba(0,234,255,0.65)",
          intensity: 12 + 8 * ripple,
          opacity: 0.55 + 0.35 * pulse,
        },
      },
      {
        text: "AURORA",
        x: cx + 5,
        y: cy + 217,
        font: { size: 64, family: "Arial" },
        bold: true,
        textAlign: TEXT_ALIGN_CENTER,
        gradient: {
          type: "linear",
          colors: [
            { stop: 0, color: "#ffffff" },
            { stop: 1, color: "#8ff8ff" },
          ],
        },
        shadow: {
          color: "rgba(0,234,255,0.45)",
          blur: 26,
          offsetX: 0,
          offsetY: 0,
        },
      },
      {
        text: "live intelligence layer",
        x: cx + 5,
        y: cy + 262,
        font: { size: 22, family: "Arial" },
        textAlign: TEXT_ALIGN_CENTER,
        color: "rgba(255,255,255,0.52)",
      },
      {
        text: "REAL TIME OPERATIONS",
        x: cx,
        y: cy - ringRadius - 10,
        font: { size: 23, family: "Arial" },
        bold: true,
        letterSpacing: 3,
        color: "rgba(255,255,255,0.75)",
        textAlign: TEXT_ALIGN_CENTER,
        textBaseline: TEXT_BASELINE_MIDDLE,
        textOnCurve: {
          sweepAngle: 118,
          radius: ringRadius,
          up: true,
          layoutMode: "override",
          startAngleDeg: 8 * Math.sin(t * Math.PI * 2),
          baselineOffset: 2 + 4 * pulse,
        },
        glow: {
          color: "rgba(0,234,255,0.4)",
          intensity: 8 + 6 * ripple,
          opacity: 0.45 + 0.45 * pulse,
        },
      },
      {
        text: "CORE TEMP  41.8°C      LATENCY  12ms      LOAD  68%",
        x: cx,
        y: center.y + center.h - 70,
        font: { size: 14, family: "Arial" },
        bold: true,
        letterSpacing: 1.6,
        color: "rgba(255,255,255,0.45)",
        textAlign: TEXT_ALIGN_CENTER,
      },
      {
        text: "VECTOR SYNC ONLINE",
        x: cx,
        y: center.y + center.h - 42,
        font: { size: 15, family: "Arial" },
        bold: true,
        letterSpacing: 2.4,
        color: `rgba(0,234,255,${0.5 + 0.35 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 2))})`,
        textAlign: TEXT_ALIGN_CENTER,
        glow: {
          color: "rgba(0,234,255,0.55)",
          intensity: 6 + 8 * ripple,
          opacity: 0.4 + 0.4 * pulse,
        },
      },

      {
        text: "SYSTEM HEALTH",
        x: right.x + 34,
        y: right.y + 52,
        font: { size: 22, family: "Arial" },
        bold: true,
        letterSpacing: 3,
        color: "rgba(0,234,255,0.95)",
      },
      {
        text: "98.7%",
        x: right.x + 34,
        y: right.y + 150,
        font: { size: 82, family: "Arial" },
        bold: true,
        gradient: {
          type: "linear",
          colors: [
            { stop: 0, color: C.cyan },
            { stop: 1, color: "#ffffff" },
          ],
        },
        shadow: {
          color: "rgba(0,234,255,0.44)",
          blur: 28,
          offsetX: 0,
          offsetY: 0,
        },
      },
      {
        text: "deployment confidence",
        x: right.x + 38,
        y: right.y + 198,
        font: { size: 19, family: "Arial" },
        color: "rgba(255,255,255,0.52)",
      },

      {
        text: "CORE TELEMETRY",
        x: right.x + 34,
        y: right.y + 323,
        font: { size: 21, family: "Arial" },
        bold: true,
        letterSpacing: 3,
        color: "rgba(255,255,255,0.78)",
      },

      ...bars.flatMap((b, bi) => [
        {
          text: b.label.toUpperCase(),
          x: barX,
          y: b.y - 12,
          font: { size: 13, family: "Arial" },
          bold: true,
          letterSpacing: 1.4,
          color: "rgba(255,255,255,0.52)",
        },
        {
          text: `${Math.round(b.val * barPulses[bi] * 100)}%`,
          x: barX + barW - 2,
          y: b.y - 12,
          font: { size: 14, family: "Arial" },
          bold: true,
          color: "rgba(255,255,255,0.72)",
          textAlign: TEXT_ALIGN_RIGHT,
        },
      ]),

      {
        text: "OUTPUT STREAM",
        x: right.x + 34,
        y: right.y + 585,
        font: { size: 20, family: "Arial" },
        bold: true,
        letterSpacing: 3,
        color: "rgba(255,255,255,0.78)",
      },
      {
        text: "• predictive routing\n• approval intelligence\n• anomaly detection\n• executive signal layer",
        x: right.x + 34,
        y: right.y + 636,
        font: { size: 20, family: "Arial" },
        color: "rgba(255,255,255,0.55)",
        lineHeight: 1.55,
      },

      {
        text: "SIGNAL TREND / 7-DAY MODEL",
        x: left.x + 75,
        y: left.y + 575,
        font: { size: 16, family: "Arial" },
        bold: true,
        letterSpacing: 2,
        color: "rgba(255,255,255,0.72)",
      },
    ] as any,
    buffer
  );

  return buffer;
}

async function main() {
  const painter = new ApexPainter({ type: "buffer" });
  const useScene = process.env.USE_SCENE === "1";
  const renderFrame = useScene ? renderAuroraFrameWithScene : renderAuroraFrameBufferChain;
  const outDir = path.join(process.cwd(), "apexify-output");
  fs.mkdirSync(outDir, { recursive: true });

  console.log(
    `[aurora] raster pipeline: ${useScene ? "renderScene (single pass)" : "buffer chain (createCanvas → createImage → …)"} — set USE_SCENE=1 for scene`
  );

  const pngPath = path.join(outDir, "aurora-core-command-interface-v2.png");
  const pngT0 = performance.now();
  fs.writeFileSync(pngPath, await renderFrame(painter, 0));
  console.log(
    `[aurora] PNG done in ${((performance.now() - pngT0) / 1000).toFixed(2)}s → ${pngPath}`
  );

  const FRAME_COUNT = 36;
  const FRAME_MS = 42;
  const gifFrames: GIFInputFrame[] = [];

  console.log(
    `[aurora] GIF: rendering ${FRAME_COUNT} full frames (${W}×${H}) — each frame repeats the whole dashboard pipeline (charts, text, images, paths); this is usually the slow part.`
  );
  const renderPhaseT0 = performance.now();

  for (let i = 0; i < FRAME_COUNT; i++) {
    const t = i / FRAME_COUNT;
    const frameT0 = performance.now();
    gifFrames.push({
      buffer: await renderFrame(painter, t),
      duration: FRAME_MS,
    });
    const frameMs = performance.now() - frameT0;
    const elapsed = performance.now() - renderPhaseT0;
    const idx = i + 1;
    const avgMs = elapsed / idx;
    const etaSec = ((FRAME_COUNT - idx) * avgMs) / 1000;

    if (frameMs > 30_000) {
      console.warn(
        `[aurora] GIF frame ${idx} took ${(frameMs / 1000).toFixed(1)}s — unusually slow; check this frame’s pipeline.`
      );
    }

    if (idx === 1 || idx === FRAME_COUNT || idx % 6 === 0) {
      console.log(
        `[aurora] GIF frame ${idx}/${FRAME_COUNT} — ${frameMs.toFixed(0)}ms this frame, ${(elapsed / 1000).toFixed(2)}s total, avg ${avgMs.toFixed(0)}ms/frame, ~${etaSec.toFixed(0)}s ETA`
      );
    } else {
      console.log(`[aurora] GIF frame ${idx}/${FRAME_COUNT} — ${frameMs.toFixed(0)}ms`);
    }
  }

  console.log(
    `[aurora] GIF: all frames rasterized in ${((performance.now() - renderPhaseT0) / 1000).toFixed(2)}s — starting encoder (gifencoder / quantize + write stream)…`
  );
  const encodeT0 = performance.now();
  const gifPath = path.join(outDir, "aurora-core-command-interface-live.gif");
  await painter.createGIF(gifFrames, {
    outputFormat: "file",
    outputFile: gifPath,
    width: W,
    height: H,
    repeat: 0,
    quality: 12,
    delay: FRAME_MS,
    skipResizeWhenDimensionsMatch: true,
  });

  console.log(
    `[aurora] GIF encode finished in ${((performance.now() - encodeT0) / 1000).toFixed(2)}s`
  );
  console.log(`[aurora] Created: ${gifPath} (${FRAME_COUNT} frames)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});