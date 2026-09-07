'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = process.cwd();
const dist = path.join(root, 'dist');
const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apexify-prepack-'));

try {
  fs.rmSync(dist, { recursive: true, force: true });
  if (fs.existsSync(dist)) throw new Error('Clean prepack probe could not remove dist/.');

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('npm_execpath is unavailable; run this verification through npm scripts.');
  const packed = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', packDir], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (packed.error) throw packed.error;
  if (packed.status !== 0) {
    throw new Error(`npm pack lifecycle probe failed with status ${packed.status}.\n${packed.stdout ?? ''}${packed.stderr ?? ''}`);
  }

  const required = [
    'esm/index.js',
    'cjs/index.cjs',
    'declarations/index.d.ts',
    'declarations-cjs/index.d.cts',
  ];
  for (const relativePath of required) {
    if (!fs.existsSync(path.join(dist, relativePath))) {
      throw new Error(`prepack did not rebuild required dist artifact: ${relativePath}`);
    }
  }

  const tarballs = fs.readdirSync(packDir).filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`Expected one packed tarball after prepack, found ${tarballs.length}.`);
  console.log(`verify-prepack-rebuild: clean dist removal, lifecycle rebuild, and tarball creation passed (${tarballs[0]}).`);
} finally {
  fs.rmSync(packDir, { recursive: true, force: true });
}