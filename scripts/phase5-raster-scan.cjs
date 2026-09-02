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
    return /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function isRasterRelevant(rel) {
  return [
    'lib-next/canvas/',
    'lib-next/image/',
    'lib-next/render/',
    'lib-next/text/',
    'lib-next/scene/',
    'lib-next/chart/',
    'lib-next/path/',
  ].some((prefix) => rel.startsWith(prefix)) || [
    'lib-next/core/general-functions.ts',
    'lib-next/output/compression.ts',
    'lib-next/output/stitch.ts',
  ].includes(rel);
}

const nativeDecodeAllowlist = new Set([
  // This module is the authoritative image metadata/decode boundary.
  'lib-next/image/image-source-validation.ts',
]);

for (const file of walk(SOURCE)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!isRasterRelevant(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');

  if (/\bJimp\b|from\s+["']jimp["']/.test(text)) {
    failures.push(`${rel}: Jimp remains in the raster pipeline`);
  }
  if (/\bresolveMediaPath\b|media-path\.ts/.test(text)) {
    failures.push(`${rel}: obsolete image path resolver remains`);
  }
  if (!nativeDecodeAllowlist.has(rel) && /\bloadImage\b/.test(text) && /@napi-rs\/canvas/.test(text)) {
    failures.push(`${rel}: native loadImage must delegate to the authoritative image decoder/cache`);
  }
  if (/\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|rmSync)\s*\(/.test(text)) {
    failures.push(`${rel}: synchronous filesystem call remains on a raster/render path`);
  }
  if (/\b(?:TODO|FIXME)\b|\bnot implemented\b|\bstub\b/i.test(text)) {
    failures.push(`${rel}: unfinished raster marker remains`);
  }

  // Explicit numeric zero must not be replaced by fallback defaults.
  const suspiciousDefault = /(?:\.|\b)(?:x|y|startX|startY|endX|endY|centerX|centerY|offsetX|offsetY|opacity|rotation|scale|blur|radius|size|levels|value|width|height)\s*\|\|/g;
  if (suspiciousDefault.test(text)) {
    failures.push(`${rel}: suspicious || numeric default; preserve explicit zero with ?? or explicit checks`);
  }
}

if (failures.length) {
  console.error('Phase 5 raster self-challenge failed:\n' + failures.map((failure) => ` - ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 5 raster self-challenge passed.');
}
