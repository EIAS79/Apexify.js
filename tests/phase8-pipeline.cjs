'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createCanvas } = require('@napi-rs/canvas');
const api = require('../node_modules/.cache/apexify-phase8/phase8-entry.cjs');

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'pipe', timeout: 60_000 });
}

function makeVideo(file, { width = 160, height = 90, duration = 2, audio = true, frequency = 440 } = {}) {
  const args = ['-f', 'lavfi', '-i', `testsrc2=size=${width}x${height}:rate=24:duration=${duration}`];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${duration}`);
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '96k', '-shortest'); else args.push('-an');
  args.push('-y', file);
  ffmpeg(args);
}

function makeWav(file, duration = 0.35) {
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=880:sample_rate=48000:duration=${duration}`, '-c:a', 'pcm_s16le', '-y', file]);
}

function makeFrame(seed) {
  const canvas = createCanvas(80, 45);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${40 + seed * 50}, ${80 + seed * 30}, ${120 + seed * 20})`;
  ctx.fillRect(0, 0, 80, 45);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(8 + seed * 4, 8, 22, 20);
  return canvas.toBuffer('image/png');
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-phase8-pipeline-'));
  const tempRoot = path.join(dir, 'tmp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const sourcePath = path.join(dir, 'source.mp4');
  const replacementPath = path.join(dir, 'replacement.mp4');
  const wavPath = path.join(dir, 'tone.wav');
  makeVideo(sourcePath, { duration: 2, audio: true, frequency: 440 });
  makeVideo(replacementPath, { width: 96, height: 64, duration: 0.8, audio: false, frequency: 660 });
  makeWav(wavPath);

  const source = fs.readFileSync(sourcePath);
  const replacement = fs.readFileSync(replacementPath);
  const wav = fs.readFileSync(wavPath);
  const frameA = makeFrame(1);
  const frameB = makeFrame(2);
  const operations = new api.VideoOperations(api.createFfmpegSession({ tempDirectory: tempRoot }));
  const pipeline = new api.VideoPipeline(operations);

  try {
    // Every advertised layer operation: source, trim, splice(video + frames), text and audio.
    pipeline.source(source);
    pipeline.trim(0, 1.8, 'trim');
    pipeline.trim(0.1, 1.7, 'trim'); // same stable id replaces instead of duplicating

    pipeline.splice({
      targetStartTime: 1.0,
      targetEndTime: 1.2,
      replacementFrames: [frameA, frameB],
      replacementFps: 12,
      durationPolicy: 'fit',
    }, 'late');
    pipeline.splice({
      targetStartTime: 0.25,
      targetEndTime: 0.45,
      replacementVideo: replacement,
      replacementStartTime: 0.05,
      replacementDuration: 0.25,
      durationPolicy: 'fit',
    }, 'early');

    pipeline.text({
      text: 'first', x: 5, y: 8, font: { size: 13, family: 'Arial' }, fill: { color: '#ffffff' }, startTime: 0.05, endTime: 0.8,
    }, 'titles');
    pipeline.text({
      text: 'second', x: 5, y: 24, font: { size: 13, family: 'Arial' }, fill: { color: '#00ffcc' }, startTime: 0.4, endTime: 1.4,
    }, 'titles'); // same text id merges overlays

    pipeline.audio([
      { type: 'file', source: wav, startTime: 0.05, duration: 0.25, volume: 0.12, pan: -0.2, fadeIn: 0.03, fadeOut: 0.03 },
      { type: 'preset', preset: 'beep', startTime: 0.3, gain: 0.12, volume: 0.4 },
      { type: 'synth', sound: { layers: [{ waveform: 'sine', frequency: 330, duration: 0.18, gain: 0.15 }], channels: 1 }, startTime: 0.55, gain: 0.12 },
      { type: 'sequence', events: [{ at: 0, preset: 'click', gain: 0.12 }], startTime: 0.8, tail: 0.03, masterGain: 0.2 },
      { type: 'wav', wav, startTime: 1.0, volume: 0.08 },
    ], { keepOriginalAudio: true, originalVolume: 0.7, durationPolicy: 'video' }, 'mix');
    pipeline.audio({ type: 'file', source: wavPath, startTime: 1.25, duration: 0.2, volume: 0.08 }, { keepOriginalAudio: true, durationPolicy: 'video' }, 'mix'); // same audio id merges tracks

    const layers = pipeline.getLayers();
    assert.equal(layers.filter((layer) => layer.kind === 'source').length, 1);
    assert.equal(layers.filter((layer) => layer.kind === 'trim').length, 1);
    assert.equal(layers.find((layer) => layer.kind === 'trim').startTime, 0.1);
    assert.equal(layers.find((layer) => layer.kind === 'text' && layer.id === 'titles').overlays.length, 2);
    assert.equal(layers.find((layer) => layer.kind === 'audio' && layer.id === 'mix').tracks.length, 6);

    pipeline.pushLayer({
      kind: 'text', id: 'replaceable', overlays: [{
        text: 'old', x: 2, y: 2, font: { size: 10, family: 'Arial' }, fill: { color: '#ffffff' }, startTime: 0, endTime: 0.3,
      }],
    });
    pipeline.pushLayer({
      kind: 'text', id: 'replaceable', overlays: [{
        text: 'replacement', x: 2, y: 2, font: { size: 10, family: 'Arial' }, fill: { color: '#ffffff' }, startTime: 0, endTime: 0.3,
      }],
    }, { replace: true });
    assert.equal(pipeline.getLayers().find((layer) => layer.id === 'replaceable').overlays[0].text, 'replacement');

    const beforeRemove = pipeline.getLayers().length;
    pipeline.removeLayer('replaceable');
    assert.equal(pipeline.getLayers().length, beforeRemove - 1);
    assert.equal(pipeline.undo(), true);
    assert.equal(pipeline.getLayers().length, beforeRemove);
    assert.equal(pipeline.canRedo(), true);
    assert.equal(pipeline.redo(), true);
    assert.equal(pipeline.getLayers().length, beforeRemove - 1);

    const textCount = pipeline.getLayers().filter((layer) => layer.kind === 'text').length;
    pipeline.clearLayers('text');
    assert.equal(pipeline.getLayers().some((layer) => layer.kind === 'text'), false);
    assert.equal(pipeline.undo(), true);
    assert.equal(pipeline.getLayers().filter((layer) => layer.kind === 'text').length, textCount);

    // Versioned snapshots must survive a real JSON stringify/parse round-trip, including Buffer-backed sources/tracks.
    const snapshot = pipeline.toJSON();
    assert.equal(snapshot.version, 1);
    const parsedSnapshot = JSON.parse(JSON.stringify(snapshot));
    const restored = api.VideoPipeline.fromJSON(operations, parsedSnapshot);
    const restoredLayers = restored.getLayers();
    assert.ok(Buffer.isBuffer(restoredLayers.find((layer) => layer.kind === 'source').source));
    assert.ok(Buffer.isBuffer(restoredLayers.find((layer) => layer.kind === 'splice' && layer.id === 'early').replacementVideo));
    assert.ok(restoredLayers.find((layer) => layer.kind === 'splice' && layer.id === 'late').replacementFrames.every(Buffer.isBuffer));
    assert.ok(Buffer.isBuffer(restoredLayers.find((layer) => layer.kind === 'audio').tracks.find((track) => track.type === 'wav').wav));
    assert.throws(() => api.VideoPipeline.fromJSON(operations, { version: 99, layers: snapshot.layers }), /Unsupported videoPipeline snapshot version/);

    // Invalid edit must be transactional.
    const stableLength = restored.getLayers().length;
    assert.throws(() => restored.splice({
      targetStartTime: 0.3,
      targetEndTime: 0.5,
      replacementVideo: replacement,
      durationPolicy: 'fit',
    }, 'overlap'), /must not overlap/);
    assert.equal(restored.getLayers().length, stableLength);

    const output = path.join(dir, 'pipeline-preview.mp4');
    let progressEvents = 0;
    const result = await restored.render({ outputPath: output, preset: 'preview', overwrite: true, onProgress: () => { progressEvents += 1; } });
    assert.deepEqual(result.executionPlan, ['trim', 'splice:early', 'splice:late', 'text', 'audio', 'preview']);
    assert.equal(result.passes, 6);
    assert.equal(result.success, true);
    assert.ok(progressEvents > 0, 'pipeline must forward FFmpeg progress callbacks');
    const outputInfo = probe(output);
    assert.equal(outputInfo.video, true);
    assert.equal(outputInfo.audio, true);
    assert.ok(outputInfo.duration > 1.3 && outputInfo.duration < 1.9, `unexpected pipeline duration ${outputInfo.duration}`);

    await assert.rejects(restored.render({ outputPath: output, overwrite: false }), /exist|overwrite/i);
    assert.deepEqual(fs.readdirSync(tempRoot), [], 'pipeline workspaces must be cleaned after success and refusal');

    console.log('phase8-pipeline: all layer kinds, stable IDs, merge/replace semantics, history, JSON Buffer revival, deterministic splice order, preview pass, progress and cleanup passed.');
  } finally {
    api.resetApexifyRuntimeConfig();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});