#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'lib-next');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const strict = process.argv.includes('--strict');

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

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function isCode(file) {
  return /\.(?:[cm]?[jt]s|tsx)$/.test(file) && !file.endsWith('.map');
}

function moduleSpecifiers(text) {
  const specs = [];
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s*)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) specs.push(match[1]);
  }
  return [...new Set(specs)];
}

function packageRoot(spec) {
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('node:')) return null;
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function resolveRelative(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, `${base}.d.ts`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'), path.join(base, 'index.mts'), path.join(base, 'index.cts'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function lineCount(text) {
  return text.length === 0 ? 0 : text.split(/\r?\n/).length;
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
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
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

const allFiles = walk(ROOT);
const sourceFiles = walk(SRC).filter(isCode);
const repoCodeFiles = allFiles.filter(isCode);
const sourceSet = new Set(sourceFiles.map((f) => path.resolve(f)));
const graph = new Map();
const incoming = new Map(sourceFiles.map((f) => [path.resolve(f), []]));
const importSpecsByFile = new Map();

for (const file of sourceFiles) {
  const abs = path.resolve(file);
  const specs = moduleSpecifiers(read(file));
  importSpecsByFile.set(abs, specs);
  const deps = [];
  for (const spec of specs) {
    const resolved = resolveRelative(abs, spec);
    if (resolved && sourceSet.has(path.resolve(resolved))) {
      const target = path.resolve(resolved);
      deps.push(target);
      incoming.get(target).push(abs);
    }
  }
  graph.set(abs, [...new Set(deps)]);
}

const dependencySections = {
  dependencies: pkg.dependencies || {},
  devDependencies: pkg.devDependencies || {},
  optionalDependencies: pkg.optionalDependencies || {},
  peerDependencies: pkg.peerDependencies || {},
};
const declared = new Map();
for (const [section, entries] of Object.entries(dependencySections)) {
  for (const name of Object.keys(entries)) declared.set(name, section);
}

const usage = {};
for (const name of declared.keys()) usage[name] = { source: [], tests: [], scripts: [], benchmarks: [], config: [], other: [] };
for (const file of repoCodeFiles) {
  const specs = moduleSpecifiers(read(file));
  for (const spec of specs) {
    const root = packageRoot(spec);
    if (!root || !usage[root]) continue;
    const r = rel(file);
    let scope = 'other';
    if (r.startsWith('lib-next/')) scope = 'source';
    else if (r.startsWith('tests/')) scope = 'tests';
    else if (r.startsWith('scripts/')) scope = 'scripts';
    else if (r.startsWith('benchmarks/')) scope = 'benchmarks';
    else if (/^(?:tsconfig|eslint|vitest|jest|rollup|webpack|esbuild)/.test(r)) scope = 'config';
    usage[root][scope].push(r);
  }
}
for (const scopes of Object.values(usage)) {
  for (const [scope, files] of Object.entries(scopes)) scopes[scope] = [...new Set(files)].sort();
}

const sourceStats = sourceFiles.map((file) => {
  const text = read(file);
  return { path: rel(file), bytes: Buffer.byteLength(text), lines: lineCount(text) };
}).sort((a, b) => b.bytes - a.bytes);

const orphans = [];
for (const file of sourceFiles) {
  const r = rel(file);
  if (r === 'lib-next/index.ts' || r.startsWith('lib-next/ambient/') || r.endsWith('.d.ts')) continue;
  if ((incoming.get(path.resolve(file)) || []).length === 0) orphans.push(r);
}

const sccs = tarjan([...graph.keys()], graph)
  .filter((component) => component.length > 1 || (graph.get(component[0]) || []).includes(component[0]))
  .map((component) => component.map(rel).sort())
  .sort((a, b) => b.length - a.length);

const fanIn = sourceFiles.map((file) => ({
  path: rel(file),
  count: (incoming.get(path.resolve(file)) || []).length,
})).sort((a, b) => b.count - a.count).slice(0, 20);
const fanOut = sourceFiles.map((file) => ({
  path: rel(file),
  count: (graph.get(path.resolve(file)) || []).length,
})).sort((a, b) => b.count - a.count).slice(0, 20);

const genericFiles = sourceFiles.map(rel).filter((r) => /(?:^|\/)(?:helpers?|utils?|common|misc|general-functions)(?:\.|\/|$)/i.test(r));
const markers = [];
const anyHits = [];
const consoleHits = [];
const envHits = [];
const deepImportHits = [];
for (const file of allFiles.filter((f) => /\.(?:md|[cm]?[jt]s|tsx|json|ya?ml)$/.test(f))) {
  const r = rel(file);
  if (r === 'scripts/phase11-audit.cjs') continue;
  const text = read(file);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/\b(?:TODO|FIXME|HACK|TEMP|XXX|remove later)\b/i.test(line)) markers.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\b(?:as\s+any|Record<\s*string\s*,\s*any\s*>|:\s*any\b|<any>|\bany\[\])/i.test(line)) anyHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\bconsole\.(?:log|error|warn|debug)\s*\(/.test(line)) consoleHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (r.startsWith('lib-next/') && /\bprocess\.env(?:\.|\[)/.test(line)) envHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
    if (/apexify\.js\/(?:dist|lib-next)\//.test(line)) deepImportHits.push({ path: r, line: i + 1, text: line.trim().slice(0, 180) });
  });
}

