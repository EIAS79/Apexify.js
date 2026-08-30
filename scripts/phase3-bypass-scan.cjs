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
  if (/console\.error\s*\(/.test(text)) failures.push(`${rel}: library console.error`);
  if (/\b(?:http|https)\.request\s*\(/.test(text) && rel !== 'lib-next/media/remote-fetch.ts') {
    failures.push(`${rel}: raw HTTP client outside central remote fetcher`);
  }

  const directFetch = /\bfetch\s*\(/.test(text);
  if (directFetch) {
    const justifiedFixedService = rel === 'lib-next/core/general-functions.ts' && text.includes('PHASE3-JUSTIFIED-FETCH');
    if (!justifiedFixedService) failures.push(`${rel}: unmanaged fetch()`);
  }

  if (/resolvable-image-source/i.test(rel) || /from\s+["'][^"']*resolvable-image-source/.test(text)) {
    failures.push(`${rel}: obsolete remote image resolver`);
  }

  if (/\b(?:imageCache|remoteByteCache|sourceCache)\s*=\s*new Map\b/.test(text)) {
    failures.push(`${rel}: unmanaged cache Map`);
  }
}

if (failures.length) {
  console.error('Phase 3 bypass scan failed:\n' + failures.map((failure) => ` - ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 3 bypass scan passed.');
}
