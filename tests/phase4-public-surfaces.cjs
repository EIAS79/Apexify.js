'use strict';

const assert = require('node:assert/strict');
const { createCanvas } = require('@napi-rs/canvas');
const phase4 = require('../node_modules/.cache/apexify-phase4/phase4-entry.cjs');
const {
  ApexPainter,
  ApexifyError,
  ApexifyInputError,
  ApexifyResourceLimitError,
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
} = phase4;

async function expectFailure(label, fn, predicate) {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ApexifyError, `${label}: expected structured Apexify error`);
    assert.ok(predicate(error), `${label}: unexpected error ${error?.stack || error}`);
    return;
  }
  assert.fail(`${label}: expected failure`);
}

async function withLimits(limits, fn) {
  resetApexifyRuntimeConfig();
  configureApexifyRuntime({ limits });
  try {
    await fn();
  } finally {
    resetApexifyRuntimeConfig();
  }
}

async function main() {
  const painter = new ApexPainter();
  const oversizedBase = createCanvas(11, 1).toBuffer('image/png');

  const resourceCases = [
    {
      label: 'pixel data allocation budget',
      limits: { maxCanvasDimension: 10 },
      expected: 'maxCanvasDimension',
      action: () => painter.pixels.setData(Buffer.alloc(0), {
        data: new Uint8ClampedArray(11 * 4),
        width: 11,
        height: 1,
      }),
    },
    {
      label: 'Path2D command collection budget',
      limits: { maxCollectionItems: 2 },
      expected: 'maxCollectionItems',
      action: () => painter.path2d.create([{}, {}, {}]),
    },
    {
      label: 'hit-region collection budget',
      limits: { maxCollectionItems: 2 },
      expected: 'maxCollectionItems',
      action: () => painter.detect.anyRegion([
        { type: 'custom', check: () => false },
        { type: 'custom', check: () => false },
        { type: 'custom', check: () => false },
      ], 0, 0),
    },
    {
      label: 'custom-line collection budget before buffer decode',
      limits: { maxCollectionItems: 2 },
      expected: 'maxCollectionItems',
      action: () => painter.path2d.custom([
        { startCoordinates: { x: 0, y: 0 }, endCoordinates: { x: 1, y: 1 } },
        { startCoordinates: { x: 0, y: 0 }, endCoordinates: { x: 1, y: 1 } },
        { startCoordinates: { x: 0, y: 0 }, endCoordinates: { x: 1, y: 1 } },
      ], Buffer.alloc(0)),
    },
    {
      label: 'createText base canvas budget before legacy decode',
      limits: { maxCanvasDimension: 10 },
      expected: 'maxCanvasDimension',
      action: () => painter.createText({ text: 'x', x: 0, y: 0 }, oversizedBase),
    },
    {
      label: 'createImage base canvas budget before legacy decode',
      limits: { maxCanvasDimension: 10 },
      expected: 'maxCanvasDimension',
      action: () => painter.createImage({ source: 'rectangle', x: 0, y: 0, width: 1, height: 1 }, oversizedBase),
    },
    {
      label: 'grouped image temporary surface budget before base decode',
      limits: { maxCanvasDimension: 10 },
      expected: 'maxCanvasDimension',
      action: () => painter.createImage([
        { source: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
        { source: 'rectangle', x: 20, y: 0, width: 1, height: 1 },
      ], Buffer.alloc(0), {
        isGrouped: true,
        groupTransform: { filters: [{ type: 'invert' }], filterOrder: 'pre' },
      }),
    },
  ];

  for (const testCase of resourceCases) {
    await withLimits(testCase.limits, () => expectFailure(
      testCase.label,
      testCase.action,
      (error) => error instanceof ApexifyResourceLimitError && error.limit === testCase.expected
    ));
  }

  resetApexifyRuntimeConfig();
  await expectFailure(
    'pixel coordinate validation before decode',
    () => painter.pixels.getColor(Buffer.alloc(0), Number.NaN, 0),
    (error) => error instanceof ApexifyInputError && /finite number/i.test(error.message)
  );

  await expectFailure(
    'Path2D option validation before decode',
    () => painter.path2d.draw(Buffer.alloc(0), [], { opacity: 2 }),
    (error) => error instanceof ApexifyInputError && /opacity/i.test(error.message)
  );

  await expectFailure(
    'hit-region finite geometry validation',
    () => painter.detect.region({ type: 'circle', x: 0, y: 0, radius: Number.POSITIVE_INFINITY }, 0, 0),
    (error) => error instanceof ApexifyInputError && /finite number/i.test(error.message)
  );

  resetApexifyRuntimeConfig();
  console.log(`phase4-public-surfaces: ${resourceCases.length} resource guards and 3 invalid-input guards passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
