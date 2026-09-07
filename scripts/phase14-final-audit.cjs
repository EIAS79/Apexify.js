'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourceRoot = path.join(root, 'lib-next');
const artifactsRoot = path.join(root, 'artifacts');

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:ts|mts|cts|js|mjs|cjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function locations(text, regex) {
  const found = [];
  for (const match of text.matchAll(regex)) {
    const line = text.slice(0, match.index).split('\n').length;
    found.push({ line, excerpt: match[0].slice(0, 120) });
  }
  return found;
}

const sourceFiles = walk(sourceRoot);
const violations = [];
const observations = {
  maps: [],
  promiseAll: [],
  largeFiles: [],
};

function addViolation(file, rule, matches) {
  for (const match of matches) violations.push({ file: rel(file), rule, ...match });
}

for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const relative = rel(file);
  const bytes = Buffer.byteLength(text);
  const lines = text.split('\n').length;

  const genericErrors = locations(text, /\bthrow\s+new\s+Error\s*\(/g);
  addViolation(file, 'structured-errors', genericErrors);

  const syncFs = locations(text, /\b(?:readFileSync|writeFileSync|appendFileSync|existsSync|statSync|lstatSync|readdirSync|accessSync|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|renameSync|copyFileSync|realpathSync|openSync|closeSync)\s*\(/g);
  addViolation(file, 'sync-runtime-fs', syncFs);

  const shellExec = locations(text, /(?<!\.)\b(?:exec|execSync)\s*\(/g);
  addViolation(file, 'shell-execution', shellExec);

  const childProcess = locations(text, /(?:from\s+['"]node:child_process['"]|require\(['"]node:child_process['"]\))/g);
  if (relative !== 'lib-next/video/process-runner.ts') addViolation(file, 'process-runner-bypass', childProcess);

  const directFetch = locations(text, /(?<![\w.])fetch\s*\(/g);
  addViolation(file, 'direct-fetch-bypass', directFetch);

  const axiosImport = locations(text, /(?:from\s+['"]axios['"]|require\(['"]axios['"]\))/g);
  addViolation(file, 'direct-axios-bypass', axiosImport);

  const rawHttp = locations(text, /(?:from\s+['"]node:https?['"]|require\(['"]node:https?['"]\))/g);
  if (!['lib-next/media/remote-fetch.ts', 'lib-next/media/network-policy.ts'].includes(relative)) {
    addViolation(file, 'network-policy-bypass', rawHttp);
  }

  const markers = locations(text, /\b(?:TODO|FIXME|HACK|XXX)\b|\bnot implemented\b/gi);
  addViolation(file, 'unfinished-marker', markers);

  const avoidableAny = locations(text, /(?:\bas\s+any\b|:\s*any\b|<any>)/g);
  addViolation(file, 'avoidable-any', avoidableAny);

  const consoleCalls = locations(text, /\bconsole\.(?:log|debug|info|warn|error)\s*\(/g);
  addViolation(file, 'runtime-console', consoleCalls);

  for (const match of locations(text, /\bnew\s+Map\s*</g)) observations.maps.push({ file: relative, ...match });
  for (const match of locations(text, /\bPromise\.all\s*\(/g)) observations.promiseAll.push({ file: relative, ...match });
  if (bytes >= 50 * 1024) observations.largeFiles.push({ file: relative, bytes, lines });
  if (bytes >= 100 * 1024) violations.push({ file: relative, rule: 'oversized-source-file', line: 1, excerpt: `${bytes} bytes` });
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packaging = {
  version: pkg.version,
  nodeEngine: pkg.engines?.node,
  npmEngine: pkg.engines?.npm,
  runtimeDependencies: Object.keys(pkg.dependencies || {}).sort(),
  exports: Object.keys(pkg.exports || {}).sort(),
  files: pkg.files || [],
};

function requireInvariant(condition, detail) {
  if (!condition) violations.push({ file: 'package.json', rule: 'package-invariant', line: 1, excerpt: detail });
}

requireInvariant(pkg.version === '6.0.0', `expected release-candidate version 6.0.0, got ${pkg.version}`);
requireInvariant(pkg.engines?.node === '22.x || 24.x || 26.x', `unexpected Node engine ${pkg.engines?.node}`);
requireInvariant(typeof pkg.scripts?.prepack === 'string' && pkg.scripts.prepack.includes('build'), 'prepack must rebuild package');
requireInvariant(typeof pkg.scripts?.prepublishOnly === 'string' && pkg.scripts.prepublishOnly.includes('verify:release'), 'prepublishOnly must run verify:release');
requireInvariant(pkg.files?.includes('dist') && pkg.files?.includes('LICENSE') && pkg.files?.includes('README.md') && pkg.files?.includes('CHANGELOG.md'), 'packed files allowlist is incomplete');
requireInvariant(fs.existsSync(path.join(root, 'package-lock.json')), 'package-lock.json must be committed');
requireInvariant(fs.existsSync(path.join(root, 'LICENSE')), 'LICENSE must be committed');
requireInvariant(pkg.exports?.['.']?.import?.default === './dist/esm/index.js', 'ESM root export mismatch');
requireInvariant(pkg.exports?.['.']?.require?.default === './dist/cjs/index.cjs', 'CJS root export mismatch');
requireInvariant(pkg.exports?.['.']?.import?.types === './dist/declarations/index.d.ts', 'ESM type declaration mismatch');
requireInvariant(pkg.exports?.['.']?.require?.types === './dist/declarations-cjs/index.d.cts', 'CJS type declaration mismatch');

const report = {
  schemaVersion: 1,
  phase: 14,
  generatedAt: new Date().toISOString(),
  sourceFiles: sourceFiles.length,
  violations,
  observations,
  packaging,
};

fs.mkdirSync(artifactsRoot, { recursive: true });
const nodeMajor = process.versions.node.split('.')[0];
const reportPath = path.join(artifactsRoot, `phase14-final-audit-node-${nodeMajor}.json`);
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (violations.length) {
  console.error(`Phase 14 final audit failed with ${violations.length} violation(s):`);
  for (const item of violations) console.error(`- ${item.file}:${item.line} [${item.rule}] ${item.excerpt}`);
  process.exitCode = 1;
} else {
  assert.equal(violations.length, 0);
  console.log(`Phase 14 final audit passed across ${sourceFiles.length} runtime source files.`);
  console.log(`Observed ${observations.maps.length} Map site(s), ${observations.promiseAll.length} Promise.all site(s), and ${observations.largeFiles.length} >=50 KiB source file(s) for manual classification.`);
  console.log(`Report: ${path.relative(root, reportPath)}`);
}
