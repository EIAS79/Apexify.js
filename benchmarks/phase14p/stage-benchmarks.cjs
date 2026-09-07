'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { buffer: consumeBuffer } = require('node:stream/consumers');
const { createCanvas } = require('@napi-rs/canvas');
const { GifEncoder } = require('@skyra/gifenc');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

function envInt(name, fallback, min = 1) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) throw new Error(`${name} must be an integer >= ${min}.`);
  return value;
}

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const outputPath = path.resolve(String(args.output || path.join(root, 'artifacts', 'phase14p', 'stage-benchmarks.json')));
const fixtureRoot = path.join(root, 'benchmarks', '.phase14p-source', 'lib-next');
const fontFamily = process.env.APEXIFY_BENCH_FONT_FAMILY || 'DejaVu Sans';
const cheapWarmups = envInt('APEXIFY_STAGE_CHEAP_WARMUPS', 10);
const cheapSamples = envInt('APEXIFY_STAGE_CHEAP_SAMPLES', 30);
const expensiveWarmups = envInt('APEXIFY_STAGE_EXPENSIVE_WARMUPS', 3);
const expensiveSamples = envInt('APEXIFY_STAGE_EXPENSIVE_SAMPLES', 10);

if (!fs.existsSync(fixtureRoot)) {
  throw new Error('Phase 14-P internal fixture is missing. Run node scripts/build-phase14p-benchmark-fixture.mjs first.');
}

const { ApexPainter } = require(path.join(root, 'dist', 'cjs', 'index.cjs'));
const { validateCanvasConfig } = require(path.join(fixtureRoot, 'canvas', 'canvas-validation.js'));
const { validateTextInput } = require(path.join(fixtureRoot, 'text', 'text-validation.js'));
const { validateChartRequest } = require(path.join(fixtureRoot, 'chart', 'chart-validation.js'));
const { validateSceneRenderInput } = require(path.join(fixtureRoot, 'scene', 'scene-validation.js'));
const {
  inspectImageSource,
  decodeImageSource,
} = require(path.join(fixtureRoot, 'image', 'image-source-validation.js'));
const {
  loadImageCached,
  clearDecodedImageCache,
  fitInto,
} = require(path.join(fixtureRoot, 'image', 'image-properties.js'));
const { applyVignette } = require(path.join(fixtureRoot, 'image', 'image-effects.js'));
const {
  getDefaultApexifyRuntimeConfig,
  resolveApexifyRuntimeConfig,
} = require(path.join(fixtureRoot, 'runtime', 'config.js'));
const {
  validateGIFOptions,
  validateGIFInputFrames,
} = require(path.join(fixtureRoot, 'gif', 'gif-validation.js'));
const {
  validateSynthSoundOptions,
  validateSynthSequenceOptions,
} = require(path.join(fixtureRoot, 'audio-synth', 'audio-validation.js'));
const {
  renderValidatedSound,
  mixFloatBuffers,
  applyLimiter,
} = require(path.join(fixtureRoot, 'audio-synth', 'engine.js'));
const { encodeValidatedWavPcm16 } = require(path.join(fixtureRoot, 'audio-synth', 'wav-encode.js'));

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  const weight = index - lo;
  return sorted[lo] * (1 - weight) + sorted[hi] * weight;
}

function stats(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  const sd = Math.sqrt(variance);
  const round = (value) => Number(value.toFixed(4));
  return {
    samples: values.length,
    mean: round(mean),
    median: round(percentile(sorted, 0.5)),
    p50: round(percentile(sorted, 0.5)),
    p90: round(percentile(sorted, 0.9)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    standardDeviation: round(sd),
    coefficientOfVariation: mean === 0 ? 0 : round(sd / mean),
  };
}

function outputBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value && Buffer.isBuffer(value.buffer)) return value.buffer;
  return null;
}

function verifyPng(value, label) {
  const buffer = outputBuffer(value);
  if (!buffer || buffer.length < 8 || !buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    throw new Error(`${label} did not produce PNG output.`);
  }
}

