'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

test('process runner treats hostile shell syntax as inert argv data', async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-argv-'));
  try {
    const marker = path.join(dir, 'PWNED');
    const payloads = [
      `$(touch ${marker})`, '`touch PWNED`', `; touch ${marker}`, `& touch ${marker}`,
      `"quoted value"`, `'single quoted'`, 'spaces [brackets] ü λ 日本語',
    ];
    const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
    for (const payload of payloads) {
      const result = await runner.runFfmpeg(['-e', 'process.stdout.write(process.argv[1])', payload], {
        timeoutMs: 5000, maxStdoutBytes: 65536, maxStderrBytes: 65536,
      });
      assert.equal(result.stdout, payload);
      assert.equal(fs.existsSync(marker), false);
    }
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});

test('process runner has bounded output, timeout, abort and structured failures', async () => {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  await assert.rejects(
    runner.runFfmpeg(['-e', 'process.stdout.write("x".repeat(8192))'], { timeoutMs: 5000, maxStdoutBytes: 64 }),
    (error) => error instanceof api.MediaProcessError && error.outputLimitExceeded === true
  );
  await assert.rejects(
    runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 20 }),
    (error) => error instanceof api.MediaProcessError && error.timedOut === true
  );
  const controller = new AbortController();
  const pending = runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 5000, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error) => error instanceof api.MediaProcessError && error.aborted === true);
  await assert.rejects(
    runner.runFfmpeg(['-e', 'process.stderr.write("diagnostic");process.exit(7)'], { timeoutMs: 5000 }),
    (error) => error instanceof api.MediaProcessError && error.exitCode === 7 && /diagnostic/.test(error.stderr)
  );
});

test('temp workspaces are unique and cleanup is idempotent after success and throw', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-workspaces-'));
  try {
    const workspaces = await Promise.all(Array.from({ length: 16 }, () => api.createTempWorkspace({ rootDirectory: root, prefix: 'job-' })));
    assert.equal(new Set(workspaces.map((workspace) => workspace.directory)).size, workspaces.length);
    await Promise.all(workspaces.map((workspace, index) => workspace.writeFile(`x-${index}`, Buffer.from('x'))));
    await Promise.all(workspaces.map(async (workspace) => { await workspace.cleanup(); await workspace.cleanup(); }));
    assert.deepEqual(await fsp.readdir(root), []);

    await assert.rejects(api.withTempWorkspace({ rootDirectory: root, prefix: 'throw-' }, async (workspace) => {
      await workspace.writeFile('partial', Buffer.from('partial'));
      throw new Error('expected failure');
    }), /expected failure/);
    assert.deepEqual(await fsp.readdir(root), []);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('retained temp workspace is explicit and still manually cleanable', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-retain-'));
  try {
    const workspace = await api.createTempWorkspace({ rootDirectory: root, prefix: 'retain-', retainFiles: true });
    await workspace.writeFile('proof', Buffer.from('x'));
    await workspace.cleanup();
    assert.equal(fs.existsSync(workspace.directory), true);
    await fsp.rm(workspace.directory, { recursive: true, force: true });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
