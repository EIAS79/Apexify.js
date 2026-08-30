const fs = require('node:fs');
const path = require('node:path');

const esmRoot = path.resolve('dist/declarations');
const cjsRoot = path.resolve('dist/declarations-cjs');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

function resolveRelativeSpecifier(sourceFile, specifier, runtimeExtension) {
  if (specifier !== '.' && specifier !== '..' && !specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
  if (specifier.endsWith('.json')) return specifier;

  const withoutRuntimeExtension = specifier.replace(/\.(?:mjs|cjs|js)$/i, '');
  const targetBase = path.resolve(path.dirname(sourceFile), withoutRuntimeExtension);

  if (fs.existsSync(`${targetBase}.d.ts`)) {
    return `${withoutRuntimeExtension}${runtimeExtension}`;
  }
  if (fs.existsSync(path.join(targetBase, 'index.d.ts'))) {
    return `${withoutRuntimeExtension.replace(/\/$/, '')}/index${runtimeExtension}`;
  }

  throw new Error(`Cannot resolve declaration specifier ${specifier} from ${path.relative(process.cwd(), sourceFile)}`);
}

function rewriteSpecifiers(sourceFile, text, runtimeExtension) {
  const relative = `(\\.{1,2}(?:\\/[^'\"]+)?)`;
  const rewrite = (prefix, quote, specifier, suffix = '') =>
    `${prefix}${quote}${resolveRelativeSpecifier(sourceFile, specifier, runtimeExtension)}${quote}${suffix}`;

  text = text.replace(new RegExp(`(\\bfrom\\s*)(['\"])${relative}\\2`, 'g'), (_m, prefix, quote, specifier) =>
    rewrite(prefix, quote, specifier)
  );
  text = text.replace(new RegExp(`(\\bimport\\s*\\(\\s*)(['\"])${relative}\\2(\\s*\\))`, 'g'), (_m, prefix, quote, specifier, suffix) =>
    rewrite(prefix, quote, specifier, suffix)
  );
  text = text.replace(new RegExp(`(\\brequire\\s*\\(\\s*)(['\"])${relative}\\2(\\s*\\))`, 'g'), (_m, prefix, quote, specifier, suffix) =>
    rewrite(prefix, quote, specifier, suffix)
  );
  text = text.replace(new RegExp(`(\\bimport\\s*)(['\"])${relative}\\2`, 'g'), (_m, prefix, quote, specifier) =>
    rewrite(prefix, quote, specifier)
  );

  return text;
}

if (!fs.existsSync(esmRoot)) throw new Error('dist/declarations does not exist; run TypeScript declaration emission first.');
fs.rmSync(cjsRoot, { recursive: true, force: true });

const declarationFiles = walk(esmRoot);
if (!declarationFiles.length) throw new Error('No declaration files were emitted.');

for (const file of declarationFiles) {
  const original = fs.readFileSync(file, 'utf8');
  const esm = rewriteSpecifiers(file, original, '.js');
  fs.writeFileSync(file, esm);

  const relative = path.relative(esmRoot, file);
  const cjsRelative = relative.replace(/\.d\.ts$/, '.d.cts');
  const cjsFile = path.join(cjsRoot, cjsRelative);
  fs.mkdirSync(path.dirname(cjsFile), { recursive: true });
  const cjs = rewriteSpecifiers(file, original, '.cjs').replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd() + '\n';
  fs.writeFileSync(cjsFile, cjs);
}

console.log(`process-declarations: normalized ${declarationFiles.length} ESM declarations and generated matching CJS declarations.`);