function verifyGif(value, label) {
  const buffer = outputBuffer(value);
  if (!buffer || buffer.length < 6 || !buffer.toString('ascii', 0, 6).startsWith('GIF8')) {
    throw new Error(`${label} did not produce GIF output.`);
  }
}

async function benchmark(name, operation, options = {}) {
  const expensive = options.expensive === true;
  const warmups = options.warmups ?? (expensive ? expensiveWarmups : cheapWarmups);
  const samples = options.samples ?? (expensive ? expensiveSamples : cheapSamples);
  for (let i = 0; i < warmups; i += 1) {
    const value = await operation();
    if (options.verify) await options.verify(value, name);
  }
  const wall = [];
  let representative;
  for (let i = 0; i < samples; i += 1) {
    if (global.gc) global.gc();
    const started = performance.now();
    const value = await operation();
    wall.push(performance.now() - started);
    representative ??= value;
    if (options.verify) await options.verify(value, name);
  }
  return {
    name,
    warmups,
    timing: stats(wall),
    representativeBytes: outputBuffer(representative)?.length ?? null,
  };
}

function solidPng(width, height, color) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

const painter = new ApexPainter('png');
const baseFixture = solidPng(1200, 630, '#101820');
const imageFixture = solidPng(320, 180, '#3a86ff');
const gifFixture = solidPng(320, 180, '#14213d');
const textProps = {
  text: 'Apexify.js normalized Phase 14-P baseline',
  x: 72,
  y: 160,
  font: { size: 56, family: fontFamily },
  fill: { color: '#ffffff' },
};
const chartData = Array.from({ length: 8 }, (_, index) => ({
  label: `S${index + 1}`,
  value: [14, 38, 29, 51, 44, 63, 57, 72][index],
  xStart: index,
  xEnd: index + 1,
}));
const scene = {
  width: 1200,
  height: 630,
  background: { colorBg: '#0b132b' },
  layers: [
    { type: 'image', images: { source: 'rectangle', x: 80, y: 80, width: 1040, height: 470, shape: { fill: true, color: '#1c2541' }, borderRadius: 24 } },
    { type: 'text', texts: { text: 'Medium scene', x: 140, y: 180, font: { size: 54, family: fontFamily }, fill: { color: '#ffffff' } } },
    { type: 'text', texts: { text: 'Apexify.js normalized baseline', x: 140, y: 260, font: { size: 30, family: fontFamily }, fill: { color: '#d8e2dc' } } },
    { type: 'imageBuffer', buffer: imageFixture, x: 140, y: 330, width: 320, height: 180, globalAlpha: 0.95 },
    { type: 'surface', placement: { x: 700, y: 330, width: 300, height: 160 }, background: { colorBg: '#5bc0be' }, layers: [
      { type: 'text', texts: { text: 'nested surface', x: 24, y: 80, font: { size: 28, family: fontFamily }, fill: { color: '#0b132b' } } },
    ] },
  ],
};
const gifFrames = Array.from({ length: 30 }, () => ({ duration: 33, buffer: gifFixture }));
const gifOptions = { outputFormat: 'buffer', width: 320, height: 180, repeat: 0, quality: 10 };
const audioOptions = {
  duration: 10,
  sampleRate: 44100,
  channels: 2,
  masterGain: 0.5,
  layers: [
    { waveform: 'sine', frequency: 220, frequencyEnd: 440, duration: 10, gain: 0.35 },
    { waveform: 'triangle', frequency: 110, duration: 10, gain: 0.15, pan: -0.25 },
  ],
};
const sequenceOptions = {
  sampleRate: 44100,
  channels: 2,
  events: Array.from({ length: 8 }, (_, index) => ({
    at: index * 0.05,
    options: { duration: 0.15, sampleRate: 44100, channels: 2, layers: [{ waveform: 'sine', frequency: 220 + index * 20, duration: 0.15, gain: 0.1 }] },
  })),
};

