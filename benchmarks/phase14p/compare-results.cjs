'use strict';

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const out = Object.create(null);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value !== undefined && !value.startsWith('--')) {
      out[key] = value;
      i += 1;
    } else out[key] = true;
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function percentChange(base, next) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(next)) return null;
  return Number((((next - base) / base) * 100).toFixed(2));
}

function sameFixtureDigests(a, b) {
  const keys = Object.keys(a || {});
  if (keys.length === 0 || keys.length !== Object.keys(b || {}).length) return false;
  return keys.every((key) => a[key]?.sha256 && a[key]?.sha256 === b[key]?.sha256);
}

function environmentMismatches(a, b) {
  const fields = ['node', 'platform', 'fontFamily', 'tz', 'locale'];
  const mismatches = [];
  for (const field of fields) {
    if (a?.[field] !== b?.[field]) mismatches.push({ field, phase0: a?.[field] ?? null, current: b?.[field] ?? null });
  }
  return mismatches;
}

function classify(delta) {
  if (delta === null) return 'unknown';
  if (delta <= -10) return 'material-improvement';
  if (delta < -5) return 'improvement';
  if (delta < 5) return 'within-5-percent';
  if (delta <= 10) return 'review-regression';
  return 'confirmed-regression-candidate';
}

function rowFor(base, current) {
  const baseMedian = base?.timing?.median ?? null;
  const currentMedian = current?.timing?.median ?? null;
  const delta = percentChange(baseMedian, currentMedian);
  return {
    name: current?.name || base?.name || 'unknown',
    phase0MedianMs: baseMedian,
    currentMedianMs: currentMedian,
    medianPercentChange: delta,
    classification: classify(delta),
    phase0P95Ms: base?.timing?.p95 ?? null,
    currentP95Ms: current?.timing?.p95 ?? null,
    phase0Cv: base?.timing?.coefficientOfVariation ?? null,
    currentCv: current?.timing?.coefficientOfVariation ?? null,
    phase0PeakRssMedianBytes: base?.memory?.peakRssBytes?.median ?? null,
    currentPeakRssMedianBytes: current?.memory?.peakRssBytes?.median ?? null,
    peakRssPercentChange: percentChange(base?.memory?.peakRssBytes?.median, current?.memory?.peakRssBytes?.median),
    phase0Output: base?.output?.representative ?? null,
    currentOutput: current?.output?.representative ?? null,
    stableOutputs: Boolean(base?.output?.stableWithinSubject && current?.output?.stableWithinSubject),
  };
}

function markdown(report) {
  const lines = [
    '# Phase 14-P normalized pre-recovery comparison',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| Workload | Phase 0 median | Current median | Change | P95 current | CV current | Peak RSS change | Classification |',
    '|---|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const row of report.rows) {
    const pct = row.medianPercentChange === null ? 'n/a' : `${row.medianPercentChange.toFixed(2)}%`;
    const rss = row.peakRssPercentChange === null ? 'n/a' : `${row.peakRssPercentChange.toFixed(2)}%`;
    lines.push(`| ${row.name} | ${row.phase0MedianMs ?? 'n/a'} ms | ${row.currentMedianMs ?? 'n/a'} ms | ${pct} | ${row.currentP95Ms ?? 'n/a'} ms | ${row.currentCv ?? 'n/a'} | ${rss} | ${row.classification} |`);
  }
  lines.push('', '## Measurement integrity', '');
  lines.push(`- environment match: ${report.integrity.environmentMatch ? 'PASS' : 'FAIL'}`);
  lines.push(`- deterministic fixture match: ${report.integrity.fixtureMatch ? 'PASS' : 'FAIL'}`);
  lines.push(`- stable within-subject outputs: ${report.integrity.stableOutputs ? 'PASS' : 'FAIL'}`);
  if (report.integrity.environmentMismatches.length > 0) {
    lines.push('- mismatches:');
    for (const mismatch of report.integrity.environmentMismatches) lines.push(`  - ${mismatch.field}: Phase 0=${mismatch.phase0} current=${mismatch.current}`);
  }
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.phase0 || !args.current || !args.output) {
  throw new Error('Usage: node compare-results.cjs --phase0 <json> --current <json> --output <json> [--markdown <md>]');
}

const phase0 = readJson(args.phase0);
const current = readJson(args.current);
const mismatches = environmentMismatches(phase0.environment, current.environment);
const fixtureMatch = sameFixtureDigests(phase0.fixtureDigests, current.fixtureDigests);
const baseMap = new Map((phase0.results || []).map((entry) => [entry.name, entry]));
const currentMap = new Map((current.results || []).map((entry) => [entry.name, entry]));
const names = [...new Set([...baseMap.keys(), ...currentMap.keys()])];
const rows = names.map((name) => rowFor(baseMap.get(name), currentMap.get(name)));
const stableOutputs = rows.every((row) => row.stableOutputs);

const report = {
  schemaVersion: 1,
  phase: '14-P',
  stage: 'pre-recovery-normalized-comparison',
  generatedAt: new Date().toISOString(),
  phase0Label: phase0.label,
  currentLabel: current.label,
  integrity: {
    environmentMatch: mismatches.length === 0,
    environmentMismatches: mismatches,
    fixtureMatch,
    stableOutputs,
  },
  rows,
};

const output = path.resolve(args.output);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
if (args.markdown) {
  const mdPath = path.resolve(args.markdown);
  fs.mkdirSync(path.dirname(mdPath), { recursive: true });
  fs.writeFileSync(mdPath, markdown(report));
}

for (const row of rows) console.log(`${row.name}: ${row.medianPercentChange}% (${row.classification})`);
if (!report.integrity.environmentMatch || !report.integrity.fixtureMatch || !report.integrity.stableOutputs) {
  console.error('Phase 14-P normalized comparison failed measurement-integrity checks.');
  process.exitCode = 1;
}
