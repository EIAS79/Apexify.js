'use strict';

const assert = require('node:assert/strict');

const phase4 = require('../node_modules/.cache/apexify-phase4/phase4-entry.cjs');
const {
  ApexifyResourceLimitError,
  configureApexifyRuntime,
  resetApexifyRuntimeConfig,
  resolveApexifyRuntimeConfig,
  validateSceneRenderInput,
} = phase4;

function nestedScene(remoteSources = 1) {
  const imageLayers = Array.from({ length: remoteSources }, (_, index) => ({
    type: 'image',
    images: {
      source: `https://cdn.example.test/image-${index}.png`,
      x: 0,
      y: 0,
    },
  }));

  return {
    width: 32,
    height: 32,
    layers: [
      {
        type: 'text',
        texts: { text: 'https://example.test/not-an-asset', x: 0, y: 0 },
      },
      {
        type: 'surface',
        placement: { x: 0, y: 0, width: 16, height: 16 },
        layers: [
          {
            type: 'surface',
            placement: { x: 0, y: 0, width: 8, height: 8 },
            layers: imageLayers,
          },
        ],
      },
    ],
  };
}

function main() {
  resetApexifyRuntimeConfig();

  const fractional = resolveApexifyRuntimeConfig({
    limits: {
      maxAudioDurationSeconds: 0.5,
      maxVideoDurationSeconds: 2.5,
      maxVideoFps: 29.97,
    },
  });
  assert.equal(fractional.limits.maxAudioDurationSeconds, 0.5);
  assert.equal(fractional.limits.maxVideoDurationSeconds, 2.5);
  assert.equal(fractional.limits.maxVideoFps, 29.97);

  configureApexifyRuntime({ limits: { maxRemoteAssets: 1 } });
  assert.doesNotThrow(
    () => validateSceneRenderInput(nestedScene(1)),
    'one nested remote image must be counted once; URL-looking text must not count as an asset'
  );

  assert.throws(
    () => validateSceneRenderInput(nestedScene(2)),
    (error) => error instanceof ApexifyResourceLimitError && error.limit === 'maxRemoteAssets',
    'two actual nested remote image sources must exceed a one-asset budget'
  );

  resetApexifyRuntimeConfig();
  console.log('phase4-postmerge-regressions: continuous limits and exact scene remote-asset accounting passed.');
}

try {
  main();
} catch (error) {
  resetApexifyRuntimeConfig();
  throw error;
}