function chartLayoutWork() {
  let min = Infinity;
  let max = -Infinity;
  for (const item of chartData) { min = Math.min(min, item.value); max = Math.max(max, item.value); }
  const span = Math.max(1, max - min);
  const ticks = Array.from({ length: 6 }, (_, i) => min + span * (i / 5));
  const canvas = createCanvas(640, 360);
  const ctx = canvas.getContext('2d');
  ctx.font = `14px ${fontFamily}`;
  const labelWidths = chartData.map((item) => ctx.measureText(item.label).width);
  const tickWidths = ticks.map((tick) => ctx.measureText(tick.toFixed(0)).width);
  const padding = 40 + Math.max(...tickWidths);
  const plotWidth = 640 - padding - 24;
  const plotHeight = 360 - 64;
  const barWidth = plotWidth / chartData.length;
  return chartData.map((item, index) => ({
    x: padding + index * barWidth,
    y: 24 + plotHeight * (1 - ((item.value - min) / span)),
    width: Math.max(1, barWidth * 0.72),
    height: plotHeight * ((item.value - min) / span),
    labelWidth: labelWidths[index],
  }));
}

async function gifEncoderStagesOnce() {
  const canvas = createCanvas(320, 180);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#14213d';
  ctx.fillRect(0, 0, 320, 180);
  const encoder = new GifEncoder(320, 180);
  const stream = encoder.createReadStream();
  const outputPromise = consumeBuffer(stream);
  encoder.setRepeat(0).setQuality(10).start();
  encoder.setDelay(33).setDispose(2).setTransparent(null);
  const addStarted = performance.now();
  encoder.addFrame(ctx);
  const addFrameMs = performance.now() - addStarted;
  const finalizeStarted = performance.now();
  encoder.finish();
  const output = await outputPromise;
  const finalizeMs = performance.now() - finalizeStarted;
  verifyGif(output, 'gif direct encoder');
  return { addFrameMs, finalizeMs, bytes: output.length };
}

async function collectCustomStage(name, operation, fields, expensive = false) {
  const warmups = expensive ? expensiveWarmups : cheapWarmups;
  const samples = expensive ? expensiveSamples : cheapSamples;
  for (let i = 0; i < warmups; i += 1) await operation();
  const rows = [];
  for (let i = 0; i < samples; i += 1) rows.push(await operation());
  return {
    name,
    warmups,
    samples,
    stages: Object.fromEntries(fields.map((field) => [field, stats(rows.map((row) => row[field]))])),
  };
}

