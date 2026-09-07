'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const api = require('../.build/phase12-entry.cjs');

test('process timeout escalates through kill grace when a child ignores SIGTERM', async () => {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  await assert.rejects(
    runner.runFfmpeg([
      '-e',
      'process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},1000);',
    ], { timeoutMs: 100, killGraceMs: 10, maxStdoutBytes: 1024, maxStderrBytes: 1024 }),
    (error) => error instanceof api.MediaProcessError && error.timedOut === true
  );
});

test('stderr observer isolates non-Error throws and progress parser clamps boundary values', async () => {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  const result = await runner.runFfmpeg(['-e', 'process.stderr.write("progress-line")'], {
    timeoutMs: 5000,
    maxStderrBytes: 1024,
    onStderr() { throw 'observer-string-failure'; },
  });
  assert.equal(result.exitCode, 0);

  const bounded = [];
  const parseBounded = api.createFfmpegProgressParser((value) => bounded.push(value), 2);
  parseBounded('=ignored\nout_time_us=5000000\nspeed=3x\nprogress=continue\n');
  assert.equal(bounded.at(-1).percent, 100);
  assert.equal(bounded.at(-1).time, 5);
  assert.equal(bounded.at(-1).speed, 3);

  const unknownDuration = [];
  const parseUnknown = api.createFfmpegProgressParser((value) => unknownDuration.push(value));
  parseUnknown('out_time_ms=250000\nspeed=1.5x\nprogress=end\n');
  assert.equal(unknownDuration.at(-1).percent, 0);
  assert.equal(unknownDuration.at(-1).time, 0.25);
  assert.equal(unknownDuration.at(-1).speed, 1.5);
});