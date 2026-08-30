const fs = require('node:fs');

const file = 'tests/security-phase1.cjs';
let source = fs.readFileSync(file, 'utf8');
const oldBlock = `const {\n  MediaProcessRunner,\n  MediaProcessError,\n  redactUrlSecrets,\n} = require('../dist/cjs/video/process-runner.js');\nconst {\n  createTempWorkspace,\n  withTempWorkspace,\n} = require('../dist/cjs/video/temp-workspace.js');\nconst { writeSafeConcatList } = require('../dist/cjs/video/safe-concat.js');\nconst { assertSafeFilterExpression } = require('../dist/cjs/video/video-text-overlay-filters.js');\nconst { url: uploadImgur } = require('../dist/cjs/output/upload-imgur.js');\nconst { VideoStack } = require('../dist/cjs/video/video-stack.js');`;
const newBlock = `const {\n  MediaProcessRunner,\n  MediaProcessError,\n  redactUrlSecrets,\n  createTempWorkspace,\n  withTempWorkspace,\n  writeSafeConcatList,\n  assertSafeFilterExpression,\n  uploadImgur,\n  VideoStack,\n} = require('../node_modules/.cache/apexify-security/security-phase1-entry.cjs');`;
const count = source.split(oldBlock).length - 1;
if (count !== 1) throw new Error(`expected one legacy security import block, found ${count}`);
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log('security-phase1 imports migrated to private test bundle.');