const rootIndex = path.join(SRC, 'index.ts');
const rootText = fs.existsSync(rootIndex) ? read(rootIndex) : '';
const rootExportLines = rootText.split(/\r?\n/).filter((line) => /^\s*export\b/.test(line)).map((line) => line.trim());
const typesIndex = path.join(SRC, 'types', 'index.ts');
const typesText = fs.existsSync(typesIndex) ? read(typesIndex) : '';
const typeExportLines = typesText.split(/\r?\n/).filter((line) => /^\s*export\b/.test(line)).map((line) => line.trim());

const runtimeUnused = Object.entries(usage)
  .filter(([name]) => declared.get(name) === 'dependencies')
  .filter(([, scopes]) => scopes.source.length === 0)
  .map(([name, scopes]) => ({ name, scopes }));
const devUnused = Object.entries(usage)
  .filter(([name]) => declared.get(name) === 'devDependencies')
  .filter(([, scopes]) => Object.values(scopes).every((files) => files.length === 0))
  .map(([name]) => name);

const dependencyInventory = Object.keys(usage).sort().map((name) => ({
  name,
  section: declared.get(name),
  version: dependencySections[declared.get(name)][name],
  usage: usage[name],
}));

const sourceDirs = fs.readdirSync(SRC, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
const topLevelPackedIntent = pkg.files || [];

const report = {
  phase: 11,
  generatedAt: new Date().toISOString(),
  repository: pkg.repository?.url || null,
  version: pkg.version,
  node: process.version,
  packageManager: pkg.packageManager || null,
  packageMetadata: {
    name: pkg.name,
    description: pkg.description,
    license: pkg.license,
    engines: pkg.engines || {},
    exports: pkg.exports || {},
    files: pkg.files || [],
    keywords: pkg.keywords || [],
    scripts: pkg.scripts || {},
  },
  dependencies: dependencyInventory,
  runtimeDependenciesWithoutSourceImports: runtimeUnused,
  devDependenciesWithoutCodeImports: devUnused,
  source: {
    fileCount: sourceFiles.length,
    directories: sourceDirs,
    largest: sourceStats.slice(0, 30),
    orphanCandidates: orphans.sort(),
    genericUtilityCandidates: genericFiles.sort(),
    cycles: sccs,
    fanIn,
    fanOut,
    rootExportLines,
    typeExportLines,
  },
  hygiene: {
    markerHits: markers,
    avoidableAnyCandidates: anyHits,
    consoleHits,
    processEnvHits: envHits,
    packageDeepImportHits: deepImportHits,
  },
  package: {
    topLevelPackedIntent,
    rootExportSubpaths: Object.keys(pkg.exports || {}),
  },
};

const major = process.versions.node.split('.')[0];
const outFile = path.join(ROOT, `phase11-audit-node-${major}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');

console.log('PHASE11_AUDIT_SUMMARY');
console.log(JSON.stringify({
  version: report.version,
  sourceFiles: report.source.fileCount,
  runtimeDependenciesWithoutSourceImports: report.runtimeDependenciesWithoutSourceImports.map((x) => x.name),
  devDependenciesWithoutCodeImports: report.devDependenciesWithoutCodeImports,
  orphanCandidates: report.source.orphanCandidates,
  cycles: report.source.cycles,
  genericUtilityCandidates: report.source.genericUtilityCandidates,
  markerHitCount: report.hygiene.markerHits.length,
  anyCandidateCount: report.hygiene.avoidableAnyCandidates.length,
  consoleHitCount: report.hygiene.consoleHits.length,
  processEnvHitCount: report.hygiene.processEnvHits.length,
  deepImportHitCount: report.hygiene.packageDeepImportHits.length,
  largestFiles: report.source.largest.slice(0, 15),
  fanIn: report.source.fanIn.slice(0, 10),
  fanOut: report.source.fanOut.slice(0, 10),
}, null, 2));

if (strict) {
  const failures = [];
  for (const item of report.runtimeDependenciesWithoutSourceImports) failures.push(`unused runtime dependency candidate: ${item.name}`);
  for (const name of report.devDependenciesWithoutCodeImports) failures.push(`unused devDependency candidate: ${name}`);
  for (const orphan of report.source.orphanCandidates) failures.push(`orphan source candidate: ${orphan}`);
  for (const cycle of report.source.cycles) failures.push(`source cycle: ${cycle.join(' -> ')}`);
  for (const hit of report.hygiene.packageDeepImportHits) failures.push(`package deep import: ${hit.path}:${hit.line}`);
  if (failures.length) {
    console.error('PHASE11_AUDIT_STRICT_FAILURES');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
  }
}
