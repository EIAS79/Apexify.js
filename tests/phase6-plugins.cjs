'use strict';

const assert = require('node:assert/strict');
const api = require('../node_modules/.cache/apexify-phase6/phase6-entry.cjs');

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const painter = new api.ApexPainter();

  const asyncInstall = painter.use({
    name: 'async-plugin',
    async install(host) {
      await delay(20);
      host.plugins.use('asyncApi', { ready: true });
    },
  });
  assert.equal(typeof asyncInstall.then, 'function', 'ApexPainter.use must return a Promise-like result');
  assert.equal(painter.plugins.has('asyncApi'), false, 'async install must not pretend to be complete synchronously');
  await asyncInstall;
  assert.equal(painter.plugins.has('asyncApi'), true);
  assert.equal(painter.plugins.isInstalled('async-plugin'), true);
  await assert.rejects(
    painter.use({ name: 'async-plugin', install() {} }),
    api.ApexifyPluginError
  );

  // Partial PluginHost registrations roll back after synchronous throw.
  await assert.rejects(
    painter.use({
      name: 'rollback-plugin',
      install(host) {
        host.plugins.use('partialApi', { partial: true });
        throw new Error('boom');
      },
    }),
    (error) => error instanceof api.ApexifyPluginError && /rolled back/.test(error.message)
  );
  assert.equal(painter.plugins.has('partialApi'), false);
  assert.equal(painter.plugins.isInstalled('rollback-plugin'), false);

  // Failed plugin names may be retried after cleanup.
  await painter.use({
    name: 'rollback-plugin',
    install(host) {
      host.plugins.use('recoveredApi', { ok: true });
    },
  });
  assert.equal(painter.plugins.has('recoveredApi'), true);
  assert.equal(painter.plugins.isInstalled('rollback-plugin'), true);

  // Async rejection also rolls back.
  await assert.rejects(
    painter.use({
      name: 'async-reject',
      async install(host) {
        host.plugins.use('asyncPartial', { partial: true });
        await delay(5);
        throw new Error('async failure');
      },
    }),
    api.ApexifyPluginError
  );
  assert.equal(painter.plugins.has('asyncPartial'), false);

  // Rollback is scoped to mutations performed in the failing plugin's async context.
  // Unrelated application registry writes that interleave while the plugin awaits must survive.
  painter.plugins.use('preexistingApi', { version: 1 });
  let releaseFailure;
  const failureGate = new Promise((resolve) => { releaseFailure = resolve; });
  const isolatedFailure = painter.use({
    name: 'isolated-rollback',
    async install(host) {
      host.plugins.use('transactionApi', { temporary: true });
      host.plugins.remove('preexistingApi');
      await failureGate;
      throw new Error('transaction failure');
    },
  });
  await delay(0);
  painter.plugins.use('externalConcurrentApi', { keep: true });
  releaseFailure();
  await assert.rejects(isolatedFailure, api.ApexifyPluginError);
  assert.equal(painter.plugins.has('transactionApi'), false, 'plugin-created API must roll back');
  assert.equal(painter.plugins.get('preexistingApi').version, 1, 'plugin-removed API must be restored');
  assert.equal(painter.plugins.get('externalConcurrentApi').keep, true, 'unrelated concurrent registry write must survive rollback');

  // Same-name concurrent install is rejected while the first is pending.
  const slow = painter.use({ name: 'slow-plugin', async install() { await delay(15); } });
  await assert.rejects(painter.use({ name: 'slow-plugin', install() {} }), api.ApexifyPluginError);
  await slow;

  // Different installs are serialized so plugin transactions cannot overlap.
  const order = [];
  const first = painter.use({
    name: 'order-a',
    async install(host) {
      order.push('a-start');
      await delay(10);
      host.plugins.use('orderA', { ok: true });
      order.push('a-end');
    },
  });
  const second = painter.use({
    name: 'order-b',
    install(host) {
      order.push('b');
      host.plugins.use('orderB', { ok: true });
    },
  });
  await Promise.all([first, second]);
  assert.deepEqual(order, ['a-start', 'a-end', 'b']);
  assert.equal(painter.plugins.has('orderA'), true);
  assert.equal(painter.plugins.has('orderB'), true);

  // Registry collision failure preserves pre-existing APIs transactionally.
  painter.plugins.use('stableApi', { version: 1 });
  await assert.rejects(
    painter.use({ name: 'collision-plugin', install(host) { host.plugins.use('stableApi', { version: 2 }); } }),
    api.ApexifyPluginError
  );
  assert.equal(painter.plugins.get('stableApi').version, 1);
  assert.equal(painter.plugins.isInstalled('collision-plugin'), false);

  assert.ok(painter.plugins.list().includes('stableApi'));
  assert.ok(painter.plugins.listInstalled().includes('async-plugin'));
  assert.equal(painter.plugins.remove('stableApi'), true);
  assert.equal(painter.plugins.has('stableApi'), false);

  console.log('phase6-plugins: async lifecycle, duplicate, ordering, rejection, isolated rollback and registry semantics passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