async function main() {
  clearDecodedImageCache();
  await loadImageCached(imageFixture);

  const budgets = Object.create(null);
  budgets['bench:canvas:create'] = await benchmark('bench:canvas:create', () => painter.createCanvas({ width: 1200, height: 630, colorBg: '#101820' }), { verify: verifyPng });

  const textMeasureCanvas = createCanvas(1200, 630);
  const textMeasureCtx = textMeasureCanvas.getContext('2d');
  textMeasureCtx.font = `56px ${fontFamily}`;
  budgets['bench:text:measure'] = await benchmark('bench:text:measure', () => {
    let width = 0;
    for (let i = 0; i < 100; i += 1) width += textMeasureCtx.measureText(`${textProps.text} ${i % 8}`).width;
    return width;
  });
  budgets['bench:text:measure'].iterationsPerSample = 100;
  budgets['bench:text:render'] = await benchmark('bench:text:render', () => painter.createText(textProps, baseFixture), { verify: verifyPng });
  budgets['bench:image:decode'] = await benchmark('bench:image:decode', () => decodeImageSource(imageFixture, { label: 'phase14p stage image decode' }));
  budgets['bench:image:compose'] = await benchmark('bench:image:compose', () => painter.createImage({ source: imageFixture, x: 440, y: 225, width: 320, height: 180, borderRadius: 18 }, baseFixture), { verify: verifyPng });
  budgets['bench:chart:layout'] = await benchmark('bench:chart:layout', chartLayoutWork);
  budgets['bench:chart:render'] = await benchmark('bench:chart:render', () => painter.createChart('bar', chartData), { verify: verifyPng });
  budgets['bench:scene:render'] = await benchmark('bench:scene:render', () => painter.renderScene(scene), { verify: verifyPng });
  budgets['bench:validation'] = await benchmark('bench:validation', () => {
    validateCanvasConfig({ width: 1200, height: 630, colorBg: '#101820' });
    validateTextInput(textProps);
    validateChartRequest('bar', chartData, undefined);
    validateSceneRenderInput(scene);
    validateGIFOptions(gifOptions, gifFrames.length);
    validateGIFInputFrames(gifFrames);
    validateSynthSoundOptions(audioOptions);
    return true;
  });
  budgets['bench:runtime-config'] = await benchmark('bench:runtime-config', () => resolveApexifyRuntimeConfig({
    limits: { maxBatchConcurrency: 4 },
    cache: { enabled: true, maxEntries: 128 },
  }));
  const encodeCanvas = createCanvas(1200, 630);
  const encodeCtx = encodeCanvas.getContext('2d');
  encodeCtx.fillStyle = '#101820';
  encodeCtx.fillRect(0, 0, 1200, 630);
  budgets['bench:encode-png'] = await benchmark('bench:encode-png', () => encodeCanvas.toBuffer('image/png'), { verify: verifyPng });

  const domainStages = {};

  domainStages.canvas = {
    validation: await benchmark('canvas:validation', () => validateCanvasConfig({ width: 1200, height: 630, colorBg: '#101820' })),
    allocation: await benchmark('canvas:allocation', () => createCanvas(1200, 630)),
    contextAcquisition: await benchmark('canvas:context-acquisition', () => createCanvas(1200, 630).getContext('2d')),
    backgroundInitialization: await benchmark('canvas:background-initialization', () => {
      const cv = createCanvas(1200, 630); const ctx = cv.getContext('2d'); ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, 1200, 630); return cv;
    }),
    simpleDrawing: await benchmark('canvas:simple-drawing', () => {
      const cv = createCanvas(1200, 630); const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff';
      for (let i = 0; i < 32; i += 1) ctx.fillRect(20 + i * 30, 20 + (i % 4) * 40, 20, 20);
      return cv;
    }),
    pngEncode: budgets['bench:encode-png'],
  };

  domainStages.text = {
    validation: await benchmark('text:validation', () => validateTextInput(textProps)),
    fontResolution: await benchmark('text:font-resolution', () => { textMeasureCtx.font = `56px ${fontFamily}`; return textMeasureCtx.font; }),
    fontRegistrationCacheLookup: await benchmark('text:font-registration-cache-lookup', () => textMeasureCtx.measureText('M').width),
    optionNormalization: await benchmark('text:option-normalization', () => ({ ...textProps, font: { ...textProps.font }, fill: { ...textProps.fill } })),
    measurement: budgets['bench:text:measure'],
    lineWrappingLayout: await benchmark('text:line-wrapping-layout', () => {
      const words = `${textProps.text} repeated words for deterministic wrapping`.split(/\s+/);
      const lines = []; let line = '';
      for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (textMeasureCtx.measureText(candidate).width > 420 && line) { lines.push(line); line = word; } else line = candidate; }
      if (line) lines.push(line); return lines;
    }),
    styleSetup: await benchmark('text:style-setup', () => { textMeasureCtx.fillStyle = '#fff'; textMeasureCtx.globalAlpha = 1; textMeasureCtx.shadowBlur = 0; return true; }),
    drawText: await benchmark('text:draw', () => { const cv = createCanvas(1200, 630); const ctx = cv.getContext('2d'); ctx.font = `56px ${fontFamily}`; ctx.fillText(textProps.text, 72, 160); return cv; }),
    finalEncode: budgets['bench:encode-png'],
  };

  const decodedImage = await decodeImageSource(imageFixture, { label: 'phase14p predecoded image' });
  const imageCompositionCanvas = createCanvas(1200, 630);
  const imageCompositionCtx = imageCompositionCanvas.getContext('2d');
  domainStages.image = {
    sourceResolution: await benchmark('image:source-resolution', () => imageFixture.subarray(0)),
    metadataInspection: await benchmark('image:metadata-inspection', () => inspectImageSource(imageFixture, { label: 'phase14p metadata' })),
    decode: budgets['bench:image:decode'],
    decodedCacheLookup: await benchmark('image:decoded-cache-lookup', () => loadImageCached(imageFixture)),
    resizeCropFit: await benchmark('image:resize-crop-fit', () => fitInto(440, 225, 320, 180, decodedImage.width, decodedImage.height, 'cover', 'center')),
    composition: await benchmark('image:composition', () => { imageCompositionCtx.clearRect(0, 0, 1200, 630); imageCompositionCtx.drawImage(decodedImage, 440, 225, 320, 180); return true; }),
    effects: await benchmark('image:effects', () => { const cv = createCanvas(320, 180); const ctx = cv.getContext('2d'); applyVignette(ctx, 0.35, 0.7, 320, 180); return cv; }),
    encode: budgets['bench:encode-png'],
  };

  const surfaceOnlyScene = { width: 640, height: 360, background: { colorBg: '#0b132b' }, layers: [
    { type: 'surface', placement: { x: 100, y: 90, width: 300, height: 160 }, background: { colorBg: '#5bc0be' }, layers: [
      { type: 'text', texts: { text: 'surface', x: 20, y: 70, font: { size: 28, family: fontFamily }, fill: { color: '#0b132b' } } },
    ] },
  ] };
  domainStages.scene = {
    validation: await benchmark('scene:validation', () => validateSceneRenderInput(scene)),
    templateReferenceResolution: await benchmark('scene:template-reference-resolution', () => scene.layers.map((layer, index) => ({ index, type: layer.type }))),
    layoutPreparation: await benchmark('scene:layout-preparation', () => ({ width: scene.width, height: scene.height, background: { ...scene.background }, layers: scene.layers.slice() })),
    resourceResolution: await benchmark('scene:resource-resolution', () => decodeImageSource(imageFixture, { label: 'phase14p scene resource' })),
    nestedSurfaceHandling: await benchmark('scene:nested-surface-handling', () => painter.renderScene(surfaceOnlyScene), { verify: verifyPng }),
    render: budgets['bench:scene:render'],
    encode: budgets['bench:encode-png'],
  };

  domainStages.chart = {
    validation: await benchmark('chart:validation', () => validateChartRequest('bar', chartData, undefined)),
    normalization: await benchmark('chart:normalization', () => chartData.map((item, index) => ({ label: String(item.label ?? index), value: Number(item.value) }))),
    scaleDomain: await benchmark('chart:scale-domain', () => { let min = Infinity, max = -Infinity; for (const item of chartData) { min = Math.min(min, item.value); max = Math.max(max, item.value); } return { min, max }; }),
    tickGeneration: await benchmark('chart:tick-generation', () => Array.from({ length: 6 }, (_, i) => i * 20)),
    layout: budgets['bench:chart:layout'],
    textMeasurement: await benchmark('chart:text-measurement', () => chartData.map((item) => textMeasureCtx.measureText(item.label).width)),
    legend: await benchmark('chart:legend', () => chartData.map((item) => ({ label: item.label, width: textMeasureCtx.measureText(item.label).width + 28 }))),
    geometry: await benchmark('chart:geometry', chartLayoutWork),
    dataDraw: await benchmark('chart:data-draw', () => { const cv = createCanvas(640, 360); const ctx = cv.getContext('2d'); const geometry = chartLayoutWork(); ctx.fillStyle = '#3a86ff'; for (const bar of geometry) ctx.fillRect(bar.x, bar.y, bar.width, bar.height); return cv; }),
    labels: await benchmark('chart:labels', () => { const cv = createCanvas(640, 360); const ctx = cv.getContext('2d'); ctx.font = `14px ${fontFamily}`; chartData.forEach((item, i) => ctx.fillText(item.label, 40 + i * 60, 340)); return cv; }),
    encode: await benchmark('chart:encode', () => { const cv = createCanvas(640, 360); return cv.toBuffer('image/png'); }, { verify: verifyPng }),
  };

  const preDecodedGif = await decodeImageSource(gifFixture, { label: 'phase14p gif frame' });
  const gifRenderCanvas = createCanvas(320, 180);
  const gifRenderCtx = gifRenderCanvas.getContext('2d');
  const encoderStages = await collectCustomStage('gif:encoder', gifEncoderStagesOnce, ['addFrameMs', 'finalizeMs'], true);
  domainStages.gif = {
    frameProducer: await benchmark('gif:frame-producer', () => gifFrames.map((frame) => ({ ...frame }))),
    validation: await benchmark('gif:validation', () => { validateGIFOptions(gifOptions, gifFrames.length); validateGIFInputFrames(gifFrames); return true; }),
    decodeNormalize: await benchmark('gif:decode-normalize', () => decodeImageSource(gifFixture, { label: 'phase14p gif decode' }), { expensive: true }),
    prefetchQueue: await benchmark('gif:prefetch-queue', () => Promise.all(Array.from({ length: 4 }, () => decodeImageSource(gifFixture, { label: 'phase14p gif prefetch' }))), { expensive: true }),
    frameRender: await benchmark('gif:frame-render', () => { gifRenderCtx.clearRect(0, 0, 320, 180); gifRenderCtx.drawImage(preDecodedGif, 0, 0, 320, 180); return true; }),
    encoderAddFrame: { name: 'gif:encoder-add-frame', warmups: encoderStages.warmups, timing: encoderStages.stages.addFrameMs },
    finalize: { name: 'gif:finalize', warmups: encoderStages.warmups, timing: encoderStages.stages.finalizeMs },
    endToEnd: await benchmark('gif:end-to-end', () => painter.createGIF(gifFrames, gifOptions), { expensive: true, verify: verifyGif }),
  };

  const validatedAudio = validateSynthSoundOptions(audioOptions);
  const renderedAudio = renderValidatedSound(audioOptions, validatedAudio);
  const mixA = renderedAudio.slice();
  const mixB = renderedAudio.slice();
  const limiterFixture = renderedAudio.slice();
  for (let i = 0; i < limiterFixture.length; i += 1) limiterFixture[i] *= 1.2;
  domainStages.audio = {
    validation: await benchmark('audio:validation', () => validateSynthSoundOptions(audioOptions)),
    eventNormalization: await benchmark('audio:event-normalization', () => validateSynthSequenceOptions(sequenceOptions)),
    oscillatorSynthesis: await benchmark('audio:oscillator-synthesis', () => renderValidatedSound(audioOptions, validatedAudio), { expensive: true }),
    mix: await benchmark('audio:mix', () => mixFloatBuffers([mixA, mixB], 2, 0.5), { expensive: true }),
    effects: await benchmark('audio:effects', () => { const copy = limiterFixture.slice(); applyLimiter(copy, true); return copy; }, { expensive: true }),
    wavEncode: await benchmark('audio:wav-encode', () => encodeValidatedWavPcm16(renderedAudio, 44100, 2), { expensive: true }),
  };

  const runtime = getDefaultApexifyRuntimeConfig();
  const report = {
    schemaVersion: 2,
    phase: '14-P',
    generatedAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: `${process.platform}-${process.arch}`,
      fontFamily,
      exposeGc: typeof global.gc === 'function',
    },
    methodology: { cheapWarmups, cheapSamples, expensiveWarmups, expensiveSamples },
    runtimeSnapshot: {
      cache: { enabled: runtime.cache.enabled, maxEntries: runtime.cache.maxEntries, maxBytes: runtime.cache.maxBytes },
      limits: {
        maxCanvasDimension: runtime.limits.maxCanvasDimension,
        maxTotalPixels: runtime.limits.maxTotalPixels,
        maxDecodedImagePixels: runtime.limits.maxDecodedImagePixels,
        maxGifFrames: runtime.limits.maxGifFrames,
        maxAudioDurationSeconds: runtime.limits.maxAudioDurationSeconds,
      },
    },
    budgets,
    domainStages,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`phase14p stage benchmarks: wrote ${outputPath}`);
  for (const [id, result] of Object.entries(budgets)) {
    console.log(`${id}: median=${result.timing.median} ms p95=${result.timing.p95} ms cv=${result.timing.coefficientOfVariation}`);
  }
  for (const [domain, stages] of Object.entries(domainStages)) {
    console.log(`\n[${domain}]`);
    for (const [stage, result] of Object.entries(stages)) {
      if (result?.timing) console.log(`${stage}: median=${result.timing.median} ms p95=${result.timing.p95} ms`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
