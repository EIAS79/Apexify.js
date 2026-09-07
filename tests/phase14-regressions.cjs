'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test, afterEach } = require('node:test');
const api = require('./.build/phase14-entry.cjs');

afterEach(() => {
  api.resetApexifyRuntimeConfig();
});

test('AssetManager bounds process-resident registry entries', () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 2 } });
  const assets = new api.AssetManager();
  assets.loadValue('first', 1);
  assets.loadValue('second', 2);
  assert.throws(
    () => assets.loadValue('third', 3),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );
});

test('AssetManager bounds nested values, palettes, and image buffers', () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 3 } });
  assert.throws(
    () => new api.AssetManager().loadValue('nested', [1, 2, 3]),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );

  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 2 } });
  assert.throws(
    () => new api.AssetManager().loadPalette('palette', { a: '#000000', b: '#111111', c: '#222222' }),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );

  api.setDefaultApexifyRuntimeConfig({
    limits: { maxImageSourceBytes: 2, maxRemoteImageBytes: 2 },
  });
  assert.throws(
    () => new api.AssetManager().loadImage('oversized', Buffer.alloc(3)),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxImageSourceBytes'
  );
});

test('PluginHost bounds API and installed-plugin registries', async () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 1 } });

  const apiHost = new api.PluginHost();
  apiHost.use('first', {});
  assert.throws(
    () => apiHost.use('second', {}),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );

  const installHost = new api.PluginHost();
  await installHost.install({ name: 'first', install() {} }, {});
  await assert.rejects(
    installHost.install({ name: 'second', install() {} }, {}),
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );
});

test('PluginHost bounds transactional rollback journal across add/remove churn', async () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 1 } });
  const plugins = new api.PluginHost();
  await assert.rejects(
    plugins.install({
      name: 'churn',
      install(host) {
        host.use('first', {});
        host.remove('first');
        host.use('second', {});
      },
    }, plugins),
    (error) => error?.cause instanceof api.ApexifyResourceLimitError && error.cause.limit === 'maxCollectionItems'
  );
  assert.deepEqual(plugins.list(), []);
});

test('native font registration admission is bounded even while registrations are in flight', async () => {
  api.setDefaultApexifyRuntimeConfig({ limits: { maxCollectionItems: 1 } });
  const firstPath = path.join(process.cwd(), 'definitely-missing-phase14-font-a.ttf');
  const secondPath = path.join(process.cwd(), 'definitely-missing-phase14-font-b.ttf');

  const first = api.registerTextFontFromPath(firstPath, 'Phase14FontA');
  const second = api.registerTextFontFromPath(secondPath, 'Phase14FontB');

  await assert.rejects(
    second,
    (error) => error instanceof api.ApexifyResourceLimitError && error.limit === 'maxCollectionItems'
  );
  await assert.rejects(first, api.ApexifyInputError);
});

test('structured error base contract remains stable', () => {
  const error = new api.ApexifyInputError('bad input', { details: { field: 'x' } });
  assert.equal(error.code, 'APEXIFY_INPUT');
  assert.equal(error.name, 'ApexifyInputError');
  assert.equal(error.details.field, 'x');
  assert.ok(error instanceof api.ApexifyError);
});
