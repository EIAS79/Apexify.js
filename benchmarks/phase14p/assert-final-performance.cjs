'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { out[key] = next; i += 1; }
    else out[key] = true;
  }
  return out;
}

function percentChange(base, current) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(current)) return null;
  return ((current - base) / base) * 100;
}

function fail(message, failures) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

const args = parseArgs(process.argv.slice(2));
if (!args.comparison) throw new Error('Usage: node assert-final-performance.cjs --comparison <post-recovery-comparison.json>');
const report = JSON.parse(fs.readFileSync(path.resolve(String(args.comparison)), 'utf8'));
const failures = [];

if (!report.integrity?.environmentMatch) fail('normalized environment identity does not match.', failures);
if (!report.integrity?.fixtureMatch) fail('normalized deterministic fixtures do not match.', failures);
if (!report.integrity?.stableOutputs) fail('one or more normalized subjects produced unstable output.', failures);

const rows = new Map((report.rows || []).map((row) => [row.name, row]));
const required = [
  'cold-cjs-import',
  'canvas-1200x630',
  'text-render',
  'single-image-composition',
  'medium-scene',
  'chart-render',
  'gif-30-frame',
  'audio-10-second',
];
for (const name of required) {
  if (!rows.has(name)) fail(`missing normalized workload ${name}.`, failures);
}

for (const name of required) {
  const row = rows.get(name);
  if (!row) continue;
  if (!Number.isFinite(row.medianPercentChange)) fail(`${name}: median comparison is unavailable.`, failures);
  else if (row.medianPercentChange > 10) fail(`${name}: median regression ${row.medianPercentChange.toFixed(2)}% exceeds the absolute +10% Phase 14-P ceiling.`, failures);

  const p95Change = percentChange(row.phase0P95Ms, row.currentP95Ms);
  if (p95Change === null) fail(`${name}: P95 comparison is unavailable.`, failures);
  else if (p95Change > 10) fail(`${name}: P95 regression ${p95Change.toFixed(2)}% exceeds the +10% confirmation ceiling.`, failures);

  if (!Number.isFinite(row.currentCv)) fail(`${name}: CV is unavailable.`, failures);
  else if (row.currentCv > 0.10) fail(`${name}: CV ${row.currentCv} exceeds 0.10; measurement is too noisy for baseline freeze.`, failures);

  if (!row.stableOutputs) fail(`${name}: output is not stable within both normalized subjects.`, failures);
}

// P14-P minimum no-regression workloads. The plan's own regression policy treats
// <5% as normal hosted-runner variance, so equivalence is enforced at +5%, while
// >10% remains an unconditional failure above.
for (const name of ['canvas-1200x630', 'text-render', 'single-image-composition', 'medium-scene', 'chart-render', 'audio-10-second']) {
  const row = rows.get(name);
  if (row && row.medianPercentChange > 5) {
    fail(`${name}: ${row.medianPercentChange.toFixed(2)}% exceeds the +5% normalized no-regression equivalence band.`, failures);
  }
}

const cold = rows.get('cold-cjs-import');
if (cold && cold.medianPercentChange > -10) fail(`cold-cjs-import: ${cold.medianPercentChange.toFixed(2)}% does not preserve a material improvement.`, failures);

const gif = rows.get('gif-30-frame');
if (gif && gif.medianPercentChange > -5) fail(`gif-30-frame: ${gif.medianPercentChange.toFixed(2)}% does not preserve a normalized material improvement of at least 5%.`, failures);

// Memory is normally capped at +5%. Text has one explicitly bounded exception:
// the lossless fast PNG path may transiently hold up to 16 MiB of RGBA and is
// independently regression-tested to fall back to native Skia above that bound.
for (const name of required) {
  const row = rows.get(name);
  if (!row || row.peakRssPercentChange === null || row.peakRssPercentChange === undefined) continue;
  const maxRss = name === 'text-render' ? 10 : 5;
  if (row.peakRssPercentChange > maxRss) {
    fail(`${name}: peak RSS regression ${row.peakRssPercentChange.toFixed(2)}% exceeds its +${maxRss}% Phase 14-P budget.`, failures);
  }
}

console.log('Phase 14-P final normalized performance gate');
for (const name of required) {
  const row = rows.get(name);
  if (!row) continue;
  const p95Change = percentChange(row.phase0P95Ms, row.currentP95Ms);
  console.log(`${name}: median=${row.medianPercentChange.toFixed(2)}% p95=${p95Change?.toFixed(2) ?? 'n/a'}% cv=${row.currentCv} rss=${row.peakRssPercentChange ?? 'n/a'}%`);
}

if (failures.length > 0) {
  console.error(`Phase 14-P final normalized performance gate: FAIL (${failures.length} issue${failures.length === 1 ? '' : 's'})`);
  process.exitCode = 1;
} else {
  console.log('Phase 14-P final normalized performance gate: PASS');
}
