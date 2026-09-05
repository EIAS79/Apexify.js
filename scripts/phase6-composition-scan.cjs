'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE = path.join(ROOT, 'lib-next');
const failures = [];
const compositionPrefixes = [
  'lib-next/assets/',
  'lib-next/template/',
  'lib-next/components/',
  'lib-next/plugins/',
  'lib-next/scene/',
  'lib-next/composition/',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.ts$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(SOURCE)) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (!compositionPrefixes.some((prefix) => rel.startsWith(prefix))) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (/\b(?:TODO|FIXME)\b|\bnot implemented\b|\bstub\b/i.test(text)) {
    failures.push(`${rel}: unfinished Phase 6 marker remains`);
  }
  if (/\bthrow\s+new\s+Error\s*\(/.test(text)) {
    failures.push(`${rel}: generic Error remains in a composition domain`);
  }
  if (/\b(?:fetch|axios\.get)\s*\(/.test(text)) {
    failures.push(`${rel}: composition domain bypasses shared media/network policy`);
  }
}

const assetStrings = fs.readFileSync(path.join(ROOT, 'lib-next/assets/asset-strings.ts'), 'utf8');
if (!/replace\(\/\\\$\\\$\/g/.test(assetStrings) || !/cyclic object graph/.test(assetStrings)) {
  failures.push('asset-strings.ts: literal-dollar escaping or cycle detection is missing');
}
for (const rel of ['lib-next/template/resolve-template.ts', 'lib-next/apex-painter/main.ts']) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (/const\s+LONE_ASSET_REF|const\s+EMBEDDED_ASSET_TOKEN/.test(text)) {
    failures.push(`${rel}: duplicate asset token resolver definition remains`);
  }
}

const sceneCreator = fs.readFileSync(path.join(ROOT, 'lib-next/scene/scene-creator.ts'), 'utf8');
const surfaceStart = sceneCreator.indexOf('private async renderSurface');
const renderStart = sceneCreator.indexOf('async render(', surfaceStart);
if (surfaceStart < 0 || renderStart < 0) {
  failures.push('scene-creator.ts: renderSurface boundary missing');
} else if (/toBuffer\s*\(|decodeSceneBuffer\s*\(/.test(sceneCreator.slice(surfaceStart, renderStart))) {
  failures.push('scene-creator.ts: nested surface regressed to Canvas -> Buffer -> decode compositing');
}
if (!/\.\.\.\(background \?\? \{\}\),\s*\n\s*width: placement\.width,\s*\n\s*height: placement\.height/.test(sceneCreator)) {
  failures.push('scene-creator.ts: surface dimensions are not authoritative over background config');
}

const builder = fs.readFileSync(path.join(ROOT, 'lib-next/scene/scene-builder.ts'), 'utf8');
for (const method of ['replaceLayer', 'insertBefore', 'insertAfter', 'toRenderInput']) {
  if (!new RegExp(`\\b${method}\\b`).test(builder)) failures.push(`scene-builder.ts: ${method} contract missing`);
}
if (!/cloneCompositionValue/.test(builder)) failures.push('scene-builder.ts: copy-on-ingress/snapshot isolation missing');

const template = fs.readFileSync(path.join(ROOT, 'lib-next/template/resolve-template.ts'), 'utf8');
const visibilityIndex = template.indexOf('layers = filterVisibleTree');
const resolutionIndex = template.indexOf('const resolvedTree = deepResolveStrings');
if (visibilityIndex < 0 || resolutionIndex < 0 || visibilityIndex > resolutionIndex) {
  failures.push('resolve-template.ts: visibility must run before placeholder/asset resolution');
}
if (!/applyInsertions/.test(template) || !/unknown layer id/.test(template) || !/duplicated/.test(template)) {
  failures.push('resolve-template.ts: insertion/override/unique-id validation incomplete');
}

const painter = fs.readFileSync(path.join(ROOT, 'lib-next/apex-painter/main.ts'), 'utf8');
const painterIndex = fs.readFileSync(path.join(ROOT, 'lib-next/apex-painter/index.ts'), 'utf8');
if (!/async\s+use\([^)]*\)[\s\S]*?Promise<this>[\s\S]*?await\s+this\.plugins\.install\(plugin, this\)/.test(painter)) {
  failures.push('apex-painter/main.ts: plugin lifecycle is not truthfully async');
}
if (/void\s+plugin\.install\s*\(/.test(painter) || /_installedPluginNames/.test(painter)) {
  failures.push('apex-painter/main.ts: stale synchronous plugin lifecycle remains');
}
if (/\bthrow\s+new\s+Error\s*\(/.test(painter)) {
  failures.push('apex-painter/main.ts: generic composition error remains');
}
if (!/from\s+["']\.\/main["']/.test(painterIndex)) {
  failures.push('apex-painter/index.ts: public export bypasses the authoritative ApexPainter implementation');
}
if (fs.existsSync(path.join(ROOT, 'lib-next/apex-painter/public-main.ts'))) {
  failures.push('lib-next/apex-painter/public-main.ts: obsolete compatibility wrapper remains');
}

const cache = fs.readFileSync(path.join(ROOT, 'lib-next/image/image-properties.ts'), 'utf8');
if (!/buffer:\$\{raw\.length\}/.test(cache)) failures.push('image-properties.ts: Buffer image cache key/deduplication missing');

const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (!packageJson.scripts?.['test:phase6'] || !String(packageJson.scripts.test).includes('test:phase6')) {
  failures.push('package.json: Phase 6 suite is not part of required npm test gate');
}

if (failures.length) {
  console.error('Phase 6 composition self-challenge failed:\n' + failures.map((failure) => ` - ${failure}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Phase 6 composition self-challenge passed.');
}
