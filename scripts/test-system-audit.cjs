'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const entries = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full.replaceAll(path.sep, '/')];
  });
}

function classify(file) {
  if (/benchmarks\//.test(file) || /benchmark/i.test(path.basename(file))) return 'BENCHMARK';
  if (/tests\/golden\//.test(file) || /golden/i.test(path.basename(file))) return 'GOLDEN TEST';
  if (/tests\/security\//.test(file) || /security/i.test(path.basename(file))) return 'SECURITY TEST';
  if (/tests\/integration\//.test(file) || /tests\/audio-synth\//.test(file) || /video-integration|space-shooter|smoke/i.test(file)) return 'INTEGRATION TEST';
  if (/tests\/unit\//.test(file) || /tests\/helpers\//.test(file)) return 'PERMANENT TEST';
  if (/tests\/property\//.test(file) || /fuzz/i.test(path.basename(file))) return 'REGRESSION TEST';
  if (/tests\/phase\d+.*\.cjs$/.test(file) || /public-api-compat/.test(file)) return 'REGRESSION TEST';
  if (/tests\/.*-entry\.ts$/.test(file)) return 'PERMANENT TEST';
  // Retained historical root/fixture tests are regression evidence unless a stronger
  // category above applies. This deliberately classifies every test asset instead of
  // deleting useful pre-Phase-12 coverage because of its old filename/layout.
  if (/^tests\//.test(file)) return 'REGRESSION TEST';
  if (/scripts\/phase\d+.*scan/.test(file) || /maintenance-audit/.test(file)) return 'REGRESSION TEST';
  if (/scripts\/build-phase\d+-fixture|scripts\/build-security-fixture/.test(file)) return 'TEMPORARY PHASE TEST';
  if (/scripts\/build-test-fixture|scripts\/verify-packed-package|scripts\/test-system-audit/.test(file)) return 'PERMANENT TEST';
  return null;
}

const candidates = [
  ...walk('tests'),
  ...walk('benchmarks'),
  ...walk('scripts').filter((file) => /phase\d+|security|test|benchmark|fixture|scan|verify-packed|maintenance-audit/.test(file)),
];

for (const file of [...new Set(candidates)].sort()) {
  const classification = classify(file);
  entries.push({ file, classification: classification ?? 'UNCLASSIFIED' });
}

const unclassified = entries.filter((entry) => entry.classification === 'UNCLASSIFIED');
const counts = Object.fromEntries([...new Set(entries.map((entry) => entry.classification))].sort().map((name) => [name, entries.filter((entry) => entry.classification === name).length]));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  counts,
  entries,
  unclassified: unclassified.map((entry) => entry.file),
};
fs.mkdirSync(path.join(ROOT, 'artifacts'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts', 'test-system-audit.json'), JSON.stringify(report, null, 2) + '\n');

if (unclassified.length) {
  console.error(`test-system-audit: ${unclassified.length} candidate test assets are unclassified:\n${unclassified.map((entry) => `- ${entry.file}`).join('\n')}`);
  process.exit(1);
}
console.log(`test-system-audit: classified ${entries.length} test/fixture/scanner/benchmark assets.`);
console.log(JSON.stringify(counts));
