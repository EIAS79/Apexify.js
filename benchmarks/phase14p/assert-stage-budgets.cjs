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

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), 'utf8'));
}

function pct(base, current) {
  if (!Number.isFinite(base) || base === 0 || !Number.isFinite(current)) return null;
  return ((current - base) / base) * 100;
}

const args = parseArgs(process.argv.slice(2));
if (!args.baseline || !args.current) {
  throw new Error('Usage: node assert-stage-budgets.cjs --baseline <baseline.json> --current <stage-benchmarks.json>');
}

const baseline = readJson(args.baseline);
const current = readJson(args.current);
const failures = [];
const warnings = [];

function fail(message) { failures.push(message); console.error(`FAIL: ${message}`); }
function warn(message) { warnings.push(message); console.warn(`REVIEW: ${message}`); }

if (baseline.schemaVersion !== current.schemaVersion) {
  fail(`schema mismatch baseline=${baseline.schemaVersion} current=${current.schemaVersion}.`);
}
if (current.phase !== '14-P') fail(`unexpected current phase ${String(current.phase)}.`);
const nodeMajor = Number(String(current.environment?.node || '').match(/^v?(\d+)/)?.[1]);
if (nodeMajor !== baseline.environment?.nodeMajor) {
  fail(`Node major mismatch baseline=${baseline.environment?.nodeMajor} current=${nodeMajor}.`);
}
if (current.environment?.platform !== baseline.environment?.platform) {
  fail(`platform mismatch baseline=${baseline.environment?.platform} current=${current.environment?.platform}.`);
}
if (current.environment?.fontFamily !== baseline.environment?.fontFamily) {
  fail(`font mismatch baseline=${baseline.environment?.fontFamily} current=${current.environment?.fontFamily}.`);
}

const policy = baseline.policy || {};
const medianFailPct = Number(policy.medianRegressionPercentFail ?? 10);
const p95ReviewPct = Number(policy.p95RegressionPercentReview ?? 10);
const p95FailPct = Number(policy.p95RegressionPercentFail ?? 25);
const microMedianSlack = Number(policy.microMedianAbsoluteSlackMsUnder1 ?? 0.15);
const smallMedianSlack = Number(policy.smallMedianAbsoluteSlackMsUnder5 ?? 0.30);
const microP95Slack = Number(policy.microP95AbsoluteSlackMsUnder2 ?? 0.50);

for (const [id, budget] of Object.entries(baseline.budgets || {})) {
  const result = current.budgets?.[id];
  if (!result) { fail(`missing required permanent budget ${id}.`); continue; }
  const median = result.timing?.median;
  const p95 = result.timing?.p95;
  const cv = result.timing?.coefficientOfVariation;
  if (!Number.isFinite(median) || !Number.isFinite(p95)) {
    fail(`${id}: current median/P95 unavailable.`);
    continue;
  }

  const baseMedian = Number(budget.medianMs);
  const baseP95 = Number(budget.p95Ms);
  const medianPct = pct(baseMedian, median);
  const p95Pct = pct(baseP95, p95);
  const absoluteSlack = baseMedian < 1 ? microMedianSlack : (baseMedian < 5 ? smallMedianSlack : 0);
  const medianCeiling = Math.max(baseMedian * (1 + medianFailPct / 100), baseMedian + absoluteSlack);
  const p95AbsoluteSlack = baseP95 < 2 ? microP95Slack : 0;
  const p95Ceiling = Math.max(baseP95 * (1 + p95FailPct / 100), baseP95 + p95AbsoluteSlack);

  console.log(`${id}: median=${median.toFixed(4)} ms baseline=${baseMedian.toFixed(4)} ms change=${medianPct?.toFixed(2) ?? 'n/a'}% ceiling=${medianCeiling.toFixed(4)} ms; P95=${p95.toFixed(4)} ms change=${p95Pct?.toFixed(2) ?? 'n/a'}%`);

  if (median > medianCeiling) {
    fail(`${id}: median ${median.toFixed(4)} ms exceeds ${medianCeiling.toFixed(4)} ms budget ceiling.`);
  } else if (medianPct !== null && medianPct >= 5) {
    warn(`${id}: median moved +${medianPct.toFixed(2)}%; review if repeated.`);
  }

  if (p95 > p95Ceiling) {
    fail(`${id}: P95 ${p95.toFixed(4)} ms exceeds ${p95Ceiling.toFixed(4)} ms confirmation ceiling.`);
  } else if (p95Pct !== null && p95Pct >= p95ReviewPct) {
    warn(`${id}: P95 moved +${p95Pct.toFixed(2)}%; review if repeated.`);
  }

  // CV is evidence, not a universal hard limit for sub-millisecond native operations.
  // Macro budgets must still be stable enough to serve as a regression control.
  if (baseMedian >= 5 && Number.isFinite(cv) && cv > 0.15) {
    fail(`${id}: macro-budget CV ${cv} exceeds 0.15.`);
  }
}

if (failures.length > 0) {
  console.error(`Phase 14-P permanent stage budget gate: FAIL (${failures.length} failure${failures.length === 1 ? '' : 's'}, ${warnings.length} review warning${warnings.length === 1 ? '' : 's'})`);
  process.exitCode = 1;
} else {
  console.log(`Phase 14-P permanent stage budget gate: PASS (${warnings.length} review warning${warnings.length === 1 ? '' : 's'})`);
}
