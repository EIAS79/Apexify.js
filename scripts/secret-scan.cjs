'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const artifactPath = path.join(root, 'artifacts', 'secret-scan.json');
const excludedDirectories = new Set(['.git', 'node_modules', 'dist', 'artifacts', '.next', 'coverage']);
const excludedRelativePrefixes = ['tests/.build/', 'tests/.coverage/'];
const textExtensions = new Set([
  '.cjs', '.js', '.mjs', '.ts', '.tsx', '.json', '.md', '.txt', '.yml', '.yaml', '.toml', '.env', '.example', '.gitignore',
]);
const textBasenames = new Set(['Dockerfile', 'LICENSE']);

const detectors = [
  { id: 'private-key', pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g },
  { id: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { id: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/g },
  { id: 'npm-token', pattern: /npm_[A-Za-z0-9]{36,}/g },
  { id: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9-]{20,}/g },
  { id: 'stripe-live-secret', pattern: /sk_live_[A-Za-z0-9]{20,}/g },
  { id: 'google-api-key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
];

function isTextFile(relativePath) {
  const basename = path.basename(relativePath);
  if (textBasenames.has(basename)) return true;
  return textExtensions.has(path.extname(relativePath).toLowerCase());
}

function walk(directory, relativeDirectory = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
    if (excludedRelativePrefixes.some((prefix) => relativePath.startsWith(prefix))) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...walk(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && isTextFile(relativePath)) files.push({ absolutePath, relativePath });
  }
  return files;
}

const findings = [];
const files = walk(root);
for (const { absolutePath, relativePath } of files) {
  const content = fs.readFileSync(absolutePath, 'utf8');
  for (const detector of detectors) {
    detector.pattern.lastIndex = 0;
    for (let match = detector.pattern.exec(content); match; match = detector.pattern.exec(content)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length;
      findings.push({ detector: detector.id, file: relativePath, line });
    }
  }
}

const report = {
  schemaVersion: 1,
  scannedFiles: files.length,
  detectors: detectors.map(({ id }) => id),
  findingCount: findings.length,
  findings,
};
fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
fs.writeFileSync(artifactPath, `${JSON.stringify(report, null, 2)}\n`);

if (findings.length > 0) {
  console.error(`secret-scan: detected ${findings.length} high-confidence secret candidate(s).`);
  for (const finding of findings) console.error(`${finding.detector}: ${finding.file}:${finding.line}`);
  process.exitCode = 1;
} else {
  console.log(`secret-scan: ${files.length} text files scanned with ${detectors.length} high-confidence detectors; no candidates found.`);
}