const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const required = [
  'dist/esm/index.js',
  'dist/cjs/index.cjs',
  'dist/declarations/index.d.ts',
  'dist/declarations-cjs/index.d.cts',
];

if (required.every((file) => fs.existsSync(file))) {
  console.log('prepare-git-install: packaged dist already present; no rebuild required.');
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
const command = npmExecPath ? process.execPath : (process.platform === 'win32' ? 'npm.cmd' : 'npm');
const args = npmExecPath ? [npmExecPath, 'run', 'build'] : ['run', 'build'];
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

for (const file of required) {
  if (!fs.existsSync(file)) throw new Error(`prepare-git-install: build completed without ${file}`);
}
console.log('prepare-git-install: staged Git dependency dist prepared.');
