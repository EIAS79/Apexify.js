'use strict';

const assert = require('node:assert/strict');
const { createCanvas: createNativeCanvas, loadImage } = require('@napi-rs/canvas');

const phase4 = require('../node_modules/.cache/apexify-phase4/phase4-entry.cjs');
const {
  ApexPainter,
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

async function main() {
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

  const painter = new ApexPainter();
  const oval = await painter.createCanvas({
    width: 120,
    height: 60,
    colorBg: '#ff0000',
    borderRadius: 'circular',
  });
  const decoded = await loadImage(oval.buffer);
  const probe = createNativeCanvas(120, 60);
  const probeCtx = probe.getContext('2d');
  probeCtx.drawImage(decoded, 0, 0);
  const edgeMidAlpha = probeCtx.getImageData(2, 30, 1, 1).data[3];
  const cornerAlpha = probeCtx.getImageData(2, 2, 1, 1).data[3];
  assert.ok(
    edgeMidAlpha > 0,
    'rectangular borderRadius:circular must span the full width as an ellipse'
  );
  assert.equal(
    cornerAlpha,
    0,
    'ellipse clipping must still leave the bounding-box corner transparent'
  );

  resetApexifyRuntimeConfig();
  console.log('phase4-postmerge-regressions: continuous limits, exact scene remote-asset accounting, and circular/ellipse canvas geometry passed.');
}

try {
  void main().catch((error) => {
    resetApexifyRuntimeConfig();
    throw error;
  });
} catch (error) {
  resetApexifyRuntimeConfig();
  throw error;
}
