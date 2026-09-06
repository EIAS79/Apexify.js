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

test('process runner validates executable and argv tokens and path mutation', async () => {
  assert.throws(() => new api.MediaProcessRunner({ ffmpegPath: '' }), api.ApexifyProcessError);
  assert.throws(() => new api.MediaProcessRunner({ ffprobePath: 'bad\0path' }), api.ApexifyProcessError);
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  assert.deepEqual(runner.getExecutablePaths(), { ffmpegPath: process.execPath, ffprobePath: process.execPath });
  assert.throws(() => runner.setExecutablePaths({ ffmpegPath: 'bad\0path' }), api.ApexifyProcessError);
  runner.setExecutablePaths({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  assert.throws(() => runner.runExecutable('', []), api.ApexifyProcessError);
  assert.throws(() => runner.runExecutable(process.execPath, ['bad\0arg']), api.ApexifyProcessError);
  const probe = await runner.runFfprobe(['-e', 'process.stdout.write("probe")'], { timeoutMs: 5000 });
  assert.equal(probe.stdout, 'probe');
});

test('process runner has bounded output, timeout, pre-abort, abort and structured failures', async () => {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  await assert.rejects(
    runner.runFfmpeg(['-e', 'process.stdout.write("x".repeat(8192))'], { timeoutMs: 5000, maxStdoutBytes: 64 }),
    (error) => error instanceof api.MediaProcessError && error.outputLimitExceeded === true
  );
  await assert.rejects(
    runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 20 }),
    (error) => error instanceof api.MediaProcessError && error.timedOut === true
  );
  const pre = new AbortController();
  pre.abort(new Error('pre-abort'));
  await assert.rejects(
    runner.runFfmpeg(['-e', 'process.exit(0)'], { signal: pre.signal }),
    (error) => error instanceof api.MediaProcessError && error.aborted === true && error.exitCode === null
  );
  const controller = new AbortController();
  const pending = runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 5000, signal: controller.signal });
  setTimeout(() => controller.abort(), 10);
  await assert.rejects(pending, (error) => error instanceof api.MediaProcessError && error.aborted === true);
  await assert.rejects(
    runner.runFfmpeg(['-e', 'process.stderr.write("diagnostic https://x.test/a?token=SECRET");process.exit(7)'], { timeoutMs: 5000, maxStderrBytes: 32 }),
    (error) => error instanceof api.MediaProcessError && error.exitCode === 7 && !/SECRET/.test(error.stderr)
  );
  await assert.rejects(
    runner.runExecutable(path.join(os.tmpdir(), 'definitely-missing-apexify-executable'), [], { timeoutMs: 1000 }),
    (error) => error instanceof api.MediaProcessError && error.exitCode === null
  );
});

test('stderr callback isolation and FFmpeg progress parsing are deterministic', async () => {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  const chunks = [];
  const result = await runner.runFfmpeg(['-e', 'process.stderr.write("one\\ntwo\\n")'], {
    timeoutMs: 5000,
    maxStderrBytes: 1024,
    onStderr(chunk) { chunks.push(chunk); throw new Error('observer failure'); },
  });
  assert.equal(result.exitCode, 0);
  assert.ok(chunks.length >= 1);

  const progress = [];
  const parse = api.createFfmpegProgressParser((value) => progress.push(value), 2);
  parse('out_time_us=500000\nspeed=2x\nprogress=continue\nout_time_ms=1500000\n');
  parse('speed=bad\nprogress=end\n');
  assert.equal(progress[0].time, 0.5);
  assert.equal(progress[0].speed, 2);
  assert.equal(progress.at(-1).percent, 100);
  const noop = api.createFfmpegProgressParser();
  assert.doesNotThrow(() => noop('anything'));
});

test('temp workspaces are unique, path-confined and cleaned after success and throw', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-workspaces-'));
  try {
    const workspaces = await Promise.all(Array.from({ length: 16 }, () => api.createTempWorkspace({ rootDirectory: root, prefix: 'job-' })));
    assert.equal(new Set(workspaces.map((workspace) => workspace.directory)).size, workspaces.length);
    assert.throws(() => workspaces[0].path('../escape'), /may not escape/i);
    assert.throws(() => workspaces[0].path(path.resolve(root, 'absolute')), /relative path/i);
    assert.throws(() => workspaces[0].path('nul\0name'), /NUL/i);
    assert.throws(() => workspaces[0].path(''), /non-empty relative/i);
    const nested = await workspaces[0].ensureDirectory('nested/a');
    assert.equal(fs.existsSync(nested), true);
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

test('retained temp workspace is explicit and requires explicit caller removal', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-phase12-retain-'));
  try {
    const workspace = await api.createTempWorkspace({ rootDirectory: root, prefix: 'retain-', retain: true });
    await workspace.writeFile('proof', Buffer.from('x'));
    await workspace.cleanup();
    assert.equal(workspace.retain, true);
    assert.equal(fs.existsSync(workspace.directory), true);
    await fsp.rm(workspace.directory, { recursive: true, force: true });
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});
