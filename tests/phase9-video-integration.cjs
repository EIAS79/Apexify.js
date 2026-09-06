'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const api = require('../node_modules/.cache/apexify-phase9/phase9-entry.cjs');

function run(executable, args) {
  return execFileSync(executable, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
}

async function main() {
  api.resetApexifyRuntimeConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase9-video-'));
  const source = path.join(dir, 'source.mp4');
  const output = path.join(dir, 'with-procedural-audio.mp4');
  try {
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=160x90:rate=24:duration=1.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', '-y', source]);
    const painter = new api.ApexPainter();
    const pipeline = painter.video.videoPipeline(source);
    pipeline.audio(
      { type: 'preset', preset: 'beep', startTime: 0.1, gain: 0.25 },
      { keepOriginalAudio: false, durationPolicy: 'video' }
    );
    pipeline.audio(
      {
        type: 'synth',
        startTime: 0.45,
        gain: 0.2,
        sound: {
          sampleRate: 32000,
          channels: 1,
          seed: 'phase9-video',
          layers: [{ waveform: 'sine', frequency: 660, duration: 0.2, gain: 0.3 }],
        },
      },
      { keepOriginalAudio: false, durationPolicy: 'video' }
    );
    const result = await pipeline.render({ outputPath: output, overwrite: true });
    assert.ok(result.success);
    assert.ok(fs.statSync(output).size > 0);
    const probe = JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output]));
    assert.ok(probe.streams.some((stream) => stream.codec_type === 'video'), 'video stream must remain present');
    assert.ok(probe.streams.some((stream) => stream.codec_type === 'audio'), 'procedural audio must be muxed into the video');
    const duration = Number(probe.format.duration);
    assert.ok(duration > 1 && duration < 1.4, `video duration must remain close to source duration, received ${duration}`);
    console.log(`PHASE9_VIDEO_INTEGRATION ${JSON.stringify({ outputBytes: fs.statSync(output).size, duration, executionPlan: result.executionPlan })}`);
    console.log('phase9-video-integration: procedural preset + seeded synth WAV generation fed Phase 8 audio mixing successfully.');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    api.resetApexifyRuntimeConfig();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
