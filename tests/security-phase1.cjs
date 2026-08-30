const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

const {
  MediaProcessRunner,
  MediaProcessError,
  redactUrlSecrets,
  createTempWorkspace,
  withTempWorkspace,
  writeSafeConcatList,
  assertSafeFilterExpression,
  uploadImgur,
  VideoStack,
} = require('../node_modules/.cache/apexify-security/security-phase1-entry.cjs');

async function expectReject(promise, predicate, label) {
  let error;
  try { await promise; } catch (e) { error = e; }
  assert.ok(error, `${label}: expected rejection`);
  if (predicate) assert.ok(predicate(error), `${label}: unexpected error ${String(error)}`);
  return error;
}

async function testArgvNoShell() {
  const parent = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-security-argv-'));
  try {
    const marker = path.join(parent, 'SHOULD_NOT_EXIST');
    const payloads = [
      `$(touch ${marker})`,
      `; touch ${marker}`,
      `" && touch ${marker} && "`,
      `' ; touch ${marker} ; '`,
      `spaces unicode-λ-日本語 $HOME * ? [abc]`,
    ];
    const runner = new MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
    for (const payload of payloads) {
      const result = await runner.runFfmpeg(['-e', 'process.stdout.write(process.argv[1])', payload], {
        timeoutMs: 5_000,
        maxStdoutBytes: 64 * 1024,
        maxStderrBytes: 64 * 1024,
      });
      assert.equal(result.stdout, payload, 'argv payload must reach child unchanged');
      assert.equal(fs.existsSync(marker), false, 'shell metacharacters must never execute');
    }
  } finally {
    await fsp.rm(parent, { recursive: true, force: true });
  }
}

async function testRunnerLimitsAndAbort() {
  const runner = new MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  const timeoutError = await expectReject(
    runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { timeoutMs: 50 }),
    (e) => e instanceof MediaProcessError && e.timedOut === true,
    'runner timeout'
  );
  assert.equal(timeoutError.aborted, false);

  await expectReject(
    runner.runFfmpeg(['-e', 'process.stdout.write("x".repeat(10000))'], { maxStdoutBytes: 128, timeoutMs: 5_000 }),
    (e) => e instanceof MediaProcessError && e.outputLimitExceeded === true,
    'runner output bound'
  );

  const controller = new AbortController();
  const pending = runner.runFfmpeg(['-e', 'setTimeout(()=>{}, 1000)'], { signal: controller.signal, timeoutMs: 5_000 });
  setTimeout(() => controller.abort(), 20);
  await expectReject(
    pending,
    (e) => e instanceof MediaProcessError && e.aborted === true,
    'runner abort'
  );
}

