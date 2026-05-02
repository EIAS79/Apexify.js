/**
 * Renders every built-in `patternBg.type` and a few other {@link ChartAppearanceExtended}
 * background paths, writes PNGs under `test-output/canvas-bg-patterns/`, and sanity-checks output.
 *
 * Run: npm run verify-canvas-bg-patterns
 */

import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  paintChartCanvasBackground,
  type ChartAppearanceExtended,
} from '../lib/Canvas/utils/Charts/chartBackground';
import type { PatternOptions } from '../lib/Canvas/utils/types';

const W = 360;
const H = 220;
const OUT = join(process.cwd(), 'test-output', 'canvas-bg-patterns');

/** Must stay in sync with {@link PatternOptions} `type` and `EnhancedPatternRenderer` switch. */
const PATTERN_TYPES: PatternOptions['type'][] = [
  'grid',
  'dots',
  'diagonal',
  'stripes',
  'waves',
  'crosses',
  'hexagons',
  'checkerboard',
  'diamonds',
  'triangles',
  'stars',
  'polka',
  'custom',
];

const commonPattern: Pick<PatternOptions, 'size' | 'spacing' | 'opacity' | 'color' | 'secondaryColor'> = {
  size: 14,
  spacing: 8,
  opacity: 0.45,
  color: '#94a3b8',
  secondaryColor: '#64748b',
};

async function renderToFile(
  name: string,
  appearance: ChartAppearanceExtended
): Promise<Buffer> {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  await paintChartCanvasBackground(ctx, canvas, W, H, appearance);
  const buf = canvas.toBuffer('image/png');
  writeFileSync(join(OUT, `${name}.png`), buf);
  return buf;
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const seen = new Set<string>();

  await renderToFile('base-color', {
    backgroundColor: '#0f172a',
  });

  await renderToFile('base-gradient', {
    backgroundGradient: {
      type: 'linear',
      startX: 0,
      startY: 0,
      endX: W,
      endY: H,
      colors: [
        { stop: 0, color: '#0f172a' },
        { stop: 0.5, color: '#1e293b' },
        { stop: 1, color: '#020617' },
      ],
    },
  });

  const colorNoise = await renderToFile('base-color-noise', {
    backgroundColor: '#0f172a',
    noiseBg: { intensity: 0.08 },
  });

  const tile = createCanvas(20, 20);
  const tctx = tile.getContext('2d');
  tctx.fillStyle = '#334155';
  tctx.fillRect(0, 0, 20, 20);
  tctx.fillStyle = '#e2e8f0';
  tctx.fillRect(2, 2, 8, 8);
  tctx.fillRect(10, 10, 8, 8);
  const tilePath = join(OUT, '_custom-tile.png');
  writeFileSync(tilePath, tile.toBuffer('image/png'));

  for (const type of PATTERN_TYPES) {
    const pattern: PatternOptions =
      type === 'custom'
        ? {
            type: 'custom',
            customPatternImage: tilePath,
            repeat: 'repeat',
            scale: 1,
            opacity: 0.5,
            blendMode: 'overlay',
          }
        : {
            type,
            ...commonPattern,
            blendMode: 'overlay',
          };

    const buf = await renderToFile(`pattern-${type}`, {
      backgroundColor: '#0f172a',
      patternBg: pattern,
    });
    assert(buf.length > 400, `pattern-${type} buffer too small`);
    const sig = buf.subarray(0, Math.min(200, buf.length)).toString('hex');
    assert(!seen.has(sig) || type === 'custom', `duplicate render signature for pattern-${type}`);
    seen.add(sig);
  }

  await renderToFile('pattern-stripe-rotate', {
    backgroundColor: '#0f172a',
    patternBg: {
      type: 'stripes',
      ...commonPattern,
      rotation: 25,
      blendMode: 'soft-light',
    },
  });

  await renderToFile('layer-preset-dots', {
    backgroundColor: '#020617',
    bgLayers: [
      {
        type: 'presetPattern',
        pattern: {
          type: 'dots',
          color: '#cbd5e1',
          size: 10,
          spacing: 14,
          opacity: 0.35,
        },
        opacity: 1,
        blendMode: 'overlay',
      },
    ],
  });

  await renderToFile('layer-noise', {
    backgroundColor: '#0f172a',
    bgLayers: [{ type: 'noise', intensity: 0.06, blendMode: 'overlay' }],
  });

  await renderToFile('stack-gradient-pattern-noise', {
    backgroundGradient: {
      type: 'linear',
      startX: 0,
      startY: 0,
      endX: W,
      endY: H,
      colors: [
        { stop: 0, color: '#1e1b4b' },
        { stop: 1, color: '#312e81' },
      ],
    },
    patternBg: {
      type: 'grid',
      ...commonPattern,
      blendMode: 'overlay',
    },
    noiseBg: { intensity: 0.04 },
  });

  assert(!colorNoise.equals(Buffer.alloc(colorNoise.length)), 'noise buffer empty');

  console.log(`OK: canvas background samples written to ${OUT}`);
  console.log(`   Built-in pattern types: ${PATTERN_TYPES.join(', ')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
