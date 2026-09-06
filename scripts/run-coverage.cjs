'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

fs.mkdirSync('artifacts/coverage', { recursive: true });

const args = [
  '--test',
  '--experimental-test-coverage',
  '--test-coverage-include=tests/.build/phase12-entry.cjs',
  '--test-coverage-lines=85',
  '--test-coverage-functions=85',
  '--test-coverage-branches=80',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
  '--test-reporter=lcov',
  '--test-reporter-destination=artifacts/coverage/lcov.info',
  'tests/unit/critical-infrastructure.test.cjs',
  'tests/security/phase12-security.test.cjs',
  'tests/integration/remote-fetch.test.cjs',
  'tests/property/core-properties.test.cjs',
];

const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
