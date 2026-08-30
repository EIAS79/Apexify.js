const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = process.cwd();
const required = [
  'dist/esm/index.js',
  'dist/cjs/index.cjs',
  'dist/declarations/index.d.ts',
  'dist/declarations/types/index.d.ts',
  'dist/declarations-cjs/index.d.cts',
  'dist/declarations-cjs/types/index.d.cts',
];

for (const rel of required) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) throw new Error(`Missing build artifact: ${rel}`);
}

for (const stale of ['dist/esm/types/index.js', 'dist/cjs/types/index.cjs']) {
  if (fs.existsSync(path.join(root, stale))) throw new Error(`Stale runtime type artifact must not exist: ${stale}`);
}

const esmText = fs.readFileSync(path.join(root, 'dist/esm/index.js'), 'utf8');
const cjsText = fs.readFileSync(path.join(root, 'dist/cjs/index.cjs'), 'utf8');
const esmTypes = fs.readFileSync(path.join(root, 'dist/declarations/types/index.d.ts'), 'utf8');
const cjsTypes = fs.readFileSync(path.join(root, 'dist/declarations-cjs/types/index.d.cts'), 'utf8');

if (!/(^|\n)import\s|(^|\n)export\s/m.test(esmText)) {
  throw new Error('dist/esm/index.js does not contain native ESM syntax.');
}
if (/\bmodule\.exports\b/.test(esmText)) {
  throw new Error('dist/esm/index.js contains CommonJS module.exports syntax.');
}
if (!/\bmodule\.exports\b|\bexports\./.test(cjsText)) {
  throw new Error('dist/cjs/index.cjs does not contain CommonJS export syntax.');
}
if (/\bfrom\s+["']\.{1,2}\/[^"']+(?<!\.js)["']/.test(esmTypes)) {
  throw new Error('ESM declarations contain an extensionless relative export/import.');
}
if (/\bfrom\s+["']\.{1,2}\/[^"']+(?<!\.cjs)["']/.test(cjsTypes)) {
  throw new Error('CommonJS declarations contain an extensionless relative export/import.');
}

(async () => {
  const esm = await import(pathToFileURL(path.join(root, 'dist/esm/index.js')).href);
  const cjs = require(path.join(root, 'dist/cjs/index.cjs'));
  for (const [label, mod] of [['ESM', esm], ['CommonJS', cjs]]) {
    if (typeof mod.ApexPainter !== 'function') throw new Error(`${label} build does not export ApexPainter.`);
    const runtimeKeys = Object.keys(mod).filter((key) => key !== 'default').sort();
    if (runtimeKeys.join(',') !== 'ApexPainter') {
      throw new Error(`${label} root runtime exports changed unexpectedly: ${runtimeKeys.join(', ')}`);
    }
  }
  console.log('verify-dist: native ESM, CommonJS, dual declarations, and root exports verified.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
