'use strict';

const assert = require('node:assert/strict');
const { ApexPainter } = require('../dist/cjs/index.cjs');

(async () => {
  const painter = new ApexPainter({ type: 'buffer' });
  const source = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  assert.equal(typeof painter.toOutput, 'function', 'preferred toOutput() API must exist');
  assert.equal(typeof painter.outPut, 'function', 'legacy outPut() compatibility alias must remain available');

  const preferred = await painter.toOutput(source);
  const legacy = await painter.outPut(source);
  assert(Buffer.isBuffer(preferred));
  assert(Buffer.isBuffer(legacy));
  assert.deepEqual(preferred, source);
  assert.deepEqual(legacy, preferred);

  console.log('public-api-compat: preferred toOutput() and legacy outPut() are behaviorally equivalent');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
