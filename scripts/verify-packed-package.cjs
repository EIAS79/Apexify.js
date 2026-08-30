const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
  });
  if (result.status !== 0) {
    const details = options.capture ? `\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}` : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}.${details}`);
  }
  return result;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const pack = run(npmCmd, ['pack', '--ignore-scripts', '--json'], { capture: true });
const packInfo = JSON.parse(pack.stdout)[0];
if (!packInfo?.filename || !Array.isArray(packInfo.files)) throw new Error('npm pack did not return expected JSON metadata.');

const allowed = /^(package\.json|README\.md|CHANGELOG\.md|LICENSE|Apex-Banner\.png|dist\/)/;
const forbidden = [];
for (const file of packInfo.files.map((entry) => entry.path)) {
  if (!allowed.test(file)) forbidden.push(file);
}
if (forbidden.length) throw new Error(`Packed artifact contains unexpected files: ${forbidden.join(', ')}`);

for (const expected of ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'dist/esm/index.js', 'dist/cjs/index.cjs', 'dist/declarations/index.d.ts']) {
  if (!packInfo.files.some((entry) => entry.path === expected)) throw new Error(`Packed artifact is missing ${expected}.`);
}

const tarball = path.join(root, packInfo.filename);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-package-'));
const fixtureEsm = path.join(temp, 'fixture-esm');
const fixtureCjs = path.join(temp, 'fixture-cjs');
fs.mkdirSync(fixtureEsm);
fs.mkdirSync(fixtureCjs);

try {
  writeJson(path.join(fixtureEsm, 'package.json'), { private: true, type: 'module' });
  writeJson(path.join(fixtureCjs, 'package.json'), { private: true, type: 'commonjs' });

  for (const fixture of [fixtureEsm, fixtureCjs]) {
    run(npmCmd, ['install', '--no-audit', '--no-fund', '--package-lock=false', tarball], { cwd: fixture });
  }

  fs.writeFileSync(
    path.join(fixtureEsm, 'index.mjs'),
    `import { ApexPainter } from 'apexify.js';\nconst ns = await import('apexify.js');\nif (typeof ApexPainter !== 'function') throw new Error('ESM ApexPainter export missing');\nconst keys = Object.keys(ns).filter((key) => key !== 'default').sort();\nif (keys.join(',') !== 'ApexPainter') throw new Error('Unexpected ESM exports: ' + keys.join(','));\nconsole.log('fixture-esm: ok');\n`
  );
  fs.writeFileSync(
    path.join(fixtureCjs, 'index.cjs'),
    `const ns = require('apexify.js');\nif (typeof ns.ApexPainter !== 'function') throw new Error('CJS ApexPainter export missing');\nconst keys = Object.keys(ns).filter((key) => key !== 'default').sort();\nif (keys.join(',') !== 'ApexPainter') throw new Error('Unexpected CJS exports: ' + keys.join(','));\nconsole.log('fixture-cjs: ok');\n`
  );

  run(process.execPath, ['index.mjs'], { cwd: fixtureEsm });
  run(process.execPath, ['index.cjs'], { cwd: fixtureCjs });

  const typeFixture = path.join(fixtureEsm, 'typecheck.mts');
  fs.writeFileSync(
    typeFixture,
    `import { ApexPainter } from 'apexify.js';\nimport type { CanvasConfig, SceneRenderInput } from 'apexify.js';\nimport type { VideoPipelineLayer } from 'apexify.js/types';\nconst painter: ApexPainter = new ApexPainter({ type: 'buffer' });\nconst canvas: CanvasConfig = { width: 1, height: 1 };\nlet scene!: SceneRenderInput;\nlet layer!: VideoPipelineLayer;\nvoid painter; void canvas; void scene; void layer;\n`
  );
  const tsc = path.join(path.dirname(require.resolve('typescript/package.json')), 'bin', 'tsc');
  run(process.execPath, [tsc, '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', typeFixture], { cwd: root });

  console.log(`verify-packed-package: ${packInfo.filename} installed and passed ESM, CJS, types, and contents checks.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(tarball, { force: true });
}
