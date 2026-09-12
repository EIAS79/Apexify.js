'use strict';

const fs = require('node:fs');
const path = require('node:path');

function walk(directory, extension, out = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.isFile() && entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

function normalizeUrl(url) {
  if (!url) return '<native/anonymous>';
  return url.replace(process.cwd(), '<cwd>');
}

function summarizeCpu(profilePath) {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const nodeById = new Map((profile.nodes || []).map((node) => [node.id, node]));
  const selfSamples = new Map();
  for (const sample of profile.samples || []) selfSamples.set(sample, (selfSamples.get(sample) || 0) + 1);

  const rows = [];
  for (const node of profile.nodes || []) {
    const self = selfSamples.get(node.id) || 0;
    const hitCount = node.hitCount || 0;
    if (self === 0 && hitCount === 0) continue;
    const frame = node.callFrame || {};
    rows.push({
      functionName: frame.functionName || '(anonymous)',
      url: normalizeUrl(frame.url),
      lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber + 1 : null,
      columnNumber: Number.isInteger(frame.columnNumber) ? frame.columnNumber + 1 : null,
      selfSamples: self,
      hitCount,
      nodeId: node.id,
    });
  }
  rows.sort((a, b) => b.selfSamples - a.selfSamples || b.hitCount - a.hitCount);

  const deltas = profile.timeDeltas || [];
  const totalMicros = deltas.reduce((sum, value) => sum + value, 0);
  return {
    profile: path.basename(profilePath),
    samples: (profile.samples || []).length,
    sampledMicros: totalMicros,
    topSelf: rows.slice(0, 30).map((row) => ({
      ...row,
      estimatedSelfPercent: (profile.samples || []).length === 0
        ? 0
        : Number(((row.selfSamples / profile.samples.length) * 100).toFixed(2)),
    })),
    nodeCount: nodeById.size,
  };
}

function summarizeHeap(profilePath) {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const head = profile.head;
  if (!head) return { profile: path.basename(profilePath), topAllocated: [] };
  const rows = [];
  function visit(node) {
    const frame = node.callFrame || {};
    const selfSize = node.selfSize || 0;
    if (selfSize > 0) {
      rows.push({
        functionName: frame.functionName || '(anonymous)',
        url: normalizeUrl(frame.url),
        lineNumber: Number.isInteger(frame.lineNumber) ? frame.lineNumber + 1 : null,
        selfSizeBytes: selfSize,
      });
    }
    for (const child of node.children || []) visit(child);
  }
  visit(head);
  rows.sort((a, b) => b.selfSizeBytes - a.selfSizeBytes);
  return { profile: path.basename(profilePath), topAllocated: rows.slice(0, 30) };
}

const root = path.resolve(process.argv[2] || '.');
const output = path.resolve(process.argv[3] || path.join(root, 'profile-summary.json'));
const cpuProfiles = walk(root, '.cpuprofile').map(summarizeCpu);
const heapProfiles = walk(root, '.heapprofile').map(summarizeHeap);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  root,
  cpuProfiles,
  heapProfiles,
};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);

for (const cpu of cpuProfiles) {
  console.log(`\nCPU ${cpu.profile}: ${cpu.samples} samples`);
  for (const row of cpu.topSelf.slice(0, 12)) {
    console.log(`${String(row.estimatedSelfPercent).padStart(6)}%  ${String(row.selfSamples).padStart(5)}  ${row.functionName}  ${row.url}:${row.lineNumber ?? '?'}`);
  }
}
for (const heap of heapProfiles) {
  console.log(`\nHEAP ${heap.profile}`);
  for (const row of heap.topAllocated.slice(0, 8)) {
    console.log(`${String(row.selfSizeBytes).padStart(10)} B  ${row.functionName}  ${row.url}:${row.lineNumber ?? '?'}`);
  }
}
