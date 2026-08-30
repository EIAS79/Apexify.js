const fs = require('node:fs');
const path = require('node:path');

const ROOTS = ['lib-next', 'tests', 'scripts', 'dist'];
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs', '.json', '.md', '.yml', '.yaml']);
const SELF = path.normalize('scripts/phase1-security-scan.cjs');
const ALLOWED_CHILD_PROCESS = new Set([
  path.normalize('lib-next/video/process-runner.ts'),
  // Phase 2 bundles internal source modules into one verified entry per module format.
  path.normalize('dist/esm/index.js'),
  path.normalize('dist/cjs/index.cjs'),
]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (TEXT_EXT.has(path.extname(entry.name))) out.push(p);
  }
  return out;
}

const violations = [];
function add(file, rule, detail) {
  violations.push({ file: file.split(path.sep).join('/'), rule, detail });
}

for (const file of ROOTS.flatMap((root) => walk(root))) {
  const normalized = path.normalize(file);
  if (normalized === SELF) continue;
  const text = fs.readFileSync(file, 'utf8');

  if (/from\s+["'](?:node:)?child_process["']|require\(["'](?:node:)?child_process["']\)/.test(text) && !ALLOWED_CHILD_PROCESS.has(normalized)) {
    add(file, 'central-process-runner', 'child_process may only be imported by video/process-runner');
  }
  if (/\.temp-frames|video-bg-temp-\$\{Date\.now|temp-video-\$\{Date\.now/.test(text)) {
    add(file, 'isolated-temp-workspace', 'legacy shared/timestamp temporary path found');
  }
  if (/IMGUR_(?:CLIENT_ID|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN)[^\n]*(?:\?\?|\|\|)\s*["'][^"']+["']/.test(text)) {
    add(file, 'no-secret-fallback', 'IMGUR environment value has a committed literal fallback');
  }
  if (/\bexecAsync\s*\(|\bexec\s*\(\s*`(?:ffmpeg|ffprobe)|\bexec\s*\(\s*["'](?:ffmpeg|ffprobe)/.test(text)) {
    add(file, 'no-shell-media-command', 'legacy exec/execAsync media execution found');
  }
  if (/\b(?:ffmpeg|ffprobe)\s+-[^\n]*\$\{/.test(text) && !file.endsWith('ffmpeg-session.ts')) {
    add(file, 'no-command-string-construction', 'FFmpeg/ffprobe command-looking string interpolation found');
  }
}

for (const file of ['README.md', 'HOTFIX-5.4.5.md', 'CHANGELOG.md', 'package.json', '.env.example']) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const secretLike = /(?:clientSecret|accessToken|refreshToken)[^\n]{0,40}["'=:]\s*["']?[A-Za-z0-9_-]{24,}/i;
  if (secretLike.test(text)) add(file, 'secret-scan', 'secret-shaped Imgur credential value found');
}

if (violations.length) {
  console.error('Phase 1 security scan failed:');
  for (const v of violations) console.error(`- ${v.file}: [${v.rule}] ${v.detail}`);
  process.exit(1);
}
console.log('Phase 1 security scan passed.');
