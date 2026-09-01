'use strict';

const assert = require('node:assert/strict');

const phase4 = require('../node_modules/.cache/apexify-phase4/phase4-entry.cjs');
const {
  ApexPainter,
  ApexifyError,
  ApexifyInputError,
  ApexifyResourceLimitError,
  batchOperations,
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
} = phase4;

async function expectFailure(label, fn, predicate) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ApexifyError, `${label}: error must use the structured Apexify error hierarchy`);
    assert.ok(predicate(error), `${label}: unexpected error ${error?.stack || error}`);
    return error;
  }
  assert.fail(`${label}: expected failure`);
}

async function withLimits(limits, fn) {
  resetApexifyRuntimeConfig();
  configureApexifyRuntime({ limits });
  try {
    return await fn();
  } finally {
    resetApexifyRuntimeConfig();
  }
}

async function main() {
  resetApexifyRuntimeConfig();
  const painter = new ApexPainter();

  let generatedGifCalls = 0;
  let oversizedBatchCalls = 0;

  const resourceCases = [
    {
      label: 'canvas dimension rejected before native allocation',
      limits: { maxCanvasDimension: 10 },
      expectedLimit: 'maxCanvasDimension',
      action: () => painter.createCanvas({ width: 11, height: 1 }),
    },
    {
      label: 'image dimensions rejected before source decode',
      limits: { maxCanvasDimension: 10 },
      expectedLimit: 'maxCanvasDimension',
      action: () => painter.createImage(
        { source: 'phase4-missing-image.png', x: 0, y: 0, width: 11, height: 1 },
        Buffer.alloc(0)
      ),
    },
    {
      label: 'text aggregate length rejected before canvas decode',
      limits: { maxTextLength: 4 },
      expectedLimit: 'maxTextLength',
      action: () => painter.createText({ text: '12345', x: 0, y: 0 }, Buffer.alloc(0)),
    },
    {
      label: 'scene total layers rejected before root canvas allocation',
      limits: { maxSceneLayers: 1 },
      expectedLimit: 'maxSceneLayers',
      action: () => painter.renderScene(
        { width: 8, height: 8, layers: [{ type: 'path', path: [] }, { type: 'path', path: [] }] },
        { resolveAssetRefs: false }
      ),
    },
    {
      label: 'GIF frame limit rejected before onStart generator',
      limits: { maxGifFrames: 2 },
      expectedLimit: 'maxGifFrames',
      action: () => painter.createGIF(undefined, {
        outputFormat: 'buffer',
        width: 2,
        height: 2,
        frameCount: 3,
        onStart() {
          generatedGifCalls += 1;
          return [];
        },
      }),
      after: () => assert.equal(generatedGifCalls, 0, 'GIF generator must not run after an upfront frame-limit failure'),
    },
    {
      label: 'audio memory estimate rejected before Float32Array allocation',
      limits: { maxAudioBytes: 128 },
      expectedLimit: 'maxAudioBytes',
      action: () => painter.createAudio.synth({
        sampleRate: 44_100,
        channels: 1,
        layers: [{ waveform: 'sine', frequency: 440, duration: 0.01, gain: 0.5 }],
      }),
    },
    {
      label: 'chart dimensions rejected before chart canvas allocation',
      limits: { maxCanvasDimension: 10 },
      expectedLimit: 'maxCanvasDimension',
      action: () => painter.createChart('pie', [{ label: 'x', value: 1 }], { dimensions: { width: 11, height: 2 } }),
    },
    {
      label: 'image resize dimensions rejected before missing source lookup',
      limits: { maxCanvasDimension: 10 },
      expectedLimit: 'maxCanvasDimension',
      action: () => painter.image.resize({
        imagePath: 'phase4-missing-resize.png',
        size: { width: 11, height: 2 },
      }),
    },
    {
      label: 'image stitch collection rejected before any image decode',
      limits: { maxCollectionItems: 2 },
      expectedLimit: 'maxCollectionItems',
      action: () => painter.image.stitchImages([
        'phase4-missing-a.png',
        'phase4-missing-b.png',
        'phase4-missing-c.png',
      ]),
    },
    {
      label: 'batch operation limit rejected before invoking painter',
      limits: { maxBatchOperations: 2, maxBatchConcurrency: 2 },
      expectedLimit: 'maxBatchOperations',
      action: () => batchOperations(
        {
          async createCanvas() {
            oversizedBatchCalls += 1;
            return { buffer: Buffer.from('unexpected') };
          },
        },
        [
          { type: 'canvas', config: {} },
          { type: 'canvas', config: {} },
          { type: 'canvas', config: {} },
        ]
      ),
      after: () => assert.equal(oversizedBatchCalls, 0, 'oversized batch must reject before any operation begins'),
    },
  ];

  for (const testCase of resourceCases) {
    await withLimits(testCase.limits, async () => {
      const error = await expectFailure(
        testCase.label,
        testCase.action,
        (candidate) => candidate instanceof ApexifyResourceLimitError && candidate.limit === testCase.expectedLimit
      );
      assert.equal(error.code, 'APEXIFY_RESOURCE_LIMIT', `${testCase.label}: stable error code`);
      testCase.after?.();
    });
  }

  const invalidCases = [
    {
      label: 'canvas non-finite dimension',
      action: () => painter.createCanvas({ width: Number.NaN, height: 10 }),
      message: /finite number/i,
    },
    {
      label: 'image non-finite coordinate',
      action: () => painter.createImage({ source: 'missing.png', x: Infinity, y: 0 }, Buffer.alloc(0)),
      message: /finite number/i,
    },
    {
      label: 'text invalid line height',
      action: () => painter.createText({ text: 'x', x: 0, y: 0, lineHeight: 0 }, Buffer.alloc(0)),
      message: /lineHeight/i,
    },
    {
      label: 'GIF file output missing path',
      action: () => painter.createGIF([{ buffer: Buffer.from('not-decoded'), duration: 10 }], { outputFormat: 'file' }),
      message: /outputFile/i,
    },
    {
      label: 'audio pan outside normalized range',
      action: () => painter.createAudio.synth({ layers: [{ duration: 0.01, frequency: 440, pan: 2 }] }),
      message: /pan/i,
    },
    {
      label: 'video ambiguous multi-operation request rejected before FFmpeg',
      action: () => painter.createVideo({
        source: 'phase4-missing-video.mp4',
        trim: { startTime: 0, endTime: 1, outputPath: 'trim.mp4' },
        convert: { outputPath: 'convert.mp4' },
      }),
      message: /exactly one operation/i,
    },
    {
      label: 'video invalid timeline range',
      action: () => painter.createVideo({
        source: 'phase4-missing-video.mp4',
        trim: { startTime: 2, endTime: 1, outputPath: 'trim.mp4' },
      }),
      message: /greater than start/i,
    },
    {
      label: 'chart empty data',
      action: () => painter.createChart('pie', []),
      message: /non-empty array/i,
    },
    {
      label: 'image mask threshold out of range',
      action: () => painter.image.masking('missing.png', 'missing-mask.png', { type: 'alpha', threshold: 300 }),
      message: /threshold/i,
    },
  ];

  for (const testCase of invalidCases) {
    resetApexifyRuntimeConfig();
    const error = await expectFailure(
      testCase.label,
      testCase.action,
      (candidate) => candidate instanceof ApexifyInputError && testCase.message.test(String(candidate.message))
    );
    assert.equal(error.code, 'APEXIFY_INPUT', `${testCase.label}: stable input error code`);
  }

  // Prove that the configured batch concurrency is an execution limit, not merely a typed option.
  await withLimits({ maxBatchOperations: 6, maxBatchConcurrency: 2 }, async () => {
    let active = 0;
    let maxActive = 0;
    const fakePainter = {
      async createCanvas(config) {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        active -= 1;
        return { buffer: Buffer.from(String(config.id)) };
      },
    };
    const operations = Array.from({ length: 6 }, (_, id) => ({ type: 'canvas', config: { id } }));
    const output = await batchOperations(fakePainter, operations);
    assert.ok(maxActive <= 2, `batch concurrency exceeded configured maximum: ${maxActive}`);
    assert.ok(maxActive >= 2, 'batch concurrency test did not exercise parallel workers');
    assert.deepEqual(output.map((buffer) => buffer.toString()), ['0', '1', '2', '3', '4', '5']);
  });

  resetApexifyRuntimeConfig();
  console.log(`phase4-runtime: ${resourceCases.length} resource cases, ${invalidCases.length} invalid cases, and bounded batch concurrency passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
