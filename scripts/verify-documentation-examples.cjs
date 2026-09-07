const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, cwd = root) {
  let executable = command;
  let executableArgs = args;
  if (process.platform === 'win32' && command === npmCmd && process.env.npm_execpath) {
    executable = process.execPath;
    executableArgs = [process.env.npm_execpath, ...args];
  }
  const result = spawnSync(executable, executableArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}`);
}

function runCapture(command, args, cwd = root) {
  let executable = command;
  let executableArgs = args;
  if (process.platform === 'win32' && command === npmCmd && process.env.npm_execpath) {
    executable = process.execPath;
    executableArgs = [process.env.npm_execpath, ...args];
  }
  const result = spawnSync(executable, executableArgs, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit ${result.status}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

const packJson = JSON.parse(runCapture(npmCmd, ['pack', '--ignore-scripts', '--json']));
const filename = packJson?.[0]?.filename;
if (!filename) throw new Error('npm pack did not return a tarball filename.');

const tarball = path.join(root, filename);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-doc-examples-'));
const esmDir = path.join(temp, 'esm');
const cjsDir = path.join(temp, 'cjs');
fs.mkdirSync(esmDir);
fs.mkdirSync(cjsDir);

try {
  fs.writeFileSync(path.join(esmDir, 'package.json'), '{"private":true,"type":"module"}\n');
  fs.writeFileSync(path.join(cjsDir, 'package.json'), '{"private":true,"type":"commonjs"}\n');

  for (const fixture of [esmDir, cjsDir]) {
    run(npmCmd, ['install', '--no-audit', '--no-fund', '--package-lock=false', tarball], fixture);
  }
  run(npmCmd, ['install', '--no-audit', '--no-fund', '--package-lock=false', '--save-dev', 'typescript@7.0.2', '@types/node@22.20.1'], esmDir);

  fs.copyFileSync(path.join(root, 'examples/phase13/quick-start.mjs'), path.join(esmDir, 'quick-start.mjs'));
  fs.copyFileSync(path.join(root, 'examples/phase13/commonjs.cjs'), path.join(cjsDir, 'commonjs.cjs'));
  fs.copyFileSync(path.join(root, 'examples/phase13/types.mts'), path.join(esmDir, 'types.mts'));

  run(process.execPath, ['quick-start.mjs'], esmDir);
  run(process.execPath, ['commonjs.cjs'], cjsDir);

  fs.writeFileSync(
    path.join(esmDir, 'tsconfig.json'),
    `${JSON.stringify({
      compilerOptions: {
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        target: 'ES2022',
        lib: ['ESNext', 'DOM', 'DOM.Iterable'],
        types: ['node'],
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
      },
      files: ['./types.mts'],
    }, null, 2)}\n`
  );
  run(process.execPath, [path.join(esmDir, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], esmDir);

  console.log('verify-documentation-examples: packed ESM, CommonJS, and TypeScript examples passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.rmSync(tarball, { force: true });
}
