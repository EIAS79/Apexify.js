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
    'lib-next/output/convert.ts',
    'lib-next/output/stitch.ts',
  ].includes(rel);
}

function lineAndSnippet(text, index) {
  const line = text.slice(0, index).split('\n').length;
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const endCandidate = text.indexOf('\n', index);
  const end = endCandidate === -1 ? text.length : endCandidate;
  return { line, snippet: text.slice(start, end).trim() };
}

const nativeDecodeAllowlist = new Set([
  // This module is the authoritative image metadata/decode boundary.
  'lib-next/image/image-source-validation.ts',
]);
const rawMediaResolverAllowlist = new Set([
  // Raster callers must go through inspectImageSource/decodeImageSource instead of
  // bypassing decoded-dimension/SVG policy with the generic media resolver.
  'lib-next/image/image-source-validation.ts',
]);

for (const file of walk(SOURCE)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!isRasterRelevant(rel)) continue;
  const text = fs.readFileSync(file, 'utf8');

  if (/from\s+["']jimp["']|require\s*\(\s*["']jimp["']\s*\)/.test(text)) {
    failures.push(`${rel}: executable Jimp dependency remains in the raster pipeline`);
  }
  if (/\bresolveMediaPath\b|media-path\.ts/.test(text)) {
    failures.push(`${rel}: obsolete image path resolver remains`);
  }
  if (!nativeDecodeAllowlist.has(rel) && /\bloadImage\b/.test(text) && /@napi-rs\/canvas/.test(text)) {
    failures.push(`${rel}: native loadImage must delegate to the authoritative image decoder/cache`);
  }
  if (!rawMediaResolverAllowlist.has(rel) && /\bresolveMediaInput\s*\(/.test(text)) {
    failures.push(`${rel}: direct resolveMediaInput bypasses authoritative image metadata/decode preflight`);
  }
  if (/\b(?:readFileSync|writeFileSync|existsSync|mkdirSync|rmSync)\s*\(/.test(text)) {
    failures.push(`${rel}: synchronous filesystem call remains on a raster/render path`);
  }
  if (/\bMath\.random\s*\(/.test(text)) {
    failures.push(`${rel}: nondeterministic Math.random remains on a raster/render path`);
  }
  if (/\b(?:TODO|FIXME)\b|\bnot implemented\b|\bstub\b/i.test(text)) {
    failures.push(`${rel}: unfinished raster marker remains`);
  }

  // Phase 5 specifically requires explicit zero coordinates to survive defaulting.
  // Limit this gate to coordinate fields and literal fallbacks so boolean conditions
  // and intentionally-positive dimensions/sizes do not become false positives.
  const suspiciousCoordinateDefault = /\.(?:x|y|startX|startY|endX|endY|centerX|centerY|offsetX|offsetY)\s*\|\|\s*[-+]?\d+(?:\.\d+)?\b/g;
  for (const match of text.matchAll(suspiciousCoordinateDefault)) {
    const location = lineAndSnippet(text, match.index ?? 0);
    failures.push(`${rel}:${location.line}: zero coordinate is overwritten by || fallback: ${location.snippet}`);
  }
}

const generalFunctions = fs.readFileSync(path.join(ROOT, 'lib-next/core/general-functions.ts'), 'utf8');
const detectStart = generalFunctions.indexOf('export async function detectColors');
const detectEnd = generalFunctions.indexOf('/** Remove one exact RGB color', detectStart);
if (detectStart < 0 || detectEnd < 0) {
  failures.push('lib-next/core/general-functions.ts: detectColors implementation could not be located');
} else {
  const detectColors = generalFunctions.slice(detectStart, detectEnd);
  if (/\bloadImageCached\s*\(/.test(detectColors) || /\bgetImageData\s*\(/.test(detectColors)) {
    failures.push('lib-next/core/general-functions.ts: detectColors regressed to full decoded-canvas pixel enumeration');
  }
  if (!/\.resize\s*\(\s*\{[^}]*width:\s*160[^}]*height:\s*160/s.test(detectColors)) {
    failures.push('lib-next/core/general-functions.ts: detectColors must downsample before palette extraction');
  }
  if (!/\.slice\s*\(\s*0\s*,\s*16\s*\)/.test(detectColors)) {
    failures.push('lib-next/core/general-functions.ts: detectColors palette must remain explicitly bounded');
  }
}
if (/function\s+applyBlur\s*\(/.test(generalFunctions)) {
  failures.push('lib-next/core/general-functions.ts: legacy quadratic blur loop remains after native filter migration');
}

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (packageJson.dependencies?.jimp || packageJson.optionalDependencies?.jimp) {
  failures.push('package.json: Jimp remains a production dependency after the Sharp/RAW filter migration');
}

const lock = fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8');
if (/"node_modules\/(?:@jimp\/|jimp")/.test(lock)) {
  failures.push('package-lock.json: Jimp packages remain in the locked dependency graph');
}

if (failures.length) {
  console.error('Phase 5 raster self-challenge failed:\n' + failures.map((failure) => ` - ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 5 raster self-challenge passed.');
}
