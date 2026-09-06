'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else if (/\.(?:ts|js|cjs|mjs)$/.test(name)) out.push(full.replaceAll('\\', '/'));
  }
  return out;
}

const videoFiles = walk('lib-next/video');
assert.equal(videoFiles.includes('lib-next/video/video-helpers.ts'), false, 'monolithic VideoHelpers must not exist');

const operationFiles = [
  'runtime.ts', 'filter-graph.ts', 'transcode.ts', 'merge.ts', 'overlays.ts', 'audio.ts', 'frames.ts', 'structure.ts', 'advanced.ts',
];
for (const name of operationFiles) {
  assert.ok(fs.existsSync(`lib-next/video/operations/${name}`), `missing cohesive video operation module: ${name}`);
}

const sources = Object.fromEntries(videoFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]));
for (const [file, source] of Object.entries(sources)) {
  if (file !== 'lib-next/video/process-runner.ts') {
    assert.equal(/from\s+["'](?:node:)?child_process["']|require\(["'](?:node:)?child_process["']\)/.test(source), false, `${file} bypasses centralized process runner`);
  }
  assert.equal(/\bexecSync?\s*\(/.test(source), false, `${file} contains shell-style exec usage`);
  assert.equal(/\bspawnSync\s*\(/.test(source), false, `${file} contains direct synchronous process execution`);
}

const runner = sources['lib-next/video/process-runner.ts'];
assert.ok(runner.includes('spawn(executable, [...args]'), 'process runner must use argv-array spawn');
assert.ok(runner.includes('shell: false'), 'process runner must force shell:false');
assert.ok(runner.includes('SIGTERM') && runner.includes('SIGKILL'), 'process runner must implement graceful termination plus forced kill fallback');
assert.ok(runner.includes('createFfmpegProgressParser'), 'machine-readable progress parser is required');

const resolver = sources['lib-next/video/video-input-resolve.ts'];
assert.ok(resolver.includes('fetchRemoteMediaToFile'), 'remote video resolver must stream remote media to workspace files');
assert.equal(/fetchRemoteMedia\s*\(/.test(resolver), false, 'remote video resolver must not buffer full remote media through fetchRemoteMedia');
assert.ok(resolver.includes('resolveMediaInput'), 'local/buffer/video resolution must retain the central media policy');

const merge = sources['lib-next/video/operations/merge.ts'];
assert.ok(merge.includes('xstack=inputs=${infos.length}'), 'grid mode must use generalized xstack');
assert.ok(merge.includes('concat=n=${infos.length}:v=1'), 'sequential merge must use normalized concat graph');
assert.ok(merge.includes('anullsrc'), 'sequential audio continuity must synthesize silence for missing audio');

const creator = sources['lib-next/video/video-creator.ts'];
assert.equal(creator.includes('Helper3'), false, 'untyped helper dispatcher must be removed');
assert.equal(creator.includes('setHelperMethods'), false, 'setter-based helper injection must be removed');
assert.equal(creator.includes('setDependencies'), false, 'setter-based dependency injection must be removed');
assert.ok(creator.includes('validatePhase8VideoOptions'), 'Phase 8 supplemental validation gate missing');

const pipeline = sources['lib-next/video/video-pipeline-render.ts'];
assert.ok(pipeline.includes('operations.runtime.resolve'), 'pipeline source must route through central resolver');
assert.equal(/\^https\?:\\\/\\\//.test(pipeline), false, 'pipeline must not hand raw HTTP URLs directly to FFmpeg');
assert.ok(pipeline.includes('executionPlan'), 'pipeline must report deterministic execution plan');

const builder = sources['lib-next/video/video-pipeline-builder.ts'];
for (const required of ['undo()', 'redo()', 'canUndo()', 'canRedo()', 'version: 1']) {
  assert.ok(builder.includes(required), `pipeline history/version contract missing: ${required}`);
}

const options = fs.readFileSync('lib-next/video/video-options.ts', 'utf8');
for (const required of ['signal?: AbortSignal', 'timeoutMs?: number', 'overwrite?: boolean', 'durationPolicy?: "video" | "shortest" | "longest"', 'durationPolicy?: "fit" | "trim" | "preserve"']) {
  assert.ok(options.includes(required), `public Phase 8 video contract missing ${required}`);
}

console.log(`phase8-video-scan: ${videoFiles.length} video source files passed architecture, process, streaming, grid, pipeline and public-contract checks.`);