async function testUrlRedaction() {
  const input = 'failed https://cdn.example.test/media.png?token=TOP_SECRET&sig=abc#frag now';
  const redacted = redactUrlSecrets(input);
  assert.match(redacted, /https:\/\/cdn\.example\.test\/media\.png/);
  assert.doesNotMatch(redacted, /TOP_SECRET|sig=|#frag/);
}

async function testWorkspaceIsolationAndCleanup() {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-security-workspace-root-'));
  try {
    const workspaces = await Promise.all(
      Array.from({ length: 24 }, () => createTempWorkspace({ rootDirectory: root, prefix: 'concurrent-' }))
    );
    assert.equal(new Set(workspaces.map((w) => w.directory)).size, workspaces.length, 'workspace paths must be unique');
    await Promise.all(workspaces.map((w, i) => w.writeFile(`file-${i}.txt`, Buffer.from(String(i)))));
    await Promise.all(workspaces.map((w) => w.cleanup()));
    assert.deepEqual(await fsp.readdir(root), [], 'explicit cleanup must remove all workspaces');

    await expectReject(
      withTempWorkspace({ rootDirectory: root, prefix: 'failure-' }, async (workspace) => {
        await workspace.writeFile('partial.bin', Buffer.from('partial'));
        throw new Error('intentional failure');
      }),
      (e) => e instanceof Error && e.message === 'intentional failure',
      'workspace failure cleanup'
    );
    assert.deepEqual(await fsp.readdir(root), [], 'finally cleanup must run after failure');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

async function testSafeConcatManifest() {
  const sourceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-security-concat-src-'));
  const workspace = await createTempWorkspace({ prefix: 'apexify-security-concat-' });
  try {
    const sources = [
      path.join(sourceRoot, `clip ' quoted ; $() ü.mp4`),
      path.join(sourceRoot, `clip spaces [brackets].mp4`),
    ];
    for (const [i, source] of sources.entries()) await fsp.writeFile(source, Buffer.from(`clip-${i}`));
    const manifest = await writeSafeConcatList(workspace, sources);
    const text = await fsp.readFile(manifest, 'utf8');
    assert.match(text, /^file 'concat-input-0000\.mp4'\nfile 'concat-input-0001\.mp4'\n$/);
    for (const source of sources) assert.equal(text.includes(path.basename(source)), false, 'user filename must not enter concat syntax');
  } finally {
    await workspace.cleanup();
    await fsp.rm(sourceRoot, { recursive: true, force: true });
  }
}

function testFilterExpressionValidation() {
  assert.equal(assertSafeFilterExpression('if(lt(t,1),0,w/2)'), 'if(lt(t,1),0,w/2)');
  for (const unsafe of [
    '0;movie=/tmp/pwn',
    '[evil]overlay',
    "1' : movie=x",
    '1\\;drawtext=text=pwn',
    'system(t)',
    '0\nmovie=x',
  ]) {
    assert.throws(() => assertSafeFilterExpression(unsafe), /unsafe|unsupported/i);
  }
}

async function testNoCredentialFallbackAtRuntime() {
  const keys = ['IMGUR_CLIENT_ID', 'IMGUR_CLIENT_SECRET', 'IMGUR_ACCESS_TOKEN', 'IMGUR_REFRESH_TOKEN'];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) delete process.env[key];
    const error = await expectReject(
      uploadImgur(Buffer.from('not-uploaded')),
      (e) => /credentials are required/i.test(e.message),
      'Imgur missing credentials'
    );
    assert.doesNotMatch(error.message, /[A-Fa-f0-9]{24,}/, 'credential error must not leak secret-shaped material');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

async function ffmpegAvailable() {
  const runner = new MediaProcessRunner();
  try {
    await runner.runFfmpeg(['-version'], { timeoutMs: 5_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024 });
    await runner.runFfprobe(['-version'], { timeoutMs: 5_000, maxStdoutBytes: 1024 * 1024, maxStderrBytes: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function testRealFfmpegHostilePathsAndCleanup() {
  if (!(await ffmpegAvailable())) {
    console.log('security-phase1: FFmpeg integration skipped (ffmpeg/ffprobe unavailable)');
    return;
  }

  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-security-ffmpeg-fixture-'));
  const tempRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'apexify-security-ffmpeg-temp-'));
  const previousTemp = process.env.APEXIFY_TEMP_DIR;
  process.env.APEXIFY_TEMP_DIR = tempRoot;
  try {
    const marker = path.join(fixtureRoot, 'SHOULD_NOT_EXIST');
    const input = path.join(fixtureRoot, `input ' ; $() ü.mp4`);
    const output = path.join(fixtureRoot, `output ' ; $(touch SHOULD_NOT_EXIST) ü.mp4`);
    const generator = new MediaProcessRunner();
    await generator.runFfmpeg([
      '-f', 'lavfi', '-i', 'color=c=black:s=32x32:d=0.4',
      '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
      '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', input,
    ], { timeoutMs: 30_000, maxStdoutBytes: 2 * 1024 * 1024, maxStderrBytes: 10 * 1024 * 1024 });

    const stack = new VideoStack();
    await stack.creator.createVideo({ source: input, convert: { outputPath: output, quality: 'medium' } });
    assert.equal(fs.existsSync(output), true, 'hostile/unicode output filename must work as an argv token');
    assert.equal(fs.existsSync(marker), false, 'hostile output path must not execute shell content');
    assert.deepEqual(await fsp.readdir(tempRoot), [], 'successful video operation must clean its workspace');

    await expectReject(
      stack.creator.createVideo({ source: Buffer.from('not-a-video'), convert: { outputPath: path.join(fixtureRoot, 'bad.mp4') } }),
      () => true,
      'failed FFmpeg operation'
    );
    assert.deepEqual(await fsp.readdir(tempRoot), [], 'failed video operation must clean its workspace');
  } finally {
    if (previousTemp === undefined) delete process.env.APEXIFY_TEMP_DIR;
    else process.env.APEXIFY_TEMP_DIR = previousTemp;
    await fsp.rm(fixtureRoot, { recursive: true, force: true });
    await fsp.rm(tempRoot, { recursive: true, force: true });
  }
}

(async () => {
  await testArgvNoShell();
  await testRunnerLimitsAndAbort();
  await testUrlRedaction();
  await testWorkspaceIsolationAndCleanup();
  await testSafeConcatManifest();
  testFilterExpressionValidation();
  await testNoCredentialFallbackAtRuntime();
  await testRealFfmpegHostilePathsAndCleanup();
  console.log('security-phase1: all security regression tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
