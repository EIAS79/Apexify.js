'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const api = require('../node_modules/.cache/apexify-phase10/phase10-entry.cjs');

function expectInputError(fn, pattern) {
  return assert.rejects(Promise.resolve().then(fn), (error) => error instanceof api.ApexifyInputError && (!pattern || pattern.test(error.message)));
}
function png(width, height, color) {
  const canvas = api.createCanvas(width, height);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

(async () => {
  // TEXT: zero coordinates, explicit newlines, grapheme fallback for overlong words, metrics/render agreement.
  const canvas = api.createCanvas(320, 180);
  const ctx = api.getCanvasContext(canvas);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 320, 180);
  const textProps = {
    text: 'AReallyLongTokenThatMustWrap\n\nCafé 😀 مرحبا 世界',
    x: 0,
    y: 0,
    font: { size: 20, family: 'Arial' },
    layout: { maxWidth: 95, lineHeight: 1.2 },
    fill: { color: '#111111', opacity: 1 },
    decorations: { underline: true },
  };
  await api.EnhancedTextRenderer.renderText(ctx, textProps);
  const metrics = await new api.TextMetricsCreator().measureText(textProps);
  assert(metrics.lineCount >= 4, 'wrapping/newline semantics must produce multiple lines');
  assert(metrics.lines.some((line) => line.text === ''), 'explicit empty line must be preserved');
  assert(metrics.lines.every((line) => line.width <= 95.5), 'overlong token must fall back to grapheme wrapping');
  assert.equal(metrics.totalHeight, metrics.lineCount * metrics.lineHeight);
  await assert.rejects(
    () => api.EnhancedTextRenderer.renderText(ctx, { text: 'x', x: 0, y: 0, font: { size: 16, path: './definitely-missing-font.ttf', name: 'Missing' } }),
    (error) => error instanceof api.ApexifyInputError && /missing|invalid/i.test(error.message)
  );

  // TEXT PARITY: bounded multiline, curve wrapping, strict validation, advanced fonts,
  // legacy aliases, affine transforms, perspective and grouped composition.
  {
    const maxHeightMetrics = await new api.TextMetricsCreator().measureText({
      text: 'one\ntwo\nthree',
      x: 0,
      y: 0,
      font: { size: 10, family: 'Arial', weight: 500, style: 'oblique' },
      layout: { lineHeight: 1, maxHeight: 20 },
    });
    assert.equal(maxHeightMetrics.lineCount, 2, 'maxHeight must limit multiline text without maxWidth');

    const curvedWrapped = await new api.TextMetricsCreator().measureText({
      text: 'alpha beta gamma delta',
      x: 50,
      y: 50,
      font: { size: 16, family: 'Arial' },
      layout: { maxWidth: 65, lineHeight: 1.2 },
      textOnCurve: { sweepAngle: 120, radius: 80 },
    });
    assert(curvedWrapped.lineCount > 1, 'textOnCurve must honor wrapped lines');

    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, textOnCurve: { sweepAngle: 360 } }),
      /< 360/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, stroke: { style: 'invalid' } }),
      /stroke\.style/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, font: { weight: 950 } }),
      /font\.weight/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, decorations: { bold: 'yes' } }),
      /bold/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, includeCharMetrics: 'yes' }),
      /includeCharMetrics/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, fill: { color: 42 } }),
      /color/
    );
    assert.throws(
      () => api.validateTextProperties({ text: 'x', x: 0, y: 0, fontPath: 42 }),
      /fontPath/
    );
    assert.throws(
      () => api.validateTextProperties({
        text: 'x',
        x: 0,
        y: 0,
        measurementCanvas: { width: Number.MAX_SAFE_INTEGER },
      }),
      api.ApexifyResourceLimitError
    );
    assert.throws(
      () => api.validateCreateTextOptions({ groupTransform: { blendMode: 'not-a-mode' } }),
      /blendMode/
    );

    const pathOnlyIdentity = api.resolveTextFontIdentity({
      text: 'x',
      x: 0,
      y: 0,
      font: { path: './fonts/example.ttf' },
    });
    assert.match(pathOnlyIdentity.family, /^Apexify_/);

    const gradientCanvas = api.createCanvas(20, 20);
    const gradientCtx = api.getCanvasContext(gradientCanvas);
    assert.doesNotThrow(() => api.createTextGradient(
      gradientCtx,
      {
        type: 'linear',
        startX: 2,
        startY: 3,
        endX: 18,
        endY: 4,
        rotate: 25,
        pivotX: 10,
        pivotY: 10,
        colors: [{ stop: 0, color: '#ff0000' }, { stop: 1, color: '#0000ff' }],
      },
      0, 0, 20, 20
    ));

    const painter = new api.ApexPainter();
    const textBase = await painter.createCanvas({ width: 160, height: 100, transparentBase: true });
    const advanced = await painter.createText(
      [
        {
          text: 'A',
          x: 30,
          y: 45,
          font: { size: 28, family: 'Arial', weight: 600, style: 'oblique' },
          isBold: true,
          outlined: true,
          fill: { color: '#ff0000' },
          placement: {
            scaleX: 1.15,
            scaleY: 0.9,
            skewX: 8,
            skewY: -4,
            perspective: {
              points: [
                { x: 15, y: 10 },
                { x: 70, y: 14 },
                { x: 66, y: 70 },
                { x: 12, y: 66 },
              ],
              interpolation: 'bilinear',
              edgeMode: 'transparent',
            },
          },
        },
        {
          text: 'B',
          x: 90,
          y: 52,
          font: { size: 24, family: 'Arial' },
          fill: { color: '#0000ff' },
        },
      ],
      textBase,
      {
        isGrouped: true,
        groupTransform: {
          translateX: 5,
          translateY: 2,
          rotation: 5,
          scaleX: 1.05,
          scaleY: 1,
          skewX: 3,
          opacity: 0.9,
        },
      }
    );
    const advancedRaw = await sharp(advanced).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let alphaPixels = 0;
    for (let i = 3; i < advancedRaw.data.length; i += 4) if (advancedRaw.data[i] > 0) alphaPixels += 1;
    assert(alphaPixels > 0, 'perspective/grouped advanced text must produce visible pixels');

    const legacyPainterOpts = await painter.createText(
      { text: 'asset-compatible', x: 5, y: 90, font: { size: 10, family: 'Arial' } },
      textBase,
      { resolveAssetRefs: false }
    );
    assert(Buffer.isBuffer(legacyPainterOpts), 'legacy third-argument PainterAssetRefsOptions must remain compatible');

    painter.assets.loadPalette('textParity', { accent: '#00ff00' });
    const assetBase = await painter.createCanvas({ width: 80, height: 50, transparentBase: true });
    const fourthArgResolved = await painter.createText(
      {
        text: 'X',
        x: 8,
        y: 36,
        font: { size: 32, family: 'Arial' },
        fill: { color: '$textParity.accent' },
      },
      assetBase,
      {},
      { resolveAssetRefs: true }
    );
    const resolvedRaw = await sharp(fourthArgResolved).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let greenPixels = 0;
    for (let i = 0; i < resolvedRaw.data.length; i += 4) {
      const [r, g, b, a] = resolvedRaw.data.subarray(i, i + 4);
      if (a > 0 && g > 100 && g > r * 1.5 && g > b * 1.5) greenPixels += 1;
    }
    assert(greenPixels > 0, 'empty CreateTextOptions plus fourth painter options must still resolve asset refs');

    const scene = await painter.renderScene({
      width: 120,
      height: 80,
      layers: [{
        type: 'text',
        texts: [
          { text: 'G', x: 20, y: 40, font: { size: 24, family: 'Arial' }, fill: { color: '#ffffff' } },
          { text: 'R', x: 45, y: 40, font: { size: 24, family: 'Arial' }, fill: { color: '#ffffff' } },
        ],
        options: {
          isGrouped: true,
          groupTransform: { rotation: 8, scaleX: 1.1, skewY: 2 },
        },
      }],
    });
    assert(Buffer.isBuffer(scene), 'scene text layers must accept CreateTextOptions');
  }

  // PATH: finite validation and all authoritative commands; malformed numeric state rejects before native backend.
  const pathCreator = new api.Path2DCreator();
  const commands = [
    { type: 'moveTo', x: 5, y: 5 },
    { type: 'lineTo', x: 50, y: 5 },
    { type: 'quadraticCurveTo', cpx: 60, cpy: 15, x: 50, y: 25 },
    { type: 'bezierCurveTo', cp1x: 45, cp1y: 35, cp2x: 15, cp2y: 35, x: 5, y: 25 },
    { type: 'closePath' },
    { type: 'circle', x: 80, y: 20, radius: 10 },
    { type: 'ellipse', x: 110, y: 20, radiusX: 15, radiusY: 8 },
    { type: 'rect', x: 130, y: 5, width: 20, height: 20 },
    { type: 'roundedRect', x: 160, y: 5, width: 30, height: 20, radius: 4 },
    { type: 'polygon', points: [{ x: 200, y: 5 }, { x: 220, y: 5 }, { x: 210, y: 25 }] },
    { type: 'star', x: 250, y: 15, outerRadius: 12, innerRadius: 5, points: 5 },
    { type: 'arrow', x: 275, y: 20, length: 25, angle: 0 },
  ];
  assert(pathCreator.createPath2D(commands));
  assert.throws(() => api.validatePathCommands([{ type: 'arc', x: 0, y: 0, radius: -1, startAngle: 0, endAngle: 1 }]), api.ApexifyInputError);
  assert.throws(() => api.validatePathCommands([{ type: 'lineTo', x: Infinity, y: 0 }]), api.ApexifyInputError);

  // HIT DETECTION: inclusive boundaries and zero-inside distance semantics.
  const hit = new api.HitDetectionCreator();
  assert.equal(hit.isPointInRegion({ type: 'rect', x: 10, y: 10, width: 20, height: 20 }, 10, 20).hit, true);
  assert.equal(hit.isPointInRegion({ type: 'circle', x: 0, y: 0, radius: 10 }, 10, 0).hit, true);
  assert.equal(hit.getDistanceToRegion({ type: 'circle', x: 0, y: 0, radius: 10 }, 0, 0), 0);
  assert.equal(hit.getDistanceToRegion({ type: 'rect', x: 0, y: 0, width: 10, height: 10 }, 5, 5), 0);
  assert.throws(() => hit.getDistanceToRegion({ type: 'custom', check: () => false }, 0, 0), api.ApexifyInputError);

  // PIXELS: reject bounds consistently, preserve exact channels, and apply intensity to every built-in filter.
  const pixels = new api.PixelDataCreator();
  const black = png(4, 4, '#000000');
  await expectInputError(() => pixels.getPixelColor(black, 4, 0), /out of bounds/i);
  await expectInputError(() => pixels.getPixelData(black, { x: 3, y: 3, width: 2, height: 2 }), /out of bounds/i);
  const red = await pixels.setPixelColor(black, 0, 0, { r: 255, g: 0, b: 0, a: 255 });
  assert.deepEqual(await pixels.getPixelColor(red, 0, 0), { r: 255, g: 0, b: 0, a: 255 });
  const noOp = await pixels.manipulatePixels(red, { filter: 'invert', intensity: 0, region: { x: 0, y: 0, width: 1, height: 1 } });
  assert.deepEqual(await pixels.getPixelColor(noOp, 0, 0), { r: 255, g: 0, b: 0, a: 255 });
  await expectInputError(() => pixels.manipulatePixels(red, { processor: () => Promise.resolve([0, 0, 0, 255]) }), /synchronously return/i);
  await expectInputError(() => pixels.setPixelColor(red, 0, 0, { r: NaN, g: 0, b: 0 }), /finite/i);

  // OUTPUT: raw base64/data URL distinction, exact ArrayBuffer slice, Blob roundtrip.
  const backing = Buffer.alloc(64, 0xaa);
  const slice = backing.subarray(11, 19);
  const ab = api.arrayBuffer(slice);
  assert.equal(ab.byteLength, 8);
  assert.deepEqual(Buffer.from(ab), slice);
  assert.equal(api.base64(slice), slice.toString('base64'));
  assert(api.dataURL(slice).startsWith('data:image/png;base64,'));
  const blob = api.blob(slice);
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), slice);

  // FILE SAVE: asynchronous creation, race-safe non-overwrite, explicit overwrite.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'apexify-phase10-'));
  try {
    const session = { saveCounter: 0 };
    const first = await api.saveImageBuffer(red, { directory: dir, filename: 'image.png' }, session);
    const second = await api.saveImageBuffer(red, { directory: dir, filename: 'image.png' }, session);
    assert.equal(first.filename, 'image.png');
    assert.equal(second.filename, 'image_1.png');
    const overwrite = await api.saveImageBuffer(black, { directory: dir, filename: 'image.png', overwrite: true }, session);
    assert.equal(overwrite.filename, 'image.png');
    assert.deepEqual(await fs.readFile(overwrite.path), black);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }

  // COMPRESSION / PALETTE: valid formats, dimensions and bounded deterministic palette.
  const source = png(64, 32, '#336699');
  for (const format of ['jpeg', 'webp', 'avif']) {
    const compressed = await api.compressImage(source, { format, quality: 70, maxWidth: 32 });
    const meta = await sharp(compressed).metadata();
    assert(meta.width <= 32);
    assert.equal(meta.format, format === 'avif' ? 'heif' : format);
  }
  await expectInputError(() => api.compressImage(source, { format: 'png' }), /unsupported/i);
  const palette = await api.extractPalette(source, { count: 4, method: 'median-cut', format: 'hex' });
  assert(palette.length >= 1 && palette.length <= 4);
  assert(/^#[0-9a-f]{6}$/i.test(palette[0].color));

  // STITCH / COLLAGE: dimensions are determined before allocation and no input is silently dropped.
  const a = png(20, 10, '#ff0000');
  const b = png(10, 20, '#00ff00');
  const horizontal = await api.stitchImages([a, b], { direction: 'horizontal', spacing: 2 });
  assert.deepEqual(await sharp(horizontal).metadata().then((m) => [m.width, m.height]), [32, 20]);
  const vertical = await api.stitchImages([a, b], { direction: 'vertical', spacing: 3 });
  assert.deepEqual(await sharp(vertical).metadata().then((m) => [m.width, m.height]), [20, 33]);
  const collage = await api.createCollage([
    { source: a }, { source: b }, { source: a }, { source: b }, { source: a },
  ], { type: 'grid', columns: 2, rows: 1, spacing: 1, background: '#000000' });
  const collageMeta = await sharp(collage).metadata();
  assert.equal(collageMeta.width, 41);
  assert.equal(collageMeta.height, 62, 'grid expands rows so all five inputs render');
  await expectInputError(() => api.createCollage([{ source: a }], { type: 'custom' }), /unsupported/i);

  // CHARTS: every public type renders; zero Cartesian range remains finite; invalid radial totals reject.
  const charts = new api.ChartCreator();
  const chartCases = [
    ['pie', [{ label: 'A', value: 2 }, { label: 'B', value: 1 }], { dimensions: { width: 320, height: 240 } }],
    ['bar', [{ label: 'A', value: -2, xStart: 0, xEnd: 1 }, { label: 'B', value: 3, xStart: 1, xEnd: 2 }], { dimensions: { width: 320, height: 240 } }],
    ['horizontalBar', [{ label: 'A', value: -2 }, { label: 'B', value: 3 }], { dimensions: { width: 320, height: 240 } }],
    ['line', [{ label: 'zero', data: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }], { dimensions: { width: 320, height: 240 } }],
    ['scatter', [{ label: 'mixed', data: [{ x: -1, y: -1 }, { x: 2, y: 3 }] }], { dimensions: { width: 320, height: 240 } }],
    ['radar', [{ label: 'R', values: [0, 2, 4] }], { dimensions: { width: 320, height: 240 }, radar: { categories: ['α', 'β', 'γ'] } }],
    ['polarArea', [{ label: 'A', value: 1 }, { label: 'B', value: 3 }], { dimensions: { width: 320, height: 240 } }],
  ];
  for (const [type, data, options] of chartCases) {
    const rendered = await charts.createChart(type, data, options);
    const metadata = await sharp(rendered).metadata();
    assert.equal(metadata.width, 320, `${type} width`);
    assert.equal(metadata.height, 240, `${type} height`);
  }

  // Dedicated combo/comparison chart entry points are public and must share semantic preflight.
  const combo = await charts.createComboChart({
    dimensions: { width: 320, height: 240 },
    bars: [{ label: 'B', value: 3, xStart: 0, xEnd: 1 }],
    lines: [{ label: 'L', yAxis: 'primary', data: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }],
  });
  assert.deepEqual(await sharp(combo).metadata().then((m) => [m.width, m.height]), [320, 240]);
  const comparison = await charts.createComparisonChart({
    dimensions: { width: 640, height: 240 },
    layout: 'sideBySide',
    chart1: { type: 'pie', data: [{ label: 'A', value: 2 }, { label: 'B', value: 1 }], options: {} },
    chart2: { type: 'line', data: [{ label: 'L', data: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }], options: {} },
  });
  assert.deepEqual(await sharp(comparison).metadata().then((m) => [m.width, m.height]), [640, 240]);

  await expectInputError(() => charts.createChart('pie', [{ label: 'A', value: 0 }]), /total/i);
  await expectInputError(() => charts.createChart('polarArea', [{ label: 'A', value: -1 }]), /must be/i);
  await expectInputError(() => charts.createChart('radar', [{ label: 'R', values: [1, 2] }], { radar: { categories: ['A', 'B', 'C'] } }), /length/i);
  await expectInputError(() => charts.createChart('line', [{ label: 'bad', data: [{ x: 0, y: Infinity }] }]), /finite/i);
  await expectInputError(() => charts.createComboChart({ bars: [], lines: [] }), /at least one/i);
  await expectInputError(() => charts.createComparisonChart({
    chart1: { type: 'pie', data: [{ label: 'A', value: 0 }], options: {} },
    chart2: { type: 'line', data: [{ label: 'L', data: [{ x: 0, y: 0 }] }], options: {} },
  }), /total/i);

  // BATCH: bounded concurrency, input-order results, fail-fast and AbortSignal.
  let active = 0;
  let peak = 0;
  const fakePainter = {
    async createCanvas(config) {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 8 + (5 - config.width)));
      active--;
      return { buffer: Buffer.from([config.width]) };
    },
    async createImage() { throw new Error('not used'); },
    async createText() { throw new Error('not used'); },
    async append(value) { return Buffer.from(value); },
  };
  const ordered = await api.batchOperations(fakePainter, [1, 2, 3, 4, 5].map((width) => ({ type: 'canvas', config: { width, height: 1 } })), { concurrency: 2 });
  assert.deepEqual(ordered.map((buffer) => buffer[0]), [1, 2, 3, 4, 5]);
  assert(peak <= 2, `batch peak concurrency ${peak} must be <= 2`);
  await expectInputError(() => api.batchOperations(fakePainter, [{ type: 'canvas', config: { width: 1, height: 1 } }], { concurrency: 999 }), /must not exceed/i);
  const controller = new AbortController();
  controller.abort();
  await expectInputError(() => api.batchOperations(fakePainter, [{ type: 'canvas', config: { width: 1, height: 1 } }], { signal: controller.signal }), /aborted/i);
  const chained = await api.chainOperations(fakePainter, [{ method: 'append', args: [[1, 2, 3]] }]);
  assert.deepEqual(chained, Buffer.from([1, 2, 3]));

  // EXTERNAL UPLOAD: no embedded fallback credentials; absent configuration fails before network access.
  for (const key of ['IMGUR_CLIENT_ID', 'IMGUR_CLIENT_SECRET', 'IMGUR_ACCESS_TOKEN', 'IMGUR_REFRESH_TOKEN']) delete process.env[key];
  await expectInputError(() => api.uploadImgur(source), /credentials are required/i);

  console.log('phase10-runtime: text/chart/path/pixel/hit/batch/output/compression/collage/stitch regressions passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});