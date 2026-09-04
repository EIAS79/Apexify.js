'use strict';

const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

function solid(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

async function measure(name, fn, iterations = 1) {
  if (global.gc) global.gc();
  const rssBefore = process.memoryUsage().rss;
  const started = performance.now();
  let last;
  for (let i = 0; i < iterations; i++) last = await fn();
  const elapsedMs = performance.now() - started;
  const rssDelta = process.memoryUsage().rss - rssBefore;
  assert.ok(elapsedMs < 10_000, `${name} exceeded 10s sanity threshold: ${elapsedMs}`);
  return { name, iterations, elapsedMs: Number(elapsedMs.toFixed(3)), perIterationMs: Number((elapsedMs / iterations).toFixed(3)), rssDelta, outputBytes: Buffer.isBuffer(last) ? last.length : undefined };
}

async function main() {
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
  const painter = new api.ApexPainter();
  const tile = solid(16, 16, '#6366f1');
  painter.assets.loadImage('tile', tile);

  const sceneLayers = (count) => Array.from({ length: count }, (_, i) => ({
    type: 'imageBuffer', buffer: tile, x: (i * 7) % 120, y: (i * 11) % 70, width: 16, height: 16, globalAlpha: 0.8,
  }));

  const results = [];
  results.push(await measure('scene-10-layers', () => painter.renderScene({ width: 160, height: 90, layers: sceneLayers(10) }, { resolveAssetRefs: false }), 3));
  results.push(await measure('scene-50-layers', () => painter.renderScene({ width: 160, height: 90, layers: sceneLayers(50) }, { resolveAssetRefs: false }), 3));

  const nested = {
    width: 160,
    height: 90,
    layers: [{ type: 'surface', placement: { x: 10, y: 10, width: 120, height: 60 }, layers: [
      { type: 'surface', placement: { x: 8, y: 8, width: 90, height: 40, opacity: 0.9 }, layers: [
        { type: 'surface', placement: { x: 5, y: 5, width: 60, height: 25 }, layers: sceneLayers(10) },
      ] },
    ] }],
  };
  results.push(await measure('nested-surfaces-direct-composite', () => painter.renderScene(nested, { resolveAssetRefs: false }), 3));

  api.clearDecodedImageCache();
  const repeatedAssetScene = {
    width: 180,
    height: 50,
    layers: Array.from({ length: 10 }, (_, i) => ({ type: 'image', images: { source: '$tile', x: i * 18, y: 0, width: 16, height: 16 } })),
  };
  results.push(await measure('repeated-buffer-asset', () => painter.renderScene(repeatedAssetScene), 3));
  const cacheStats = api.getDecodedImageCacheStats();
  assert.ok(cacheStats.hits >= 9, `same asset should be reused from decode cache: ${JSON.stringify(cacheStats)}`);

  const template = painter.createTemplate({
    width: 160,
    height: 90,
    layers: [
      { type: 'image', source: 'rectangle', x: '{{x}}', y: 5, width: 40, height: 20, shape: { fill: true, color: '{{color}}' } },
      { type: 'text', text: '{{label}}', x: 10, y: 50, fontSize: 16, color: '#ffffff' },
    ],
  });
  results.push(await measure('template-resolve-repeat', () => template.toRenderInput({ x: 0, color: '#22c55e', label: 'Apexify' }), 25));
  results.push(await measure('template-render-repeat', () => template.render({ x: 0, color: '#22c55e', label: 'Apexify' }), 5));

  const componentLayers = [];
  for (let i = 0; i < 6; i++) componentLayers.push(...painter.components.badge.toLayers({ text: `B${i}`, x: i * 25, y: 4 }));
  componentLayers.push(...painter.components.progressBar.toLayers({ x: 4, y: 45, width: 150, height: 20, value: 62 }));
  results.push(await measure('component-heavy-scene', () => painter.renderScene({ width: 180, height: 80, layers: componentLayers }, { resolveAssetRefs: false }), 3));

  const baseline = await measure('plugin-baseline-render', () => painter.renderScene({ width: 80, height: 40, layers: [] }, { resolveAssetRefs: false }), 10);
  await painter.use({ name: 'benchmark-noop', install(host) { host.plugins.use('benchmarkApi', { enabled: true }); } });
  const pluginEnabled = await measure('plugin-enabled-render', () => painter.renderScene({ width: 80, height: 40, layers: [] }, { resolveAssetRefs: false }), 10);
  results.push(baseline, pluginEnabled);

  console.log(JSON.stringify({ phase: 6, cacheStats, results }, null, 2));
  api.resetApexifyRuntimeConfig();
  api.clearDecodedImageCache();
}

main().catch((error) => {
  try { api.resetApexifyRuntimeConfig(); } catch {}
  try { api.clearDecodedImageCache(); } catch {}
  console.error(error);
  process.exitCode = 1;
});
