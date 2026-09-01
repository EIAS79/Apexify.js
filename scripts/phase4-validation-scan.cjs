'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const libRoot = path.join(root, 'lib-next');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const config = read('lib-next/runtime/config.ts');
const renderLimitsBody = config.match(/export interface RenderLimits\s*\{([\s\S]*?)\n\}/);
assert.ok(renderLimitsBody, 'RenderLimits interface must exist');
const limitKeys = [...renderLimitsBody[1].matchAll(/^\s*(\w+)\s*:\s*number\s*;/gm)].map((m) => m[1]);
assert.ok(limitKeys.length >= 20, `expected comprehensive RenderLimits, found ${limitKeys.length}`);

const nonConfigSource = walk(libRoot)
  .filter((file) => path.relative(root, file) !== 'lib-next/runtime/config.ts')
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');

for (const key of limitKeys) {
  assert.ok(nonConfigSource.includes(key), `RenderLimits.${key} has no enforcement/reference outside config.ts`);
}

const requiredBoundaries = [
  ['canvas façade', 'lib-next/apex-painter/creates/canvas-create.ts', /validateCanvasConfig\s*\(/],
  ['image façade', 'lib-next/apex-painter/creates/image-text-create.ts', /validateImageInput\s*\(/],
  ['text façade', 'lib-next/apex-painter/creates/image-text-create.ts', /validateTextInput\s*\(/],
  ['scene core', 'lib-next/scene/scene-creator.ts', /validateSceneRenderInput\s*\(/],
  ['GIF generated frames', 'lib-next/gif/gif-creator.ts', /validateGeneratedGIFFrame\s*\(/],
  ['audio façade', 'lib-next/audio-synth/painter-create-audio.ts', /validateSynthSoundOptions\s*\(/],
  ['video creator guard', 'lib-next/video/video-stack.ts', /validateVideoCreationOptions\s*\(/],
  ['video pipeline guard', 'lib-next/video/video-pipeline-render.ts', /validateVideoPipelineLayers\s*\(/],
  ['chart façade', 'lib-next/chart/chart-creator.ts', /validateChartRequest\s*\(/],
  ['image utilities', 'lib-next/image/painter-image-utils.ts', /validateResizeInputs\s*\(/],
  ['batch concurrency', 'lib-next/batch/batch-operations.ts', /maxBatchConcurrency/],
  ['decoded image budget', 'lib-next/image/image-properties.ts', /maxDecodedImagePixels/],
];

for (const [label, rel, pattern] of requiredBoundaries) {
  assert.match(read(rel), pattern, `${label} is missing its Phase 4 validation boundary`);
}

const scene = read('lib-next/scene/scene-creator.ts');
assert.doesNotMatch(scene, /options\?\.validate\s*!==\s*false/, 'scene safety validation must not be disableable');

const batch = read('lib-next/batch/batch-operations.ts');
assert.doesNotMatch(batch, /Promise\.all\s*\(\s*operations\.map/, 'batch operations must not fan out without a concurrency bound');
assert.match(batch, /mapWithConcurrency/, 'batch operations must use bounded concurrency');

const gif = read('lib-next/gif/gif-creator.ts');
assert.match(gif, /assertGifResourceLimits/, 'GIF creator must enforce final resource cost before encoder allocation');

const ffprobe = read('lib-next/video/ffprobe-metadata.ts');
assert.match(ffprobe, /validateVideoProbeMetadata\s*\(metadata\)/, 'probed video metadata must be governed before transforms');

console.log(`phase4-validation-scan: ${limitKeys.length} limits and ${requiredBoundaries.length} public/core boundaries verified.`);
