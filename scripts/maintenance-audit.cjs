#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'lib-next');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const strict = process.argv.includes('--strict');

const CODE_RE = /\.(?:[cm]?[jt]s|tsx)$/;
const TEXT_RE = /\.(?:md|[cm]?[jt]s|tsx|json|ya?ml)$/;
const PUBLIC_SOURCE_ENTRIES = new Set([
  'lib-next/index.ts',
  'lib-next/types/index.ts',
]);

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}
function rel(file) { return path.relative(ROOT, file).split(path.sep).join('/'); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function lineCount(text) { return text.length === 0 ? 0 : text.split(/\r?\n/).length; }

function moduleEdges(text) {
  const edges = [];
  const patterns = [
    { re: /\bimport\s+(type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g, typeOnlyGroup: 1, specGroup: 2 },
    { re: /\bexport\s+(type\s+)?(?:[^'";]*?\s+from\s*)['"]([^'"]+)['"]/g, typeOnlyGroup: 1, specGroup: 2 },
    { re: /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g, specGroup: 1 },
    { re: /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, specGroup: 1 },
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.re)) {
      edges.push({
        spec: match[pattern.specGroup],
        typeOnly: Boolean(pattern.typeOnlyGroup && match[pattern.typeOnlyGroup]),
      });
    }
  }
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.typeOnly ? 'T' : 'R'}:${edge.spec}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function packageRoot(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
}
function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}.d.ts`, path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(base, 'index.mts'), path.join(base, 'index.cts')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}
function tarjan(nodes, edges) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const sccs = [];
  function strongConnect(v) {
    indices.set(v, index);
    low.set(v, index++);
    stack.push(v);
    onStack.add(v);
    for (const w of edges.get(v) || []) {
      if (!indices.has(w)) { strongConnect(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), indices.get(w)));
    }
    if (low.get(v) === indices.get(v)) {
      const component = [];
      while (true) {
        const w = stack.pop();
        onStack.delete(w);
        component.push(w);
        if (w === v) break;
      }
      sccs.push(component);
    }
  }
  for (const node of nodes) if (!indices.has(node)) strongConnect(node);
  return sccs;
}
function isTypesModule(file) { return rel(file).startsWith('lib-next/types/'); }

const allFiles = walk(ROOT);
const codeFiles = allFiles.filter((f) => CODE_RE.test(f));
const sourceFiles = walk(SRC).filter((f) => CODE_RE.test(f));
const sourceSet = new Set(sourceFiles.map((f) => path.resolve(f)));
const sourceIncoming = new Map(sourceFiles.map((f) => [path.resolve(f), []]));
const repoIncoming = new Map(sourceFiles.map((f) => [path.resolve(f), []]));
const runtimeGraph = new Map(sourceFiles.map((f) => [path.resolve(f), []]));

for (const file of codeFiles) {
  const abs = path.resolve(file);
  for (const edge of moduleEdges(read(file))) {
    const resolved = resolveRelative(abs, edge.spec);
    if (!resolved || !sourceSet.has(path.resolve(resolved))) continue;
    const target = path.resolve(resolved);
    repoIncoming.get(target).push(abs);
    if (sourceSet.has(abs)) {
      sourceIncoming.get(target).push(abs);
      if (!edge.typeOnly && !isTypesModule(target)) runtimeGraph.get(abs).push(target);
    }
  }
}
for (const [file, deps] of runtimeGraph) runtimeGraph.set(file, [...new Set(deps)]);

const dependencySections = {
  dependencies: pkg.dependencies || {},
  devDependencies: pkg.devDependencies || {},
  optionalDependencies: pkg.optionalDependencies || {},
  peerDependencies: pkg.peerDependencies || {},
};
const declared = new Map();
for (const [section, entries] of Object.entries(dependencySections)) for (const name of Object.keys(entries)) declared.set(name, section);
const usage = {};
for (const name of declared.keys()) usage[name] = { source: [], tests: [], scripts: [], benchmarks: [], config: [], tooling: [], other: [] };
for (const file of codeFiles) {
  for (const edge of moduleEdges(read(file))) {
    const root = packageRoot(edge.spec);
    if (!root || !usage[root]) continue;
    const r = rel(file);
    let scope = 'other';
    if (r.startsWith('lib-next/')) scope = 'source';
    else if (r.startsWith('tests/')) scope = 'tests';
    else if (r.startsWith('scripts/')) scope = 'scripts';
    else if (r.startsWith('benchmarks/')) scope = 'benchmarks';
    usage[root][scope].push(r);
  }
}
const scriptsText = Object.values(pkg.scripts || {}).join('\n');
if (usage.typescript && /\btsc\b/.test(scriptsText)) usage.typescript.tooling.push('package scripts invoke tsc');
const tsconfigFiles = allFiles.filter((f) => /^tsconfig(?:\..+)?\.json$/.test(path.basename(f)));
if (usage['@types/node'] && tsconfigFiles.some((f) => /["']node["']/.test(read(f)))) usage['@types/node'].tooling.push('TypeScript configuration includes Node types');
for (const scopes of Object.values(usage)) for (const [scope, files] of Object.entries(scopes)) scopes[scope] = [...new Set(files)].sort();

const sourceStats = sourceFiles.map((file) => {
  const text = read(file);
  return { path: rel(file), bytes: Buffer.byteLength(text), lines: lineCount(text) };
}).sort((a, b) => b.bytes - a.bytes);

const orphanCandidates = [];
for (const file of sourceFiles) {
  const r = rel(file);
  if (PUBLIC_SOURCE_ENTRIES.has(r) || r.startsWith('lib-next/ambient/') || r.endsWith('.d.ts')) continue;
  if ((repoIncoming.get(path.resolve(file)) || []).length === 0) orphanCandidates.push(r);
}
const runtimeCycles = tarjan([...runtimeGraph.keys()], runtimeGraph)
  .filter((component) => component.length > 1 || (runtimeGraph.get(component[0]) || []).includes(component[0]))
  .map((component) => component.map(rel).sort()).sort((a, b) => b.length - a.length);

const fanIn = sourceFiles.map((file) => ({ path: rel(file), count: (sourceIncoming.get(path.resolve(file)) || []).length })).sort((a, b) => b.count - a.count).slice(0, 20);
const fanOut = sourceFiles.map((file) => ({ path: rel(file), count: (runtimeGraph.get(path.resolve(file)) || []).length })).sort((a, b) => b.count - a.count).slice(0, 20);

const genericUtilityCandidates = sourceFiles.map(rel).filter((r) => {
  if (r.startsWith('lib-next/types/')) return false;
  const base = path.basename(r, path.extname(r));
  return /^(?:helpers?|utils?|common|misc|general-functions)$/i.test(base);
});
const markerHits = [];
const anyHits = [];
const consoleHits = [];
const envHits = [];
const deepImportHits = [];
for (const file of allFiles.filter((f) => TEXT_RE.test(f))) {
  const r = rel(file);
  if (r === 'scripts/maintenance-audit.cjs' || r === 'scripts/phase11-audit.cjs') continue;
  const lines = read(file).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (r.startsWith('lib-next/') && /\b(?:TODO|FIXME|HACK|XXX)\b|remove later|temporary workaround/i.test(line)) markerHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\b(?:as\s+any|Record<\s*string\s*,\s*any\s*>|:\s*any\b|<any>|\bany\[\])/i.test(line)) anyHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\bconsole\.(?:log|error|warn|debug)\s*\(/.test(line)) consoleHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\bprocess\.env(?:\.|\[)/.test(line)) envHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (/apexify\.js\/(?:dist|lib-next)\//.test(line)) deepImportHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
  });
}

const runtimeDependenciesWithoutSourceImports = Object.entries(usage)
  .filter(([name]) => declared.get(name) === 'dependencies')
  .filter(([, scopes]) => scopes.source.length === 0)
  .map(([name, scopes]) => ({ name, scopes }));
const unusedDevDependencies = Object.entries(usage)
  .filter(([name]) => declared.get(name) === 'devDependencies')
  .filter(([, scopes]) => Object.values(scopes).every((files) => files.length === 0))
  .map(([name]) => name);
const dependencyInventory = Object.keys(usage).sort().map((name) => ({ name, section: declared.get(name), version: dependencySections[declared.get(name)][name], usage: usage[name] }));

const rootText = read(path.join(SRC, 'index.ts'));
const typesText = read(path.join(SRC, 'types', 'index.ts'));
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  version: pkg.version,
  node: process.version,
  packageManager: pkg.packageManager || null,
  dependencies: dependencyInventory,
  runtimeDependenciesWithoutSourceImports,
  unusedDevDependencies,
  source: {
    fileCount: sourceFiles.length,
    largest: sourceStats.slice(0, 30),
    orphanCandidates: orphanCandidates.sort(),
    genericUtilityCandidates: genericUtilityCandidates.sort(),
    runtimeCycles,
    fanIn,
    fanOut,
    rootExportLines: rootText.split(/\r?\n/).filter((line) => /^\s*export\b/.test(line)).map((line) => line.trim()),
    typeExportLines: typesText.split(/\r?\n/).filter((line) => /^\s*export\b/.test(line)).map((line) => line.trim()),
  },
  hygiene: { markerHits, avoidableAnyCandidates: anyHits, consoleHits, processEnvHits: envHits, packageDeepImportHits: deepImportHits },
  package: {
    exports: pkg.exports || {},
    files: pkg.files || [],
    keywords: pkg.keywords || [],
    scripts: pkg.scripts || {},
    engines: pkg.engines || {},
  },
};

const major = process.versions.node.split('.')[0];
const outFile = path.join(ROOT, `maintenance-audit-node-${major}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
const summary = {
  version: report.version,
  sourceFiles: report.source.fileCount,
  runtimeDependenciesWithoutSourceImports: report.runtimeDependenciesWithoutSourceImports.map((x) => x.name),
  unusedDevDependencies: report.unusedDevDependencies,
  orphanCandidates: report.source.orphanCandidates,
  runtimeCycles: report.source.runtimeCycles,
  genericUtilityCandidates: report.source.genericUtilityCandidates,
  markerHitCount: report.hygiene.markerHits.length,
  anyCandidateCount: report.hygiene.avoidableAnyCandidates.length,
  consoleHitCount: report.hygiene.consoleHits.length,
  processEnvHitCount: report.hygiene.processEnvHits.length,
  deepImportHitCount: report.hygiene.packageDeepImportHits.length,
  largestFiles: report.source.largest.slice(0, 15),
  fanIn: report.source.fanIn.slice(0, 10),
  fanOut: report.source.fanOut.slice(0, 10),
};
console.log('MAINTENANCE_AUDIT_SUMMARY');
console.log(JSON.stringify(summary, null, 2));

if (strict) {
  const failures = [];
  for (const item of report.runtimeDependenciesWithoutSourceImports) failures.push(`unused runtime dependency: ${item.name}`);
  for (const name of report.unusedDevDependencies) failures.push(`unused devDependency: ${name}`);
  for (const orphan of report.source.orphanCandidates) failures.push(`orphan source file: ${orphan}`);
  for (const cycle of report.source.runtimeCycles) failures.push(`runtime source cycle: ${cycle.join(' -> ')}`);
  for (const hit of report.hygiene.packageDeepImportHits) failures.push(`package deep import: ${hit.path}:${hit.line}`);
  for (const hit of report.hygiene.markerHits) failures.push(`unfinished source marker: ${hit.path}:${hit.line}`);
  for (const hit of report.hygiene.consoleHits) failures.push(`library console output: ${hit.path}:${hit.line}`);
  if (failures.length) {
    console.error('MAINTENANCE_AUDIT_STRICT_FAILURES');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}
