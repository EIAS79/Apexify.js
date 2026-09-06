'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const failures = [];
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

const required = [
  'tests/phase10-runtime.cjs',
  'tests/phase10-collage-semantics.cjs',
  'tests/phase10-fuzz.cjs',
  'tests/phase10-golden.cjs',
  'tests/phase10-benchmark.cjs',
  'scripts/build-phase10-fixture.mjs',
  'lib-next/path/path-validation.ts',
  'lib-next/image/image-utilities.ts',
];
for (const file of required) if (!exists(file)) failures.push(`missing required Phase 10 artifact: ${file}`);

if (exists('lib-next/core/general-functions.ts')) failures.push('obsolete mixed lib-next/core/general-functions.ts still exists');

const pkg = JSON.parse(read('package.json'));
if (!pkg.scripts?.['test:phase10']) failures.push('package.json does not expose test:phase10');
if (!String(pkg.scripts?.test || '').includes('test:phase10')) failures.push('npm test does not enforce test:phase10');
for (const test of ['phase10-runtime.cjs','phase10-collage-semantics.cjs','phase10-fuzz.cjs','phase10-golden.cjs','phase10-benchmark.cjs']) {
  if (!String(pkg.scripts?.['test:phase10'] || '').includes(test)) failures.push(`test:phase10 does not enforce ${test}`);
}

const outputFiles = [
  'lib-next/output/save-buffer.ts',
  'lib-next/output/buffer-encoding.ts',
  'lib-next/output/compression.ts',
  'lib-next/output/stitch.ts',
];
for (const file of outputFiles) {
  const text = read(file);
  if (/\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|rmSync)\s*\(/.test(text)) {
    failures.push(`${file}: synchronous filesystem call remains on a public output/render path`);
  }
}

const imageUtils = read('lib-next/image/image-utilities.ts');
if (/\baxios\b|\bfetch\s*\(/.test(imageUtils)) failures.push('image utilities bypass shared remote transport');
if (/\bMath\.random\s*\(/.test(imageUtils)) failures.push('image utilities contain nondeterministic Math.random');

const pathValidation = read('lib-next/path/path-validation.ts');
for (const command of ['moveTo','lineTo','arc','arcTo','quadraticCurveTo','bezierCurveTo','rect','ellipse','closePath','circle','roundedRect','polygon','star','arrow']) {
  if (!pathValidation.includes(`case "${command}"`)) failures.push(`path validation does not explicitly cover ${command}`);
}

const chartValidation = read('lib-next/chart/chart-validation.ts');
for (const chart of ['pie','bar','horizontalBar','line','scatter','radar','polarArea']) {
  if (!chartValidation.includes(`case "${chart}"`)) failures.push(`chart semantic validation does not explicitly cover ${chart}`);
}
for (const composite of ['validateCombo', 'validateComparison']) {
  if (!chartValidation.includes(`function ${composite}`)) failures.push(`chart semantic validation missing ${composite}`);
}
const phase10Runtime = read('tests/phase10-runtime.cjs');
for (const surface of ['createComboChart', 'createComparisonChart']) {
  if (!phase10Runtime.includes(surface)) failures.push(`Phase 10 runtime suite does not exercise ${surface}`);
}

const batch = read('lib-next/batch/batch-operations.ts');
for (const token of ['maxBatchConcurrency', 'AbortSignal', 'signal', 'concurrency']) {
  if (!batch.includes(token)) failures.push(`batch/chain implementation missing ${token} governance`);
}

const bufferEncoding = read('lib-next/output/buffer-encoding.ts');
if (!/function base64[\s\S]*toString\("base64"\)/.test(bufferEncoding)) failures.push('raw base64 implementation missing');
if (!/data:\$\{mime\};base64/.test(bufferEncoding)) failures.push('data URL implementation missing MIME-prefixed encoding');
if (!/source\.buffer\.slice\(source\.byteOffset, source\.byteOffset \+ source\.byteLength\)/.test(bufferEncoding)) failures.push('ArrayBuffer exact-slice semantics missing');

const stitch = read('lib-next/output/stitch.ts');
if (!/function shortestColumn\s*\(/.test(stitch) || !/masonryPositions\s*\(/.test(stitch)) {
  failures.push('collage masonry does not expose shortest-column placement implementation');
}
if (/["']custom["']/.test(read('lib-next/types/batch.ts'))) failures.push('misleading custom collage layout remains in public type surface');

if (failures.length) {
  console.error('Phase 10 completeness self-challenge failed:\n' + failures.map((f) => ` - ${f}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 10 completeness self-challenge passed.');
}
