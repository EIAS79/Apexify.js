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
  assert.throws(
    () => assets.replacePalette('theme', { __proto__: '#000' }),
    api.ApexifyInputError,
    'replacePalette must reject non-plain/unsafe palette objects'
  );
  assert.equal(assets.resolve('theme.primary'), '#fff', 'failed replacement must not mutate the registry');

  // Scene-to-video validation must be structured and must reject bad configuration before raster work.
  const painter = new api.ApexPainter();
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

  console.log('phase6-regressions: replacement validation and structured scene-video errors passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
