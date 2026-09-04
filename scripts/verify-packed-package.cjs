const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const expectedRuntimeKeys = 'ApexPainter,ApexifyAssetError,ApexifyConfigError,ApexifyDecodeError,ApexifyError,ApexifyExternalServiceError,ApexifyInputError,ApexifyPluginError,ApexifyProcessError,ApexifyRemoteFetchError,ApexifyResourceLimitError,DEFAULT_APEXIFY_RUNTIME_CONFIG,configureApexifyRuntime,getDefaultApexifyRuntimeConfig,resetApexifyRuntimeConfig,resolveApexifyRuntimeConfig';

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

const allowed = /^(package\.json|README\.md|CHANGELOG\.md|LICENSE|Apex-Banner\.png|scripts\/prepare-source-package\.cjs|dist\/)/;
const packedPaths = packInfo.files.map((entry) => entry.path);
const forbidden = packedPaths.filter((file) => !allowed.test(file));
if (forbidden.length) throw new Error(`Packed artifact contains unexpected files: ${forbidden.join(', ')}`);

for (const expected of [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'scripts/prepare-source-package.cjs',
  'dist/esm/index.js',
  'dist/cjs/index.cjs',
  'dist/declarations/index.d.ts',
  'dist/declarations/types/index.d.ts',
  'dist/declarations-cjs/index.d.cts',
  'dist/declarations-cjs/types/index.d.cts',
]) {
  if (!packedPaths.includes(expected)) throw new Error(`Packed artifact is missing ${expected}.`);
}
for (const stale of ['dist/esm/types/index.js', 'dist/cjs/types/index.cjs']) {
  if (packedPaths.includes(stale)) throw new Error(`Packed artifact contains stale runtime type entry: ${stale}`);
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
    run(
      npmCmd,
      ['install', '--no-audit', '--no-fund', '--package-lock=false', '--save-dev', 'typescript@7.0.2', '@types/node@22.20.1'],
      { cwd: fixture }
    );
  }

  fs.writeFileSync(
    path.join(fixtureEsm, 'index.mjs'),
    `import { ApexPainter, ApexifyError, ApexifyAssetError, ApexifyPluginError, configureApexifyRuntime } from 'apexify.js';\nconst ns = await import('apexify.js');\nif (typeof ApexPainter !== 'function') throw new Error('ESM ApexPainter export missing');\nif (typeof ApexifyError !== 'function') throw new Error('ESM ApexifyError export missing');\nif (typeof ApexifyAssetError !== 'function') throw new Error('ESM ApexifyAssetError export missing');\nif (typeof ApexifyPluginError !== 'function') throw new Error('ESM ApexifyPluginError export missing');\nif (typeof configureApexifyRuntime !== 'function') throw new Error('ESM runtime config export missing');\nconst keys = Object.keys(ns).filter((key) => key !== 'default').sort();\nif (keys.join(',') !== ${JSON.stringify(expectedRuntimeKeys)}) throw new Error('Unexpected ESM exports: ' + keys.join(','));\ntry { await import('apexify.js/types'); throw new Error('types subpath unexpectedly has an ESM runtime target'); } catch (error) { if (error?.message?.includes('unexpectedly')) throw error; }\nconsole.log('fixture-esm: ok');\n`
  );
  fs.writeFileSync(
    path.join(fixtureCjs, 'index.cjs'),
    `const ns = require('apexify.js');\nif (typeof ns.ApexPainter !== 'function') throw new Error('CJS ApexPainter export missing');\nif (typeof ns.ApexifyError !== 'function') throw new Error('CJS ApexifyError export missing');\nif (typeof ns.ApexifyAssetError !== 'function') throw new Error('CJS ApexifyAssetError export missing');\nif (typeof ns.ApexifyPluginError !== 'function') throw new Error('CJS ApexifyPluginError export missing');\nif (typeof ns.configureApexifyRuntime !== 'function') throw new Error('CJS runtime config export missing');\nconst keys = Object.keys(ns).filter((key) => key !== 'default').sort();\nif (keys.join(',') !== ${JSON.stringify(expectedRuntimeKeys)}) throw new Error('Unexpected CJS exports: ' + keys.join(','));\ntry { require('apexify.js/types'); throw new Error('types subpath unexpectedly has a CJS runtime target'); } catch (error) { if (error?.message?.includes('unexpectedly')) throw error; }\nconsole.log('fixture-cjs: ok');\n`
  );

  run(process.execPath, ['index.mjs'], { cwd: fixtureEsm });
  run(process.execPath, ['index.cjs'], { cwd: fixtureCjs });

  const typeSource = `import { ApexPainter, configureApexifyRuntime, ApexifyRemoteFetchError, ApexifyAssetError, ApexifyPluginError } from 'apexify.js';\nimport type { CanvasConfig, SceneRenderInput, ApexifyPlugin } from 'apexify.js';\nimport type { VideoPipelineLayer } from 'apexify.js/types';\nconst painter: ApexPainter = new ApexPainter({ type: 'buffer' });\nconst canvas: CanvasConfig = { width: 1, height: 1 };\nconst configured = configureApexifyRuntime({ network: { timeoutMs: 500 } });\nlet remoteError!: ApexifyRemoteFetchError;\nlet assetError!: ApexifyAssetError;\nlet pluginError!: ApexifyPluginError;\nlet scene!: SceneRenderInput;\nlet layer!: VideoPipelineLayer;\nconst plugin: ApexifyPlugin<ApexPainter> = { name: 'fixture', async install() {} };\nconst installed: Promise<ApexPainter> = painter.use(plugin);\nvoid painter; void canvas; void configured; void remoteError; void assetError; void pluginError; void scene; void layer; void installed;\n`;
  fs.writeFileSync(path.join(fixtureEsm, 'typecheck.mts'), typeSource);
  fs.writeFileSync(path.join(fixtureCjs, 'typecheck.cts'), typeSource);

  const compilerOptions = {
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    target: 'ES2022',
    lib: ['ESNext', 'DOM', 'DOM.Iterable'],
    types: ['node'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
  };
  writeJson(path.join(fixtureEsm, 'tsconfig.json'), { compilerOptions, files: ['./typecheck.mts'] });
  writeJson(path.join(fixtureCjs, 'tsconfig.json'), { compilerOptions, files: ['./typecheck.cts'] });

  const esmTsc = path.join(fixtureEsm, 'node_modules', 'typescript', 'bin', 'tsc');
  const cjsTsc = path.join(fixtureCjs, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [esmTsc, '-p', 'tsconfig.json'], { cwd: fixtureEsm });
  run(process.execPath, [cjsTsc, '-p', 'tsconfig.json'], { cwd: fixtureCjs });

  console.log(`verify-packed-package: ${packInfo.filename} installed and passed ESM, CJS, dual types, and contents checks.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(tarball, { force: true });
}
