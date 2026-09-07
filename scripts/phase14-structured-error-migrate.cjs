'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function write(rel, text) {
  fs.writeFileSync(path.join(ROOT, rel), text);
}

function addImport(text, line) {
  if (text.includes(line)) return text;
  return `${line}\n${text}`;
}

function replaceGenericThrows(rel, importPath, errorClass = 'ApexifyInputError') {
  let text = read(rel);
  const before = (text.match(/throw new Error\s*\(/g) || []).length;
  if (before === 0) return 0;
  text = addImport(text, `import { ${errorClass} } from "${importPath}";`);
  text = text.replace(/throw new Error\s*\(/g, `throw new ${errorClass}(`);
  write(rel, text);
  return before;
}

let changedThrows = 0;

// Public chart/image/text/video validation failures are caller-input contract failures.
for (const rel of [
  'lib-next/apex-painter/creates/chart-create.ts',
  'lib-next/chart/impl/barchart.ts',
  'lib-next/chart/impl/combochart.ts',
  'lib-next/chart/impl/comparisonchart.ts',
  'lib-next/chart/impl/horizontalbarchart.ts',
  'lib-next/chart/impl/linechart.ts',
  'lib-next/chart/impl/piechart.ts',
  'lib-next/chart/impl/polarareachart.ts',
  'lib-next/chart/impl/radarchart.ts',
  'lib-next/image/shapes/shapes.ts',
  'lib-next/render/repeating-gradient-pattern.ts',
  'lib-next/text/text-style.ts',
  'lib-next/video/render-video-text-layer.ts',
  'lib-next/video/video-text-overlay-apply.ts',
  'lib-next/video/video-text-overlay-filters.ts',
]) {
  const depth = rel.split('/').length - 1;
  const importPath = depth === 2 ? '../runtime/errors' : depth === 3 ? '../../runtime/errors' : '../../../runtime/errors';
  changedThrows += replaceGenericThrows(rel, importPath);
}

// Defensive IPv6 parser guards are structured input failures even though validated callers should not reach them.
changedThrows += replaceGenericThrows('lib-next/media/network-policy.ts', '../runtime/errors');

// Batch/chain facades preserve domain errors instead of flattening them into strings.
{
  const rel = 'lib-next/apex-painter/creates/batch-create.ts';
  let text = read(rel);
  text = text.replace('import { getErrorMessage } from "../../core/errors";\n', 'import { ApexifyError, ApexifyInputError } from "../../runtime/errors";\n');
  text = text.replace(
    '  } catch (error) {\n    throw new Error(`batch failed: ${getErrorMessage(error)}`);\n  }',
    '  } catch (error) {\n    if (error instanceof ApexifyError) throw error;\n    throw new ApexifyInputError("batch failed.", { cause: error, details: { operation: "batch" } });\n  }'
  );
  text = text.replace(
    '  } catch (error) {\n    throw new Error(`chain failed: ${getErrorMessage(error)}`);\n  }',
    '  } catch (error) {\n    if (error instanceof ApexifyError) throw error;\n    throw new ApexifyInputError("chain failed.", { cause: error, details: { operation: "chain" } });\n  }'
  );
  write(rel, text);
  changedThrows += 2;
}

// Gradient blend separates validation from rendering/decode failures.
{
  const rel = 'lib-next/image/gradient-blend.ts';
  let text = read(rel);
  const before = (text.match(/throw new Error\s*\(/g) || []).length;
  text = addImport(text, 'import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";');
  text = text.replace(/throw new Error\s*\(/g, 'throw new ApexifyInputError(');
  text = text.replace(
    '  } catch (error) {\n    throw new ApexifyInputError(`gradientBlend failed: ${getErrorMessage(error)}`, { cause: error });\n  }',
    '  } catch (error) {\n    if (error instanceof ApexifyError) throw error;\n    throw new ApexifyDecodeError(`gradientBlend failed: ${getErrorMessage(error)}`, { cause: error });\n  }'
  );
  write(rel, text);
  changedThrows += before;
}

// ImageCreator keeps validation as input errors and unexpected render/decode failures as decode errors.
{
  const rel = 'lib-next/image/image-creator.ts';
  let text = read(rel);
  const before = (text.match(/throw new Error\s*\(/g) || []).length;
  text = text.replace('import { ApexifyError } from "../runtime/errors";', 'import { ApexifyDecodeError, ApexifyError, ApexifyInputError } from "../runtime/errors";');
  text = text.replace(/throw new Error\s*\(/g, 'throw new ApexifyInputError(');
  text = text.replace(
    '      throw new ApexifyInputError(`createImage failed: ${getErrorMessage(error)}`);',
    '      throw new ApexifyDecodeError(`createImage failed: ${getErrorMessage(error)}`, { cause: error });'
  );
  write(rel, text);
  changedThrows += before;
}

// Frame extraction distinguishes availability, validation, metadata/decode, and process execution failures.
{
  const rel = 'lib-next/video/extract-all-frames.ts';
  let text = read(rel);
  const before = (text.match(/throw new Error\s*\(/g) || []).length;
  text = addImport(text, 'import { ApexifyDecodeError, ApexifyError, ApexifyInputError, ApexifyProcessError } from "../runtime/errors";');
  text = text.replace(/throw new Error\s*\(/g, 'throw new ApexifyInputError(');
  text = text.replace(
    'throw new ApexifyInputError(\n        "FFMPEG NOT FOUND\\nVideo processing features require FFmpeg/ffprobe to be installed.\\n" +',
    'throw new ApexifyProcessError(\n        "FFMPEG NOT FOUND\\nVideo processing features require FFmpeg/ffprobe to be installed.\\n" +'
  );
  text = text.replace(
    'throw new ApexifyInputError("Could not get usable video information.");',
    'throw new ApexifyDecodeError("Could not get usable video information.");'
  );
  text = text.replace(
    '    const errorMessage = getErrorMessage(error);\n    if (errorMessage.includes("FFMPEG NOT FOUND") || errorMessage.includes("FFmpeg")) throw error;\n    throw new ApexifyInputError(`extractAllFrames failed: ${errorMessage}`, { cause: error });',
    '    if (error instanceof ApexifyError) throw error;\n    const errorMessage = getErrorMessage(error);\n    throw new ApexifyProcessError(`extractAllFrames failed: ${errorMessage}`, { cause: error });'
  );
  write(rel, text);
  changedThrows += before;
}

// Malformed ffprobe JSON is a decode failure and is already wrapped at that boundary.
{
  const rel = 'lib-next/video/ffprobe-metadata.ts';
  let text = read(rel);
  const before = (text.match(/throw new Error\s*\(/g) || []).length;
  text = text.replace(/throw new Error\s*\(/g, 'throw new ApexifyDecodeError(');
  write(rel, text);
  changedThrows += before;
}

const remaining = [];
for (const rel of fs.readdirSync(path.join(ROOT, 'lib-next'), { recursive: true })) {
  if (typeof rel !== 'string' || !rel.endsWith('.ts')) continue;
  const fullRel = path.posix.join('lib-next', rel.replaceAll('\\', '/'));
  const text = read(fullRel);
  if (/throw new Error\s*\(/.test(text)) remaining.push(fullRel);
}

if (remaining.length) {
  console.error(`phase14 structured-error migration left generic runtime throws:\n${remaining.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`phase14 structured-error migration converted ${changedThrows} generic runtime throw site(s).`);
}
