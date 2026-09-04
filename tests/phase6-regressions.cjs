'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

async function main() {
  // Replacement APIs must enforce the same runtime validation as initial registration.
  const assets = new api.AssetManager();
  assets.loadPalette('theme', { primary: '#fff' });
  assert.throws(
    () => assets.replacePalette('theme', { primary: 123 }),
    api.ApexifyInputError,
    'replacePalette must reject non-string palette values at runtime'
  );
  const unsafePalette = Object.create(null);
  unsafePalette.__proto__ = '#000';
  assert.throws(
    () => assets.replacePalette('theme', unsafePalette),
    api.ApexifyAssetError,
    'replacePalette must reject unsafe palette keys'
  );
  assert.equal(assets.resolve('theme.primary'), '#fff', 'failed replacement must not mutate the registry');

  const painter = new api.ApexPainter();

  // Components with canvas-aware placement must reject invalid or impossible geometry.
  assert.throws(
    () => painter.components.watermark.toLayers({ text: 'mark', canvasWidth: 80, canvasHeight: 40, position: 'outside' }),
    api.ApexifyInputError
  );
  assert.throws(
    () => painter.components.watermark.toLayers({ text: 'watermark-too-wide', canvasWidth: 20, canvasHeight: 20, fontSize: 20, margin: 0 }),
    api.ApexifyInputError
  );

  // Scene-to-video validation must be structured and must reject bad configuration before raster work.
  await assert.rejects(
    painter.renderSceneToVideoFrames(
      { width: 1, height: 1, layers: [] },
      { options: { source: '' } }
    ),
    api.ApexifyInputError
  );
  await assert.rejects(
    painter.renderSceneToVideoFrames(
      { width: 1, height: 1, layers: [] },
      {
        options: {
          source: '',
          createFromFrames: { frames: [], outputPath: './unused.mp4', fps: 1, format: 'mp4' },
        },
        prependComposedToFrames: false,
      }
    ),
    api.ApexifyInputError
  );

  console.log('phase6-regressions: replacement validation, component bounds, and structured scene-video errors passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
