'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve('lib-next/audio-synth');
const files = fs.readdirSync(root).filter((name) => name.endsWith('.ts')).sort();
const failures = [];
const allocationSites = [];

function fail(file, rule, match) { failures.push(`${file}: ${rule}${match ? ` (${match})` : ''}`); }

for (const file of files) {
  const full = path.join(root, file);
  const text = fs.readFileSync(full, 'utf8');
  if (file !== 'audio-random.ts' && /\bMath\.random\s*\(/.test(text)) fail(file, 'direct Math.random bypasses operation-local RNG architecture');
  if (/\bthrow\s+new\s+Error\s*\(/.test(text)) fail(file, 'generic Error used in audio subsystem');
  if (/\b(?:TODO|FIXME|XXX)\b/i.test(text)) fail(file, 'unfinished marker');
  if (/not implemented/i.test(text)) fail(file, 'not-implemented marker');
  if (/child_process|\bexec\s*\(|\bspawn\s*\(/.test(text)) fail(file, 'audio subsystem must not launch processes');
  for (const match of text.matchAll(/new\s+Float32Array\s*\([^\n]+/g)) allocationSites.push(`${file}: ${match[0].slice(0, 120)}`);
  for (const match of text.matchAll(/Buffer\.alloc\s*\([^\n]+/g)) allocationSites.push(`${file}: ${match[0].slice(0, 120)}`);
}

const limits = fs.readFileSync(path.resolve('lib-next/runtime/config.ts'), 'utf8');
const enforcement = fs.readFileSync(path.resolve('lib-next/runtime/limits.ts'), 'utf8') + fs.readFileSync(path.join(root, 'audio-validation.ts'), 'utf8');
for (const limit of ['maxAudioDurationSeconds', 'maxAudioSampleRate', 'maxAudioChannels', 'maxAudioEvents', 'maxAudioLayers', 'maxAudioPartials', 'maxAudioBytes']) {
  if (!limits.includes(limit)) failures.push(`runtime/config.ts: missing ${limit}`);
  if (!enforcement.includes(limit)) failures.push(`audio enforcement: ${limit} is defined but not enforced`);
}

const wav = fs.readFileSync(path.join(root, 'wav-encode.ts'), 'utf8');
for (const required of ['RIFF size does not match', 'invalid block alignment', 'invalid byte rate', 'missing fmt chunk', 'missing data chunk', 'odd-sized chunk']) {
  if (!wav.includes(required)) failures.push(`wav-encode.ts: missing hardening path ${JSON.stringify(required)}`);
}

const synth = fs.readFileSync(path.join(root, 'synthesizer.ts'), 'utf8');
for (const fn of ['synthesizeSound', 'synthesizePreset', 'synthesizeSequence', 'mixSynthSounds']) {
  if (!synth.includes(`function ${fn}`)) failures.push(`synthesizer.ts: missing ${fn}`);
}
if (!synth.includes('assertAudioWavResourceLimits')) failures.push('synthesizer.ts: missing pre-render WAV peak budget');

const compose = fs.readFileSync(path.join(root, 'compose.ts'), 'utf8');
if (!compose.includes('assertAudioWavResourceLimits')) failures.push('compose.ts: missing composition WAV peak budget');
if (/const\s+placements\s*=|placements\.push/.test(compose)) failures.push('compose.ts: old retain-all-placement architecture remains');

const engine = fs.readFileSync(path.join(root, 'engine.ts'), 'utf8');
if (/const\s+chunks\s*=|chunks\.push/.test(engine)) failures.push('engine.ts: old retain-all-sequence-event architecture remains');

if (failures.length) {
  console.error(`phase9-audio-scan failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`PHASE9_ALLOCATION_SITES ${JSON.stringify(allocationSites)}`);
console.log(`phase9-audio-scan: ${files.length} audio modules scanned; RNG bypass, generic errors, unfinished markers, old retained-buffer paths, WAV hardening, allocation sites, and limit enforcement passed.`);
