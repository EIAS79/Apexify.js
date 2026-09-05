'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const api = require('../node_modules/.cache/apexify-phase8/phase8-entry.cjs');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'pipe', timeout: 60_000 });
}

function makeVideo(file, duration = 1) {
  ffmpeg([
    '-f', 'lavfi', '-i', `testsrc2=size=96x54:rate=24:duration=${duration}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${duration}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-shortest', '-y', file,
  ]);
}

function makeAudioOnly(file, duration = 0.5) {
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=660:sample_rate=48000:duration=${duration}`, '-c:a', 'pcm_s16le', '-y', file]);
}

function probe(file) {
  const parsed = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8', timeout: 30_000 }));
  return {
    duration: Number(parsed.format.duration || 0),
    audio: parsed.streams.some((stream) => stream.codec_type === 'audio'),
    video: parsed.streams.some((stream) => stream.codec_type === 'video'),
  };
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase8-edges-'));
  const source = path.join(dir, 'source.mp4');
  const audioOnly = path.join(dir, 'audio-only.wav');
  const malformed = path.join(dir, 'malformed.mp4');
  makeVideo(source, 1);
  makeAudioOnly(audioOnly);
  fs.writeFileSync(malformed, Buffer.from('not a media container\0\xff\x00', 'latin1'));
  const painter = new api.ApexPainter();

  try {
    await assert.rejects(
      painter.video.getVideoInfo(audioOnly),
      /decodable video stream|video stream|video/i,
      'audio-only input must be rejected as no-video metadata'
    );
    await assert.rejects(
      painter.video.getVideoInfo(malformed),
      /ffprobe|decode|process|video|invalid/i,
      'malformed media must fail metadata probing'
    );

    const timeoutRunner = new api.MediaProcessRunner({ ffmpegPath: process.execPath, ffprobePath: process.execPath });
    const started = Date.now();
    await assert.rejects(
      timeoutRunner.runFfmpeg(['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 80 }),
      (error) => Boolean(error && error.timedOut === true),
      'process timeout must terminate a hung child'
    );
    assert.ok(Date.now() - started < 4000, 'timed-out child process must terminate promptly');

    const slow = path.join(dir, 'speed-slow.mp4');
    await painter.createVideo({ source, changeSpeed: { speed: 0.125, outputPath: slow } });
    const slowInfo = probe(slow);
    assert.equal(slowInfo.video, true);
    assert.equal(slowInfo.audio, true);
    assert.ok(slowInfo.duration > 7.2 && slowInfo.duration < 8.8, `0.125x speed expected ~8s, got ${slowInfo.duration}`);

    const fast = path.join(dir, 'speed-fast.mp4');
    await painter.createVideo({ source, changeSpeed: { speed: 16, outputPath: fast } });
    const fastInfo = probe(fast);
    assert.equal(fastInfo.video, true);
    assert.equal(fastInfo.audio, true);
    assert.ok(fastInfo.duration > 0 && fastInfo.duration < 0.3, `16x speed expected a short valid file, got ${fastInfo.duration}`);

    const effects = path.join(dir, 'effects-all.mp4');
    await painter.createVideo({
      source,
      applyEffects: {
        outputPath: effects,
        filters: [
          { type: 'blur', intensity: 1 },
          { type: 'brightness', value: 5 },
          { type: 'contrast', value: 5 },
          { type: 'saturation', value: 5 },
          { type: 'grayscale' },
          { type: 'sepia' },
          { type: 'invert' },
          { type: 'sharpen', intensity: 0.5 },
          { type: 'noise', intensity: 2 },
        ],
      },
    });
    const effectsInfo = probe(effects);
    assert.equal(effectsInfo.video, true);
    assert.equal(effectsInfo.audio, true);
    assert.ok(effectsInfo.duration > 0.8 && effectsInfo.duration < 1.2);

    await assert.rejects(
      painter.createVideo({ source, changeSpeed: { speed: 0.124, outputPath: path.join(dir, 'too-slow.mp4') } }),
      /between 0\.125 and 16|speed/i,
      'speed below supported minimum must be rejected before FFmpeg'
    );
    await assert.rejects(
      painter.createVideo({ source, changeSpeed: { speed: 16.001, outputPath: path.join(dir, 'too-fast.mp4') } }),
      /between 0\.125 and 16|speed/i,
      'speed above supported maximum must be rejected before FFmpeg'
    );

    console.log('phase8-edges: no-video/malformed metadata, timeout termination, extreme audio speeds, all advertised effects, and speed bounds passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});