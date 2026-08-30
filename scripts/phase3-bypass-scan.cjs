'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'lib-next');
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|js|cjs|mjs)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(SOURCE)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');

  if (/\baxios\b/.test(text)) failures.push(`${rel}: unmanaged axios reference`);
  if (/console\.(?:error|warn)\s*\(/.test(text)) failures.push(`${rel}: unmanaged library console diagnostic`);
  if (/\b(?:http|https)\.request\s*\(/.test(text) && rel !== 'lib-next/media/remote-fetch.ts') {
    failures.push(`${rel}: raw HTTP client outside central remote fetcher`);
  }

  if (/\bfetch\s*\(/.test(text)) failures.push(`${rel}: unmanaged fetch()`);

  if (rel.startsWith('lib-next/video/') && !['lib-next/video/ffmpeg-session.ts', 'lib-next/video/process-runner.ts'].includes(rel)) {
    if (/\b(?:maxStdoutBytes|maxStderrBytes|timeoutMs)\s*:\s*(?:\d|\d+\s*\*)|DEFAULT_PROCESS_TIMEOUT/.test(text)) {
      failures.push(`${rel}: hard-coded FFmpeg/process bounds outside central runtime policy`);
    }
  }

  if (/resolvable-image-source/i.test(rel) || /from\s+["'][^"']*resolvable-image-source/.test(text)) {
    failures.push(`${rel}: obsolete remote image resolver`);
  }

  if (/\b\w*cache\w*\s*=\s*new Map\b/i.test(text) && rel !== 'lib-next/media/cache.ts') {
    failures.push(`${rel}: unmanaged cache Map outside central cache abstraction`);
  }

  // URL redaction is a security boundary. Keep both single-URL and text-wide
  // sanitization authoritative in media/network-policy.ts.
  if (rel !== 'lib-next/media/network-policy.ts' && /function\s+(?:redactUrl|redactUrlsInText|redactProcessText|redactUrlSecrets|sanitizeUrl)\s*\(/i.test(text)) {
    failures.push(`${rel}: duplicate URL redaction helper outside central network policy`);
  }

  // Retry/Retry-After policy belongs exclusively to the central transport.
  if (rel !== 'lib-next/media/remote-fetch.ts' && /function\s+(?:retryDelay|parseRetryAfter)\s*\(/.test(text)) {
    failures.push(`${rel}: duplicate remote retry helper outside central transport`);
  }

  // IP/host classification must not diverge from the authoritative network policy.
  if (rel !== 'lib-next/media/network-policy.ts' && /function\s+(?:classifyIpAddress|isPrivateIp|isPrivateAddress|isLocalAddress)\s*\(/i.test(text)) {
    failures.push(`${rel}: duplicate IP/network classification helper outside central network policy`);
  }

  // Arbitrary caller-provided media must not be handed directly to the native
  // canvas loader because doing so bypasses DNS/SSRF/byte/cache policy. Static
  // package-owned assets and already-resolved Buffer values are allowed.
  if (/loadImage\s*\(\s*(?:source|src|imageSource|maskSource|textureSource|frame\.source|frame\.pattern\.source|options\.(?:source|maskSource|customPatternImage)|imgConfig\.source)\s*\)/.test(text)) {
    failures.push(`${rel}: direct caller media source passed to canvas loadImage()`);
  }
  if (/loadImage\s*\(\s*["']https?:\/\//i.test(text)) {
    failures.push(`${rel}: literal remote URL passed directly to canvas loadImage()`);
  }
  if (/startsWith\s*\(\s*["']http["']\s*\)/.test(text) && /loadImage\s*\(/.test(text) && !/resolveMedia(?:Buffer|Input)\s*\(/.test(text)) {
    failures.push(`${rel}: ad-hoc remote canvas source resolver`);
  }
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.dependencies?.axios || packageJson.devDependencies?.axios || packageJson.optionalDependencies?.axios) {
  failures.push('package.json: axios remains a direct dependency');
}

if (failures.length) {
  console.error('Phase 3 bypass scan failed:\n' + failures.map((failure) => ` - ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 3 bypass scan passed.');
}
