'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase8/phase8-entry.cjs');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'pipe', timeout: 60_000 });
}

function probe(file) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], { encoding: 'utf8', timeout: 30_000 });
  const parsed = JSON.parse(raw);
  const video = parsed.streams.find((stream) => stream.codec_type === 'video');
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');
  const [num, den] = String(video?.avg_frame_rate || video?.r_frame_rate || '0/1').split('/').map(Number);
  return {
    duration: Number(parsed.format.duration || 0),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: den ? num / den : 0,
    videoCodec: video?.codec_name,
    audioCodec: audio?.codec_name,
    audio: Boolean(audio),
  };
}

function approx(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: expected ${expected}±${tolerance}, got ${actual}`);
}

function makeVideo(file, { width, height, duration, frequency, rate = 24, audio = true, hue = 0 }) {
  const video = `testsrc2=size=${width}x${height}:rate=${rate}:duration=${duration},hue=h=${hue}`;
  const args = ['-f', 'lavfi', '-i', video];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`);
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '96k', '-shortest'); else args.push('-an');
  args.push('-y', file);
  ffmpeg(args);
}

function makeWav(file, duration = 1.2) {
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=880:sample_rate=48000:duration=${duration}`, '-c:a', 'pcm_s16le', '-y', file]);
}

function makeWatermark() {
  const canvas = createCanvas(32, 18);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff00ff';
  ctx.fillRect(0, 0, 32, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(4, 4, 24, 10);
  return canvas.toBuffer('image/png');
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}
function close(server) { return new Promise((resolve) => server.close(resolve)); }

async function testProcessAbortAndCleanup(root) {
  const runner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
  const controller = new AbortController();
  const started = Date.now();
  const pending = runner.runFfmpeg(['-e', 'setTimeout(() => {}, 10000)'], { signal: controller.signal, timeoutMs: 20_000 });
  setTimeout(() => controller.abort(new Error('phase8 abort')), 60);
  await assert.rejects(pending, (error) => error && error.aborted === true);
  assert.ok(Date.now() - started < 4000, 'aborted child process must terminate promptly');

  let workspaceDir;
  await assert.rejects(
    api.withTempWorkspace({ rootDirectory: root, prefix: 'phase8-cleanup-' }, async (workspace) => {
      workspaceDir = workspace.directory;
      await workspace.writeFile('partial.bin', Buffer.alloc(1024));
      throw new Error('cleanup challenge');
    }),
    /cleanup challenge/
  );
  assert.equal(fs.existsSync(workspaceDir), false, 'temporary workspace must be removed on failure');
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase8-video-'));
  const tempRoot = path.join(dir, 'temp-root');
  fs.mkdirSync(tempRoot, { recursive: true });
  const sourceA = path.join(dir, 'source-a.mp4');
  const sourceB = path.join(dir, 'source-b.mp4');
  const sourceC = path.join(dir, 'source-c.mp4');
  const wav = path.join(dir, 'overlay.wav');
  makeVideo(sourceA, { width: 160, height: 90, duration: 2.0, frequency: 440, rate: 24, audio: true, hue: 0 });
  makeVideo(sourceB, { width: 120, height: 120, duration: 1.4, frequency: 550, rate: 30, audio: false, hue: 90 });
  makeVideo(sourceC, { width: 96, height: 64, duration: 1.7, frequency: 660, rate: 15, audio: true, hue: 180 });
  makeWav(wav);
  const wavBytes = fs.readFileSync(wav);
  const painter = new api.ApexPainter();

  try {
    const info = await painter.video.getVideoInfo(sourceA);
    assert.equal(info.width, 160);
    assert.equal(info.height, 90);
    assert.equal(info.audio, true);
    assert.equal(typeof info.codec, 'string');
    approx(info.duration, 2, 0.15, 'metadata duration');

    const converted = path.join(dir, 'converted.mp4');
    await painter.createVideo({
      source: sourceA,
      convert: { outputPath: converted, format: 'mp4', videoCodec: 'libx264', audioCodec: 'aac', fps: 20, resolution: { width: 128, height: 72, fit: 'contain' } },
    });
    const convertedInfo = probe(converted);
    assert.equal(convertedInfo.width, 128);
    assert.equal(convertedInfo.height, 72);
    assert.equal(convertedInfo.audio, true);
    approx(convertedInfo.fps, 20, 0.1, 'converted fps');

    const trimmed = path.join(dir, 'trimmed.mp4');
    await painter.createVideo({ source: sourceA, trim: { startTime: 0.25, endTime: 1.25, outputPath: trimmed, mode: 'accurate' } });
    approx(probe(trimmed).duration, 1.0, 0.16, 'accurate trim duration');

    const copiedTrim = path.join(dir, 'trim-copy.mp4');
    await painter.createVideo({ source: sourceA, trim: { startTime: 0, endTime: 1, outputPath: copiedTrim, mode: 'copy' } });
    assert.ok(probe(copiedTrim).duration > 0.5, 'copy trim must create a valid keyframe-bound clip');

    const grid = path.join(dir, 'grid.mp4');
    await painter.createVideo({
      source: sourceA,
      merge: {
        videos: [sourceA, sourceB, sourceC], outputPath: grid, mode: 'grid',
        grid: { cols: 2, rows: 2, cellWidth: 96, cellHeight: 54, gap: 0, background: '#000000' }, audioPolicy: 'mix',
      },
    });
    const gridInfo = probe(grid);
    assert.equal(gridInfo.width, 192);
    assert.equal(gridInfo.height, 108);
    assert.equal(gridInfo.audio, true);
    approx(gridInfo.duration, 1.4, 0.2, 'grid shortest duration');

    const sequential = path.join(dir, 'sequential.mp4');
    await painter.createVideo({ source: sourceA, merge: { videos: [sourceA, sourceB], outputPath: sequential, mode: 'sequential', audioPolicy: 'preserve' } });
    const sequentialInfo = probe(sequential);
    assert.equal(sequentialInfo.audio, true, 'sequential preserve must synthesize silence for missing-audio clips');
    approx(sequentialInfo.duration, 3.4, 0.25, 'sequential duration');

    const watermarked = path.join(dir, 'watermarked.mp4');
    await painter.createVideo({
      source: sourceA,
      addWatermark: { watermarkPath: makeWatermark(), position: 'bottom-right', opacity: 0.65, size: { width: 32, height: 18, fit: 'contain' }, marginX: 3, marginY: 4, startTime: 0.2, endTime: 1.5, outputPath: watermarked },
    });
    const wmInfo = probe(watermarked);
    assert.equal(wmInfo.audio, true);
    approx(wmInfo.duration, 2, 0.16, 'watermark duration');

    const speed = path.join(dir, 'speed.mp4');
    await painter.createVideo({ source: sourceA, changeSpeed: { speed: 2, outputPath: speed } });
    const speedInfo = probe(speed);
    approx(speedInfo.duration, 1.0, 0.18, '2x speed duration');
    assert.equal(speedInfo.audio, true);

    const replaced = path.join(dir, 'replaced.mp4');
    await painter.createVideo({
      source: sourceA,
      replaceSegment: { replacementVideo: sourceB, targetStartTime: 0.5, targetEndTime: 1.0, durationPolicy: 'fit', outputPath: replaced },
    });
    const replacedInfo = probe(replaced);
    approx(replacedInfo.duration, 2.0, 0.22, 'fit replacement duration');
    assert.equal(replacedInfo.audio, true, 'replacement must preserve continuous audio timeline');

    const mixed = path.join(dir, 'mixed.mp4');
    await painter.createVideo({
      source: sourceA,
      mixAudio: {
        outputPath: mixed,
        overlays: [{ source: wavBytes, startTime: 0.2, duration: 0.9, volume: 0.5, pan: -0.25, fadeIn: 0.1, fadeOut: 0.1, speed: 1.25, pitchSemitones: 2 }],
        keepOriginalAudio: true, originalVolume: 0.75, durationPolicy: 'video',
      },
    });
    const mixedInfo = probe(mixed);
    assert.equal(mixedInfo.audio, true);
    approx(mixedInfo.duration, 2, 0.2, 'mixed audio duration policy');

    const textOut = path.join(dir, 'text.mp4');
    const unicodeText = 'Apexify “مرحبا”\nline 2: \'quoted\' ✓';
    await painter.createVideo({
      source: sourceA,
      addTextOverlay: {
        outputPath: textOut,
        overlays: [{
          text: unicodeText, x: 8, y: 12,
          font: { size: 16, family: 'Arial' }, fill: { color: '#ffffff' },
          startTime: 0.1, endTime: 1.6, overlayOpacity: 0.9,
          transitionIn: { type: 'fade', duration: 0.2 }, transitionOut: { type: 'slideRight', duration: 0.2 },
        }],
      },
    });
    assert.equal(probe(textOut).audio, true);

    const pipelineOut = path.join(dir, 'pipeline.mp4');
    const pipeline = painter.video.videoPipeline(sourceA);
    pipeline.trim(0.1, 1.8);
    pipeline.text({ text: 'Pipeline ✓', x: 6, y: 10, font: { size: 14, family: 'Arial' }, fill: { color: '#00ffcc' }, startTime: 0.1, endTime: 1.2 }, 'caption');
    pipeline.audio({ type: 'file', source: wavBytes, startTime: 0.15, duration: 0.6, volume: 0.35, pan: 0.2 }, { keepOriginalAudio: true, durationPolicy: 'video' }, 'sound');
    assert.equal(pipeline.canUndo(), true);
    const snapshot = pipeline.toJSON();
    assert.equal(snapshot.version, 1);
    assert.ok(snapshot.layers.length >= 4);
    assert.equal(pipeline.undo(), true);
    assert.equal(pipeline.canRedo(), true);
    assert.equal(pipeline.redo(), true);
    const pipelineResult = await pipeline.render({ outputPath: pipelineOut, overwrite: true });
    assert.deepEqual(pipelineResult.executionPlan, ['trim', 'text', 'audio']);
    assert.equal(pipelineResult.passes, 3);
    assert.equal(probe(pipelineOut).audio, true);

    await assert.rejects(
      painter.createVideo({ source: sourceA, convert: { outputPath: converted, format: 'mp4' }, overwrite: false }),
      /overwrite|exists|exited/i,
      'overwrite=false must refuse an existing output'
    );

    const frame = await painter.video.extractFrameAtTime(sourceA, 0.5, 'png', 2);
    assert.ok(Buffer.isBuffer(frame) && frame.length > 100, 'single frame extraction must return image bytes');
    const multi = await painter.video.extractMultipleFrames(sourceA, [0.2, 0.8], 'jpg', 2);
    assert.equal(multi.length, 2);
    assert.ok(multi.every((item) => Buffer.isBuffer(item) && item.length > 100));

    await testProcessAbortAndCleanup(tempRoot);

    const remoteBytes = fs.readFileSync(sourceA);
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': remoteBytes.length });
      const chunk = 16 * 1024;
      let offset = 0;
      const push = () => {
        if (offset >= remoteBytes.length) { res.end(); return; }
        res.write(remoteBytes.subarray(offset, Math.min(remoteBytes.length, offset + chunk)));
        offset += chunk;
        setImmediate(push);
      };
      push();
    });
    const port = await listen(server);
    try {
      api.configureApexifyRuntime({
        network: { trustedNetworkAccess: true, allowedHosts: ['127.0.0.1'], retryAttempts: 1, timeoutMs: 3000 },
        temp: { rootDirectory: tempRoot },
      });
      const remotePainter = new api.ApexPainter();
      const remoteInfo = await remotePainter.video.getVideoInfo(`http://127.0.0.1:${port}/source.mp4`);
      assert.equal(remoteInfo.width, 160);
      assert.equal(api.getRemoteConcurrencyStats().active, 0);
      const leftovers = fs.readdirSync(tempRoot).filter((name) => name.startsWith('apexify-'));
      assert.deepEqual(leftovers, [], 'remote video probe must cleanup streamed workspace');

      api.configureApexifyRuntime({ limits: { maxRemoteVideoBytes: Math.max(1, remoteBytes.length - 1) } });
      await assert.rejects(
        remotePainter.video.getVideoInfo(`http://127.0.0.1:${port}/too-large.mp4`),
        (error) => error && error.code === 'APEXIFY_RESOURCE_LIMIT'
      );
    } finally {
      await close(server);
      api.resetApexifyRuntimeConfig();
    }

    console.log('phase8-video: probe, transcode, trim, generalized grid, audio continuity, overlays, replacement, pipeline history, extraction, cancellation, cleanup and streamed remote input passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
