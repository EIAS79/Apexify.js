'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

fs.mkdirSync('artifacts/coverage', { recursive: true });

const build = spawnSync(process.execPath, ['scripts/build-coverage-fixture.mjs'], { stdio: 'inherit', env: process.env });
if (build.error) throw build.error;
if (build.status !== 0) {
  process.exitCode = build.status ?? 1;
  return;
}

const criticalModules = [
  'tests/.coverage/lib-next/runtime/config.js',
  'tests/.coverage/lib-next/media/network-policy.js',
  'tests/.coverage/lib-next/media/remote-fetch.js',
  'tests/.coverage/lib-next/media/cache.js',
  'tests/.coverage/lib-next/video/process-runner.js',
  'tests/.coverage/lib-next/video/temp-workspace.js',
];

const args = [
  '--test',
  '--experimental-test-coverage',
  ...criticalModules.map((file) => `--test-coverage-include=${file}`),
  '--test-coverage-lines=85',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=lcov',
  '--test-reporter-destination=artifacts/coverage/critical-lcov.info',
  'tests/unit/critical-infrastructure.test.cjs',
  'tests/unit/critical-branches.test.cjs',
  'tests/unit/private-policy-branches.test.cjs',
  'tests/security/phase12-security.test.cjs',
  'tests/security/phase12-process-branches.test.cjs',
  'tests/integration/remote-fetch.test.cjs',
];

const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
