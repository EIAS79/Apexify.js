const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const required = [
  'dist/esm/index.js',
  'dist/cjs/index.cjs',
  'dist/declarations/index.d.ts',
  'dist/declarations-cjs/index.d.cts',
];

if (required.every((file) => fs.existsSync(file))) {
  console.log('prepare-source-package: dist already complete; skipping rebuild.');
  process.exit(0);
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
console.log('prepare-source-package: dist missing; building package for source installation.');
const result = spawnSync(npmCmd, ['run', 'build'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`prepare-source-package: build did not produce ${file}`);
}
