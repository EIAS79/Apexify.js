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
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

function finiteArg(name, raw, fallback) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite.`);
  return value;
}

function percentChange(base, current) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(current)) return null;
  return ((current - base) / base) * 100;
}

const args = parseArgs(process.argv.slice(2));
if (!args.comparison) {
  throw new Error('Usage: node assert-text-recovery.cjs --comparison <post-recovery-comparison.json> [--median-target -10] [--p95-target -10] [--max-cv 0.10] [--max-rss-change 10]');
}

const medianTarget = finiteArg('median-target', args['median-target'], -10);
const p95Target = finiteArg('p95-target', args['p95-target'], -10);
const maxCv = finiteArg('max-cv', args['max-cv'], 0.10);
const maxRssChange = finiteArg('max-rss-change', args['max-rss-change'], 10);
const report = JSON.parse(fs.readFileSync(path.resolve(args.comparison), 'utf8'));

if (!report?.integrity?.environmentMatch || !report?.integrity?.fixtureMatch || !report?.integrity?.stableOutputs) {
  throw new Error('Text recovery gate requires a normalized comparison with all measurement-integrity checks passing.');
}

const row = (report.rows || []).find((entry) => entry.name === 'text-render');
if (!row) throw new Error('Normalized comparison is missing the text-render workload.');

const p95Change = percentChange(row.phase0P95Ms, row.currentP95Ms);
const failures = [];
if (!Number.isFinite(row.medianPercentChange) || row.medianPercentChange > medianTarget) {
  failures.push(`median change ${row.medianPercentChange}% did not meet ${medianTarget}% target`);
}
if (!Number.isFinite(p95Change) || p95Change > p95Target) {
  failures.push(`P95 change ${p95Change === null ? 'n/a' : p95Change.toFixed(2)}% did not meet ${p95Target}% target`);
}
if (!Number.isFinite(row.currentCv) || row.currentCv > maxCv) {
  failures.push(`current CV ${row.currentCv} exceeded ${maxCv}`);
}
if (!Number.isFinite(row.peakRssPercentChange) || row.peakRssPercentChange > maxRssChange) {
  failures.push(`peak RSS change ${row.peakRssPercentChange}% exceeded +${maxRssChange}% allowance`);
}
if (!row.stableOutputs) failures.push('within-subject output stability failed');

console.log('Phase 14-P normalized text recovery gate');
console.log(`median: Phase0=${row.phase0MedianMs} ms current=${row.currentMedianMs} ms change=${row.medianPercentChange}% target<=${medianTarget}%`);
console.log(`P95: Phase0=${row.phase0P95Ms} ms current=${row.currentP95Ms} ms change=${p95Change === null ? 'n/a' : p95Change.toFixed(2)}% target<=${p95Target}%`);
console.log(`CV: current=${row.currentCv} max=${maxCv}`);
console.log(`peak RSS change=${row.peakRssPercentChange}% max=+${maxRssChange}%`);
console.log(`stable outputs=${row.stableOutputs}`);

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exitCode = 1;
} else {
  console.log('Phase 14-P normalized text recovery gate: PASS');
}
